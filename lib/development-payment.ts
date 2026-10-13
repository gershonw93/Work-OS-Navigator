// ─────────────────────────────────────────────────────────────────────────────
// One cheque, split across the houses of a development.
//
// "when a customer gives a payment - can i split it into different houses in
// the bulk project?" - and the answer to "against invoices, or lump sums you
// divide up?" was "both". So each house's share can pay that house's invoices,
// carry an amount against no invoice (a deposit, a draw), or both.
//
// A SHARE IS AN ORDINARY PAYMENT ON ITS HOUSE. Not a second kind of money: the
// house's balance, its invoices' paid status, Funds Received and escrow all
// read `client_payments`, so the split writes one row per house (two when a
// house gets invoice money AND a lump sum - an invoice payment and a deposit
// are different things in QuickBooks) and links them with a group. Every
// screen that already knows how to read a payment then reads these correctly
// without being taught anything.
//
// THE SPLIT MUST ADD UP TO THE CHEQUE, TO THE CENT. Money left over with
// nowhere to go is a typo, not a decision - the same rule a single payment's
// split follows (`allocationProblem`).
//
// Pure. The route reads the houses and invoices; this decides.
// ─────────────────────────────────────────────────────────────────────────────

import { allocationProblem, cents, dollars, type OpenInvoice } from './invoice-settlement'

export interface HouseShareInput {
  project_id: string
  /** Invoices on this house, and how much of the cheque goes to each. */
  invoices?: { client_invoice_id: string; amount: unknown }[]
  /** Money for this house against no invoice - a deposit or a draw. */
  other?: unknown
}

/** A payment row the split will write: invoice money, or a lump sum - never both. */
export interface ShareRow {
  project_id: string
  amountCents: number
  allocations: { client_invoice_id: string; amountCents: number }[]
}

const money = (c: number) => `$${dollars(c).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

/**
 * Why this split cannot be saved, or null. Asked by the form AND the route.
 * `invoicesByHouse` is each house's issued invoices with their balances;
 * a house missing from it is not in this development.
 */
export function splitProblem(
  total: unknown, shares: readonly HouseShareInput[], invoicesByHouse: ReadonlyMap<string, OpenInvoice[]>,
  houseName: (id: string) => string = id => id,
): string | null {
  const totalCents = cents(total)
  if (totalCents <= 0) return 'Enter the amount of the check.'
  let placed = 0
  const seen = new Set<string>()
  for (const s of shares) {
    if (seen.has(s.project_id)) return `${houseName(s.project_id)} is listed twice.`
    seen.add(s.project_id)
    const invoices = invoicesByHouse.get(s.project_id)
    if (!invoices) return 'One of those houses is not in this development any more. Reload and try again.'
    const otherCents = s.other === undefined || s.other === '' || s.other === null ? 0 : cents(s.other)
    if (otherCents < 0) return `The amount for ${houseName(s.project_id)} cannot be negative.`
    const allocs = (s.invoices ?? []).filter(a => cents(a.amount) !== 0)
    if (allocs.length) {
      const sum = allocs.reduce((t, a) => t + cents(a.amount), 0)
      // The single-payment rule, per house: each invoice no more than it owes.
      const problem = allocationProblem(dollars(sum), allocs.map(a => ({ client_invoice_id: a.client_invoice_id, amount: a.amount })), invoices)
      if (problem) return `${houseName(s.project_id)}: ${problem}`
      placed += sum
    }
    placed += otherCents
  }
  if (placed === 0) return 'Put the check on at least one house - an invoice, or an amount.'
  if (placed !== totalCents) {
    return placed < totalCents
      ? `${money(totalCents - placed)} of the check is not on a house yet.`
      : `The houses add up to ${money(placed - totalCents)} more than the check.`
  }
  return null
}

/** The payment rows to write. Assumes `splitProblem` returned null. */
export function shareRows(shares: readonly HouseShareInput[]): ShareRow[] {
  const rows: ShareRow[] = []
  for (const s of shares) {
    const allocations = (s.invoices ?? [])
      .map(a => ({ client_invoice_id: a.client_invoice_id, amountCents: cents(a.amount) }))
      .filter(a => a.amountCents > 0)
    const invoiceCents = allocations.reduce((t, a) => t + a.amountCents, 0)
    if (invoiceCents > 0) rows.push({ project_id: s.project_id, amountCents: invoiceCents, allocations })
    const otherCents = s.other === undefined || s.other === '' || s.other === null ? 0 : cents(s.other)
    if (otherCents > 0) rows.push({ project_id: s.project_id, amountCents: otherCents, allocations: [] })
  }
  return rows
}

/**
 * The cheque divided evenly across houses, in cents, the odd cents going to the
 * first houses - so the parts always add back up to the cheque exactly.
 */
export function evenSplit(total: unknown, houseIds: readonly string[]): Map<string, number> {
  const out = new Map<string, number>()
  const t = cents(total)
  if (t <= 0 || !houseIds.length) return out
  const base = Math.floor(t / houseIds.length)
  let rem = t - base * houseIds.length
  for (const id of houseIds) { out.set(id, base + (rem > 0 ? 1 : 0)); if (rem > 0) rem-- }
  return out
}

/**
 * What a share row says about itself on the house it landed on, so a payment
 * on Lot 7 reads as part of a cheque rather than as a stray $12,500.
 */
export function groupMemo(g: { amount: unknown; reference?: string | null; houses: number }): string {
  const ref = g.reference?.trim() ? ` ${g.reference.trim()}` : ''
  return `Part of check${ref} for ${money(cents(g.amount))}, split across ${g.houses} ${g.houses === 1 ? 'house' : 'houses'}`
}
