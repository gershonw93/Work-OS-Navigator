import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, loadInvoice, invoiceParts, syncBillStatus, asMoney } from '@/lib/service-billing-server'
import { paymentProblem, PAYMENT_METHODS, billSettlement, usd } from '@/lib/service-billing'
import { pushServiceCallPayment } from '@/lib/quickbooks-push'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST - record money the customer paid against this invoice.
//
// `paymentProblem` decides - the form asks the same rule - so a payment on a
// draft, a void, or for more than is owed is refused with a sentence. PAID IS
// WHAT THE MONEY SAYS: the status is recomputed from the payments that exist
// (`syncBillStatus`), never set because a button was pressed. Then it goes to
// QuickBooks as a Payment APPLIED to the invoice; if the invoice is not there
// yet the payment books nothing and waits (lib/quickbooks-push.ts).
export async function POST(request: Request, { params }: { params: { invoiceId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied
  const inv = found.invoice
  const parts = await invoiceParts(db, inv.id)
  if (!parts) return NextResponse.json({ error: 'Could not load the invoice. Try again.' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const p = {
    amount: body.amount,
    paid_date: typeof body.paid_date === 'string' && body.paid_date ? body.paid_date : null,
    method: (PAYMENT_METHODS as readonly string[]).includes(body.method) ? body.method : null,
    reference: String(body.reference ?? '').trim() || null,
    memo: String(body.memo ?? '').trim() || null,
  }
  const problem = paymentProblem(inv, parts.payments, p)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data: row, error } = await db.from('service_call_payments').insert({
    company_id: gate.companyId, invoice_id: inv.id, amount: asMoney(p.amount), paid_date: p.paid_date,
    method: p.method, reference: p.reference, memo: p.memo, created_by: gate.actor.userId,
  }).select('id').single()
  if (error) {
    console.error('[service-billing] payment insert failed', { invoice: inv.id, error: error.message })
    return NextResponse.json({ error: 'Could not record the payment. Try again.' }, { status: 500 })
  }
  const status = await syncBillStatus(db, inv)

  const r = await pushServiceCallPayment(db, (row as any).id)
  const qboNote = r.pushed ? 'In QuickBooks, applied to the invoice.'
    : r.reason === 'not_connected' ? 'QuickBooks is not connected, so it is not in your books yet.'
    : r.reason === 'skipped' && /Waiting/.test(r.detail ?? '') ? 'It goes to QuickBooks once the invoice is there.'
    : r.reason === 'failed' ? `QuickBooks refused it${r.detail ? `: ${r.detail}` : ''}. It is retried from Settings, QuickBooks.`
    : null
  const left = billSettlement(inv, [...parts.payments, { amount: p.amount }]).balance
  return NextResponse.json({
    ok: true, status,
    note: [status === 'paid' ? 'Paid in full.' : `Recorded. ${usd(left)} still owed.`, qboNote].filter(Boolean).join(' '),
  }, { status: 201 })
}
