import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { NOTIFICATION_TYPES } from '@/lib/notifications'
import { checkRule, defaultAudience } from '@/lib/notification-routing'
import { usersWhoCan } from '@/lib/server-permissions'

export const runtime = 'nodejs'
// Every answer here depends on who is asking - their company, their permission.
// Without this Next tries to prerender it at build time, which builds the
// service-role client with no environment and fails the whole build. The
// sibling settings routes escape it only by reading a request header before
// they construct the client, which is luck rather than intent.
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function callerCompany(db: any, request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db
    .from('profiles').select('id, company_id').eq('id', user.id).maybeSingle()
  return profile?.company_id ? { userId: user.id, companyId: profile.company_id } : null
}

/**
 * Who gets told when something happens - the company's own routing.
 *
 * Returns every configurable event with what is set and, where nothing is,
 * WHO THE DEFAULT ACTUALLY RESOLVES TO right now. A screen that says "default"
 * and leaves you guessing which four people that is has not answered the
 * question you opened it to ask.
 */
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return gate.denied

  const who = await callerCompany(db, request)
  if (!who) return NextResponse.json({ error: 'No company on this account.' }, { status: 409 })

  const [{ data: rows }, { data: members }] = await Promise.all([
    db.from('notification_routing').select('type, roles, user_ids').eq('company_id', who.companyId),
    db.from('profiles').select('id, full_name, email, role').eq('company_id', who.companyId).order('full_name'),
  ])

  const byType = new Map((rows ?? []).map((r: any) => [r.type, r]))
  const routable = NOTIFICATION_TYPES.filter(t => t.audience === 'team')

  // The permission defaults, resolved once each rather than per event - several
  // events share one (all three inspection events are ['inspections','edit']).
  const permCache = new Map<string, string[]>()
  const resolveDefault = async (key: string) => {
    const perm = defaultAudience(key)
    if (!perm) return []
    const k = `${perm[0]}:${perm[1]}`
    if (!permCache.has(k)) permCache.set(k, await usersWhoCan(db, who.companyId, perm[0], perm[1]))
    return permCache.get(k) ?? []
  }

  const events = []
  for (const t of routable) {
    const row: any = byType.get(t.key)
    events.push({
      key: t.key,
      label: t.label,
      description: t.description,
      group: t.group,
      status: t.status,
      // What this screen does NOT control, so it stops presenting the
      // configurable half as the whole answer.
      alsoTold: t.alsoTold ?? null,
      configured: !!row,
      roles: row?.roles ?? [],
      userIds: row?.user_ids ?? [],
      defaultPermission: defaultAudience(t.key),
      defaultUserIds: row ? [] : await resolveDefault(t.key),
    })
  }

  return NextResponse.json({ events, members: members ?? [] })
}

/**
 * Save one event's routing.
 *
 * `edit` on company settings, not `view` - the GET is readable by anyone who
 * can open Settings, but changing who hears about money moving is an admin's.
 */
export async function PUT(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'settings_company', 'edit')
  if (denied(gate)) return gate.denied

  const who = await callerCompany(db, request)
  if (!who) return NextResponse.json({ error: 'No company on this account.' }, { status: 409 })

  const body = await request.json().catch(() => ({}))

  // Reset to the default. A DELETE of the row, not a rule with nobody in it -
  // "use the default" and "tell nobody" are different intentions and storing
  // them the same way loses one.
  if (body.reset === true && typeof body.type === 'string') {
    await db.from('notification_routing')
      .delete().eq('company_id', who.companyId).eq('type', body.type)
    return NextResponse.json({ ok: true, reset: true })
  }

  const checked = checkRule(body)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const rule = checked.value

  // Named people have to be in THIS company. An id from another company would
  // route a bill approval to somebody who cannot open the job it is on.
  if (rule.userIds.length) {
    const { data: mine } = await db.from('profiles')
      .select('id').eq('company_id', who.companyId).in('id', rule.userIds)
    const known = new Set((mine ?? []).map((p: any) => p.id))
    const strangers = rule.userIds.filter(id => !known.has(id))
    if (strangers.length) {
      return NextResponse.json({ error: 'One of those people is not on your team.' }, { status: 400 })
    }
  }

  const { error } = await db.from('notification_routing').upsert({
    company_id: who.companyId,
    type: rule.type,
    roles: rule.roles,
    user_ids: rule.userIds,
    updated_by: who.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,type' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
