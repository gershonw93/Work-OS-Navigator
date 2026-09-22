/**
 * SAYING A TRADE IS RUNNING LATE, AS AN ACT RATHER THAN AS A DATE EDIT.
 *
 * "How do I currently delay a sub?" - by opening the line and typing a later
 * end date. Nothing records that it WAS a delay, why, or what the dates were
 * before, so a slip, a correction and a pull-forward are one shape the moment
 * the dialog closes.
 *
 * THE MATHS IS NOT NEW. A delay is the existing date change with the dates
 * computed for you and a reason attached - it goes through the same preview,
 * the same review screen and the same apply. A second writer of `start_date` /
 * `end_date` is how this repo ended up with two doors onto `companies.trade`
 * and onto a vendor's dates, and the cascade is the last place to want two
 * spellings of one calculation.
 */

import { addDays, type DateString } from './schedule-dependencies'

/** What a date move was, which is the whole reason this feature exists. */
export type ChangeKind = 'delay' | 'replan' | 'cascade'

export interface DelayDraft {
  days?: number | string | null
  reason?: string | null
}

/** Below this a "reason" is a keystroke, not a reason. */
export const MIN_DELAY_REASON = 4

/**
 * The longest slip this dialog will take in one go.
 *
 * Not a rule about construction - it is a typo guard. "30" with a stray key is
 * 300, and the cascade would happily push an entire job eleven months on a
 * number nobody read back.
 */
export const MAX_DELAY_DAYS = 365

/**
 * What is wrong with this delay, in the sender's terms, or null.
 *
 * Asked by the FORM and by the cascade PUT - the `missingMilestone` /
 * `missingSchedule` pattern. A server's answer can only ever arrive as a
 * message about a whole request that did not happen, and the field app posts
 * to the same route.
 *
 * NEVER wired to a `disabled` attribute. A disabled button explains nothing;
 * this text is what the press produces.
 */
export function missingDelay(draft: DelayDraft): string | null {
  return missingDelayDays(draft.days) ?? missingDelayReason(draft.reason)
}

/**
 * The days half on its own.
 *
 * Split out for the same reason as the reason half: the live preview under the
 * field wants to know WHERE THE LINE LANDS while the reason box is still
 * empty. Asking the whole rule there would mean passing a fake reason to get
 * past a check the preview does not care about - a lie in the argument list
 * that the next reader has to work out is deliberate.
 */
export function missingDelayDays(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Say how many days late it is.'

  const days = Number(raw)
  if (!Number.isInteger(days)) return 'Days late has to be a whole number.'
  // ZERO IS NOT A DELAY. It would write a record saying something moved while
  // moving nothing, which is worse than refusing.
  if (days < 1) return 'A delay is at least one day. To pull the dates earlier, edit them instead.'
  if (days > MAX_DELAY_DAYS) return `That is more than ${MAX_DELAY_DAYS} days - check the number.`
  return null
}

/**
 * The reason half on its own.
 *
 * SPLIT OUT BECAUSE THE ROUTE CANNOT ASK THE OTHER HALF. The apply route is
 * handed final DATES, not a day count - the dialog has already done that
 * arithmetic - so "how many days" is a question it has no input for. Asking a
 * fabricated one would be a check that cannot fail, which is worse than no
 * check: it reads like a guard in every future diff.
 *
 * The database refuses a reasonless delay too, but a CHECK violation reaches a
 * user as a Postgres sentence. This is the same rule, worded for a person.
 */
export function missingDelayReason(value: unknown): string | null {
  const reason = String(value ?? '').trim()
  if (!reason) return 'Say what happened. Six weeks from now the number on its own answers nothing.'
  if (reason.length < MIN_DELAY_REASON) {
    return 'Say a bit more about what happened - "late" is what the dates already say.'
  }
  return null
}

/**
 * How many whole days is being asked for, or null when the number is not usable.
 *
 * Asks the DAYS rule only - a valid number with no reason yet is exactly the
 * state the preview renders in.
 */
export function delayDays(value: unknown): number | null {
  if (missingDelayDays(value)) return null
  return Number(String(value).trim())
}

/**
 * Where the line lands after a delay of `days`.
 *
 * BOTH DATES MOVE BY THE SAME AMOUNT, so the line keeps its LENGTH. A trade
 * that was going to take eight days still takes eight days; it starts later.
 * Stretching the end alone would be a different statement - "this is taking
 * longer" rather than "this is starting later" - and a form with one number on
 * it cannot tell you which was meant.
 */
export function delayedDates(
  line: { start_date: DateString; end_date: DateString },
  days: number,
): { start: DateString; end: DateString } {
  return {
    start: addDays(line.start_date, days),
    end: addDays(line.end_date, days),
  }
}
