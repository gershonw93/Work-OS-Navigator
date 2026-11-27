import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, loadInvoice, invoiceParts, ensureBillingCustomer, newToken, INVOICE_COLS, type InvoiceRow } from '@/lib/service-billing-server'
import { invoiceProblem, amountDueCents, usd } from '@/lib/service-billing'
import { pushServiceCallInvoice } from '@/lib/quickbooks-push'
import { serviceInvoiceEmail, sendEmail, emailConfig } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import { dayWords } from '@/lib/dates'
import { logEvent, actorName } from '@/lib/service-calls-server'

export const runtime = 'nodejs'
// The QuickBooks push (capped at 8s) and the email run inside this request.
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST - send the invoice to the customer. On a DRAFT this is the whole act:
//
//   1. it must be a complete invoice (`invoiceProblem`, the form's own rule);
//   2. it is CLAIMED - draft -> sent on a conditional update - so a double
//      press cannot send it twice;
//   3. the customer gets a `customers` row, which a QuickBooks Customer needs;
//   4. it goes to QUICKBOOKS FIRST, and the total QuickBooks came to (with any
//      sales tax it added) is read back - so the email asks for the amount the
//      books hold, not the pre-tax lines;
//   5. THEN the customer is emailed, from the sub, replies to whoever sent it;
//   6. the call moves Done -> Invoiced.
//
// On an invoice already SENT it only emails the link again. QuickBooks not
// being connected, or refusing, never stops the send: the invoice is real, the
// backlog sync picks it up, and the response SAYS what happened to each half.
export async function POST(request: Request, { params }: { params: { invoiceId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied
  let inv = found.invoice
  if (inv.status === 'void') return NextResponse.json({ error: 'This invoice is void.' }, { status: 409 })

  const parts = await invoiceParts(db, inv.id)
  if (!parts) return NextResponse.json({ error: 'Could not load the invoice. Try again.' }, { status: 500 })

  const resend = inv.status !== 'draft'
  type QboOutcome = 'pushed' | 'already' | 'not_connected' | 'failed' | 'skipped'
  let qbo = 'already' as QboOutcome
  let qboDetail: string | undefined

  if (!resend) {
    const problem = invoiceProblem({ customer_name: inv.customer_name, lines: parts.lines, issue_date: inv.issue_date, due_date: inv.due_date })
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })

    let call: any = null
    if (inv.call_id) {
      const { data } = await db.from('service_calls').select('id, status, contact_phone, site_address')
        .eq('id', inv.call_id).eq('company_id', gate.companyId).maybeSingle()
      call = data
    }
    const customerId = await ensureBillingCustomer(db, gate.companyId, {
      customer_id: inv.customer_id, customer_name: inv.customer_name, customer_email: inv.customer_email,
      phone: call?.contact_phone ?? null, address: call?.site_address ?? null,
    })
    if (!customerId) return NextResponse.json({ error: 'Could not set up the customer record for this invoice. Try again.' }, { status: 500 })

    // THE CLAIM. Only one request moves this draft to sent.
    const { data: claimed, error: claimErr } = await db.from('service_call_invoices').update({
      status: 'sent', sent_at: new Date().toISOString(), token: inv.token ?? newToken(),
      customer_id: customerId, updated_at: new Date().toISOString(),
    }).eq('id', inv.id).eq('company_id', gate.companyId).eq('status', 'draft').select(INVOICE_COLS)
    if (claimErr) {
      console.error('[service-billing] send claim failed', { invoice: inv.id, error: claimErr.message })
      return NextResponse.json({ error: 'Could not send the invoice. Try again.' }, { status: 500 })
    }
    if (!claimed?.length) return NextResponse.json({ error: 'This invoice was sent a moment ago, from another screen.' }, { status: 409 })
    inv = claimed[0] as unknown as InvoiceRow

    // QuickBooks first, and read back what it came to.
    const r = await pushServiceCallInvoice(db, inv.id)
    qbo = r.pushed ? 'pushed' : (r.reason as QboOutcome)
    qboDetail = r.pushed ? undefined : r.detail
    const again = await loadInvoice(db, gate.companyId, inv.id)
    if (!('denied' in again)) inv = again.invoice

    // The call moves on: an invoice has gone out for it.
    if (call && call.status === 'done') {
      const { error: moveErr } = await db.from('service_calls').update({ status: 'invoiced', updated_at: new Date().toISOString() })
        .eq('id', call.id).eq('company_id', gate.companyId).eq('status', 'done')
      if (!moveErr) {
        await logEvent(db, call.id, {
          kind: 'status', status: 'invoiced', note: `Invoice ${inv.invoice_number} sent`,
          actorId: gate.actor.userId, actorName: await actorName(db, gate.actor.userId),
        })
      }
    }
  }

  // The letter. No address is not a failure - the link can be copied.
  let emailed = false
  let emailNote: string | null = null
  if (!inv.customer_email) emailNote = 'There is no email address on it, so nobody was emailed. Copy the link and send it yourself, or add an address and send again.'
  else if (!emailConfig().configured) emailNote = 'Email is not set up here, so nobody was emailed. Copy the link to send it.'
  else {
    const [{ data: company }, { data: me }] = await Promise.all([
      db.from('companies').select('name').eq('id', gate.companyId).maybeSingle(),
      db.auth.admin.getUserById(gate.actor.userId),
    ])
    const tax = inv.tax_amount !== null && Number(inv.tax_amount) > 0 ? `Includes ${usd(inv.tax_amount)} sales tax` : null
    const msg = serviceInvoiceEmail({
      companyName: (company as any)?.name ?? null,
      customerName: inv.customer_name,
      invoiceNumber: inv.invoice_number,
      amountDue: usd(amountDueCents(inv) / 100),
      dueWords: dayWords(inv.due_date, { weekday: true }),
      taxNote: tax,
      viewUrl: `${appOrigin()}/service-invoice/${inv.token}`,
    })
    const result = await sendEmail({ to: inv.customer_email, ...msg, replyTo: me?.user?.email ?? null })
    emailed = result.sent
    if (!result.sent) {
      console.error('[service-billing] invoice email failed', { invoice: inv.id, reason: result.reason, detail: result.detail })
      emailNote = `The invoice is sent, but the email did not go out${result.detail ? ` (${result.detail})` : ''}. Copy the link to send it yourself.`
    }
  }

  const qboNote = resend ? null
    : qbo === 'pushed' ? `In QuickBooks${inv.tax_amount !== null && Number(inv.tax_amount) > 0 ? `, with ${usd(inv.tax_amount)} sales tax added` : ''}.`
    : qbo === 'not_connected' ? 'QuickBooks is not connected, so it is not in your books yet.'
    : qbo === 'failed' ? `QuickBooks refused it${qboDetail ? `: ${qboDetail}` : ''}. It is retried from Settings, QuickBooks.`
    : null

  return NextResponse.json({
    ok: true, resent: resend, emailed, qbo,
    note: [emailed ? `Emailed to ${inv.customer_email}.` : emailNote, qboNote].filter(Boolean).join(' '),
    link: inv.token ? `${appOrigin()}/service-invoice/${inv.token}` : null,
  })
}
