import { daysBetween, type DateString } from './schedule-dependencies'
import type { ChangeKind } from './schedule-delay'

/**
 * WHY THIS DATE MOVED - read back out of `schedule_date_changes`.
 *
 * The table is append-only, so the baseline is DERIVED from the oldest row
 * rather than stored on the line. Two columns on `schedule_items` would be
 * null on almost every row, would answer only the net question, and a second
 * delay would overwrite the first - leaving "why has this moved three times"
 * with no answer, which is exactly the question a thrice-moved line provokes.
 *
 * Same rule as `annualPerMonth` in `lib/plans.ts` and read time on a guide: a
 * stored copy of arithmetic goes stale silently.
 */

export interface DateChange {
  id: string
  kind: ChangeKind
  reason: string | null
  from_start: DateString
  from_end: DateString
  to_start: DateString
  to_end: DateString
  /** The line whose move caused this one. Null for a move somebody made. */
  caused_by_item_id: string | null
  /** Who did it. Null once the account is gone - the record outlives it. */
  changed_by_name?: string | null
  created_at: string
}

/** Oldest first. Everything here reads in the order things happened. */
export function inOrder(changes: DateChange[]): DateChange[] {
  return [...changes].sort((a, b) => a.created_at.localeCompare(b.created_at))
}

/**
 * The dates this line was FIRST planned for.
 *
 * Its own dates when nothing has moved it - which is most lines, and the case
 * that must not read as "slipped from nothing".
 */
export function baselineOf(
  line: { start_date: DateString; end_date: DateString },
  changes: DateChange[],
): { start: DateString; end: DateString } {
  const first = inOrder(changes)[0]
  if (!first) return { start: line.start_date, end: line.end_date }
  return { start: first.from_start, end: first.from_end }
}

/**
 * How far the line has moved from where it was first planned.
 *
 * SIGNED, and that is the point: a trade three days EARLY has the same wasted
 * morning as one three days late, and calling a pull-forward a delay would be
 * the wrong word on the screen. Measured on the START, because "this job is
 * running nine days behind" is about when work begins.
 */
export function slipDays(
  line: { start_date: DateString; end_date: DateString },
  changes: DateChange[],
): number {
  return daysBetween(baselineOf(line, changes).start, line.start_date)
}

/**
 * Whether anybody said this was a SLIP rather than a re-plan.
 *
 * A line can have moved four times through cascades and re-plans without
 * anybody once saying the work ran late. That is a different fact from having
 * slipped, and the badge must not claim it.
 */
export function wasDelayed(changes: DateChange[]): boolean {
  return changes.some(c => c.kind === 'delay')
}

/** The reasons somebody typed, oldest first. A re-plan carries none. */
export function delayReasons(changes: DateChange[]): string[] {
  return inOrder(changes)
    .filter(c => c.kind === 'delay')
    .map(c => String(c.reason ?? '').trim())
    .filter(Boolean)
}

/**
 * One row of the history, in words.
 *
 * A CASCADE NAMES WHAT PUSHED IT. "Moved 3 days" on a line nobody touched is
 * the mystery this whole table exists to answer, so the sentence carries the
 * line that caused it - and says so plainly when that line has since been
 * deleted, rather than dropping the clause and reading like somebody did it.
 */
export function historySentence(
  c: DateChange,
  nameOf: (id: string) => string | null,
): string {
  const moved = daysBetween(c.from_start, c.to_start)
  const n = Math.abs(moved)
  const days = `${n} ${n === 1 ? 'day' : 'days'}`
  const dir = moved === 0 ? 'moved' : moved > 0 ? 'moved back' : 'pulled forward'

  if (c.kind === 'cascade') {
    const cause = c.caused_by_item_id ? nameOf(c.caused_by_item_id) : null
    // The line is gone but the fact is not. "Moved 3 days because something
    // upstream moved" is still an answer; silence is not.
    return cause
      ? `${dir} ${days} because ${cause} moved`
      : `${dir} ${days} because something upstream moved`
  }

  const reason = String(c.reason ?? '').trim()
  if (c.kind === 'delay') {
    return reason ? `Delayed ${days} - ${reason}` : `Delayed ${days}`
  }
  return reason ? `Dates changed, ${dir} ${days} - ${reason}` : `Dates changed, ${dir} ${days}`
}

/**
 * The badge on a schedule row, or null when there is nothing to say.
 *
 * NULL FOR A LINE THAT HAS NOT MOVED, and that is most of them. A badge on
 * every row means nothing on any of them - the same reason
 * `inspectionCountdown` returns null past a fortnight.
 */
export function slipBadge(
  line: { start_date: DateString; end_date: DateString },
  changes: DateChange[],
): { label: string; tone: 'warn' | 'info' } | null {
  const slip = slipDays(line, changes)
  if (slip === 0) return null
  const n = Math.abs(slip)
  const days = `${n} ${n === 1 ? 'day' : 'days'}`

  // A SLIP IS AMBER ONLY IF SOMEBODY CALLED IT ONE. A line that moved because
  // the whole job was re-planned is a fact, not a problem, and colouring it
  // like a problem spends the one bit of attention amber buys.
  if (slip > 0) {
    return wasDelayed(changes)
      ? { label: `${days} late`, tone: 'warn' }
      : { label: `${days} later than planned`, tone: 'info' }
  }
  return { label: `${days} earlier than planned`, tone: 'info' }
}
