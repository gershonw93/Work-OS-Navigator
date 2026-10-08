import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { cents, dollars, drawCredit } from '@/lib/invoice-settlement'
import { creditPayments, issuedInvoices, syncInvoiceStatus } from '@/lib/invoice-settlement-db'
import { reapplyPaymentInQbo } from '@/lib/quickbooks-push'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Pay an invoice from the client's credit on account.
 *
 * NO NEW MONEY. The credit is what earlier payments held on account have not
 * yet applied; this adds allocation rows from those payments (oldest first) to
 * this invoice, so Funds Received and escrow do not move - the money was
 * counted the day it arrived. Then the invoice status follows the sums, and
 * any of those payments already in QuickBooks has its lines rewritten there,
 * so the credit is applied to the same QuickBooks payment rather than booked
 * as a second one.
 *
 * Body: `{ amount?: number }` - how much to apply. Absent means "as much as
 * covers it": the invoice's balance, or all the credit if that is less.
 */
export async function POST(request: Request, { params }: { params: { id: string; billId: string } }) {
  const gate = await requirePermission(admin(), request, 'payments', 'edit')
  if (denied(gate)) return gate.denied
  const db = admin()
  const body = await request.json().catch(() => ({}))

  const [invoices, credit] = await Promise.all([issuedInvoices(db, params.id), creditPayments(db, params.id)])
  // An unread balance or an unread credit is not zero of either - refuse
  // rather than apply against numbers we did not see.
  if (!invoices || !credit) {
    return NextResponse.json({ error: 'Could not read this job\'s invoices and credit. Try again in a moment.' }, { status: 503 })
  }
  const inv = invoices.find(i => i.id === params.billId)
  if (!inv) return NextResponse.json({ error: 'That invoice is not issued on this job.' }, { status: 404 })
  if (inv.balanceCents <= 0) return NextResponse.json({ error: `Invoice ${inv.invoice_number} is already paid in full.` }, { status: 400 })

  const asked = body.amount === undefined || body.amount === null ? inv.balanceCents : cents(body.amount)
  if (asked <= 0) return NextResponse.json({ error: 'Enter how much credit to apply.' }, { status: 400 })
  if (asked > inv.balanceCents) {
    return NextResponse.json({
      error: `That is more than invoice ${inv.invoice_number} still owes ($${dollars(inv.balanceCents).toLocaleString('en-US', { maximumFractionDigits: 2 })}).`,
    }, { status: 400 })
  }
  const { shares, shortCents } = drawCredit(credit, asked)
  if (!shares.length) return NextResponse.json({ error: 'There is no credit on account for this job.' }, { status: 400 })
  // Asking for an exact amount and getting less is not what was asked; asking
  // for "cover it" and getting what credit there is, is.
  if (shortCents > 0 && body.amount !== undefined && body.amount !== null) {
    return NextResponse.json({
      error: `There is only $${dollars(asked - shortCents).toLocaleString('en-US', { maximumFractionDigits: 2 })} of credit on account.`,
    }, { status: 400 })
  }

  // One share per payment per invoice (the unique index): a payment that
  // already pays part of this invoice has its share raised, not a second row.
  const { data: existing } = await db.from('client_payment_allocations')
    .select('id, payment_id, amount').eq('client_invoice_id', inv.id)
    .in('payment_id', shares.map(s => s.payment_id))
  for (const sh of shares) {
    const prior = (existing ?? []).find((e: any) => e.payment_id === sh.payment_id) as any
    const { error } = prior
      ? await db.from('client_payment_allocations').update({ amount: dollars(cents(prior.amount) + sh.cents) }).eq('id', prior.id)
      : await db.from('client_payment_allocations').insert({ payment_id: sh.payment_id, client_invoice_id: inv.id, amount: dollars(sh.cents) })
    if (error) {
      console.error('[apply-credit] could not record the allocation', error.message)
      await syncInvoiceStatus(db, [inv.id])
      return NextResponse.json({ error: 'Could not apply the credit. Reload and check the invoice before trying again.' }, { status: 500 })
    }
  }
  await syncInvoiceStatus(db, [inv.id])

  const applied = asked - shortCents
  await logActivity(db, params.id, 'Office', 'client_payment_received',
    `Credit on account applied to invoice ${inv.invoice_number} - $${dollars(applied).toLocaleString('en-US', { maximumFractionDigits: 2 })}`,
    { invoice_id: inv.id, amount: dollars(applied) }, gate.actor.userId)

  // The same QuickBooks payment now applies to this invoice too.
  const qb = await Promise.all(shares.map(s => reapplyPaymentInQbo(db, s.payment_id)))
  const failed = qb.find(r => !r.pushed && r.reason !== 'skipped' && r.reason !== 'not_connected')

  return NextResponse.json({
    applied: dollars(applied),
    ...(failed && !failed.pushed ? { quickbooks: { updated: false, detail: failed.detail ?? failed.reason } } : {}),
  })
}
