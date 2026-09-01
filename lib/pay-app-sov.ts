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
