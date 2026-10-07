// ─────────────────────────────────────────────────────────────────────────────
// How much of a client invoice has been paid, and how a payment may be split.
//
// PURE. Every door that touches the answer asks these functions: the payments
// route when money is recorded, edited or deleted, the invoice list, the
// client portal, the client's own /bill page, and the QuickBooks push.
//
// THE BUG THIS EXISTS FOR. "Mark paid" set an invoice to `paid` whatever amount
// was typed into the payment box, so $5,000 against a $10,000 invoice read
// "Paid" here while QuickBooks - which applies the payment's real amount -
// still showed $5,000 owed. The two books disagreed and ours was the wrong one,
// and with the invoice marked paid the button to record the second $5,000 was
// gone. An invoice is paid when the money recorded against it covers it; it is
// never paid because somebody said so. `status = 'paid'` is now written ONLY by
// `syncInvoiceStatus` (lib/invoice-settlement-db.ts), from these numbers.
//
// AND ONE CHEQUE CAN PAY SEVERAL INVOICES. The link lives in
// `client_payment_allocations` - one row per invoice a payment pays, with the
// amount that went to it - and that table is the ONE home for the fact.
// `client_payments.client_invoice_id` is the old single link; migration 128
// copied every one into an allocation and nothing reads it any more.
//
// Money is compared in whole CENTS. `numeric` comes back from PostgREST as a
// string, and 0.1 + 0.2 is not 0.3 - a split that is a cent out either way
// must be refused or accepted for a reason a person can see, not for a
// floating-point one.
// ─────────────────────────────────────────────────────────────────────────────

export const cents = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
export const dollars = (c: number): number => c / 100

/** The invoice's total, from its lines - the same sum the client's copy prints. */
export function invoiceTotalCents(lines: { amount?: unknown }[] | null | undefined): number {
  return (lines ?? []).reduce((s, l) => s + cents(l.amount), 0)
}

export type SettlementState = 'unpaid' | 'partly_paid' | 'paid'

export interface Settlement {
  total: number
  paid: number
  /** Never negative: an over-applied invoice owes nothing, it does not owe a minus. */
  balance: number
  state: SettlementState
}

/** Where an invoice stands, given what has been applied to it. Dollars out. */
export function settlementOf(totalCents: number, appliedCents: number): Settlement {
  const balance = Math.max(totalCents - appliedCents, 0)
  const state: SettlementState = appliedCents <= 0
    ? 'unpaid'
    : balance === 0 ? 'paid' : 'partly_paid'
  return { total: dollars(totalCents), paid: dollars(appliedCents), balance: dollars(balance), state }
}

/**
 * The words for an invoice's payment state. One sentence, used by the office
 * list and the client's pages alike, so the two cannot describe one invoice
 * two ways.
 */
export function settlementLabel(s: Settlement): string | null {
  if (s.state !== 'partly_paid') return null
  const m = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`
  return `${m(s.paid)} of ${m(s.total)} paid · ${m(s.balance)} left`
}

export interface AllocationInput {
  client_invoice_id: string
  amount: unknown
}

export interface OpenInvoice {
  id: string
  invoice_number: string
  status: string
  /** What is still owed on it BEFORE this payment, in cents. */
  balanceCents: number
}

/**
 * What is wrong with splitting a payment this way, or null.
 *
 * Asked by the payment form AND the route - the form so the problem is on the
 * screen before anything is sent, the route because a second tab or an old
 * cached page does not run the form.
 *
 * No allocations is allowed: money that settles nothing in particular is a
 * deposit, and it books as one.
 */
export function allocationProblem(
  paymentAmount: unknown,
  allocations: AllocationInput[],
  invoices: OpenInvoice[],
): string | null {
  const total = cents(paymentAmount)
  if (total <= 0) return 'Enter the amount you received.'
  if (!allocations.length) return null

  const seen = new Set<string>()
  let applied = 0
  for (const a of allocations) {
    if (seen.has(a.client_invoice_id)) return 'The same invoice is listed twice.'
    seen.add(a.client_invoice_id)
    const inv = invoices.find(i => i.id === a.client_invoice_id)
    if (!inv) return 'One of those invoices is not on this job any more. Reload and try again.'
    if (inv.status !== 'sent' && inv.status !== 'paid') {
      return `Invoice ${inv.invoice_number} is ${inv.status === 'void' ? 'void' : 'not issued yet'}, so it cannot be paid.`
    }
    const c = cents(a.amount)
    if (c <= 0) return `Enter how much of this payment goes to invoice ${inv.invoice_number}.`
    if (c > inv.balanceCents) {
      return inv.balanceCents === 0
        ? `Invoice ${inv.invoice_number} is already paid in full.`
        : `That is more than invoice ${inv.invoice_number} still owes ($${dollars(inv.balanceCents).toLocaleString('en-US', { maximumFractionDigits: 2 })}).`
    }
    applied += c
  }
  if (applied !== total) {
    const diff = dollars(Math.abs(total - applied)).toLocaleString('en-US', { maximumFractionDigits: 2 })
    return applied < total
      ? `The invoices add up to $${diff} less than the payment. Put the rest on an invoice, or lower the payment amount.`
      : `The invoices add up to $${diff} more than the payment.`
  }
  return null
}

/**
 * Spread a payment across the invoices ticked, oldest first, never past what
 * each still owes - the default the form shows when somebody ticks invoices
 * after typing the cheque amount. Whatever is left over stays unapplied, and
 * `allocationProblem` will say so.
 */
export function spreadPayment(totalCents: number, invoices: OpenInvoice[]): Record<string, number> {
  let left = Math.max(totalCents, 0)
  const out: Record<string, number> = {}
  for (const inv of invoices) {
    const take = Math.min(left, inv.balanceCents)
    out[inv.id] = take
    left -= take
  }
  return out
}
