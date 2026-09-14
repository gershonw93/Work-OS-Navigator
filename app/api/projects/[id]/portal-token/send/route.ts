import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { clientPortalEmail, isEmailAddress, sendEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Email the client their portal link.
 *
 * Uses the token that already exists and REFUSES if there is not one, rather
 * than minting a fresh one on the way out. That distinction matters: minting
 * here would invalidate a link the client may already be using, from the very
 * action whose whole purpose is to give them a working one.
 *
 * Sending is best-effort in the same sense as everywhere else - it reports
 * what happened instead of throwing - but unlike a notification, a failure
 * here is worth telling the user about, because the link is the entire point
 * and copying it by hand is the fallback.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()

  // `view`, not `create`: seeing the link IS the power to send it - anyone who
  // can read it can paste it into their own email. Gating the send higher than
  // the read would be theatre.
  const gate = await requirePermission(db, request, 'client-portal', 'view')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({}))
  const to = String(body?.to ?? '').trim()
  const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : null

  if (!isEmailAddress(to)) {
    return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })
  }

  const [owned, { data: me }] = await Promise.all([
    ownedProject<{
      // `name` is NOT NULL in the schema, same as the project PATCH relies on.
      name: string; client: string | null
      customer_id: string | null; client_portal_token: string | null
      gc_company_id: string | null
    }>(db, gate.actor, params.id, 'name, client, customer_id, client_portal_token'),
    db.from('profiles').select('full_name, company_id').eq('id', gate.actor.userId).maybeSingle(),
  ])

  if ('denied' in owned) return owned.denied
  const project = owned.project

  if (!project.client_portal_token) {
    return NextResponse.json({ error: 'No share link yet - close and reopen this dialog.' }, { status: 400 })
  }

  const { data: company } = project.gc_company_id
    ? await db.from('companies').select('name').eq('id', project.gc_company_id).maybeSingle()
    : { data: null }

  const { subject, text, html } = clientPortalEmail({
    clientName: project.client,
    projectName: project.name,
    senderName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    portalUrl: `${appOrigin(request.headers.get('origin'))}/portal/${project.client_portal_token}`,
    note,
  })

  const result = await sendEmail({ to, subject, text, html })
  if (!result.sent) {
    return NextResponse.json({
      sent: false,
      reason: result.reason,
      error: result.reason === 'not_configured'
        ? 'Email sending is not set up yet. Copy the link and send it yourself.'
        : 'Could not send that email. Copy the link and send it yourself.',
    }, { status: 200 })
  }

  // The send is what "we gave the client their link" MEANS, so this is where
  // the fact is written - never a column default, and never inferred from the
  // token existing (the dialog mints one on open, so that would claim a share
  // for anybody who merely looked). The setup checklist reads it.
  //
  // After the send, not before: a stamp written ahead of a send that fails
  // claims something that did not happen. Best-effort - the email HAS gone, so
  // a failure to record it must not turn a successful send into an error.
  const { error: stampErr } = await db.from('projects')
    .update({ portal_shared_at: new Date().toISOString(), portal_shared_how: 'email' })
    .eq('id', params.id)
  if (stampErr) console.error(`[portal] sent to ${to} but could not record the share: ${stampErr.message}`)

  return NextResponse.json({ sent: true, to })
}
