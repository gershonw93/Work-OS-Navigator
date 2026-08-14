// ─────────────────────────────────────────────────────────────────────────────
// How a job PAYS - which is not the same as how it bills.
//
// `billing_mode` (simple | aia) says how you invoice: one bill, or a G702
// progress application. It says nothing about how you are paid, and the budget
// screen needs to know that to show the right control:
//
//   cost-plus    - you bill cost with a percentage on top. The markup IS your
//                  pay. There is no contract value; asking for one is asking a
//                  question the job has no answer to.
//   fixed price  - one agreed number. You earn whatever is left after costs.
//                  Your markup no longer affects what you are paid.
//   building to  - no client. Revenue is the sale price.
//   sell
//
// Before this existed the screen guessed from whether a client was named, which
// only separates spec from not-spec. It could not tell cost-plus from fixed
// price, so it showed BOTH the revenue box and the markup box and hedged with
// "Leave it empty on cost-plus" - making the reader resolve an ambiguity the
// app should have resolved once, at setup.
// ─────────────────────────────────────────────────────────────────────────────

export type ContractType = 'cost_plus' | 'fixed_price' | 'spec'

export const CONTRACT_TYPES: ContractType[] = ['cost_plus', 'fixed_price', 'spec']

export function asContractType(v: unknown): ContractType | null {
  return CONTRACT_TYPES.includes(v as ContractType) ? (v as ContractType) : null
}

export const CONTRACT_LABEL: Record<ContractType, string> = {
  cost_plus: 'Cost-plus',
  fixed_price: 'Fixed price',
  spec: 'Building to sell',
}

/** One line, in the builder's words, for the picker. */
export const CONTRACT_BLURB: Record<ContractType, string> = {
  cost_plus: 'You bill what it costs plus a percentage. The markup is your pay.',
  fixed_price: 'One agreed price. You keep whatever is left after costs.',
  spec: 'No client - you are building it to sell.',
}

/** Does this job have a revenue figure you set up front? */
export function usesRevenue(t: ContractType | null): boolean {
  return t === 'fixed_price' || t === 'spec'
}

/** Is the markup rate what you actually get paid? */
export function usesMarkup(t: ContractType | null): boolean {
  return t === 'cost_plus'
}

/** What the revenue figure is called on this kind of job. */
export function revenueLabel(t: ContractType | null): string {
  return t === 'spec' ? 'Sellout' : 'Contract value'
}

export function revenueHint(t: ContractType | null): string {
  return t === 'spec' ? 'what it sells for' : 'what you are charging the client'
}

export function revenueAsk(t: ContractType | null): string {
  return t === 'spec' ? 'What will this job sell for?' : 'What are you charging for this job?'
}

export interface ProfitInput {
  contractType: ContractType | null
  /** The contract value or sale price. Null when not set yet. */
  revenue: number | null
  budgetedCost: number
  actualCost: number
  /**
   * Fee earned so far on a cost-plus job, worked out item by item from the
   * invoices - NOT a percentage of the total. Per-invoice overrides and
   * at-cost pass-throughs mean those two are different numbers.
   */
  markupEarned: number
  /** Project markup rate, as a percent, for the forward-looking figure. */
  markupPct: number
}

export interface Profit {
  /** What the job should make if it lands on budget. Null when unknowable. */
  projected: number | null
  projectedMargin: number | null
  /** Where it stands against money actually spent. Null when nothing spent. */
  toDate: number | null
  /**
   * What the projected figure is measured against, so the label can say so.
   * 'revenue' - a price you set. 'markup' - your fee on cost.
   */
  basis: 'revenue' | 'markup' | null
}

const EMPTY: Profit = { projected: null, projectedMargin: null, toDate: null, basis: null }

/**
 * Profit, or nothing.
 *
 * Nothing is a real answer here. This used to fall back to markup-on-cost when
 * no sale price was set, which printed a confident green "projected profit" for
 * a job whose revenue nobody had ever entered - a number the app made up and
 * presented as fact. If the inputs are not there, every field stays null and
 * the panel does not draw.
 */
export function profitFor(i: ProfitInput): Profit {
  if (usesMarkup(i.contractType)) {
    // Cost-plus: the fee IS the profit. Projected is the rate applied to the
    // budget; to-date is the fee actually earned on costs booked, which
    // follows per-invoice overrides rather than re-deriving from the rate.
    const pct = Math.max(Number(i.markupPct) || 0, 0)
    if (pct <= 0 && i.markupEarned <= 0) return EMPTY
    const projected = round2(i.budgetedCost * (pct / 100))
    const clientPrice = i.budgetedCost + projected
    return {
      projected,
      projectedMargin: clientPrice > 0 ? (projected / clientPrice) * 100 : null,
      toDate: i.actualCost > 0 ? round2(i.markupEarned) : null,
      basis: 'markup',
    }
  }

  if (usesRevenue(i.contractType)) {
    const rev = Number(i.revenue)
    if (!isFinite(rev) || rev <= 0) return EMPTY
    const projected = round2(rev - i.budgetedCost)
    return {
      projected,
      projectedMargin: (projected / rev) * 100,
      toDate: i.actualCost > 0 ? round2(rev - i.actualCost) : null,
      basis: 'revenue',
    }
  }

  // No contract type yet - nothing to measure against.
  return EMPTY
}

function round2(v: number): number {
  const scaled = v * 100
  return Math.round(scaled + Math.sign(scaled) * 1e-9) / 100
}
