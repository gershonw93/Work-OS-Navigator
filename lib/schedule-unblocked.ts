import {
  blockedBy, lineName, toPct,
  type Dependency, type Progress, type ProgressSource, type ScheduleLine,
} from './schedule-dependencies'

/**
 * WHO IS STILL HELD, AND WHO HAS JUST COME FREE.
 *
 * The percent gate has had teeth since #502 and a "you're clear to start"
 * email since #500, and between them nothing ever asked this question on a
 * screen: the route that computed it had no caller in the entire repository,
 * so the published release note ("when it clears, the sub gets a 'you are
 * clear to start' email") and the public scheduling guide both described a
 * letter that could not be sent. Every user had a Settings toggle for a
 * notification that had never fired once.
 *
 * Pure, so the board, the review screen and the send all read ONE rule. The
 * verdict itself is `blockedBy` and is never re-worded here - the cascade
 * review already learned that lesson, where two screens printing their own
 * sentence about one gate meant neither could be used to check the other.
 *
 * THE AGGREGATION IS THE POINT, and getting it wrong is what this module
 * exists to prevent. The first version of this question mapped one row PER
 * DEPENDENCY and called every unblocked row cleared. A line waiting on two
 * trades - Drywall after both Framing and Rough Plumbing - would appear in
 * that list the moment EITHER gate opened, and the sub would be told they
 * were clear to start against a gate that was still shut. A wrong "go" puts a
 * crew on a site. A line is clear when EVERY gate on it is clear, and a line
 * with no gates at all is not "clear", it is ungated - it was never waiting,
 * so there is nothing to announce.
 */

export interface LineGate {
  predecessorId: string
  predecessorName: string
  /** The percent the predecessor must reach. */
  need: number
  /** Where it has actually got to, and how we know. */
  progress: number | null
  progressSource: ProgressSource
  blocked: boolean
  /** Blocked because nobody has said, rather than because the work is early. */
  unknown: boolean
  /** `blockedBy`'s own sentence. Null once the gate is open. */
  reason: string | null
}

export interface LineGateState {
  taskId: string
  taskName: string
  taskStart: string | null
  subcontractId: string | null
  /** Every percent gate on this line, shut or open. */
  gates: LineGate[]
  /** ANY gate still shut. */
  blocked: boolean
  /** Held only because nobody has said how far along the trade ahead is. */
  unknown: boolean
  /** The first shut gate's sentence, for a badge that has room for one line. */
  reason: string | null
  /** When this line was last told it was clear. Null means never. */
  toldAt: string | null
}

/**
 * Every line that carries at least one percent gate, and whether it is shut.
 *
 * A dependency with no `min_predecessor_progress` is a plain "after them"
 * link. It takes no part: there is no moment at which it "clears" - it is a
 * statement about order, which the cascade already acts on - so counting it
 * here would put every linked line on a screen about gates.
 *
 * A link whose two ends are not both on the board reports NOTHING, the same
 * refusal the cascade review makes: a row the reader cannot find on the
 * schedule is worse than a row left out of the list.
 */
export function gatePicture(
  lines: ScheduleLine[],
  deps: Dependency[],
  progressOf: (lineId: string) => Progress,
  toldAt: (taskId: string) => string | null = () => null,
): LineGateState[] {
  const byId = new Map(lines.map(l => [l.id, l]))
  const byTask = new Map<string, LineGate[]>()

  for (const dep of deps) {
    const need = toPct(dep.min_predecessor_progress)
    if (need == null) continue

    const task = byId.get(dep.task_id)
    const pred = byId.get(dep.predecessor_task_id)
    if (!task || !pred) continue

    const progress = progressOf(pred.id)
    const verdict = blockedBy(dep, pred, progress)

    const list = byTask.get(task.id) ?? []
    list.push({
      predecessorId: pred.id,
      predecessorName: lineName(pred),
      need,
      progress: progress.pct,
      progressSource: progress.source,
      blocked: verdict.blocked,
      unknown: verdict.unknown,
      reason: verdict.reason,
    })
    byTask.set(task.id, list)
  }

  const out: LineGateState[] = []
  // `Array.from` rather than iterating the Map directly: this file compiles
  // under the repo's ES5 target, where a bare `for...of` over a Map needs
  // downlevelIteration and fails the build instead.
  for (const [taskId, gates] of Array.from(byTask.entries())) {
    const task = byId.get(taskId)!
    const shut = gates.filter(g => g.blocked)
    out.push({
      taskId,
      taskName: lineName(task),
      taskStart: task.start_date ?? null,
      subcontractId: task.subcontract_id ?? null,
      gates,
      blocked: shut.length > 0,
      // Only 'unknown' when EVERY reason it is held is a missing answer. A
      // line held by one trade that is genuinely early and one nobody has
      // reported on is held by the early one, and saying "nobody has said"
      // would send somebody to chase the wrong question.
      unknown: shut.length > 0 && shut.every(g => g.unknown),
      reason: shut[0]?.reason ?? null,
      toldAt: toldAt(taskId),
    })
  }
  return out
}

/**
 * The ones worth putting in front of somebody, and ONLY those.
 *
 * Three refusals, each because the alternative is a screen that wastes a
 * press:
 *
 *   - STILL SHUT. Obviously.
 *   - ALREADY TOLD. The moment this button really sends, a second press is a
 *     second identical email to one sub. Nothing re-opens a gate that has
 *     been announced, so the offer goes away once it has been taken.
 *   - NOBODY TO TELL. A line with no subcontract has no vendor and no
 *     address, so offering it is offering to email nobody - the same failure
 *     the cascade review already answered, where a change that moved nobody
 *     still rendered two buttons about notifying them.
 */
export function clearToTell(rows: LineGateState[]): LineGateState[] {
  return rows.filter(r => !r.blocked && !r.toldAt && r.subcontractId)
}
