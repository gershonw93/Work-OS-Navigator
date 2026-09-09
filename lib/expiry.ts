// ─────────────────────────────────────────────────────────────────────────────
// Has it run out yet?
//
// THE BUG, reported twice in one sitting. A certificate of insurance with an
// expiry date in the PAST saved as "Approved" with no warning and the Expiring
// Soon counter stayed on zero - a sub with lapsed insurance read as compliant.
// A permit that expired yesterday showed a plain "pending" badge and grey text.
//
// One cause, two screens: both asked only "is it expiring SOON", and soon was a
// window BEFORE the date -
//
//     const diff = new Date(expiry).getTime() - Date.now()
//     return diff > 0 && diff <= 30 days
//
// `diff > 0` is the whole bug. The day after it lapses the answer flips from
// true back to false, and nothing anywhere asked the other question. A document
// is at its most dangerous the day after it expires, and that is precisely when
// both screens went quiet.
//
// So the question is not a boolean. Four answers, in one place, tested.
// ─────────────────────────────────────────────────────────────────────────────

export type ExpiryState =
  | 'none'      // no date on it - nothing to say
  | 'expired'   // the date has passed
  | 'soon'      // inside the warning window
  | 'ok'        // a date, comfortably ahead

/** How long before the date counts as "soon". Thirty days to renew a COI. */
export const EXPIRY_WINDOW_DAYS = 30

/**
 * `today` is injectable so the tests are not a different answer tomorrow.
 *
 * Dates are compared at MIDNIGHT, not by the clock. A COI that expires today
 * is good until the end of today; comparing timestamps made it expired from
 * 00:00 and told somebody their sub had lapsed on the morning of the last
 * good day.
 */
export function expiryState(
  expiry: string | null | undefined,
  opts: { today?: Date; windowDays?: number } = {},
): ExpiryState {
  if (!expiry) return 'none'

  // Date-only strings are parsed as UTC midnight by Date, which lands on the
  // PREVIOUS day anywhere west of Greenwich. Anchoring to local midnight is
  // what makes "expires today" mean today wherever you are standing.
  const due = new Date(`${String(expiry).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(due.getTime())) return 'none'

  const today = opts.today ? new Date(opts.today) : new Date()
  today.setHours(0, 0, 0, 0)

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (days < 0) return 'expired'
  return days <= (opts.windowDays ?? EXPIRY_WINDOW_DAYS) ? 'soon' : 'ok'
}

/** Days since it lapsed, for "expired 12 days ago". Null unless expired. */
export function daysExpired(expiry: string | null | undefined, today?: Date): number | null {
  if (expiryState(expiry, { today }) !== 'expired') return null
  const due = new Date(`${String(expiry).slice(0, 10)}T00:00:00`)
  const d = today ? new Date(today) : new Date()
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - due.getTime()) / 86_400_000)
}
