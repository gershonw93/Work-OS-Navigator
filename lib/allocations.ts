// ─────────────────────────────────────────────────────────────────────────────
// Splitting one invoice across budget lines, and what that does to the markup.
//
// A supplier bill covers lumber AND windows. A sub's bill is half this line and
// half another. Neither fits "an invoice belongs to one line", so an invoice
// carries a set of allocations - a line and an amount, as many as it needs.
//
// The rules that matter:
//   * A split can be PARTIAL. Allocations do not have to add up to the invoice
//     total; the remainder is simply unassigned and is shown as such.
//   * A split can never EXCEED the invoice. Assigning $50k of a $40k bill is
//     always a mistake and is refused.
//   * Markup follows the line the money landed on, so one bill split across a
//     line at 15% and a line at cost produces the right fee for each part.
// ─────────────────────────────────────────────────────────────────────────────

import { effectivePct, type MarkupSource } from './markup'

export interface Allocation {
  budget_line_item_id: string
  amount: unknown
}

/** A budget line, as far as markup is concerned. */
export interface LineRate extends MarkupSource {
  id: string
}

const n = (v: unknown): number => {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v.replace(/[^0-9.\-]/g, ''))
    return isFinite(x) ? x : 0
  }
  return 0
}

const round2 = (v: number) => {
  const scaled = v * 100
  return Math.round(scaled + Math.sign(scaled) * 1e-9) / 100
}

export function allocatedTotal(allocations: Allocation[]): number {
  return round2(allocations.reduce((s, a) => s + n(a.amount), 0))
}

/** What is left of the invoice that has not been put anywhere. Never negative. */
export function unallocated(invoiceAmount: unknown, allocations: Allocation[]): number {
  return round2(Math.max(0, n(invoiceAmount) - allocatedTotal(allocations)))
}

export interface AllocationProblem {
  kind: 'over' | 'negative' | 'duplicate' | 'no-line'
  message: string
}

/**
 * Why a split cannot be saved, in the words you would use to fix it.
 *
 * Returns every problem rather than the first, so a form does not make you
 * discover them one save at a time.
 */
export function validateAllocations(
  invoiceAmount: unknown,
  allocations: Allocation[],
): AllocationProblem[] {
  const problems: AllocationProblem[] = []
  const total = allocatedTotal(allocations)
  const amount = n(invoiceAmount)

  if (allocations.some(a => n(a.amount) < 0)) {
    problems.push({ kind: 'negative', message: 'An amount cannot be negative.' })
  }
  if (allocations.some(a => !a.budget_line_item_id)) {
    problems.push({ kind: 'no-line', message: 'Pick a budget line for every row.' })
  }
  const seen = new Set<string>()
  for (const a of allocations) {
    if (!a.budget_line_item_id) continue
    if (seen.has(a.budget_line_item_id)) {
      problems.push({ kind: 'duplicate', message: 'The same budget line is on this invoice twice - put it on one row.' })
      break
    }
    seen.add(a.budget_line_item_id)
  }
  // A hair of tolerance so a split typed to the cent is not rejected by binary
  // floating point.
  if (total - amount > 0.005) {
    problems.push({
      kind: 'over',
      message: `That splits ${fmt(total)} of a ${fmt(amount)} invoice - ${fmt(total - amount)} too much.`,
    })
  }
  return problems
}

const fmt = (v: number) => `$${round2(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export interface SplitFee {
  /** Cost accounted for by the split. */
  allocated: number
  /** Cost on the invoice with no line named. */
  unallocated: number
  /** Fee across the whole invoice. */
  markup: number
  /** cost + fee. */
  clientPrice: number
  /** True when a single rate covers the whole invoice. */
  uniformRate: boolean
}

/**
 * The fee on one invoice once its split is taken into account.
 *
 * Precedence is most-specific-first, and it short-circuits: an override on the
 * INVOICE covers the whole bill no matter how it is split, because "bill this
 * one at cost" is a statement about the bill. Only when the invoice has no
 * answer of its own does each slice follow the rate of the line it landed on,
 * and only then does the project rate get a look in.
 */
export function feeForInvoice(input: {
  invoice: MarkupSource & { amount: unknown }
  allocations: Allocation[]
  lines: LineRate[]
  projectPct: number
}): SplitFee {
  const { invoice, allocations, lines, projectPct } = input
  const amount = n(invoice.amount)
  const alloc = allocatedTotal(allocations)
  const rest = Math.max(0, amount - alloc)

  // The invoice speaks for itself - one rate, whole bill.
  const ownRate = invoice?.markup_excluded || invoice?.markup_pct != null
  if (ownRate || allocations.length === 0) {
    const pct = effectivePct(invoice, projectPct)
    const markup = round2(amount * (pct / 100))
    return {
      allocated: round2(alloc), unallocated: round2(rest),
      markup, clientPrice: round2(amount + markup), uniformRate: true,
    }
  }

  const byId = new Map(lines.map(l => [l.id, l]))
  let markup = 0
  const rates = new Set<number>()
  for (const a of allocations) {
    const line = byId.get(a.budget_line_item_id)
    // A line we were not given cannot be assumed to be at the project rate -
    // but it also cannot be assumed to be at zero. The project rate is the
    // documented fallback for "no answer at this level", so it applies.
    const pct = line ? effectivePct(line, projectPct) : Math.max(projectPct, 0)
    rates.add(pct)
    markup = round2(markup + n(a.amount) * (pct / 100))
  }
  if (rest > 0) {
    const pct = Math.max(projectPct, 0)
    rates.add(pct)
    markup = round2(markup + rest * (pct / 100))
  }

  return {
    allocated: round2(alloc),
    unallocated: round2(rest),
    markup,
    clientPrice: round2(amount + markup),
    uniformRate: rates.size <= 1,
  }
}
