import { daysBetween, lineName, type DateString, type ScheduleLine, type Dependency, type CascadeResult } from './schedule-dependencies'

/**
 * WHAT A DATE CHANGE WILL **NOT** DO.
 *
 * THE REPORT: "will it actually push off anyone dependent?" - and on this
 * database the honest answer is usually no. 121 schedule lines across 26 jobs
 * carry FIVE links between them, so on 23 of those 26 jobs moving a date moves
 * nobody. The screen said nothing about it: with no line to move there is
 * nothing to review, the review was skipped, and the save went through in
 * silence. "Nothing was waiting on this line" and "the feature did not fire"
 * look identical from the chair, which is the whole problem.
 *
 * Same family as `lib/auth-outcome.ts` and the empty-list rule on the
 * dependency picker: AN ABSENCE IS A FACT AND HAS TO BE STATED. A reason for
 * saying nothing is not a reason the reader can see.
 *
 * FOUR CASES, and only two of them ever reach the review screen today:
 *
 *   - `nothing_linked`  nothing waits on this line, so nobody moves.
 *   - `all_pinned` / `some_pinned`  what waits on it was hand-dated after it
 *     was linked, so it stays put. `cascade()` already reports these as
 *     `manually_overridden`; this names them before the write as well.
 *   - `self_unpins`  THE INVISIBLE ONE. This line follows something, and
 *     typing dates on it takes it OUT of that chain for ever - `handEditWins`
 *     reads the flag this save is about to set. Nothing tells anybody, and the
 *     only way back is to link it again.
 *   - `end_unchanged`  the finish did not move, so nothing follows. What a
 *     follower waits on is the FINISH date; a line that starts two days later
 *     and still finishes on the day it always did pushes nobody.
 *
 * ASKED BY THE ROUTE AND READ BY THE FORM, the one-function-two-doors rule:
 * the cascade preview computes it beside the moves, so the sentence on screen
 * and the thing that happens are worked out by the same code.
 */

export type NoMoveReason =
  | 'nothing_linked'
  | 'all_pinned'
  | 'some_pinned'
  | 'self_unpins'
  | 'end_unchanged'

export interface ChangeWarning {
  /** The headline, or null when there is nothing to say. */
  title: string | null
  /** One sentence per reason, in the order they matter. */
  points: string[]
  reasons: NoMoveReason[]
  /**
   * True only when there is genuinely nothing to warn about. The review screen
   * is skipped ONLY on this - never on "no moves", which is exactly the case
   * that needed saying.
   */
  silent: boolean
}

export interface WarningInput {
  edited: Pick<ScheduleLine, 'id' | 'trade' | 'label' | 'start_date' | 'end_date'>
  newStart: DateString
  newEnd: DateString
  result: CascadeResult
  /**
   * The links where the EDITED line is the one that waits - what it follows.
   * Empty means it follows nothing, so no hand edit can un-pin it.
   */
  ownPredecessors: { dep: Dependency; predecessor: Pick<ScheduleLine, 'id' | 'trade' | 'label'> }[]
  /**
   * True when this same save is creating a link. Linking says "follow" and is
   * the later word, so the line is NOT dropping out of anything.
   */
  justLinked: boolean
  /** Anything else that waits on this line, whether or not it moves. */
  hasDependents: boolean
}

const PINNED = 'manually_overridden'

/** What a date change will not do, in the sender's own terms. */
export function changeWarning(input: WarningInput): ChangeWarning {
  const { edited, newStart, newEnd, result, ownPredecessors, justLinked, hasDependents } = input

  const name = lineName(edited)
  const datesChanged = newStart !== edited.start_date || newEnd !== edited.end_date
  const endMoved = daysBetween(edited.end_date, newEnd) !== 0

  const reasons: NoMoveReason[] = []
  const points: string[] = []

  // NOTHING IS WAITING ON IT. The commonest case by far, and the one that was
  // saving in silence. The sentence says what to DO about it, because "nobody
  // moves" on its own reads as a failure rather than as a schedule nobody has
  // linked up yet.
  if (datesChanged && !hasDependents) {
    reasons.push('nothing_linked')
    points.push(
      `Nothing is waiting on ${name}, so moving it moves nobody. ` +
      `If another trade should follow this one, open that trade's own row and link it.`,
    )
  }

  // THE FINISH IS WHAT A FOLLOWER WAITS ON. A start-only edit is a legitimate
  // thing to do and pushes nobody, which is surprising enough to say out loud.
  if (datesChanged && hasDependents && !endMoved) {
    reasons.push('end_unchanged')
    points.push(
      `Nothing behind this moves: what a follower waits on is the FINISH, ` +
      `and ${name} still finishes ${edited.end_date}.`,
    )
  }

  // HAND-DATED FOLLOWERS. `cascade()` already reports these; naming them
  // before the write means the answer is not a message about a save that
  // already happened.
  const pinned = result.skipped.filter(s => s.reason === PINNED)
  if (pinned.length) {
    const all = result.moves.length === 0
    reasons.push(all ? 'all_pinned' : 'some_pinned')
    points.push(
      `${pinned.length} ${pinned.length === 1 ? 'trade that waits' : 'trades that wait'} on this ` +
      `${pinned.length === 1 ? 'has' : 'have'} had dates typed in by hand since being linked, so ` +
      `${pinned.length === 1 ? 'it stays' : 'they stay'} put. Link ${pinned.length === 1 ? 'it' : 'them'} ` +
      `again from ${pinned.length === 1 ? 'its' : 'their'} own row and ${pinned.length === 1 ? 'it follows' : 'they follow'} from then on.`,
    )
  }

  // THIS LINE DROPS OUT OF ITS OWN CHAIN. Nothing has ever said this, and it
  // is permanent until somebody re-links - `handEditWins` weighs the flag this
  // save is about to stamp against the link's own date, and the later word
  // wins. Linking in the same save IS the later word, so it does not apply.
  if (datesChanged && !justLinked && ownPredecessors.length) {
    reasons.push('self_unpins')
    const after = ownPredecessors.map(p => lineName(p.predecessor)).join(', ')
    points.push(
      `${name} follows ${after}. Typing dates here takes it OUT of that chain - ` +
      `if ${after} moves later, ${name} will not move with it. Linking it again puts it back.`,
    )
  }

  return {
    title: reasons.length ? 'Before you save' : null,
    points,
    reasons,
    silent: reasons.length === 0,
  }
}
