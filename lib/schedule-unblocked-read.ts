import type { SupabaseClient } from '@supabase/supabase-js'
import { progressReader } from './schedule-progress-read'
import { gatePicture, type LineGateState } from './schedule-unblocked'
import type { Dependency, ScheduleLine } from './schedule-dependencies'

/**
 * THE GATE PICTURE FOR A WHOLE PROJECT, READ ONCE.
 *
 * The same shape as `schedule-progress-read.ts` beside it, and for the same
 * reason. The unblocked route had its own inline copy of the budget roll-up -
 * twenty lines of fetch-and-group that `progressReader` was extracted to be
 * the only home of. The extraction moved the cascade over and left that one
 * behind, so the send path and the board were one edit away from disagreeing
 * about whether a trade was far enough along. Two readers of one question is
 * the failure this repo keeps paying for.
 *
 * Both callers are here: the schedule payload the page already waits for, and
 * the send itself, which re-reads rather than trusting what it is handed.
 */

export const GATE_LINE_COLS =
  'id, trade, label, start_date, end_date, subcontract_id, dates_overridden_at, progress_pct'

/**
 * `lines` and `deps` are accepted because the schedule payload has ALREADY
 * read both by the time it wants this, and that route is a layout-nested
 * client fetch - every trip it makes is paid again on each navigation. The
 * assembly stays one function either way; only the fetching is skipped.
 */
export async function readGatePicture(
  db: SupabaseClient,
  projectId: string,
  have: { lines?: ScheduleLine[]; deps?: Dependency[] } = {},
): Promise<LineGateState[]> {
  const [linesRes, depsRes, toldRes] = await Promise.all([
    have.lines
      ? Promise.resolve({ data: have.lines, error: null })
      : db.from('schedule_items').select(GATE_LINE_COLS).eq('project_id', projectId),
    have.deps
      ? Promise.resolve({ data: have.deps, error: null })
      : db.from('schedule_dependencies').select('*').eq('project_id', projectId),
    // WHO HAS ALREADY BEEN TOLD. `sent_at` is null until a send is CONFIRMED,
    // so a row that failed to send is not a row that was told - the offer has
    // to come back for it, or a bounced address silently costs the sub their
    // notice.
    db.from('schedule_shift_notices')
      .select('schedule_item_id, sent_at')
      .eq('project_id', projectId).eq('kind', 'unblocked')
      .not('sent_at', 'is', null),
  ])

  // A refused query and an empty one are the same `[]` otherwise, and here
  // that reads as "nothing is gated" - which on this screen is the sentence
  // "everybody is clear to start". Loud, and it throws: the callers decide
  // whether that costs a badge or the whole request.
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`)
  if (depsRes.error) throw new Error(`dependencies: ${depsRes.error.message}`)
  // The notices half degrades the other way: unreadable means we cannot prove
  // anybody was told, and the safe side of THAT fence is to say they were.
  // Offering a fresh send off a failed read is how one sub gets the same
  // email twice.
  if (toldRes.error) {
    console.error('[schedule/unblocked] notice history unavailable:', toldRes.error.message)
  }

  const lines = (linesRes.data ?? []) as unknown as ScheduleLine[]
  const deps = (depsRes.data ?? []) as unknown as Dependency[]

  const told = new Map<string, string>()
  if (toldRes.error) {
    // Unknown, so treated as told - see above.
    for (const l of lines) told.set(l.id, 'unknown')
  } else {
    for (const row of (toldRes.data ?? []) as any[]) {
      if (row.schedule_item_id) told.set(row.schedule_item_id, row.sent_at)
    }
  }

  const readProgress = await progressReader(db, lines)
  return gatePicture(lines, deps, readProgress, id => told.get(id) ?? null)
}
