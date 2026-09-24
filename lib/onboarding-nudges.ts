import { TRIAL_DAYS } from './plans'
import { TRIAL_WARN_FROM } from './trial-warning'

// ─────────────────────────────────────────────────────────────────────────────
// The first fifteen days, for somebody who has not come back.
//
// THE GAP. A new company got a 15-day trial and then silence: no welcome, no
// direction, and the first automated mail we ever sent was the trial warning on
// day 12 - by which point they had either worked it out alone or quietly gone.
// The app's own onboarding is a per-PROJECT setup checklist, so it is invisible
// until they have created a project, which is exactly the step somebody who has
// drifted has not taken.
//
// MILESTONE-DRIVEN, NOT DAY-DRIVEN, and that is the whole design. A sequence
// that fires on a calendar sends "create your first job" to somebody with three
// of them, which is the single fastest way to teach a person to filter mail
// from us. Every nudge carries the question it is asking, and a nudge whose
// question is already answered is never sent - so the sequence adapts to what
// they have actually done rather than to how long they have been here.
//
// AND IT SHUTS UP WHEN THEY ARE ACTIVE. Somebody who signed in today or
// yesterday is in the product; the screen in front of them already says what to
// do next, better than an email can. This is a nudge for a person who drifted,
// not a drip for everybody.
//
// IT ALSO STOPS BEFORE THE TRIAL WARNINGS DO. Days 12, 14 and 15 belong to
// `lib/trial-warning.ts`, and two emails from us in one morning is how the one
// that mattered gets ignored.
// ─────────────────────────────────────────────────────────────────────────────

/** Signed in this recently and we say nothing at all. */
export const ACTIVE_WITHIN_DAYS = 2

/**
 * The last day a nudge may go out.
 *
 * Derived, not typed: it is the day before the trial warnings start, so moving
 * `TRIAL_WARN_FROM` cannot leave the two sequences overlapping.
 */
export const NUDGE_LAST_DAY = TRIAL_DAYS - TRIAL_WARN_FROM - 1

export interface OnboardingFacts {
  /** Whole days since the trial started. Day 0 is the day they signed up. */
  daysSinceSignup: number
  /** Whole days since anybody at the company signed in. Null: nobody ever has. */
  daysSinceSignIn: number | null
  projects: number
  budgetLines: number
  teammates: number
  subcontracts: number
  scans: number
  /** Nudge keys already sent to this company. */
  sent: string[]
}

export interface Nudge {
  key: string
  /** The earliest day of the trial this may go out. */
  day: number
  /** Has the thing it asks for already happened? A yes means it is never sent. */
  done: (f: OnboardingFacts) => boolean
  /** Bell headline and email subject. */
  title: string
  /** One paragraph, in the reader's terms. */
  message: string
  /** Where the button goes. */
  link: string
}

/**
 * IN ORDER OF DEPENDENCY, not of importance - each one presupposes the one
 * before it. You cannot record a subcontract without a job to hang it on, so
 * the first UNMET nudge is the one that goes: somebody who has done nothing by
 * day seven is asked for a project, not for subs they have nowhere to put.
 */
export const NUDGES: Nudge[] = [
  {
    key: 'first_project',
    day: 1,
    done: f => f.projects > 0,
    title: 'Put your first job into SyteNav',
    message: 'Everything in SyteNav hangs off a job - the budget, the subs, the bills, what you are owed. '
      + 'Start with one you are running right now rather than a test: it takes a few minutes and you can '
      + 'see straight away whether the numbers land where you expect.',
    link: '/projects/new',
  },
  {
    key: 'budget',
    day: 3,
    done: f => f.budgetLines > 0,
    title: 'Bring the budget in',
    message: 'The budget is the spine of the job - sub bills, change orders and what you invoice the client '
      + 'all attach to its lines. You can type it, import a spreadsheet, or upload the estimate and have it '
      + 'read into line items for you.',
    link: '/projects',
  },
  {
    key: 'invite_team',
    day: 5,
    done: f => f.teammates > 1,
    title: 'Get your people in',
    message: 'Team members are unlimited on every plan, so there is no reason to ration it - your PM, the '
      + 'office and the crew all belong in here. Subs and clients do not need accounts at all; they work '
      + 'through links.',
    link: '/settings?tab=team',
  },
  {
    key: 'subs',
    day: 7,
    done: f => f.subcontracts > 0,
    title: 'Record the subs you have already awarded',
    message: 'Put the subcontracts you have already signed into the job and the committed column starts '
      + 'telling you the truth - what is spent, what is left, and which bills are against which contract. '
      + 'It is the difference between a budget and a guess.',
    link: '/projects',
  },
  {
    key: 'scan',
    day: 10,
    done: f => f.scans > 0,
    title: 'Let it read a document for you',
    message: 'Drop in a sub invoice, a quote or an inspector card and SyteNav reads it into the job instead '
      + 'of you retyping it. It is the part people tell us they did not expect to use and then use daily - '
      + 'and your plan includes a monthly allowance whether or not you touch it.',
    link: '/projects',
  },
]

/**
 * The one nudge to send this company today, or null for silence.
 *
 * Silence is the common answer and that is deliberate.
 */
export function nextNudge(f: OnboardingFacts): Nudge | null {
  // Past the handover point - the trial warnings take it from here.
  if (f.daysSinceSignup > NUDGE_LAST_DAY) return null
  // THERE WAS A `daysSinceSignup < 1` GUARD HERE AND IT WAS DEAD: every nudge
  // is day 1 or later, so the `find` below already refuses signup day. A
  // red-check deleting it changed nothing, which is the only reason anybody
  // noticed. The invariant it was reaching for is real and is pinned instead -
  // no nudge may be scheduled on day 0, because that day belongs to the welcome
  // email and two of our messages in one morning is noise.

  // THEY ARE ACTIVE. The screen in front of them says what to do next better
  // than we can, and mail to somebody who is already here reads as spam.
  if (f.daysSinceSignIn !== null && f.daysSinceSignIn < ACTIVE_WITHIN_DAYS) return null

  const sent = new Set(f.sent)
  return NUDGES.find(n => n.day <= f.daysSinceSignup && !sent.has(n.key) && !n.done(f)) ?? null
}

/** Whole days between two instants, flattened to local midnight at both ends. */
export function wholeDaysSince(at: string | null | undefined, now: Date): number | null {
  if (!at) return null
  const then = new Date(at)
  if (Number.isNaN(then.getTime())) return null
  const a = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}
