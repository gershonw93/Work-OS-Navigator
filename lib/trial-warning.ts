import { TRIAL_DAYS } from './plans'
import { daysUntil } from './billing-state'

// ─────────────────────────────────────────────────────────────────────────────
// Telling somebody their trial is nearly up, before it is up.
//
// THE GAP THIS CLOSES. The trial shipped with a banner that appears inside the
// app three days out - which only ever reaches somebody who opens the app. The
// company most likely to lose its account to an expiring trial is the one that
// has not logged in this week, and the banner is invisible to exactly them. A
// deadline with no job behind it warns nobody.
//
// ASKED FOR AS "12, 14 AND 15" of a fifteen-day trial. It is expressed here as
// DAYS LEFT - 3, 1 and 0 - which is the same three days and survives the one
// thing that would break the other spelling: the platform console can extend a
// trial by any number of days, and "day 12" of an eighteen-day trial is not a
// warning about anything. Days left is the number the customer is actually
// living, and the number the screen already prints.
//
// THE SCREEN SAYS WHAT THE LETTER SAYS. The banner reads this same list rather
// than keeping its own idea of "soon", so a company cannot see a calm screen on
// a day we emailed them, or a shouting one on a day we did not.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When we write, counted in days REMAINING.
 *
 * On the standard trial these are days 12, 14 and 15. Descending, and read in
 * that order - the first element is the earliest warning and the widest net.
 */
export const TRIAL_WARNING_DAYS_LEFT = [3, 1, 0] as const

/** The earliest point at which anything is said. Everything quieter than this is silence. */
export const TRIAL_WARN_FROM = Math.max(...TRIAL_WARNING_DAYS_LEFT)

/** The day of the trial a given "days left" is, for copy that counts upwards. */
export const trialDayOf = (daysLeft: number, length: number = TRIAL_DAYS): number => length - daysLeft

export interface TrialRow {
  status?: string | null
  trial_ends_at?: string | null
  /** The last milestone we wrote about, in days left. Null if we never have. */
  trial_warned_days_left?: number | null
}

export type TrialAction =
  /** Write to them about this milestone, then stamp it. */
  | { send: number }
  /** The trial moved out of range - clear the stamp so the run-up can happen again. */
  | { reset: true }
  /** Nothing to do today. */
  | null

/**
 * Should anything happen for this company today?
 *
 * THE STAMP IS THE WHOLE POINT. Without it this job writes to the same company
 * every morning for three days running about the same deadline, which is how
 * people learn to filter mail from us. With it, each milestone fires once.
 *
 * AND IT MUST BE ABLE TO UN-STAMP ITSELF. Extending a trial in the platform
 * console moves the deadline but leaves a stamp saying "we already warned them
 * about the end" - and since the milestones only ever count DOWN, a stamped
 * company would never be warned again, silently, for the rest of its life. The
 * `reset` branch is that, derived from the dates rather than depending on every
 * future writer of `trial_ends_at` remembering to clear a column. The admin
 * routes clear it too; this is the half that cannot be forgotten.
 */
export function trialWarning(row: TrialRow, now: Date = new Date()): TrialAction {
  if (row.status !== 'trialing') return null

  const left = daysUntil(row.trial_ends_at, now)
  if (left === null) return null

  const stamped = typeof row.trial_warned_days_left === 'number' ? row.trial_warned_days_left : null

  // Comfortably ahead of the first warning: nothing to say, and any stamp on
  // the row is about a deadline that has since moved.
  if (left > TRIAL_WARN_FROM) return stamped === null ? null : { reset: true }

  // The milestone this day IS, not merely the one it is past: a company that
  // was unreachable on day 12 is written to on day 14, about day 14. A day
  // between two milestones answers null here, and so does any day past the
  // end - the account is locked by then and every screen says so, and another
  // email about it is a second letter for one event.
  //
  // THERE WAS A SEPARATE `left < min(...)` GUARD ABOVE THIS LINE and it was
  // dead: this `find` already refuses every one of those days. A red-check
  // deleting it changed nothing, which is the only reason anybody noticed. A
  // guard that cannot fail is not protection, it is a comment that compiles.
  const milestone = TRIAL_WARNING_DAYS_LEFT.find(d => d === left)
  if (milestone === undefined) return null

  // Already said, or already said something later in the run-up. `<=` rather
  // than `===` so a row stamped at 1 is not written to again if the clock is
  // somehow read as 3 - the stamp only ever moves towards the deadline.
  if (stamped !== null && stamped <= milestone) return null

  return { send: milestone }
}

export interface TrialCopy {
  /** The bell headline, and the email subject. */
  title: string
  /** One line in the recipient's terms. */
  message: string
}

/**
 * What we actually say, escalating.
 *
 * THE COMPANY NAME IS NOT IN IT and the days are. A subject beginning with the
 * reader's own company name is the shape every piece of automated mail takes,
 * and it buries the only number that matters. The last one does not say
 * "expires" either - it says what will happen, because a person reading it has
 * to decide whether to act today.
 */
export function trialCopy(daysLeft: number): TrialCopy {
  if (daysLeft <= 0) {
    return {
      title: 'Your SyteNav trial ends today',
      message: 'This is the last day of your free trial. Choose a plan to keep saving work - '
        + 'nothing is deleted either way, and everything on your jobs stays readable, but from '
        + 'tomorrow nobody at your company will be able to write to them.',
    }
  }
  if (daysLeft === 1) {
    return {
      title: 'Your SyteNav trial ends tomorrow',
      message: 'One day left on your free trial. Pick a plan in Settings > Billing and nothing '
        + 'changes; leave it and the account becomes read-only tomorrow, with every job, photo '
        + 'and invoice still there to read.',
    }
  }
  return {
    title: `${daysLeft} days left on your SyteNav trial`,
    message: `Your free trial ends in ${daysLeft} days. Settings > Billing shows how many active `
      + 'jobs and AI scans you have been using, which is the quickest way to tell which plan fits.',
  }
}
