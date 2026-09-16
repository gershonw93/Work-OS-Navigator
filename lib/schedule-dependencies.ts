// ─────────────────────────────────────────────────────────────────────────────
// What moves when a schedule line moves, and what is allowed to depend on what.
//
// Pure. No database, no clock, no Date arithmetic that a timezone can bend -
// dates are 'YYYY-MM-DD' strings all the way through, because a schedule is a
// calendar of days and a UTC Date object one hour either side of midnight is a
// different day to the person reading it.
//
// THE MODEL, and where it differs from the spec it was written from:
//
//   - The table is `schedule_items`, not `schedule_task`. A row is a project,
//     a trade, dates, and OPTIONALLY a subcontract. A row with no subcontract
//     is the "placeholder line" - that has been the shape since migration 006
//     made `subcontract_id` nullable; what it lacked was a trade of its own,
//     which is why dependencies could not point at "sheetrock, dates TBD".
//
//   - A dependency is a row pointing at a PREDECESSOR line, with an optional
//     `min_predecessor_progress` and a `lag_days`. Pointing at the LINE and not
//     at the trade is what lets a trade have phases: Electrical rough-in and
//     Electrical finish are two lines, and "drywall follows rough-in" names
//     one of them.
// ─────────────────────────────────────────────────────────────────────────────

/** A calendar day. Always 'YYYY-MM-DD'. */
export type DateString = string

export interface ScheduleLine {
  id: string
  /** The trade this line is for. A placeholder has one; only the sub is absent. */
  trade?: string | null
  label?: string | null
  start_date: DateString
  end_date: DateString
  subcontract_id?: string | null
  /** Set when a human edited the dates by hand - see `skipped` below. */
  dates_overridden_at?: string | null
  /** A percent somebody TYPED. Null means nobody has, which is not zero. */
  progress_pct?: number | null
}

export interface Dependency {
  id?: string
  /** The line that waits. */
  task_id: string
  /** The line it waits for. */
  predecessor_task_id: string
  /** How far along the predecessor must be. Null means "just the dates". */
  min_predecessor_progress?: number | null
  /** Days of breathing room after the predecessor ends. */
  lag_days?: number | null
}

// ── Dates ────────────────────────────────────────────────────────────────────

/**
 * Days between two calendar days, b - a.
 *
 * Built from UTC on purpose: both sides are parsed the same way, so the offset
 * cancels and the answer is a whole number of days. `new Date('2026-03-08')`
 * in a local zone is the trap - across a DST boundary the difference comes out
 * as 0.958333 days and `Math.round` hides it until it does not.
 */
export function daysBetween(a: DateString, b: DateString): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000)
}

/** The day `n` days after `date`. Negative `n` goes backwards. */
export function addDays(date: DateString, n: number): DateString {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return date
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10)
}

/** True for a well-formed calendar day. */
export function isDateString(v: unknown): v is DateString {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
}

// ── Cycles ───────────────────────────────────────────────────────────────────

export interface CyclePath {
  /** The ids that form the loop, first repeated at the end: A -> B -> A. */
  ids: string[]
  /** The same loop written with names, for the message a human reads. */
  message: string
}

/** What a line is called on screen: its trade, else its label, else "a line". */
export function lineName(line: Pick<ScheduleLine, 'trade' | 'label'> | undefined | null): string {
  return line?.trade?.trim() || line?.label?.trim() || 'an unnamed line'
}

/**
 * The loop that adding `task -> predecessor` would create, or null.
 *
 * Walks FORWARD from the proposed predecessor: if the chain of things it in
 * turn waits for ever reaches `taskId`, the edge closes a loop. Naming the
 * loop is the whole point - "that would create a circular dependency" tells
 * somebody nothing about which link to remove.
 */
export function findCycle(
  deps: Dependency[],
  taskId: string,
  predecessorTaskId: string,
  lines: ScheduleLine[] = [],
): CyclePath | null {
  if (taskId === predecessorTaskId) {
    const name = lineName(lines.find(l => l.id === taskId))
    return { ids: [taskId, taskId], message: `${name} cannot wait for itself.` }
  }

  const waitsFor = new Map<string, string[]>()
  for (const d of deps) {
    const list = waitsFor.get(d.task_id) ?? []
    list.push(d.predecessor_task_id)
    waitsFor.set(d.task_id, list)
  }

  // Depth-first from the predecessor, keeping the path so the loop can be read
  // back. `seen` is per-search, not per-path: revisiting a node that led
  // nowhere cannot suddenly lead somewhere.
  const seen = new Set<string>()
  const path: string[] = []

  const walk = (id: string): boolean => {
    if (id === taskId) return true
    if (seen.has(id)) return false
    seen.add(id)
    path.push(id)
    for (const next of waitsFor.get(id) ?? []) {
      if (walk(next)) return true
    }
    path.pop()
    return false
  }

  if (!walk(predecessorTaskId)) return null

  const ids = [taskId, ...path, taskId]
  const names = ids.map(id => lineName(lines.find(l => l.id === id)))
  return { ids, message: `That would create a loop: ${names.join(' waits for ')}.` }
}

// ── Progress ─────────────────────────────────────────────────────────────────

export type ProgressSource = 'entered' | 'budget' | 'unknown'

export interface Progress {
  /** Null when nobody knows. NOT zero - see below. */
  pct: number | null
  source: ProgressSource
}

export interface BudgetProgressRow {
  progress_pct?: number | null
  amount?: number | null
}

/**
 * How far along a line is, and WHERE THAT NUMBER CAME FROM.
 *
 * A typed percent wins, because somebody looked at the job and said so. With
 * none, the linked subcontract's budget lines are rolled up, weighted by
 * amount - a $90k line at 10% and a $10k line at 100% is 19% done, not 55%.
 *
 * WITH NEITHER IT RETURNS NULL, and that is the important case. Zero would
 * mean "not started", which is a claim, and a gate compared against a false
 * zero stays shut for ever while looking like it is working. `source` travels
 * with the number so the screen can say "nobody has said" instead of "0%".
 */
export function lineProgress(line: ScheduleLine, budgetRows: BudgetProgressRow[] = []): Progress {
  const typed = line.progress_pct
  if (typed != null && Number.isFinite(typed)) {
    return { pct: clampPct(typed), source: 'entered' }
  }

  const rows = budgetRows.filter(r => r.progress_pct != null && Number.isFinite(r.progress_pct as number))
  if (!rows.length) return { pct: null, source: 'unknown' }

  const weight = (r: BudgetProgressRow) => {
    const a = Number(r.amount)
    return Number.isFinite(a) && a > 0 ? a : 0
  }
  const total = rows.reduce((sum, r) => sum + weight(r), 0)

  // Every row weightless (no amounts) - a plain mean is the only honest answer.
  if (total <= 0) {
    const mean = rows.reduce((s, r) => s + clampPct(Number(r.progress_pct)), 0) / rows.length
    return { pct: round2(mean), source: 'budget' }
  }

  const weighted = rows.reduce((s, r) => s + clampPct(Number(r.progress_pct)) * weight(r), 0) / total
  return { pct: round2(weighted), source: 'budget' }
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n))
const round2 = (n: number) => Math.round(n * 100) / 100

export interface BlockedVerdict {
  blocked: boolean
  /** The sentence to show. Null only when nothing is blocking. */
  reason: string | null
  /** True when we are blocking because nobody has said, not because it is early. */
  unknown: boolean
}

/**
 * Whether a line is held up by a progress gate.
 *
 * An UNKNOWN predecessor blocks. The alternative - treating "nobody has said"
 * as far-enough-along - releases a sub onto a site because a field was never
 * filled in, and a wrong "go" costs a wasted truck roll. It says which it is,
 * so the fix (type a percent) is obvious rather than mysterious.
 */
export function blockedBy(
  dep: Pick<Dependency, 'min_predecessor_progress'>,
  predecessor: ScheduleLine,
  progress: Progress,
): BlockedVerdict {
  const need = dep.min_predecessor_progress
  if (need == null || !Number.isFinite(need)) return { blocked: false, reason: null, unknown: false }

  const name = lineName(predecessor)
  if (progress.pct == null) {
    return {
      blocked: true,
      unknown: true,
      reason: `Waiting on ${name} to reach ${need}% - nobody has said how far along it is yet.`,
    }
  }
  if (progress.pct < need) {
    return {
      blocked: true,
      unknown: false,
      reason: `Waiting on ${name} to reach ${need}% - it is at ${progress.pct}%.`,
    }
  }
  return { blocked: false, reason: null, unknown: false }
}

// ── The cascade ──────────────────────────────────────────────────────────────

export interface Move {
  id: string
  from: { start: DateString; end: DateString }
  to: { start: DateString; end: DateString }
  /** Days moved. Negative pulls the line earlier. */
  shiftDays: number
  /** The line whose move caused this one. Null for the line the user edited. */
  becauseOf: string | null
}

export interface Skipped {
  id: string
  reason: 'manually_overridden'
  /** The line that would have moved it. */
  becauseOf: string
}

export interface CascadeResult {
  moves: Move[]
  skipped: Skipped[]
}

/**
 * Everything that moves when one line moves.
 *
 * Breadth-first over dependents, which is what makes a diamond behave: if D
 * waits for both B and C and both moved, D is visited once and takes the
 * LARGEST push, because a task cannot start until the last thing it waits for
 * is done. Taking the first answer found would schedule it against whichever
 * predecessor happened to be walked first.
 *
 * A line whose dates a human edited by hand is SKIPPED and reported, not moved
 * silently - and skipping it stops the cascade there, because moving its
 * dependents off dates it no longer has would be arithmetic about a number
 * nobody agreed to.
 *
 * `lagDays` is honoured as a floor: a dependent never starts before its
 * predecessor's new end plus the lag. A line already sitting later than that
 * does not get dragged backwards by a predecessor moving earlier.
 */
export function cascade(
  lines: ScheduleLine[],
  deps: Dependency[],
  movedId: string,
  newStart: DateString,
  newEnd: DateString,
): CascadeResult {
  const byId = new Map(lines.map(l => [l.id, l]))
  const root = byId.get(movedId)
  if (!root) return { moves: [], skipped: [] }

  const dependentsOf = new Map<string, Dependency[]>()
  for (const d of deps) {
    const list = dependentsOf.get(d.predecessor_task_id) ?? []
    list.push(d)
    dependentsOf.set(d.predecessor_task_id, list)
  }

  const moves = new Map<string, Move>()
  const skipped = new Map<string, Skipped>()

  moves.set(movedId, {
    id: movedId,
    from: { start: root.start_date, end: root.end_date },
    to: { start: newStart, end: newEnd },
    shiftDays: daysBetween(root.start_date, newStart),
    becauseOf: null,
  })

  // Current dates for a line, taking a move already decided over the stored row.
  const endOf = (id: string) => moves.get(id)?.to.end ?? byId.get(id)?.end_date ?? null

  const queue: string[] = [movedId]
  // A cycle should be impossible (findCycle guards every write), but a loop
  // that slipped in must not hang the request - every id is enqueued once.
  const enqueued = new Set<string>([movedId])

  while (queue.length) {
    const currentId = queue.shift()!
    const currentEnd = endOf(currentId)
    if (!currentEnd) continue

    for (const dep of dependentsOf.get(currentId) ?? []) {
      const child = byId.get(dep.task_id)
      if (!child) continue

      if (child.dates_overridden_at) {
        skipped.set(child.id, { id: child.id, reason: 'manually_overridden', becauseOf: currentId })
        continue
      }

      const lag = Number(dep.lag_days) || 0
      const earliestStart = addDays(currentEnd, lag + 1)
      const existing = moves.get(child.id)
      const childStart = existing?.to.start ?? child.start_date

      // The floor only pushes forward. A dependent already later than the
      // earliest it could start is not pulled back by a predecessor that moved
      // earlier - its own dates were a decision, not a consequence.
      const shift = daysBetween(childStart, earliestStart)
      if (shift <= 0) continue

      const nextStart = addDays(childStart, shift)
      const nextEnd = addDays(existing?.to.end ?? child.end_date, shift)

      moves.set(child.id, {
        id: child.id,
        from: { start: child.start_date, end: child.end_date },
        to: { start: nextStart, end: nextEnd },
        shiftDays: daysBetween(child.start_date, nextStart),
        becauseOf: currentId,
      })

      if (!enqueued.has(child.id)) { enqueued.add(child.id); queue.push(child.id) }
      // Re-walk a line that took a bigger push, so its own dependents follow.
      else if (!queue.includes(child.id)) queue.push(child.id)
    }
  }

  moves.delete(movedId)
  return {
    moves: Array.from(moves.values()),
    skipped: Array.from(skipped.values()),
  }
}

/**
 * The sentence a sub reads. One per SUB, not one per task - `tasks` is
 * everything of theirs that moved, and the reason names what actually pushed
 * it rather than the whole chain.
 */
export function shiftSentence(move: Move, predecessorName: string | null): string {
  const dir = move.shiftDays > 0 ? 'later' : 'earlier'
  const n = Math.abs(move.shiftDays)
  const days = `${n} ${n === 1 ? 'day' : 'days'}`
  const because = predecessorName ? ` because ${predecessorName} moved` : ''
  return `moved ${days} ${dir}${because}: ${move.from.start} is now ${move.to.start}`
}
