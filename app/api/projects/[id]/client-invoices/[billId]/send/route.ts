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
 * Email a client their invoice link.
 *
 * Unlike the other three, this table stores NO recipient - the old mailto was
 * literally `mailto:?subject=...`, an empty To: field beside a link the app
 * could have addressed itself. The GET below hands the UI the customer's
 * address to pre-fill; the caller can still change it.
 */
export async function POST(request: Request, { params }: { params: { id: string; billId: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const [{ data: bill }, { data: project }, { data: me }] = await Promise.all([
    db.from('client_invoices').select('token, invoice_number, due_date').eq('id', params.billId).maybeSingle(),
    db.from('projects').select('name, client, gc_company_id').eq('id', params.id).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ])
  if (!bill?.token) return NextResponse.json({ error: 'That invoice has no link yet.' }, { status: 400 })

  const { data: company } = (project as any)?.gc_company_id
    ? await db.from('companies').select('name').eq('id', (project as any).gc_company_id).maybeSingle()
    : { data: null }

  const due = (bill as any)?.due_date
    ? `It is due ${new Date((bill as any).due_date + 'T00:00:00').toLocaleDateString()}.`
    : null

  const email = tokenLinkEmail({
    recipientName: (project as any)?.client,
    eyebrow: 'Invoice',
    heading: `Invoice ${bill.invoice_number ?? ''}`.trim(),
    lines: [
      `${(company as any)?.name ?? 'Your contractor'} has sent you an invoice${(project as any)?.name ? ` for ${(project as any).name}` : ''}.`,
      'The link shows the full breakdown.',
      ...(due ? [due] : []),
    ],
    ctaLabel: 'View invoice',
    url: `${appOrigin(request.headers.get('origin'))}/bill/${bill.token}`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: () => db.from('client_invoices')
      .update({ sent_at: new Date().toISOString(), status: 'sent' })
      .eq('id', params.billId),
  })
}
