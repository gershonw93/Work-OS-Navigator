import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { appOrigin } from '@/lib/app-url'
import { sendEmail, tokenLinkEmail } from '@/lib/email'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Params = { params: { id: string; coId: string } }

/**
 * Put a change order on the client's link (POST), or take it off (DELETE).
 *
 * The ONLY writer of `client_shared_at`: a change order tied to a subcontract
 * carries the sub's price, so nothing else may put one in front of a client.
 * `change-orders: edit` AND `ownedProject` - it is the GC's contract with the
 * GC's client. POST takes `email: true` to also send the client their link; the
 * share stands whether or not that email goes, and the answer says which.
 */
async function resolve(request: Request, { params }: Params) {
  const db = admin()
  const g = await requirePermission(db, request, 'change-orders', 'edit')
  if (denied(g)) return { denied: g.denied }
  const owned = await ownedProject<{ name: string | null; client: string | null; customer_id: string | null; client_portal_token: string | null }>(
    db, g.actor, params.id, 'name, client, customer_id, client_portal_token')
  if ('denied' in owned) return { denied: owned.denied }
  const { data: co } = await db.from('change_orders').select('id, title, amount, client_shared_at')
    .eq('id', params.coId).eq('project_id', params.id).maybeSingle()
  if (!co) return { denied: NextResponse.json({ error: 'Change order not found' }, { status: 404 }) }
  const { data: me } = await db.from('profiles').select('full_name').eq('id', g.actor.userId).maybeSingle()
  return { db, actor: g.actor, project: owned.project, co, me: (me as any)?.full_name ?? 'Someone' }
}

export async function POST(request: Request, ctx: Params) {
  const r = await resolve(request, ctx)
  if ('denied' in r) return r.denied
  const { email } = await request.json().catch(() => ({} as any))

  // A link has to exist for there to be anything to put it on. Shared without
  // one would be a change order nobody can open - say so instead.
  if (!r.project.client_portal_token) {
    return NextResponse.json({ error: 'This job has not been shared with the client yet. Share the client link first, then share the change order.' }, { status: 409 })
  }

  if (!r.co.client_shared_at) {
    const { error } = await r.db.from('change_orders')
      .update({ client_shared_at: new Date().toISOString(), client_shared_by: r.actor.userId })
      .eq('id', r.co.id).eq('project_id', ctx.params.id)
    if (error) {
      console.error('[change-order share] failed', error)
      return NextResponse.json({ error: 'Could not share it. Try again.' }, { status: 500 })
    }
    await logActivity(r.db, ctx.params.id, r.me, 'change_order_updated', `Change order "${r.co.title}" shared with the client`, { change_order_id: r.co.id })
  }

  let emailed: { sent: boolean; reason: string | null; to: string | null } | null = null
  if (email === true) {
    let to: string | null = null
    if (r.project.customer_id) {
      const { data: c } = await r.db.from('customers').select('email').eq('id', r.project.customer_id).maybeSingle()
      to = (c as any)?.email ?? null
    }
    if (!to) emailed = { sent: false, reason: 'no_email', to: null }
    else {
      const msg = tokenLinkEmail({
        recipientName: r.project.client,
        eyebrow: 'Change order',
        heading: r.co.title,
        lines: [
          `There is a change order on ${r.project.name ?? 'your job'} for you to look at.`,
          `Open it to see what changes and what it costs, approve or decline it, or ask a question.`,
        ],
        ctaLabel: 'Review the change order',
        url: `${appOrigin(request.headers.get('origin'))}/portal/${r.project.client_portal_token}#change-orders`,
        fromName: r.me,
        companyName: null,
      })
      const sent = await sendEmail({ to, ...msg })
      if (!sent.sent) console.error('[change-order share] email not sent', { coId: r.co.id, reason: sent.reason })
      emailed = { sent: sent.sent, reason: sent.sent ? null : sent.reason, to }
    }
  }
  return NextResponse.json({ shared: true, emailed })
}

export async function DELETE(request: Request, ctx: Params) {
  const r = await resolve(request, ctx)
  if ('denied' in r) return r.denied
  // Taking it off the link keeps the client's answer and the thread: they are
  // a record of what was said, and sharing it again brings both back.
  const { error } = await r.db.from('change_orders').update({ client_shared_at: null, client_shared_by: null })
    .eq('id', r.co.id).eq('project_id', ctx.params.id)
  if (error) return NextResponse.json({ error: 'Could not take it off the client link.' }, { status: 500 })
  await logActivity(r.db, ctx.params.id, r.me, 'change_order_updated', `Change order "${r.co.title}" taken off the client link`, { change_order_id: r.co.id })
  return NextResponse.json({ shared: false })
}
