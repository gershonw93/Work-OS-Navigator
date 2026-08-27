import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { tokenLinkEmail } from '@/lib/email'
import { deliverLink, readSendBody } from '@/lib/send-link'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Email the client a request for a deposit or stage payment.
 *
 * Goes through deliverLink like the other four token-link sends, so it obeys
 * the same contract: never throws, answers 200 with { sent: false } when it
 * did not send, and stamps sent_at ONLY on a confirmed send. A request marked
 * "sent" that never left is worse than one that visibly failed - you would
 * chase the client for ignoring an email they never got.
 *
 * The link is the project's existing client portal token. No new token is
 * minted here: minting inside a send is what let the share dialog invalidate
 * the very link it was sending (#295).
 */
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const [{ data: req }, { data: project }, { data: me }] = await Promise.all([
    db.from('client_payment_requests').select('*').eq('id', params.reqId).eq('project_id', params.id).maybeSingle(),
    db.from('projects').select('name, client, client_portal_token').eq('id', params.id).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
  ])

  if (!req) return NextResponse.json({ sent: false, error: 'That request no longer exists.' }, { status: 404 })
  if (!(project as any)?.client_portal_token) {
    return NextResponse.json({
      sent: false,
      error: 'This job has no client portal link yet. Open Share with Client once to create one, then send this.',
    }, { status: 200 })
  }

  const { data: company } = (me as any)?.company_id
    ? await db.from('companies').select('name').eq('id', (me as any).company_id).maybeSingle()
    : { data: null }

  const amount = Number((req as any).amount).toLocaleString(undefined, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  })
  const jobName = (project as any)?.name ?? 'your project'
  const chasing = !!(req as any).sent_at

  const email = tokenLinkEmail({
    recipientName: (project as any)?.client ?? null,
    eyebrow: chasing ? 'Payment reminder' : 'Payment request',
    heading: `${(req as any).label}: ${amount}`,
    lines: [
      chasing
        ? `A reminder that ${amount} is due for ${(req as any).label.toLowerCase()} on ${jobName}.`
        : `${(company as any)?.name ?? 'Your contractor'} is requesting ${amount} for ${(req as any).label.toLowerCase()} on ${jobName}.`,
      ...((req as any).due_hint ? [`This was agreed as due ${(req as any).due_hint}.`] : []),
      'Your project page below shows this alongside progress, schedule and everything else on the job.',
    ],
    ctaLabel: 'View your project',
    url: `${appOrigin(request.headers.get('origin'))}/portal/${(project as any).client_portal_token}`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: () => db.from('client_payment_requests')
      .update({ sent_at: new Date().toISOString(), sent_to: to })
      .eq('id', params.reqId),
  })
}
