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
  /**
   * A percent somebody TYPED. Null means nobody has, which is not zero.
   *
   * `number | string` is not sloppiness - see `toPct` below. The column is
   * NUMERIC and PostgREST hands it back QUOTED.
   */
  progress_pct?: number | string | null
}

export interface Dependency {
  id?: string
  /** The line that waits. */
  task_id: string
  /** The line it waits for. */
  predecessor_task_id: string
  /** How far along the predecessor must be. Null means "just the dates". */
  min_predecessor_progress?: number | string | null
  /** Days of breathing room after the predecessor ends. */
  lag_days?: number | null
  /** When the link was made. Decides which of two statements is the later one. */
  created_at?: string | null
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
  progress_pct?: number | string | null
  amount?: number | string | null
}

/**
 * A percent off a row, whatever shape the database handed it over in.
 *
 * **A NUMERIC COLUMN COMES BACK AS A STRING, AND `Number.isFinite` DOES NOT
 * COERCE.** `min_predecessor_progress`, `schedule_items.progress_pct` and
 * `budget_line_items.progress_pct` are all `NUMERIC(5,2)`, and PostgREST
 * serialises those QUOTED - `"80.00"`, not `80`. Every guard in this file read
 * `Number.isFinite(value)`, which is `false` for a string, so:
 *
 *   - a typed percent never won over the budget roll-up,
 *   - the budget roll-up filtered every row out and answered `unknown`,
 *   - `blockedBy` returned "not blocked" for every gate ever set, and
 *   - the review printed "waits on Sheetrock" for an 80% link.
 *
 * Only the last of those is visible, and it was reported as a nit. The other
 * three fail SILENTLY AND SAFELY-LOOKING: a gate that never blocks looks
 * exactly like a gate whose condition is met.
 *
 * Every unit test passed throughout, because a fixture is written by hand and
 * a hand writes `80`. THE SAME RULE AS A `.select()` - check the shape against
 * the migration, not against what you would have typed.
 */
export function toPct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? clampPct(n) : null
}

/** The same, for money: an amount off a NUMERIC column is a string too. */
export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

/** "80", never "80.00" - a trailing .00 is the database showing through. */
export function pctLabel(value: unknown): string | null {
  const n = toPct(value)
  return n == null ? null : String(n)
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
  const typed = toPct(line.progress_pct)
  if (typed != null) return { pct: typed, source: 'entered' }

  const rows = budgetRows.filter(r => toPct(r.progress_pct) != null)
  if (!rows.length) return { pct: null, source: 'unknown' }

  const weight = (r: BudgetProgressRow) => {
    const a = toAmount(r.amount)
    return a != null && a > 0 ? a : 0
  }
  const total = rows.reduce((sum, r) => sum + weight(r), 0)

  // Every row weightless (no amounts) - a plain mean is the only honest answer.
  if (total <= 0) {
    const mean = rows.reduce((s, r) => s + (toPct(r.progress_pct) ?? 0), 0) / rows.length
    return { pct: round2(mean), source: 'budget' }
  }

  const weighted = rows.reduce((s, r) => s + (toPct(r.progress_pct) ?? 0) * weight(r), 0) / total
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
  const need = toPct(dep.min_predecessor_progress)
  if (need == null) return { blocked: false, reason: null, unknown: false }

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

/** Whether a line waits on the edited line itself, or further down the chain. */
export type LinkKind = 'direct' | 'downstream'

/** What the link that pushed a line actually says, for the screen to print. */
export interface LinkGate {
  /** The percent the predecessor must reach. Null for a plain "after them". */
  pct: number | null
  /** Clear days left in between. */
  lagDays: number
}

export function gateOf(dep: Pick<Dependency, 'min_predecessor_progress' | 'lag_days'>): LinkGate {
  return {
    pct: toPct(dep.min_predecessor_progress),
    lagDays: Number(dep.lag_days ?? 0) || 0,
  }
}

/**
 * Which of two statements about a line is the later one: the link, or the hand.
 *
 * THE REPORT THIS ANSWERS, in the reporter's words: "an explicitly linked row
 * follows the cascade - the manually-overridden flag should only come from date
 * edits made AFTER the link exists". Clearing the flag when a link is written
 * was half a fix: it can only ever help a link made after that code shipped,
 * and every row linked before it stayed stuck for ever with no way out but to
 * unlink and link again - which is exactly what the second report was, a row
 * on an 80% link sitting still while two rows linked the same afternoon moved.
 *
 * So the rule is READ at cascade time and covers every row already in the
 * table: LINKING SAYS "THIS FOLLOWS", DATING SAYS "LEAVE IT", AND THE ONE SAID
 * LAST WINS.
 *
 * A link with no `created_at` is treated as the later word. The flag is
 * re-asserted by editing the dates, which stamps a fresh timestamp - so the
 * recoverable mistake is the one this default makes, and the unrecoverable one
 * is the one it avoids.
 */
export function handEditWins(
  line: Pick<ScheduleLine, 'dates_overridden_at'>,
  dep: Pick<Dependency, 'created_at'>,
): boolean {
  const edited = line.dates_overridden_at
  if (!edited) return false
  const linked = dep.created_at
  if (!linked) return false
  const e = Date.parse(edited)
  const l = Date.parse(linked)
  if (Number.isNaN(e) || Number.isNaN(l)) return false
  return e > l
}

export interface Move {
  id: string
  from: { start: DateString; end: DateString }
  to: { start: DateString; end: DateString }
  /** Days moved. Negative pulls the line earlier. */
  shiftDays: number
  /** The line whose move caused this one. Null for the line the user edited. */
  becauseOf: string | null
  link: LinkKind
  /** What the link that pushed it says. Null when nothing pushed it. */
  gate: LinkGate | null
}

/**
 * Why a linked line is not moving. THREE reasons, not one:
 *
 *   - `manually_overridden` - somebody dated it by hand, so it is not computed
 *     from, and the chain stops there.
 *   - `no_shift`            - the thing it waits for did not actually finish
 *     any later, so there is nothing to pass on.
 *   - `chain_stopped`       - something between it and the edited line was
 *     left alone, so where this one lands cannot be worked out.
 *
 * The last two used to be nothing at all: they were simply absent from the
 * review, which reads exactly like "these are not linked".
 */
export type SkipReason = 'manually_overridden' | 'no_shift' | 'chain_stopped'

export interface Skipped {
  id: string
  reason: SkipReason
  /** The line that would have moved it. */
  becauseOf: string
  link: LinkKind
  gate: LinkGate | null
}

export interface CascadeResult {
  moves: Move[]
  skipped: Skipped[]
}

/**
 * Everything that moves when one line moves - AND EVERY LINKED LINE THAT DOES
 * NOT, because a linked row missing from the review reads as an unlinked one.
 *
 * A DEPENDENT SHIFTS BY THE SAME NUMBER OF DAYS ITS PREDECESSOR DID. Nothing
 * else. That is what the spec asked for and it is the only rule that keeps a
 * schedule's shape.
 *
 * THE BUG THIS REPLACES, reported with the arithmetic attached: the first
 * version computed `predecessorEnd + lag + 1` and SNAPPED the dependent to it.
 * Sheetrock moved three days, Oct 12 to Oct 15, and a line sitting back on
 * Sep 16 jumped to Oct 20 - thirty-four days, landing exactly on Sheetrock's
 * new boundary. Every test passed, because every fixture had the dependent
 * starting the day after its predecessor ended, where the snap and the shift
 * are the same number. A fixture that only exercises the case where two rules
 * agree cannot tell you which one you implemented.
 *
 * `lag_days` takes no part in this, and that is the point: shifting by the same
 * delta PRESERVES whatever gap the two lines already had, lag included. A lag
 * re-applied on every cascade is a floor, and a floor is what produced the
 * thirty-four days.
 *
 * THE DELTA A DEPENDENT TAKES IS ITS PREDECESSOR'S **END** DELTA, not its
 * start's. The screen says "can't start till another trade finishes", so what
 * a follower waits on is the FINISH: a line whose start holds and whose end
 * slips three days has taken three days longer, and everything behind it moves
 * three days. Measuring the start would report "nothing else moves" for the
 * most ordinary slip there is. For a cascaded line the two are the same number
 * - it moves whole - so only the edited line can tell them apart.
 *
 * The shift is SIGNED. A predecessor pulled three days earlier pulls its
 * dependents three days earlier too - "shifts by the same number of days" has
 * no direction in it, and a chain that only ever moves later drifts.
 *
 * A line whose dates a human edited carries `dates_overridden_at`; it is
 * SKIPPED and REPORTED, never moved silently, and the cascade stops there
 * rather than computing off dates the line no longer has.
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

  const rootShift = daysBetween(root.end_date, newEnd)

  const dependentsOf = new Map<string, Dependency[]>()
  for (const d of deps) {
    // A link whose two ends are not both on this project's board would put a
    // row in the review that the reader cannot see anywhere.
    if (!byId.has(d.task_id) || !byId.has(d.predecessor_task_id)) continue
    const list = dependentsOf.get(d.predecessor_task_id) ?? []
    list.push(d)
    dependentsOf.set(d.predecessor_task_id, list)
  }

  const directIds = new Set((dependentsOf.get(movedId) ?? []).map(d => d.task_id))
  const linkOf = (id: string): LinkKind => (directIds.has(id) ? 'direct' : 'downstream')

  // ── Pass one: how far does each line move ──────────────────────────────────
  /** How far each line ended up moving, so its own dependents can follow. */
  const shiftOf = new Map<string, number>([[movedId, rootShift]])
  /** What pushed it, for the sentence the review prints. */
  const causeOf = new Map<string, string>()
  /** And what that link SAYS, so an 80% gate is not printed as a plain link. */
  const gateVia = new Map<string, LinkGate>()
  /** Every link pointing AT a line, for classifying one pass one never reached. */
  const linksTo = new Map<string, Dependency[]>()
  for (const d of deps) {
    if (!byId.has(d.task_id) || !byId.has(d.predecessor_task_id)) continue
    const list = linksTo.get(d.task_id) ?? []
    list.push(d)
    linksTo.set(d.task_id, list)
  }

  const queue: string[] = [movedId]
  const enqueued = new Set<string>([movedId])

  while (queue.length) {
    const currentId = queue.shift()!
    const currentShift = shiftOf.get(currentId) ?? 0

    for (const dep of dependentsOf.get(currentId) ?? []) {
      const child = byId.get(dep.task_id)!
      if (child.id === movedId) continue
      // The hand edit only wins when it came AFTER this link. Otherwise the
      // link is the later word and the line follows - not computed from, and
      // not computed THROUGH, only when the hand had the last say. Pass two
      // reports it and everything standing behind it.
      if (handEditWins(child, dep)) continue

      // A diamond takes the BIGGEST push. D waiting on both B and C cannot
      // start until the last of them is done, so the larger delta wins - and
      // "larger" is by magnitude in the direction of travel, which for a
      // forward move is the greater number and for a backward one the lesser.
      const already = shiftOf.get(child.id)
      const next = already == null ? currentShift
        : currentShift > 0 ? Math.max(already, currentShift)
        : Math.min(already, currentShift)
      if (already != null && next === already) continue

      shiftOf.set(child.id, next)
      causeOf.set(child.id, currentId)
      gateVia.set(child.id, gateOf(dep))

      if (!enqueued.has(child.id)) { enqueued.add(child.id); queue.push(child.id) }
      else if (!queue.includes(child.id)) queue.push(child.id)
    }
  }

  // ── Pass two: EVERY line the links reach, in one bucket or the other ───────
  //
  // Pass one walks only what it can compute; anything behind a hand-dated line
  // never appears in it. Reporting off pass one alone is how linked rows went
  // missing from a screen whose whole job is to say what this edit touches.
  const moves: Move[] = []
  const skipped: Skipped[] = []
  const seen = new Set<string>([movedId])
  const walk: string[] = [movedId]

  while (walk.length) {
    const currentId = walk.shift()!

    for (const dep of dependentsOf.get(currentId) ?? []) {
      const childId = dep.task_id
      if (seen.has(childId)) continue
      seen.add(childId)
      walk.push(childId)

      const child = byId.get(childId)!
      const shift = shiftOf.get(childId)
      const link = linkOf(childId)
      // The gate the cascade came through, else this walk's own link - a row
      // pass one never reached still has to print what its link says.
      const gate = gateVia.get(childId) ?? gateOf(dep)
      // Asked with the SAME function pass one skipped on, or the two halves
      // can disagree about one row and the screen explains a skip that did not
      // happen.
      const vetoed = (linksTo.get(childId) ?? []).some(d => handEditWins(child, d))

      if (shift != null && shift !== 0) {
        moves.push({
          id: childId,
          from: { start: child.start_date, end: child.end_date },
          to: { start: addDays(child.start_date, shift), end: addDays(child.end_date, shift) },
          shiftDays: shift,
          becauseOf: causeOf.get(childId) ?? currentId,
          link,
          gate,
        })
      } else if (vetoed) {
        skipped.push({ id: childId, reason: 'manually_overridden', becauseOf: currentId, link, gate })
      } else if (shift === 0) {
        skipped.push({ id: childId, reason: 'no_shift', becauseOf: causeOf.get(childId) ?? currentId, link, gate })
      } else {
        skipped.push({ id: childId, reason: 'chain_stopped', becauseOf: currentId, link, gate })
      }
    }
  }

  return { moves, skipped }
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
