import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { notify } from '@/lib/notify'
import { scopeNoticeProblem, scopeNoticeTitle } from '@/lib/scope-notice'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * "NOTIFY TEAM" - say the plans or the scope moved, and pick who needs to know.
 *
 * WHY: "a scope change in one trade silently moves another trade's work.
 * Concrete switches from one center pour to floor-by-floor, the slab height
 * changes half an inch, and now the electrician's heights are off - and nobody
 * told him."
 *
 * NO NEW MESSAGING SYSTEM, as asked. It is one send through `notify()`, which
 * means it obeys each recipient's own preferences and reaches the bell, the
 * inbox and the phone exactly as everything else does.
 *
 * GATED ON `plans: edit`. Somebody who can change the drawings can say the
 * drawings changed; a vendor with `plans: view` cannot broadcast to the job.
 * It is a row in the permission grid, so a company that wants their office
 * staff sending these turns it on rather than asking us.
 */

/** GET - who on this job can actually be told. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'edit')
  if (denied(gate)) return gate.denied

  const { data, error } = await db
    .from('project_team_members')
    .select('id, name, role, email, profile_id')
    .eq('project_id', params.id)

  if (error) {
    console.error('[scope-notice] team read failed:', error.message)
    return NextResponse.json({ error: 'Could not load the team for this job.' }, { status: 500 })
  }

  // ONLY PEOPLE WITH AN ACCOUNT CAN RECEIVE ONE, and the screen has to say so
  // rather than quietly dropping them: a picker that silently omits the sub you
  // most wanted to warn is worse than one that lists him greyed out with the
  // reason. `profile_id` is the link, which is why it being written matters.
  const rows = (data ?? []) as any[]
  const ids = rows.map(r => r.profile_id).filter(Boolean)
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] as any[] }
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  return NextResponse.json({
    recipients: rows.map(r => ({
      member_id: r.id,
      profile_id: r.profile_id ?? null,
      name: byId.get(r.profile_id)?.full_name || r.name || 'Unnamed',
      role: r.role ?? null,
      email: byId.get(r.profile_id)?.email || r.email || null,
      reachable: !!r.profile_id,
    })),
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const message = String(body?.message ?? '')
  const recipientIds: string[] = Array.isArray(body?.recipient_ids)
    ? body.recipient_ids.filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : []
  const planName = body?.plan_name ? String(body.plan_name) : null
  const planId = body?.plan_id ? String(body.plan_id) : null

  // The SAME guard the dialog asks, so the two cannot disagree about what a
  // usable notice is.
  const problem = scopeNoticeProblem({ message, recipientIds })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // The ids arrive from a browser, so confirm every one is actually on THIS
  // job. Without it the body could broadcast to anybody whose id you know.
  const { data: team } = await db
    .from('project_team_members').select('profile_id')
    .eq('project_id', params.id).not('profile_id', 'is', null)
  const onThisJob = new Set((team ?? []).map((t: any) => t.profile_id))
  const allowed = recipientIds.filter(id => onThisJob.has(id))
  if (!allowed.length) {
    return NextResponse.json(
      { error: 'Those people are not on this job any more. Reopen the list and pick again.' },
      { status: 400 },
    )
  }

  const { data: actor } = await db
    .from('profiles').select('full_name, email').eq('id', gate.actor.userId).maybeSingle()
  const who = (actor as any)?.full_name || (actor as any)?.email || 'Someone'

  const result = await notify({
    db,
    userIds: allowed,
    type: 'scope_change',
    title: scopeNoticeTitle(planName),
    message: `${who}: ${String(message).trim()}`,
    link: planId ? `/projects/${params.id}/plans/${planId}` : `/projects/${params.id}/plans`,
  })

  // REPORT WHAT ACTUALLY WENT OUT. A recipient with email off for this type
  // gets the bell and nothing else, and on a change that moves somebody's work
  // the sender needs to know which it was - the same rule the demo board
  // follows. `skipped` names the reason when nothing went at all.
  return NextResponse.json({
    sent: allowed.length,
    inApp: result.inApp,
    emailed: result.emailed,
    pushed: result.pushed,
    skipped: result.skipped,
  })
}
