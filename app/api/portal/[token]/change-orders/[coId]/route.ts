import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { clientResponseProblem } from '@/lib/change-order-client'
import { clientAuthor } from '@/lib/client-thread'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client approves or declines a change order shared on their link.
 *
 * The token is the credential; the change order has to be on its job AND
 * shared. It writes the client's ANSWER only - never `status`, which moves money
 * and stays the GC's decision - and then tells whoever approves change orders,
 * so that decision is made with the client's yes or no in front of them.
 */
export async function POST(request: Request, { params }: { params: { token: string; coId: string } }) {
  const db = admin()
  const { data: project } = await db.from('projects').select('id, name, client, gc_company_id')
    .eq('client_portal_token', params.token).maybeSingle()
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const { data: co } = await db.from('change_orders').select('id, title, amount, status, client_shared_at')
    .eq('id', params.coId).eq('project_id', project.id).maybeSingle()

  const payload = await request.json().catch(() => ({} as any))
  const note = typeof payload?.note === 'string' && payload.note.trim() ? payload.note.trim() : null
  const problem = clientResponseProblem(co as any, payload?.response, note)
  if (problem) return NextResponse.json({ error: problem }, { status: co && (co as any).client_shared_at ? 409 : 404 })

  const name = clientAuthor(payload?.name, (project as any).client)
  const { error } = await db.from('change_orders').update({
    client_response: payload.response,
    client_response_at: new Date().toISOString(),
    client_response_name: name,
    client_response_note: note,
  }).eq('id', (co as any).id).eq('project_id', project.id).eq('status', 'pending')
  if (error) {
    console.error('[change-order respond] failed', error)
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }

  const team = await audienceFor({ db, companyId: (project as any).gc_company_id, type: 'client_change_order' })
  await notify({
    db,
    userIds: team,
    type: 'client_change_order',
    title: `${name} ${payload.response === 'approved' ? 'approved' : 'declined'} ${(co as any).title}`,
    message: `${(project as any).name ? `${(project as any).name}: ` : ''}${payload.response === 'approved'
      ? 'Approve it on the Change Orders tab to add it to the contract.'
      : 'It is still pending on the Change Orders tab.'}${note ? ` "${note.length > 160 ? `${note.slice(0, 157)}...` : note}"` : ''}`,
    link: `/projects/${(project as any).id}/change-orders`,
  })

  return NextResponse.json({
    ok: true,
    message: payload.response === 'approved'
      ? 'Thanks - we have your approval. We will confirm once it is added to the contract.'
      : 'Thanks - we have your answer and will be in touch.',
  })
}
