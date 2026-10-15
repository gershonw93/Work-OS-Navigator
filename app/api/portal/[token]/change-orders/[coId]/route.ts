import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { logActivity } from '@/lib/log-activity'
import { approvalCounts, clientResponseProblem } from '@/lib/change-order-client'
import { clientAuthor } from '@/lib/client-thread'
import { clientEmailFor, signedInClient } from '@/lib/portal-login-server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client approves or declines a change order shared on their link.
 *
 * The token finds the job; the change order has to be on it AND shared. The
 * answer itself needs the CLIENT SIGNED IN - the address on the session must be
 * the one on the job's customer record - because a link gets forwarded and a
 * yes can move money.
 *
 * For a change order with no subcontract the client's approval IS the approval
 * (`approvalCounts`): status moves to `approved`, conditionally on it still
 * being pending. One tied to a subcontract folds money into the SUB's contract,
 * so there the answer stays a record and whoever approves change orders is
 * told. A decline is always a record.
 */
export async function POST(request: Request, { params }: { params: { token: string; coId: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects').select('id, name, client, gc_company_id, customer_id')
    .eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const { data: co } = await db.from('change_orders').select('id, title, amount, status, client_shared_at, subcontract_id')
    .eq('id', params.coId).eq('project_id', project.id).maybeSingle()

  const payload = await request.json().catch(() => ({} as any))
  const note = typeof payload?.note === 'string' && payload.note.trim() ? payload.note.trim() : null
  const problem = clientResponseProblem(co as any, payload?.response, note)
  if (problem) return NextResponse.json({ error: problem }, { status: co && (co as any).client_shared_at ? 409 : 404 })

  const who = await signedInClient(db, request, await clientEmailFor(db, (project as any).customer_id))
  if (!who.ok) {
    return NextResponse.json({
      error: who.reason === 'no_email_on_file'
        ? 'We do not have an email address for you on this job yet - ask us to add it, then you can sign in and answer.'
        : who.reason === 'wrong_person'
          ? 'You are signed in as somebody else. Sign out and sign in with the address we have for you on this job.'
          : 'Sign in to answer - we will email you a code.',
      needs_login: true,
      reason: who.reason,
    }, { status: 401 })
  }

  const counts = payload.response === 'approved' && approvalCounts(co as any)
  const name = clientAuthor(payload?.name, (project as any).client)
  const now = new Date().toISOString()
  const { data: saved, error } = await db.from('change_orders').update({
    client_response: payload.response,
    client_response_at: now,
    client_response_name: name,
    client_response_note: note,
    client_response_email: who.email,
    ...(counts ? { status: 'approved' } : {}),
  }).eq('id', (co as any).id).eq('project_id', project.id).eq('status', 'pending').select('id')
  if (error) {
    console.error('[change-order respond] failed', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }
  // Conditional on pending: if the GC decided in between, nothing was written.
  if (!saved?.length) {
    return NextResponse.json({ error: 'This change order was just updated - reload to see where it stands.' }, { status: 409 })
  }

  if (counts) {
    await logActivity(db, (project as any).id, `${name} (client)`, 'change_order_updated',
      `Change order "${(co as any).title}" approved by the client`,
      { change_order_id: (co as any).id, status: 'approved', client_email: who.email })
  }

  const team = await audienceFor({ db, companyId: (project as any).gc_company_id, type: 'client_change_order' })
  await notify({
    db,
    userIds: team,
    type: 'client_change_order',
    title: `${name} ${payload.response === 'approved' ? 'approved' : 'declined'} ${(co as any).title}`,
    message: `${(project as any).name ? `${(project as any).name}: ` : ''}${counts
      ? 'It is approved and added to the contract.'
      : payload.response === 'approved'
        ? 'It is tied to a subcontract - approve it on the Change Orders tab to add it to the contract.'
        : 'It is still pending on the Change Orders tab.'}${note ? ` "${note.length > 160 ? `${note.slice(0, 157)}...` : note}"` : ''}`,
    link: `/projects/${(project as any).id}/change-orders`,
  })

  return NextResponse.json({
    ok: true,
    approved: counts,
    message: counts
      ? 'Thanks - it is approved and added to your contract.'
      : payload.response === 'approved'
        ? 'Thanks - we have your approval. We will confirm once it is added to the contract.'
        : 'Thanks - we have your answer and will be in touch.',
  })
}
