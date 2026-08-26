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

/** Email a sub their private link to quote a scope of work. */
export async function POST(request: Request, { params }: { params: { id: string; reqId: string; inviteId: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const [{ data: invite }, { data: req }, { data: me }] = await Promise.all([
    db.from('bid_invites').select('token, vendor_name').eq('id', params.inviteId).maybeSingle(),
    db.from('bid_requests').select('title, trade, due_date').eq('id', params.reqId).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
  ])
  if (!invite?.token) return NextResponse.json({ error: 'That invite no longer exists.' }, { status: 404 })

  const { data: company } = (me as any)?.company_id
    ? await db.from('companies').select('name').eq('id', (me as any).company_id).maybeSingle()
    : { data: null }

  const scope = [(req as any)?.title, (req as any)?.trade].filter(Boolean).join(' - ') || 'a scope of work'
  const due = (req as any)?.due_date
    ? `Please get it back by ${new Date((req as any).due_date + 'T00:00:00').toLocaleDateString()}.`
    : null

  const email = tokenLinkEmail({
    recipientName: invite.vendor_name,
    eyebrow: 'Request for quote',
    heading: `Quote request: ${scope}`,
    lines: [
      `${(company as any)?.name ?? 'A contractor'} would like your price for ${scope}.`,
      'The link has the scope and any plans attached, and you can submit your quote straight from it.',
      ...(due ? [due] : []),
    ],
    ctaLabel: 'View scope and quote',
    url: `${appOrigin(request.headers.get('origin'))}/bid/${invite.token}`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    // 'invited' is this table's sent state; it starts null until somebody is
    // actually told, and moves to viewed/submitted from the sub's side.
    onSent: () => db.from('bid_invites').update({ status: 'invited' }).eq('id', params.inviteId),
  })
}
