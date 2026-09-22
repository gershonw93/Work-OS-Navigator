import { findCycle, type Dependency } from './schedule-dependencies'
import { tradePhase, type TradePhase } from './trade-order'

/**
 * WHAT THIS LINE PROBABLY WAITS FOR - OFFERED, NEVER WRITTEN.
 *
 * The root cause under every schedule feature shipped so far: 121 lines, FIVE
 * links. A cascade with nothing to cascade through is indistinguishable from a
 * cascade that does not work, which is how "will it actually push off anyone
 * dependent?" got asked in the first place.
 *
 * ── THIS MODULE HAS NO WRITE IN IT, AND THAT IS THE DESIGN ───────────────────
 *
 * It returns proposals. The picker renders them as chips; tapping one STAGES a
 * link exactly as typing it by hand would, and "Save Changes" is still what
 * commits. Nothing here reaches a route, and the route that writes links takes
 * EXPLICIT pairs and has never had an opinion of its own.
 *
 * That matters more than it sounds. A link decides whose dates move and who
 * gets emailed when something slips. A feature that wrote its own guesses
 * would be sending mail to subcontractors on the strength of a lookup table -
 * and the wrongness would only surface weeks later, as a trade that showed up
 * on a day nobody expected them.
 *
 * ── THE FOUR REFUSALS ────────────────────────────────────────────────────────
 *
 * Each one exists because the alternative produces a confident wrong answer:
 *
 *  1. NO PHASE, NO SUGGESTION. Both ends have to be a trade `trade-order.ts`
 *     actually places. An unrecognised trade - "Elecric", "PL&SP", a bare
 *     milestone called "Substantial Completion" - proposes nothing.
 *  2. THE DATES MUST ALREADY AGREE (`pred.end_date <= line.start_date`). This
 *     is the load-bearing one. The table says what USUALLY follows what; the
 *     dates say what somebody actually planned on THIS job. Suggesting a link
 *     the dates contradict would be telling a GC their own schedule is wrong,
 *     and the moment it is accepted the cascade drags the line somewhere
 *     nobody put it.
 *  3. NEVER A LOOP. `findCycle` is reused, never re-implemented - a second
 *     cycle check is a second answer to one question.
 *  4. ONE PER LINE, AND ONLY FOR A LINE WITH NO LINKS AT ALL. A line somebody
 *     has already linked is a line somebody has already thought about, and
 *     piling suggestions onto it argues with a decision that was made.
 *
 * ── AND A SUGGESTION NEVER CARRIES A GATE ────────────────────────────────────
 *
 * `min_predecessor_progress` stays null and `lag_days` stays 0. A percent gate
 * is a HUMAN STATEMENT about how far along another trade has to be before this
 * one starts; nothing in a trade table knows that. Worse, it would be a claim
 * with teeth: a gate that is never met blocks the line for ever, and a blocked
 * gate looks exactly like a gate whose condition is satisfied.
 *
 * ── DELIVERIES ARE OUT, BOTH WAYS ────────────────────────────────────────────
 *
 * Which delivery feeds which trade is not recoverable from a trade name - a
 * lumber package and a cabinet order are both "Materials" - and a delivery is
 * not 40% of the way through anything. They remain hand-picked, which is what
 * the person who ordered them is for.
 */

export interface SuggestableLine {
  id: string
  /** What this line is called on screen - already resolved through `lineTrade`. */
  name: string
  /** The trade, from the line or its subcontract. Null for a milestone. */
  trade: string | null
  start_date: string
  end_date: string
  /** A delivery neither suggests nor receives - see above. */
  kind: 'work' | 'delivery'
}

export interface LinkSuggestion {
  task_id: string
  predecessor_task_id: string
  taskName: string
  predecessorName: string
  /**
   * WHY, IN ONE SENTENCE, ON THE CHIP.
   *
   * A suggestion whose reasoning is invisible is a thing to click, not a thing
   * to judge - and judging it is the entire job the person has been given.
   */
  because: string
}

/** Just the date part, so a timestamp and a date compare the same way. */
const day = (v: unknown): string => String(v ?? '').trim().slice(0, 10)

export function suggestLinks({ lines, deps }: {
  lines: SuggestableLine[]
  deps: Dependency[]
}): LinkSuggestion[] {
  const all = lines ?? []
  const links = deps ?? []

  /** The phase of each line, worked out once. Null is the common answer. */
  const phaseOf = new Map<string, TradePhase>()
  for (const line of all) {
    if (line.kind === 'delivery') continue
    const phase = tradePhase(line.trade)
    if (phase) phaseOf.set(line.id, phase)
  }

  // `findCycle` wants the shape the real table has, and the proposals made so
  // far count too: two suggestions accepted together must not close a loop
  // that neither closes alone.
  const known: Dependency[] = links.map(d => ({
    task_id: d.task_id,
    predecessor_task_id: d.predecessor_task_id,
  }))
  const cycleLines = all.map(l => ({
    id: l.id, trade: l.trade, label: l.name, start_date: l.start_date, end_date: l.end_date,
  }))

  const out: LinkSuggestion[] = []

  for (const line of all) {
    const phase = phaseOf.get(line.id)
    if (!phase) continue
    // A line somebody has already linked has already been thought about.
    if (links.some(d => d.task_id === line.id)) continue
    const start = day(line.start_date)
    if (!start) continue

    const candidates = all.filter(other => {
      if (other.id === line.id) return false
      const otherPhase = phaseOf.get(other.id)
      // Strictly below: the rough-ins do not wait for the rough-ins.
      if (!otherPhase || otherPhase.order >= phase.order) return false
      const end = day(other.end_date)
      // THE DATES MUST ALREADY AGREE.
      if (!end || end > start) return false
      return !findCycle(known, line.id, other.id, cycleLines)
    })

    if (!candidates.length) continue

    // THE NEAREST PHASE BELOW, then the one that finishes LAST.
    //
    // Nearest phase because drywall follows the rough-ins, not the foundation
    // - both are "below", and proposing the foundation would be true and
    // useless. Finishes last because among equals that is the one actually
    // holding this line up; a tie falls back to the id purely so the same
    // board suggests the same thing twice, which a test can check and a person
    // can trust.
    candidates.sort((a, b) => {
      const pa = phaseOf.get(a.id)!.order
      const pb = phaseOf.get(b.id)!.order
      if (pa !== pb) return pb - pa
      const ea = day(a.end_date)
      const eb = day(b.end_date)
      if (ea !== eb) return ea < eb ? 1 : -1
      return a.id < b.id ? -1 : 1
    })

    const best = candidates[0]
    known.push({ task_id: line.id, predecessor_task_id: best.id })
    out.push({
      task_id: line.id,
      predecessor_task_id: best.id,
      taskName: line.name,
      predecessorName: best.name,
      because: `${phase.label} comes after ${phaseOf.get(best.id)!.label} on a job, `
        + `and ${best.name} already finishes before this starts.`,
    })
  }

  return out
}

/** The suggestion for one line, which is what a dialog actually asks for. */
export function suggestionFor(
  lineId: string,
  args: { lines: SuggestableLine[]; deps: Dependency[] },
): LinkSuggestion | null {
  return suggestLinks(args).find(s => s.task_id === lineId) ?? null
}
