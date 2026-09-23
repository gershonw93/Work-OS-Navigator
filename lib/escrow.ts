import { feeForInvoice, type Allocation, type LineRate } from './allocations'
import { ACTUAL_STATUSES } from './invoice-budget'
import { toAmount } from './schedule-dependencies'

// ─────────────────────────────────────────────────────────────────────────────
// A job's escrow, and the money around it - ONE derivation for every screen.
//
// THE BUG. Master Money and the job's own Billing the client tab disagreed on
// escrow for the same job. The tab worked the contractor fee out bill by bill
// (feeForInvoice: a bill marked at cost earns nothing, a bill can carry its own
// rate, a bill split across budget lines earns each line's rate on its part);
// Master Money multiplied ALL vendor billing by the job's rate in one go. Any job
// with an at-cost permit or a split bill showed two escrow figures, and the one
// on the owner's rollup was the wrong one. CLAUDE.md: "One fact, ONE home" - so
// both routes now call this, and neither holds a copy of the arithmetic.
//
//   escrow = client payments received
//          - vendor payments made out of escrow
//          - the fee earned on vendor bills that are approved, sent or paid
//
// Pure: the caller loads the rows, this adds them up. `numeric` columns arrive
// from PostgREST as STRINGS ("80.00"), so every amount goes through toAmount.
// ─────────────────────────────────────────────────────────────────────────────

export interface EscrowInvoice {
  id: string
  amount: unknown
  status: string | null
  client_paid?: unknown
  escrow_paid?: unknown
  markup_pct?: unknown
  markup_excluded?: boolean | null
}

export interface EscrowInput {
  /** projects.contractor_fee_pct - a FRACTION, 0.15 = 15%. */
  feePct: unknown
  payments: { amount: unknown }[]
  invoices: EscrowInvoice[]
  /** Budget lines (id, budgeted_amount, markup_pct, markup_excluded) - a line's own rate. */
  budgetLines: (LineRate & { budgeted_amount?: unknown })[]
  /** invoice_allocations for these invoices: how a bill is split across lines. */
  allocations: (Allocation & { invoice_id: string })[]
}

export interface EscrowSummary {
  received: number
  vendorBilled: number
  vendorPaid: number
  escrowPaid: number
  clientPaidDirect: number
  feeEarned: number
  escrowBalance: number
  outstandingToVendors: number
  budgetTotal: number
}

const amt = (v: unknown): number => toAmount(v) ?? 0

export function projectEscrow(input: EscrowInput): EscrowSummary {
  const feePct = amt(input.feePct)
  const received = input.payments.reduce((s, p) => s + amt(p.amount), 0)
  const billedRows = input.invoices.filter(i => ACTUAL_STATUSES.has(String(i.status)))
  const vendorBilled = billedRows.reduce((s, i) => s + amt(i.amount), 0)

  // Payment-source split. Prefer the explicit split; a 'paid' bill with no
  // split entered is treated as paid from escrow in full.
  let escrowPaid = 0
  let clientPaidDirect = 0
  for (const i of input.invoices) {
    const cp = amt(i.client_paid)
    const ep = amt(i.escrow_paid)
    if (cp || ep) { escrowPaid += ep; clientPaidDirect += cp }
    else if (i.status === 'paid') { escrowPaid += amt(i.amount) }
  }

  // The fee, bill by bill - never one multiplication over the total.
  const allocsByInvoice = new Map<string, Allocation[]>()
  for (const a of input.allocations) {
    if (!allocsByInvoice.has(a.invoice_id)) allocsByInvoice.set(a.invoice_id, [])
    allocsByInvoice.get(a.invoice_id)!.push(a)
  }
  const feeEarned = billedRows.reduce((sum, i) => sum + feeForInvoice({
    invoice: i as any,
    allocations: allocsByInvoice.get(i.id) ?? [],
    lines: input.budgetLines,
    projectPct: feePct * 100,
  }).markup, 0)

  const vendorPaid = escrowPaid + clientPaidDirect
  return {
    received,
    vendorBilled,
    vendorPaid,
    escrowPaid,
    clientPaidDirect,
    feeEarned,
    escrowBalance: received - escrowPaid - feeEarned,
    outstandingToVendors: Math.max(vendorBilled - vendorPaid, 0),
    budgetTotal: input.budgetLines.reduce((s, b) => s + amt(b.budgeted_amount), 0),
  }
}
