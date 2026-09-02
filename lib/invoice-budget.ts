// ─────────────────────────────────────────────────────────────────────────────
// Where a sub's invoice lands on the budget.
//
// TWO ROUTES, never both for the same bill.
//
// 1. ALLOCATIONS. An invoice can be split across as many budget lines as it
//    needs, at whatever amounts - a supplier bill covering lumber and windows,
//    or a bill only partly belonging to a line. When an invoice has any
//    allocations, they are the whole story for it.
//
// 2. ITS SUBCONTRACT. With no allocations, an invoice lands on the line linked
//    to its contract, exactly as before. The contract is the agreement, the
//    line is where the agreement is tracked, and one contract belongs to one
//    line. Every invoice that exists today takes this route and is unaffected.
//
// Deliberately SPLIT, never OVERRIDE: there is no single budget_line_item_id on
// an invoice that could quietly redirect a whole bill away from where its
// contract says it belongs. Either it divides explicitly, or it follows the
// contract.
//
// The two routes are mutually exclusive per invoice, which is what stops a bill
// being counted once through its allocations and again through its contract.
//
// The rollup below is the single source of truth for a line's Actual. The
// Budget tab and the Invoices tab both read it, so the "already billed" number
// on an invoice cannot drift from the one on the budget sheet.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An invoice counts against the budget once it has been accepted - not while it
 * is still sitting in someone's approval queue. Approving is the moment the
 * money becomes real, which is why 'approved' is in here and not just 'paid'.
 */
import { committedTotal, type CommittedSubcontract } from '@/lib/committed'

export const ACTUAL_STATUSES = new Set(['approved', 'sent', 'paid'])

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return isFinite(x) ? x : 0
}

export interface RollupLine {
  id: string
  subcontract_id?: string | null
  budgeted_amount?: unknown
  committed_amount?: unknown
  actual_amount?: unknown
  [k: string]: unknown
}

export interface RollupInvoice {
  id?: string
  subcontract_id?: string | null
  amount?: unknown
  status?: string | null
}

/** A slice of one invoice landing on one budget line. */
export interface RollupAllocation {
  invoice_id: string
  budget_line_item_id: string
  amount?: unknown
}

export interface RollupMaterial {
  budget_line_id?: string | null
  amount?: unknown
}

export interface RollupSub {
  id: string
  trade?: string | null
  contract_amount?: unknown
  companies?: { name?: string | null } | null
}

export interface RollupChangeOrder {
  amount?: unknown
  status?: string | null
  budget_line_item_id?: string | null
  subcontract_id?: string | null
}

export interface RolledLine extends RollupLine {
  committed_amount: number
  actual_amount: number
  materials_amount: number
  /**
   * The part of Actual that somebody TYPED, rather than a bill or a receipt.
   *
   * An unlinked line with no invoice splits keeps whatever was entered in its
   * Actual column by hand - a real and useful thing to be able to do, and a
   * third source of money in a total that looks like it only has one. On a
   * live job this was $218,785 of a $428,615 Actual Spent, sitting silently
   * between the bills and the receipts.
   */
  entered_amount: number
  /** Invoice money landing here by an explicit split rather than via a contract. */
  allocated_amount: number
  /** Approved change orders landing on this line. Zero, or signed. */
  change_orders_amount: number
  /** budgeted + approved changes. THE number to judge this line against. */
  revised_budget: number
  linked: boolean
  linked_label: string | null
}

/**
 * Fold accepted invoices and assigned material receipts into each budget line.
 *
 * A line linked to a subcontract takes its Committed from the contract amount
 * and its Actual from that sub's accepted invoices - the numbers typed into
 * those columns by hand are ignored, because the contract is the better answer.
 * An unlinked line keeps whatever was typed and just adds its receipts.
 */
/**
 * Approved change orders, mapped onto the budget lines they belong to.
 *
 * Exported because the Schedule of Values on a pay application needs exactly
 * the same answer. It used to be inlined here, and the pay app seeded its SOV
 * from `budgeted_amount` alone - so a $50,000 approved owner change order left
 * the contract sum at $300,000 on a G702 whose own line 1 reads "Original
 * contract sum + change orders". The label was a promise the code did not keep,
 * and a GC billing approved work never saw it on the certificate.
 *
 * `unmapped` is the amount that belongs to NO line: an owner-side change order
 * naming neither a budget line nor a subcontract has nowhere to land. The
 * budget rollup drops it; the pay application gives it its own line, because
 * money you may bill has to be billable from somewhere.
 */
export function approvedChangesByLine(
  lines: { id: string; subcontract_id?: string | null }[],
  changeOrders: RollupChangeOrder[],
): { byLine: Map<string, number>; unmapped: number } {
  // Most change orders name a subcontract rather than a budget line, so a
  // sub-linked one is followed through to whichever line that contract sits on.
  const lineIdForSub = new Map<string, string>()
  for (const l of lines) {
    if (l.subcontract_id && !lineIdForSub.has(l.subcontract_id)) lineIdForSub.set(l.subcontract_id, l.id)
  }

  const byLine = new Map<string, number>()
  let unmapped = 0
  for (const co of changeOrders) {
    if (co.status !== 'approved') continue
    const target = co.budget_line_item_id
      ?? (co.subcontract_id ? lineIdForSub.get(co.subcontract_id) ?? null : null)
    if (!target) { unmapped += n(co.amount); continue }
    byLine.set(target, (byLine.get(target) ?? 0) + n(co.amount))
  }
  return { byLine, unmapped }
}

export function rollupBudgetLines(input: {
  lines: RollupLine[]
  invoices: RollupInvoice[]
  materials: RollupMaterial[]
  subs: RollupSub[]
  changeOrders?: RollupChangeOrder[]
  allocations?: RollupAllocation[]
}): RolledLine[] {
  const { lines, invoices, materials, subs, changeOrders = [], allocations = [] } = input

  // Approved change orders raise the budget of the line they belong to.
  //
  // Derived, never written back to budgeted_amount. Approving, un-approving or
  // deleting a change order is then self-correcting - there is no "applied"
  // flag to get out of step and no way to double-count - and the original
  // budget survives, which is the number you want when asking how well the
  // job was estimated.
  //
  // Most change orders name a subcontract rather than a budget line, so a
  // sub-linked one is followed through to whichever line that contract sits on.
  // Without that hop approving a change order raised the contract (and so the
  // line's Committed) while leaving its budget alone, which showed as a line
  // going over budget at the exact moment the overage was approved and funded.
  const { byLine: changesByLine } = approvedChangesByLine(lines, changeOrders)

  // An allocated invoice is accounted for entirely by its allocations. Any
  // amount it has NOT allocated is deliberately dropped rather than falling
  // back to the contract: a half-allocated bill routing its remainder somewhere
  // the user never named would be a silent surprise, and the editor shows the
  // unallocated remainder so it is never invisible.
  const allocatedInvoiceIds = new Set<string>()
  for (const a of allocations) if (a.invoice_id) allocatedInvoiceIds.add(a.invoice_id)

  const acceptedInvoiceIds = new Set<string>()
  for (const inv of invoices) {
    if (inv.id && ACTUAL_STATUSES.has(String(inv.status))) acceptedInvoiceIds.add(inv.id)
  }

  const allocByLine = new Map<string, number>()
  for (const a of allocations) {
    // A split only counts once the bill it belongs to has been accepted, same
    // rule as every other route onto the budget.
    if (!acceptedInvoiceIds.has(a.invoice_id)) continue
    allocByLine.set(
      a.budget_line_item_id,
      (allocByLine.get(a.budget_line_item_id) ?? 0) + n(a.amount),
    )
  }

  const actualBySub = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.id && allocatedInvoiceIds.has(inv.id)) continue
    if (inv.subcontract_id && ACTUAL_STATUSES.has(String(inv.status))) {
      actualBySub.set(inv.subcontract_id, (actualBySub.get(inv.subcontract_id) ?? 0) + n(inv.amount))
    }
  }

  const materialsByLine = new Map<string, number>()
  for (const m of materials) {
    if (m.budget_line_id) materialsByLine.set(m.budget_line_id, (materialsByLine.get(m.budget_line_id) ?? 0) + n(m.amount))
  }

  const subById = new Map(subs.map(s => [s.id, s]))

  return lines.map(line => {
    const materials_amount = materialsByLine.get(line.id) ?? 0
    const allocated_amount = allocByLine.get(line.id) ?? 0
    const change_orders_amount = changesByLine.get(line.id) ?? 0
    const revised_budget = n(line.budgeted_amount) + change_orders_amount
    const sub = line.subcontract_id ? subById.get(line.subcontract_id) : undefined
    if (sub) {
      return {
        ...line,
        committed_amount: n(sub.contract_amount),
        actual_amount: (actualBySub.get(line.subcontract_id!) ?? 0) + allocated_amount + materials_amount,
        materials_amount,
        // A linked line derives everything from its contract's bills; nothing
        // typed on it survives.
        entered_amount: 0,
        allocated_amount,
        change_orders_amount,
        revised_budget,
        linked: true,
        linked_label: sub.companies?.name ?? sub.trade ?? 'Subcontract',
      }
    }
    return {
      ...line,
      committed_amount: n(line.committed_amount),
      // A line with real invoice splits on it derives its Actual from them, the
      // same way a linked line derives its own - the record beats a number
      // somebody typed. Only a line with neither keeps the typed figure.
      actual_amount: (allocByLine.has(line.id) ? allocated_amount : n(line.actual_amount)) + materials_amount,
      materials_amount,
      // Only the third case is hand-entered: unlinked AND with no splits.
      // The line above is what decides it, so this mirrors that condition
      // exactly rather than restating the rule in different words.
      entered_amount: allocByLine.has(line.id) ? 0 : n(line.actual_amount),
      allocated_amount,
      change_orders_amount,
      revised_budget,
      linked: false,
      linked_label: null,
    }
  })
}

/**
 * What this line is really going to cost, as best anyone can tell today.
 *
 * A signed contract is money gone whether or not the sub has invoiced yet, so
 * the commitment sets the floor. Billing above the commitment (extras, an
 * invoice that outran its contract) raises it. Receipts are separate spend
 * rather than billing against the contract, so they add on top rather than
 * competing with it.
 *
 * The old Remaining ignored commitments entirely - Budget minus Actual - which
 * told a GC with $500k budgeted, $200k billed and $450k signed that they had
 * $300k left to spend. They had $50k.
 */
export function lineExposure(line: RolledLine): number {
  const receipts = line.materials_amount
  const billed = line.actual_amount - receipts
  return Math.max(line.committed_amount, billed) + receipts
}

export interface BudgetTotals {
  /** Before any change orders - what the job was estimated at. */
  original_budget: number
  approved_changes: number
  /** original + approved changes. Everything is judged against this. */
  revised_budget: number
  committed: number
  actual: number
  /** Signed but not yet invoiced - the money that used to hide. */
  committed_not_billed: number
  /**
   * How much of `committed` sits in contracts NO budget line points at.
   *
   * Part of the total, not extra - but a screen has to be able to say so,
   * because otherwise the headline is bigger than the rows below it add up to
   * and there is no way to find out why. On a job with $80,000 typed on a line
   * AND an $80,000 subcontract nobody linked, that is very often the SAME
   * money entered twice, and this is what lets the screen point at it.
   */
  committed_unlinked: number
  /**
   * Receipts on this job with no budget line. Inside `actual` and `materials`,
   * not extra - but named so the screen can show them as their own row and
   * offer to file them, rather than leaving somebody to wonder why Actual Spent
   * is bigger than the lines add up to.
   */
  materials_unassigned: number
  /**
   * The two halves of `actual`, so a screen can SAY what it is made of.
   *
   * A reviewer worked out that Actual Spent and the Bills figure disagreed by
   * $220,695 and had to guess why. Two things were hiding in one number:
   * material receipts assigned to a line, and bills in the other two accepted
   * statuses (`ACTUAL_STATUSES` is approved, sent AND paid - the Bills tab was
   * showing one of the three). Neither was recoverable from the screen.
   *
   * billed + entered + materials === actual, always. That is the invariant
   * the tile relies on to print a sum that closes.
   *
   * It was written as two parts first, and that was WRONG on a real job: it
   * labelled $426,705 as "in bills" when only $207,920 was. A total explained
   * incorrectly is worse than one left unexplained.
   */
  billed: number
  materials: number
  /** Typed into a line's Actual by hand - neither a bill nor a receipt. */
  entered: number
  /** Best estimate of final cost given what is signed and billed. */
  projected_cost: number
  /** Revised budget still free to spend. Negative means the job is over. */
  remaining: number
}

export function budgetTotals(
  lines: RolledLine[],
  /**
   * Every subcontract on the project. Needed because Committed includes
   * contracts that no budget line points at - the half this screen used to
   * lose. Optional so the signature stays usable, but a caller that omits it
   * gets the old, incomplete figure.
   */
  subcontracts: CommittedSubcontract[] = [],
  /**
   * Receipts on this job that carry NO budget line.
   *
   * A budget line is attribution, not eligibility - money spent on a job is a
   * job cost whether or not somebody has filed it against a line. Without this
   * a scanned $186.51 receipt sat in Materials and moved nothing: not Actual
   * Spent, not billing, not Master Money, while the page said receipts flow
   * into project costs.
   */
  unassignedMaterials: { amount?: unknown }[] = [],
): BudgetTotals {
  const t: BudgetTotals = {
    original_budget: 0, approved_changes: 0, revised_budget: 0,
    committed: 0, actual: 0, committed_not_billed: 0, committed_unlinked: 0,
    materials_unassigned: 0,
    billed: 0, materials: 0, entered: 0,
    projected_cost: 0, remaining: 0,
  }
  for (const line of lines) {
    t.original_budget += n(line.budgeted_amount)
    t.approved_changes += line.change_orders_amount
    // Not accumulated here any more - committedTotal() owns it below, so this
    // screen and Master Money cannot drift apart again.
    t.actual += line.actual_amount
    t.projected_cost += lineExposure(line)
    const billed = line.actual_amount - line.materials_amount
    // THREE parts, not two. `billed` above still means "not a receipt",
    // because that is what committed_not_billed has always compared against
    // and changing it would move a number nobody asked about. The split the
    // screen prints takes the hand-entered part back out.
    t.billed += billed - line.entered_amount
    t.entered += line.entered_amount
    t.materials += line.materials_amount
    t.committed_not_billed += Math.max(0, line.committed_amount - billed)
  }
  // ONE derivation, shared with Master Money and the project Summary.
  const c = committedTotal({ subcontracts, lines })
  t.committed = c.total

  // THE CARD USED TO HOLD TWO DIFFERENT COMMITTED NUMBERS AT ONCE.
  //
  // The headline came from committedTotal - every contract, plus what is typed
  // on lines that have no contract. The "signed, not yet billed" note under it
  // was still summed per LINE, so a contract nobody had linked to a budget line
  // was in one and not the other. On a job with one $80,000 subcontract and
  // $80,000 typed on a line, the card read "$160,000" over "$55,000 signed" and
  // the rows below added to $80,000. Three numbers, one question.
  //
  // #356 moved the headline to a shared derivation and left this behind, which
  // is the same drift it existed to end.
  t.committed_unlinked = c.subcontractsWithNoBudgetLine
  // Added whole. What has been billed against a contract that is on no budget
  // line cannot be seen from the line rollup - by definition, nothing points at
  // it - so this is deliberately the contract value rather than a figure that
  // looks netted-off and is not.
  t.committed_not_billed += c.subcontractsWithNoBudgetLine

  // MONEY IN A TOTAL HAS TO BE IN THE EXPOSURE TOO.
  //
  // `projected_cost` was summed per LINE, so a contract no line points at was in
  // Committed and NOT in Left to spend. On a job with $100,000 budgeted,
  // $80,000 typed on a line and a separate $80,000 subcontract, the card read
  // Committed $160,000 over Left to spend $20,000 - the second figure quietly
  // pretending the contract did not exist. Left to spend is now -$60,000, which
  // is the honest answer for $160,000 committed against a $100,000 budget.
  t.projected_cost += c.subcontractsWithNoBudgetLine

  // Receipts with no line, added to what has actually been spent and to the
  // exposure. Counted once: they are excluded from every line's rollup by
  // definition, because nothing points at them.
  t.materials_unassigned = unassignedMaterials.reduce((sum, m) => sum + n(m.amount), 0)
  t.actual += t.materials_unassigned
  t.materials += t.materials_unassigned
  t.projected_cost += t.materials_unassigned

  t.revised_budget = t.original_budget + t.approved_changes
  t.remaining = t.revised_budget - t.projected_cost
  return t
}

/**
 * How far along the job is, weighted by value.
 *
 * TWO SCREENS WERE ANSWERING THIS DIFFERENTLY, and one of them was in front of
 * the customer. The Progress tab weights each budget line's % by what that
 * line is worth - a job 17% complete. The client portal read
 * `subcontracts.progress_percent`, which is a MANUAL billing field only written
 * when a sub bills by percentage, so it showed 0% on every trade of a job
 * visibly underway. A client seeing zeroes on work they can watch happening is
 * worse than showing them nothing.
 *
 * One derivation, here, so they cannot drift - the same reason lineExposure
 * lives here rather than in whichever screen needed it first.
 *
 * NULL, NOT ZERO, when nothing is measurable. "Nobody has marked any progress"
 * and "no progress has been made" are different facts, and collapsing them is
 * precisely the bug: 0% is an assertion, and an unmeasured job should not make
 * one. Callers decide whether to hide the bar or explain it.
 *
 * Lines with no budget are ignored rather than counted as zero - a $0 line
 * marked complete should not drag a weighted average it contributes nothing to.
 */
export function weightedProgress(
  lines: { budgeted_amount?: unknown; progress_pct?: unknown }[],
): number | null {
  let total = 0
  let earned = 0
  let measured = false
  for (const l of lines) {
    const value = n(l.budgeted_amount)
    if (value <= 0) continue
    total += value
    const pct = n(l.progress_pct)
    if (pct > 0) measured = true
    earned += value * (Math.min(Math.max(pct, 0), 100) / 100)
  }
  if (total <= 0 || !measured) return null
  return Math.round((earned / total) * 100)
}

/** What an invoice screen needs to say about the line the money is going to. */
export interface BudgetDestination {
  id: string
  cost_code: string | null
  category: string
  description: string
  /** Original budget plus approved change orders - what the line is worth now. */
  budgeted_amount: number
  /** How much of that came from approved change orders. Zero, or signed. */
  change_orders_amount: number
  /** Accepted invoices + receipts already against this line. */
  billed_amount: number
  /** Budget less what has already landed. Negative once the line is blown. */
  remaining: number
}

/** Index the destinations by subcontract, which is how an invoice finds one. */
export function destinationsBySubcontract(rolled: RolledLine[]): Map<string, BudgetDestination> {
  const out = new Map<string, BudgetDestination>()
  for (const line of rolled) {
    // `linked`, not just a non-null subcontract_id. A line pointing at a
    // subcontract that isn't there would otherwise advertise itself as a
    // destination while the Budget tab treats it as unlinked and never rolls
    // invoices into its Actual - the two screens saying different things about
    // the same money is the whole thing this file exists to stop.
    if (!line.linked || !line.subcontract_id) continue
    // The REVISED budget. An approved change order is budget, so measuring an
    // invoice against the original would flag an approved, funded overage as
    // an overage.
    const budgeted = line.revised_budget
    // A sub pointed at two lines shouldn't happen, but if it does, the first
    // one wins rather than the last - stable, and it matches the budget sheet's
    // own ordering.
    if (out.has(line.subcontract_id)) continue
    out.set(line.subcontract_id, {
      id: line.id,
      cost_code: (line.cost_code as string) ?? null,
      category: String(line.category ?? 'General'),
      description: String(line.description ?? ''),
      budgeted_amount: budgeted,
      change_orders_amount: line.change_orders_amount,
      billed_amount: line.actual_amount,
      remaining: budgeted - line.actual_amount,
    })
  }
  return out
}

/** "06 · Framing - Rough carpentry", skipping the bits that aren't filled in. */
export function destinationLabel(d: BudgetDestination): string {
  const head = [d.cost_code, d.category].filter(Boolean).join(' · ')
  return [head, d.description].filter(Boolean).join(' - ')
}
