// The reader behind `finishedBudgetLines`, shared by the GC's board and the
// client's portal so the two cannot disagree about what is installed.
//
// A read that FAILED says nothing: every selection comes back
// `line_finished: false`, which leaves the stored status showing. A wrong
// "installed" is a claim to a client; a missing one is the status they already
// had.

import type { SupabaseClient } from '@supabase/supabase-js'
import { finishedBudgetLines } from './selection-installed'

export async function withLineFinished<T extends { budget_line_item_id?: string | null }>(
  db: SupabaseClient, projectId: string, selections: T[],
): Promise<(T & { line_finished: boolean })[]> {
  const none = selections.map(s => ({ ...s, line_finished: false }))
  if (!selections.some(s => s.budget_line_item_id)) return none

  const [lines, items] = await Promise.all([
    db.from('budget_line_items').select('id, subcontract_id, progress_pct, budgeted_amount').eq('project_id', projectId),
    db.from('schedule_items').select('id, subcontract_id, progress_pct, start_date, end_date').eq('project_id', projectId),
  ])
  if (lines.error || items.error) {
    console.error('[selections] reading schedule progress for Installed failed', lines.error ?? items.error)
    return none
  }
  const done = finishedBudgetLines((lines.data ?? []) as any[], (items.data ?? []) as any[])
  return selections.map(s => ({ ...s, line_finished: !!s.budget_line_item_id && done.has(s.budget_line_item_id) }))
}
