// ─────────────────────────────────────────────────────────────────────────────
// The owner-facing schedule of values, read from the database. Once.
//
// #360 seeded the SOV from budget + approved change orders at CREATION, which
// fixed every new application and left the existing draft reading a contract
// sum of $300,000 on a $350,000 job - the same bug still on the screen. The
// draft now compares itself against this, so the answer it is compared to and
// the answer a new application is built from are literally the same code.
//
// lib/pay-app-rules.ts holds the arithmetic and stays pure. This is the part
// that knows which tables it comes out of.
// ─────────────────────────────────────────────────────────────────────────────

import { scheduleOfValues, type SovLine } from './pay-app-rules'
import { approvedChangesByLine } from './invoice-budget'

/**
 * What the G703 should say today: every budget line, raised by the approved
 * change orders that name it, plus one line for the approved change orders that
 * name nothing - which is what a plain owner-side change order is, and what the
 * budget rollup drops.
 */
export async function ownerScheduleOfValues(db: any, projectId: string): Promise<SovLine[]> {
  const [{ data: lines }, { data: cos }] = await Promise.all([
    db.from('budget_line_items')
      .select('id, cost_code, description, budgeted_amount, subcontract_id')
      .eq('project_id', projectId)
      .order('sort_order'),
    db.from('change_orders')
      .select('amount, status, budget_line_item_id, subcontract_id')
      .eq('project_id', projectId),
  ])

  const { byLine, unmapped } = approvedChangesByLine((lines ?? []) as any, (cos ?? []) as any)
  return scheduleOfValues({
    budgetLines: (lines ?? []) as any,
    changesByLine: byLine,
    unmappedChanges: unmapped,
  })
}

/**
 * The same question for a SUBCONTRACTOR's application.
 *
 * A sub's schedule is the budget lines tied to that subcontract, not the whole
 * budget - so `ownerScheduleOfValues` is the wrong answer for one, and using it
 * would hand a sub every line on the job.
 *
 * WHY THIS EXISTS. #361 gave a stale draft a "these approved change orders are
 * not on this schedule yet" banner, and restricted it to owner-facing drafts
 * because this builder did not exist. That left the "raise it with a change
 * order" link working on an owner application and dead-ending on a sub one:
 * right change order, approved, and the draft never picks it up.
 *
 * A sub with no budget lines bills against a single contract-amount row, which
 * has no budget line to raise. The approve route already adds an approved change
 * order to `subcontracts.contract_amount`, so that row moves on its own and
 * there is nothing to reconcile here - hence the empty schedule rather than a
 * made-up one.
 */
export async function subcontractScheduleOfValues(
  db: any,
  projectId: string,
  subcontractId: string,
): Promise<SovLine[]> {
  const [{ data: lines }, { data: cos }] = await Promise.all([
    db.from('budget_line_items')
      .select('id, cost_code, description, budgeted_amount, subcontract_id')
      .eq('project_id', projectId)
      .eq('subcontract_id', subcontractId)
      .order('sort_order'),
    db.from('change_orders')
      .select('amount, status, budget_line_item_id, subcontract_id')
      .eq('project_id', projectId),
  ])

  if (!lines || !lines.length) return []

  // Only the changes landing on THIS sub's lines. `unmapped` is deliberately
  // dropped: an owner-side change order belonging to no line is the general
  // contractor's business with the owner, and has no place on what a
  // subcontractor is allowed to bill.
  const { byLine } = approvedChangesByLine(lines as any, (cos ?? []) as any)
  return scheduleOfValues({
    budgetLines: lines as any,
    changesByLine: byLine,
    unmappedChanges: 0,
  })
}
