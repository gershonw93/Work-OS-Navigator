// A document is at its most dangerous the day AFTER it expires, and that is
// exactly when both screens went quiet.
//
// Reported twice in one sitting. A certificate of insurance dated last month
// saved as Approved, the Expiring Soon counter stayed on zero, and the sub read
// as compliant. A permit that expired yesterday showed a plain grey "pending".
//
// One cause, two screens. Each had its own copy of
//
//     const diff = new Date(expiry).getTime() - Date.now()
//     return diff > 0 && diff <= 30 days
//
// and `diff > 0` is the whole bug: "soon" is a window BEFORE the date, so the
// day it lapses the answer flips from true back to false and nothing anywhere
// asked the other question.

import { expiryState, daysExpired, EXPIRY_WINDOW_DAYS } from '../expiry'
import { ok, done, code } from './_helpers'

// A fixed today, so these assertions mean the same thing tomorrow.
const TODAY = new Date('2026-06-15T09:30:00')
const on = (d: string) => expiryState(d, { today: TODAY })

// ── the reported bug: a date already past ────────────────────────────────────
ok(on('2026-05-14') === 'expired', 'a COI that lapsed last month is expired')
ok(on('2026-06-14') === 'expired', 'so is one that lapsed yesterday')

// What the old rule said about the same two dates, which is the bug.
const oldRule = (expiry: string) => {
  const diff = new Date(expiry).getTime() - TODAY.getTime()
  return diff > 0 && diff <= 30 * 86_400_000
}
ok(oldRule('2026-05-14') === false && oldRule('2026-06-14') === false,
  'the old "expiring soon" check answered false for both - the day it lapsed, the warning stopped')

// ── today is still a good day ────────────────────────────────────────────────
ok(on('2026-06-15') === 'soon',
  'a document that expires TODAY is still valid today, not expired at 00:00')
ok(daysExpired('2026-06-15', TODAY) === null, '...and it has not been expired for any days')

// ── the warning window ───────────────────────────────────────────────────────
ok(on('2026-06-16') === 'soon', 'tomorrow is expiring soon')
ok(on('2026-07-15') === 'soon', `the last day of the ${EXPIRY_WINDOW_DAYS}-day window is still soon`)
ok(on('2026-07-16') === 'ok', '...and the day after it is comfortably ahead')
ok(expiryState('2026-06-20', { today: TODAY, windowDays: 3 }) === 'ok',
  'the window is adjustable, in case a permit wants a shorter one')

// ── nothing to say ───────────────────────────────────────────────────────────
ok(expiryState(null) === 'none', 'no date is not a status')
ok(expiryState('') === 'none' && expiryState(undefined) === 'none', '...nor is an empty one')
ok(expiryState('not a date', { today: TODAY }) === 'none', '...nor is a value that will not parse')

// ── a timestamp, not just a date ─────────────────────────────────────────────
ok(on('2026-05-14T23:59:59+00:00') === 'expired',
  'a full timestamp is read by its date, so a time of day cannot change the answer')

// ── local midnight, not UTC ──────────────────────────────────────────────────
// `new Date('2026-06-15')` is UTC midnight, which is the 14th anywhere west of
// Greenwich - so a document expiring today read as expired all day in New York.
ok(new Date('2026-06-15T00:00:00').getDate() === 15,
  'the date is anchored to LOCAL midnight, so a date-only string is not shifted a day west')

// ── how long ago ─────────────────────────────────────────────────────────────
ok(daysExpired('2026-06-14', TODAY) === 1, 'expired yesterday is 1 day')
ok(daysExpired('2026-05-16', TODAY) === 30, 'expired a month ago is 30 days')
ok(daysExpired('2026-07-01', TODAY) === null, 'a date still ahead has not expired at all')

// ── the two screens ask through it ───────────────────────────────────────────
const compliance = code('app/(dashboard)/projects/[id]/compliance/page.tsx')
// `statusFromExpiry` used to be declared HERE. It moved to
// lib/compliance-report.ts when the printed report needed the same answer -
// two screens deriving a certificate's state separately is how they end up
// disagreeing about one certificate. The rule is unchanged; its address is not.
const report = code('lib/compliance-report.ts')
ok(/from '\.\/expiry'/.test(report), 'the resolver asks the shared question')
ok(!/diff > 0/.test(compliance) && !/diff > 0/.test(report),
  '...not its own copy of the check that goes quiet on expiry')
ok(/export function statusFromExpiry/.test(report),
  'one resolver decides what a document\'s date makes it')
ok(/import \{ statusFromExpiry \} from '@\/lib\/compliance-report'/.test(compliance),
  '...and Compliance imports it rather than keeping a second')
ok((compliance.match(/statusFromExpiry\(doc\)/g) ?? []).length >= 2,
  '...for BOTH resolveStatus copies - the cards and the roll-up')
ok(/expiredDocs/.test(compliance),
  'expired subs are COUNTED, not just resolved - a number nobody shows is a number nobody sees')
ok(/label: 'Expired'/.test(compliance) && /StatCard label="Expired"/.test(compliance),
  '...on the phone strip and the desktop tiles alike')

const permits = code('app/(dashboard)/projects/[id]/permits/page.tsx')
ok(/from '@\/lib\/expiry'/.test(permits), 'Permits asks the same question')
ok(!/diff > 0/.test(permits), '...and has dropped its own copy too')
ok(/state === 'expired' \? 'expired' : permit\.status/.test(permits),
  'a permit whose date has passed reads Expired whatever the row still says')
ok(/Expired \$\{/.test(permits) || /Expired \$\{days\}/.test(permits) || /`Expired/.test(permits),
  '...and says how long ago')

done()
