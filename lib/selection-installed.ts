// When a selection is installed, read off the schedule rather than remembered.
//
// "make installed automatic when the schedule line finishes". The path is
// selection -> its budget line -> that line's subcontract -> the schedule
// line(s) for that subcontract. A line is FINISHED when its progress is 100%,
// by the one answer the schedule already uses (`lineProgress`: typed, else
// rolled up from the subcontract's budget lines). The END DATE is not it - a
// date passing is a plan running out, not tile on a wall, and "installed"
// printed to a client on the strength of a calendar is a claim nobody made.
//
// Pure. The reader that fetches the rows is `lib/selection-installed-db.ts`.

import { lineProgress, type BudgetProgressRow, type ScheduleLine } from './schedule-dependencies'

export interface InstallBudgetLine extends BudgetProgressRow {
  id: string
  subcontract_id: string | null
}

/**
 * The budget line ids whose work is finished on the schedule.
 *
 * A budget line with no subcontract, or a subcontract with no schedule line,
 * is NOT finished - it has no way to say so, and that is what the manual
 * "Mark installed" is for. With several schedule lines for one sub, every one
 * of them has to be done: the second visit is still part of the install.
 */
export function finishedBudgetLines(budgetLines: InstallBudgetLine[], schedule: ScheduleLine[]): Set<string> {
  const out = new Set<string>()
  for (const line of budgetLines) {
    if (!line.subcontract_id) continue
    const items = schedule.filter(s => s.subcontract_id === line.subcontract_id)
    if (!items.length) continue
    const subRows = budgetLines.filter(b => b.subcontract_id === line.subcontract_id)
    if (items.every(s => (lineProgress(s, subRows).pct ?? 0) >= 100)) out.add(line.id)
  }
  return out
}
