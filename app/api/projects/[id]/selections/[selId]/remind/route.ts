import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { tokenLinkEmail } from '@/lib/email'
import { deliverLink, readSendBody } from '@/lib/send-link'
import { appOrigin } from '@/lib/app-url'
import { dayWords } from '@/lib/dates'
import { isOutstanding } from '@/lib/selections'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * "We're waiting on you for the kitchen tile" - one selection, one email.
 *
 * Delivers the link the client already has (the portal's selections page); it
 * NEVER mints one, so an unshared job is refused with what to do instead. The
 * stamp (`client_reminded_at`) is written only after a confirmed send, and a
 * stored Not started moves to Waiting on client, because putting it in front of
 * them is exactly what that stage claims.
 */
export async function POST(request: Request, { params }: { params: { id: string; selId: string } }) {
  const db = admin()
  const g = await requirePermission(db, request, 'selections', 'edit')
  if (denied(g)) return g.denied
  const owned = await ownedProject<{ name: string | null; client: string | null; client_portal_token: string | null; gc_company_id: string | null }>(
    db, g.actor, params.id, 'name, client, client_portal_token, gc_company_id')
  if ('denied' in owned) return owned.denied
  const project = owned.project

  if (!project.client_portal_token) {
    return NextResponse.json({ sent: false, error: 'This job has not been shared with the client yet. Use "Copy client link" first - that creates their link.' }, { status: 409 })
  }

  const { data: sel } = await db.from('project_selections')
    .select('id, item, location, needed_by, status, selection_options(id)')
    .eq('id', params.selId).eq('project_id', params.id).maybeSingle()
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })
  if (!isOutstanding((sel as any).status)) {
    return NextResponse.json({ sent: false, error: 'This one is already decided - there is nothing to remind them about.' }, { status: 409 })
  }

  const { to, note } = await readSendBody(request)
  const [{ data: me }, { data: company }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', g.actor.userId).maybeSingle(),
    project.gc_company_id
      ? db.from('companies').select('name').eq('id', project.gc_company_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const s = sel as any
  const what = s.location ? `${s.item} (${s.location})` : s.item
  const nOpts = s.selection_options?.length ?? 0
  // A date in a letter is words, built server-side from fixed tables (lib/dates.ts).
  const by = dayWords(s.needed_by, { weekday: true })
  const from = (company as any)?.name ?? 'Your contractor'

  const email = tokenLinkEmail({
    recipientName: project.client,
    eyebrow: 'Waiting on you',
    heading: `Your pick: ${what}`,
    lines: [
      `${from} is waiting on your choice for ${what}${project.name ? ` on ${project.name}` : ''}.`,
      nOpts
        ? `There ${nOpts === 1 ? 'is 1 option' : `are ${nOpts} options`} to look at. Pick one, or tell us what you would like instead.`
        : 'Tell us what you would like and we will take it from there.',
      ...(by ? [`We need it by ${by} to keep the job on schedule.`] : []),
    ],
    ctaLabel: 'Make your pick',
    url: `${appOrigin(request.headers.get('origin'))}/portal/${project.client_portal_token}/selections`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: () => db.from('project_selections').update({
      client_reminded_at: new Date().toISOString(),
      client_reminded_to: to,
      ...(s.status === 'pending' ? { status: 'waiting' } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', params.selId),
  })
}
