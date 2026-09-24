import { TRIAL_DAYS, planByKey, type Plan } from './plans'

// ─────────────────────────────────────────────────────────────────────────────
// Is this company allowed to write anything today?
//
// One question, one answer, and the answer is DERIVED from dates rather than
// read off a status column - the same rule as `lib/expiry.ts`. A stored
// "trialing" on a row whose trial ended three weeks ago is not a fact about
// today, and a stored "active" on a subscription that lapsed is worse: both
// read as permission.
//
// WHICH WAY TO GUESS WHEN THE ROW IS THIN. A wrong "locked" takes a crew's
// screen away in the middle of a job; a wrong "open" costs us a few dollars
// and is corrected the moment somebody looks. So every ambiguity here resolves
// towards writable, which is the same asymmetry `lib/auth-outcome.ts` settles
// the other way round for the same reason - when the evidence does not say,
// guess the answer whose mistake is recoverable.
//
// THE COMPANIES WITH NO ROW ARE NOT FREELOADERS. `companies` holds our
// customers AND every subcontractor and inspector in a Directory. A sub writes
// to jobs it does not own - bills, daily logs, clock-ins - which is exactly why
// `requirePermission` refuses to check ownership. A blanket "no billing row
// means no writing" would close a small hole by breaking every sub in the
// product, so no row means UNMETERED and nothing is enforced against it.
// ─────────────────────────────────────────────────────────────────────────────

/** What the row says about itself. Stripe's vocabulary, plus our own `comped`. */
export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'comped'

export type AccessState =
  | 'unmetered' // not a paying tenant at all - a sub, an inspector, a Directory row
  | 'trial'     // inside the free days
  | 'paid'      // a live subscription
  | 'comped'    // we have given this company free access on purpose
  | 'overdue'   // a payment failed and Stripe is still retrying - writable, loudly
  | 'locked'    // nothing entitles them, so the app is read-only

/** The columns this answer needs. Named exactly as `company_billing` spells them. */
export interface BillingRow {
  status?: string | null
  plan_key?: string | null
  trial_ends_at?: string | null
  comped_until?: string | null
  current_period_end?: string | null
  cancel_at_period_end?: boolean | null
}

export interface Access {
  state: AccessState
  /** The one thing every caller actually asks. */
  writable: boolean
  /** What to say on screen. Always a sentence, never a status word. */
  reason: string
  /**
   * Whole days until this state runs out, or null when nothing is counting.
   * Zero means the last day, which is still a day you may work - "expires
   * today" is good today, the same as a certificate of insurance.
   */
  daysLeft: number | null
  /** The plan they are on or heading for, if the row names one we sell. */
  plan: Plan | null
}

/** Whole days from `now` to `at`, both flattened to local midnight. */
export function daysUntil(at: string | null | undefined, now: Date): number | null {
  if (!at) return null
  const end = new Date(at)
  if (Number.isNaN(end.getTime())) return null
  // Midnight on both sides, so a trial that ends at 14:03 is not half a day
  // shorter for somebody who signed up in the afternoon.
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((endDay - today) / 86_400_000)
}

/** When a trial that starts now would run out. */
export function trialEnd(from: Date, days: number = TRIAL_DAYS): Date {
  const end = new Date(from)
  end.setDate(end.getDate() + days)
  return end
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

export function billingAccess(row: BillingRow | null | undefined, now: Date = new Date()): Access {
  if (!row) {
    return { state: 'unmetered', writable: true, reason: '', daysLeft: null, plan: null }
  }

  const plan = planByKey(row.plan_key)
  const status = (row.status ?? '') as BillingStatus

  // ── free access we granted, which outranks everything else ────────────────
  // An open-ended comp has no `comped_until` at all. One WITH a date stops
  // being a comp the day after it, and the row then falls through to whatever
  // else it says - a comp running out is not the same event as a trial ending,
  // and quietly treating it as one would lock somebody with a live plan.
  if (status === 'comped') {
    const left = daysUntil(row.comped_until, now)
    if (left === null) {
      return { state: 'comped', writable: true, reason: 'This company has free access to SyteNav.', daysLeft: null, plan }
    }
    if (left >= 0) {
      return {
        state: 'comped',
        writable: true,
        reason: left === 0
          ? 'Free access ends today.'
          : `Free access ends in ${left} ${plural(left, 'day', 'days')}.`,
        daysLeft: left,
        plan,
      }
    }
    return {
      state: 'locked',
      writable: false,
      reason: 'The free access on this account has ended. Choose a plan to start writing again.',
      daysLeft: null,
      plan,
    }
  }

  // ── a live subscription ───────────────────────────────────────────────────
  if (status === 'active') {
    const left = daysUntil(row.current_period_end, now)
    // A period end in the past with the status still on `active` means a
    // webhook has not landed yet, NOT that they stopped paying. Stripe says
    // canceled when they stop; believing a stale date over an explicit status
    // is the wrong guess in the expensive direction.
    return {
      state: 'paid',
      writable: true,
      reason: row.cancel_at_period_end && left !== null && left >= 0
        ? `This plan ends in ${left} ${plural(left, 'day', 'days')} and will not renew.`
        : plan ? `On ${plan.name}.` : 'On a plan.',
      daysLeft: row.cancel_at_period_end ? left : null,
      plan,
    }
  }

  // ── the card failed, and Stripe has not given up ──────────────────────────
  // Writable on purpose. Stripe retries a failed payment for weeks before it
  // marks the subscription unpaid, and locking the app on the first decline
  // would take the job screen away over an expired card the office has not
  // noticed. It says so loudly instead, and the lock arrives with `canceled`.
  if (status === 'past_due') {
    return {
      state: 'overdue',
      writable: true,
      reason: 'The last payment did not go through. Update the card to keep the account open.',
      daysLeft: null,
      plan,
    }
  }

  // ── the trial ─────────────────────────────────────────────────────────────
  if (status === 'trialing') {
    const left = daysUntil(row.trial_ends_at, now)
    // Trialing with no end date is a claim with no evidence behind it. Guess
    // the recoverable way: open, and let the screen say a plan is needed.
    if (left === null) {
      return { state: 'trial', writable: true, reason: `Your first ${TRIAL_DAYS} days are free.`, daysLeft: null, plan }
    }
    if (left >= 0) {
      return {
        state: 'trial',
        writable: true,
        reason: left === 0
          ? 'Your free trial ends today. Choose a plan to keep the account open.'
          : `${left} ${plural(left, 'day', 'days')} left in your free trial.`,
        daysLeft: left,
        plan,
      }
    }
    return {
      state: 'locked',
      writable: false,
      reason: `Your ${TRIAL_DAYS} free days are up. Choose a plan to start writing again - nothing has been deleted, and everything on your jobs is still here to read.`,
      daysLeft: null,
      plan,
    }
  }

  if (status === 'canceled') {
    return {
      state: 'locked',
      writable: false,
      reason: 'This plan has been cancelled. Choose a plan to start writing again - nothing has been deleted, and everything on your jobs is still here to read.',
      daysLeft: null,
      plan,
    }
  }

  // An unrecognised status is a row we do not understand, not a verdict about
  // the customer. Open, and visible to us in the admin console.
  return { state: 'unmetered', writable: true, reason: '', daysLeft: null, plan }
}

/**
 * The short badge beside the company name. The sentence is `reason`; this is
 * the WORD, and the two are built from one answer so a screen cannot show a
 * calm badge over an alarming sentence.
 */
export function accessBadge(a: Access): { label: string; tone: 'ok' | 'warn' | 'danger' | 'quiet' } | null {
  switch (a.state) {
    case 'unmetered': return null
    case 'paid':      return { label: 'On a plan', tone: 'ok' }
    case 'comped':    return { label: 'Free access', tone: 'quiet' }
    case 'overdue':   return { label: 'Payment failed', tone: 'danger' }
    case 'locked':    return { label: 'Read-only', tone: 'danger' }
    case 'trial':
      return a.daysLeft !== null && a.daysLeft <= 3
        ? { label: a.daysLeft === 0 ? 'Trial ends today' : `${a.daysLeft} days left`, tone: 'warn' }
        : { label: 'Free trial', tone: 'quiet' }
  }
}
