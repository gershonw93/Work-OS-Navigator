// "Newest first" was a convention, and a convention is a claim.
//
// The file said it at the top - "Newest first; `date` drives the unread badge"
// - and the badge read `RELEASES[0].date` on the strength of it. Then two
// sessions shipped in the same week, each adding an entry at the top of the
// array with its own date, and the list went:
//
//   2026-09-15   the invoices page says when it could not load
//   2026-09-17   the client portal link is a permission now
//   2026-09-17   swipe, like a real app
//   2026-09-16   the setup checklist ...
//
// Two things wrong at once. The ORDER, so `RELEASES[0]` was not the newest and
// `hasUnread` compared against a date three releases down - a reader who had
// seen everything up to the 17th would never be shown the 15th's entry, and one
// who had seen nothing was told about the wrong batch. And the DATES: every one
// of those was written ahead of the commit that shipped it (#446, #448, #449
// and #450 all landed on the 14th), so a release announced itself as having
// happened two days into the future.
//
// The order is derived now. Author an entry anywhere; the app reads a sorted
// view, and `RELEASES[0]` is the newest because it is sorted, not because
// somebody remembered.

import { RELEASES, LATEST_RELEASE, hasUnread, unreadCount } from '../whats-new'
import { ok, done, read } from './_helpers'

// ── the invariant the badge rests on ────────────────────────────────────────
{
  let firstBreak = ''
  for (let i = 1; i < RELEASES.length; i++) {
    if (RELEASES[i - 1].date < RELEASES[i].date) {
      firstBreak = `${RELEASES[i - 1].date} sits above ${RELEASES[i].date}`
      break
    }
  }
  ok(!firstBreak, `THE ORDER: newest first, all the way down (${firstBreak || 'ok'})`)
}

ok(RELEASES.length > 0, 'there are releases to order')
ok(LATEST_RELEASE === RELEASES.map(r => r.date).sort().slice(-1)[0],
  'THE BADGE: the newest date is the MAXIMUM date, not whatever happens to be written first')

// A stable sort: two releases on one day keep the order the file gives them,
// or the day's headline entry could be shuffled under its own follow-up.
{
  const sameDay = RELEASES.filter(r => r.date === LATEST_RELEASE)
  ok(sameDay.length >= 1, 'the newest day has at least one release')
  const src = read('lib/whats-new.ts')
  ok(/a\[1\] - b\[1\]/.test(src), '...and same-day releases keep their authored order (a stable sort)')
}

// ── it is DERIVED, not maintained ───────────────────────────────────────────
{
  const src = read('lib/whats-new.ts')
  ok(/const AUTHORED: Release\[\] = \[/.test(src),
    'the authored list and the ordered one are different things')
  ok(/export const RELEASES: Release\[\] = AUTHORED/.test(src),
    '...and what the app reads is the sorted view, so the order cannot be got wrong by hand')
  ok(/export const LATEST_RELEASE = RELEASES\[0\]\?\.date/.test(src),
    'the badge can go on reading [0], because [0] is now a fact rather than a convention')
}

// ── no release claims to have shipped in the future ─────────────────────────
// The file's own rule: `date` drives the unread badge, so keep it real. A date
// ahead of today is a release announcing itself before it exists - and it pins
// `LATEST_RELEASE` there, so everything that really ships in between is
// published already "read".
{
  const today = new Date().toISOString().slice(0, 10)
  const ahead = RELEASES.filter(r => r.date > today).map(r => `${r.date} ${r.title}`)
  ok(ahead.length === 0, `no release is dated in the future (${ahead.join('; ') || 'none'})`)
}

// ── and the badge answers from it ───────────────────────────────────────────
ok(hasUnread(null), 'somebody who has never looked has something to read')
ok(!hasUnread(LATEST_RELEASE), '...and somebody up to date does not')
ok(unreadCount(LATEST_RELEASE) === 0, 'nothing is unread once you are on the newest date')
ok(unreadCount(null) === RELEASES.length, 'and everything is, before you have looked at all')

done()
