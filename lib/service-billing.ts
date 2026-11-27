// ─────────────────────────────────────────────────────────────────────────────
// BILLING A SERVICE CALL'S CUSTOMER - the rules, pure, so every one is a test
// (lib/__tests__/service-billing.ts). The routes ask these and so do the
// screens, so a refusal is on the control rather than a failed request.
//
// The owner's ask: "We also need to be able to bill a customer. Full build out
// and qb integrated." Decided with them: email the customer a link and record
// the payment by hand; QuickBooks adds any sales tax; a company keeps a price
// list. Migration 172.
//
// THE MONEY RULES ARE THE JOB INVOICES', NOT A SECOND SET. Sums are in cents
// and a balance comes from `settlementOf` (lib/invoice-settlement.ts), so a
// call's invoice and a job's say "paid" by the same arithmetic.
//
// THREE THINGS THAT COST SOMETHING IF BROKEN:
//   - PAID IS WHAT THE MONEY SAYS (`statusAfterPayments`), never a button. The
//     route recomputes it after every payment written or voided.
//   - A PAYMENT NEVER EXCEEDS WHAT IS OWED (`paymentProblem`). There is no
//     credit-on-account here: money left over is a typo until somebody says
//     otherwise, and QuickBooks would book it as unapplied credit nobody chose.
//   - THE TOTAL THE CUSTOMER IS ASKED FOR IS QUICKBOOKS' WHEN IT ADDED TAX
//     (`amountDue`). We send the lines; QuickBooks Online's automated sales tax
//     may add to them; the invoice is pushed BEFORE it is emailed and the total
//     QuickBooks came to is read back, so the letter and the books agree.
// ─────────────────────────────────────────────────────────────────────────────

import { cents, dollars, settlementOf, type Settlement } from './invoice-settlement'

export const BILL_STATUSES = ['draft', 'sent', 'paid', 'void'] as const
export type BillStatus = (typeof BILL_STATUSES)[number]

export const BILL_STATUS_LABEL: Record<BillStatus, string> = {
  draft: 'Draft', sent: 'Sent', paid: 'Paid', void: 'Void',
}

export const UNITS = ['each', 'hour'] as const
export type Unit = (typeof UNITS)[number]
export const UNIT_LABEL: Record<Unit, string> = { each: 'each', hour: 'per hour' }

export const PAYMENT_METHODS = ['Check', 'Cash', 'Credit card', 'ACH / bank transfer', 'Other'] as const

export type LineInput = { description?: string | null; quantity?: unknown; unit?: string | null; unit_price?: unknown }
export type Line = { description: string; quantity: number; unit: Unit; unit_price: number; amount: number }

/** One line as stored: trimmed, a known unit, and its amount worked out in cents. */
export function cleanLine(l: LineInput): Line {
  const quantity = Math.round(Number(l.quantity ?? 0) * 100) / 100
  const unit_price = dollars(cents(l.unit_price))
  const unit: Unit = (UNITS as readonly string[]).includes(String(l.unit)) ? (l.unit as Unit) : 'each'
  return {
    description: String(l.description ?? '').trim(),
    quantity,
    unit,
    unit_price,
    amount: dollars(Math.round(quantity * cents(unit_price))),
  }
}

/** What the lines add up to, in cents. */
export function subtotalCents(lines: readonly { amount?: unknown }[]): number {
  return lines.reduce((s, l) => s + cents(l.amount), 0)
}

/**
 * What is wrong with an invoice as it would be saved, or null. A line has to
 * say what it is and carry a positive quantity; a price may be zero (a
 * warranty call is still worth a record) but the invoice as a whole may not.
 */
export function invoiceProblem(f: { customer_name?: string | null; lines: readonly LineInput[]; due_date?: string | null; issue_date?: string | null }): string | null {
  if (!String(f.customer_name ?? '').trim()) return 'Who is this invoice to? Add the customer.'
  if (!f.lines.length) return 'Add at least one line - what was done, or a part.'
  for (let i = 0; i < f.lines.length; i++) {
    const raw = f.lines[i]
    const l = cleanLine(raw)
    if (!l.description) return `Line ${i + 1} needs a description.`
    if (!(l.quantity > 0)) return `Line ${i + 1} needs a quantity above zero.`
    if (cents(raw.unit_price) < 0) return `Line ${i + 1} cannot have a negative price.`
  }
  if (subtotalCents(f.lines.map(cleanLine)) <= 0) return 'The invoice comes to nothing. Add a price to at least one line.'
  if (f.due_date && f.issue_date && f.due_date < f.issue_date) return 'The due date is before the invoice date.'
  return null
}

/** What a sent invoice is being asked to pay: QuickBooks' total if it added tax, else the lines. */
export function amountDueCents(inv: { subtotal: unknown; total?: unknown; tax_amount?: unknown }): number {
  const total = cents(inv.total)
  return total > 0 ? total : cents(inv.subtotal)
}

/** Where an invoice stands, from the payments against it. */
export function billSettlement(inv: { subtotal: unknown; total?: unknown; tax_amount?: unknown }, payments: readonly { amount: unknown; voided?: boolean }[]): Settlement {
  const paid = payments.filter(p => !p.voided).reduce((s, p) => s + cents(p.amount), 0)
  return settlementOf(amountDueCents(inv), paid)
}

/**
 * The status an invoice should have after its payments changed. Only a SENT
 * invoice can become paid, and only by money covering it; a paid one whose
 * payment was voided goes back to sent. Draft and void are not moved by money.
 */
export function statusAfterPayments(status: BillStatus, s: Settlement): BillStatus {
  if (status === 'sent' && s.state === 'paid') return 'paid'
  if (status === 'paid' && s.state !== 'paid') return 'sent'
  return status
}

/** May this payment be recorded against this invoice? A sentence, or null. */
export function paymentProblem(
  inv: { status: BillStatus; subtotal: unknown; total?: unknown; tax_amount?: unknown },
  payments: readonly { amount: unknown; voided?: boolean }[],
  p: { amount?: unknown; paid_date?: string | null },
): string | null {
  if (inv.status === 'draft') return 'Send the invoice before recording a payment against it.'
  if (inv.status === 'void') return 'This invoice is void.'
  const amount = cents(p.amount)
  if (amount <= 0) return 'How much was paid? Enter an amount above zero.'
  if (!p.paid_date) return 'When was it paid? Add the date.'
  const left = cents(billSettlement(inv, payments).balance)
  if (left <= 0) return 'This invoice is already paid in full.'
  if (amount > left) {
    return `That is more than is owed ($${dollars(left).toFixed(2)}). Record the amount owed, or check the figure.`
  }
  return null
}

/**
 * The next invoice number for a company: SVC-1001, SVC-1002... A prefix of its
 * own so a service invoice never collides with a job invoice's INV- number in
 * the same QuickBooks file (the duplicate check keys on the number).
 */
export function nextInvoiceNumber(existing: readonly string[]): string {
  const top = existing.reduce((m, n) => {
    const hit = /^SVC-(\d+)$/.exec(String(n).trim())
    return hit ? Math.max(m, Number(hit[1])) : m
  }, 1000)
  return `SVC-${top + 1}`
}

/** "$1,234.50" - a figure on a service invoice. */
export const usd = (v: unknown): string =>
  `$${(cents(v) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Due in N days from an ISO date. */
export function dueIn(issueIso: string, days: number): string {
  const d = new Date(`${issueIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** May this invoice still be edited line by line? Only a draft: a sent one is in the books. */
export const editable = (status: BillStatus) => status === 'draft'

// ── the price list ──────────────────────────────────────────────────────────

export const PRICE_COLS = 'id, name, unit, unit_price, active, sort_order'

/** What is wrong with a price item, or null. Asked by the form and the route. */
export function priceItemProblem(b: { name?: unknown; unit_price?: unknown; unit?: unknown }): string | null {
  if (!String(b.name ?? '').trim()) return 'Give it a name, e.g. "Service call fee".'
  if (cents(b.unit_price) < 0) return 'A price cannot be negative.'
  if (b.unit !== undefined && !(UNITS as readonly string[]).includes(String(b.unit))) return 'A price is per item or per hour.'
  return null
}
