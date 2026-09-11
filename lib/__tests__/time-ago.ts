// "That notification showed '6d ago' minutes after it was created."
//
// WHAT WAS CHECKED, so the next pass does not repeat it: `notifications.
// created_at` is `timestamptz DEFAULT now()` in the live database; `notify()`
// is the ONLY thing that inserts a notification and it never sets `created_at`,
// so the stored value is Postgres's own clock by construction; the route
// returns the raw row and PostgREST serialises a timestamptz with an offset,
// which `new Date()` parses correctly. The stored value is right and the
// arithmetic is right, which leaves the reader's own clock - and nothing
// server-side can see that.
//
// So two things here. Every relative time now carries the ABSOLUTE one on
// hover, which is the diagnostic that was missing: one hover on the next "6d
// ago" says whether the data or the machine is wrong. And the five private
// copies of this function became one, because three of them had already
// drifted in the branch nobody looks at.

import { timeAgo, absoluteTime } from '../time-ago'
import { ok, done, code, read } from './_helpers'

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR

ok(timeAgo(ago(10_000)) === 'just now', 'seconds old is "just now"')
ok(timeAgo(ago(5 * MIN)) === '5m ago', `minutes (${timeAgo(ago(5 * MIN))})`)
ok(timeAgo(ago(3 * HOUR)) === '3h ago', `hours (${timeAgo(ago(3 * HOUR))})`)
ok(timeAgo(ago(3 * DAY)) === '3d ago', `days (${timeAgo(ago(3 * DAY))})`)
ok(!/ago/.test(timeAgo(ago(40 * DAY))),
  `past a week it is a date, because "40d ago" is arithmetic homework (${timeAgo(ago(40 * DAY))})`)

// A TIMESTAMP IN THE FUTURE IS NOT "just now". Negative arithmetic falls
// through every branch and lands there, so a row dated next Tuesday read as
// having happened a moment ago - the same class of wrongness as the report,
// pointing the other way.
const nextWeek = new Date(Date.now() + 7 * DAY).toISOString()
ok(timeAgo(nextWeek) !== 'just now', `a future timestamp is not "just now" (${timeAgo(nextWeek)})`)
ok(!/ago/.test(timeAgo(nextWeek)), '...and is not phrased as the past at all - it prints the date')
// ...but a few seconds of skew between two machines is not "the future".
ok(timeAgo(new Date(Date.now() + 5_000).toISOString()) === 'just now',
  'a handful of seconds ahead is still just now - clocks are never exactly equal')

ok(timeAgo('not a date') === '', 'a value that is not a date prints nothing, never "Invalid Date"')
ok(!/undefined|NaN|Invalid/.test([
  timeAgo(ago(MIN)), timeAgo(ago(40 * DAY)), timeAgo(nextWeek), absoluteTime(ago(MIN)),
].join('|')), 'and no branch leaks a broken date')

// ── the hover that answers the question ─────────────────────────────────────
ok(absoluteTime(ago(6 * DAY)).length > 0, 'the absolute time is renderable')
ok(absoluteTime('not a date') === '', '...and safe on rubbish')
const bell = code('components/layout/notification-bell.tsx')
ok(/title=\{absoluteTime\(n\.created_at\)\}/.test(bell),
  'THE DIAGNOSTIC: a notification carries its real timestamp on hover')
ok(!/function relativeTime/.test(bell), 'and the bell no longer keeps its own copy of the wording')

// ── one function, not five ──────────────────────────────────────────────────
const copies: string[] = []
for (const f of [
  'components/layout/notification-bell.tsx',
  'app/(dashboard)/projects/[id]/tasks/page.tsx',
  'app/(dashboard)/dashboard/page.tsx',
  'components/layout/activity-drawer.tsx',
]) {
  const src = code(f)
  if (/function (timeAgo|relativeTime)\(/.test(src)) copies.push(f)
  ok(/from '@\/lib\/time-ago'/.test(src), `${f.split('/').pop()} imports the shared one`)
  ok(/title=\{absoluteTime\(/.test(src), `...and shows the absolute time on hover`)
}
ok(copies.length === 0, `no screen keeps a private copy${copies.length ? ` - ${copies[0]}` : ''}`)

// The drift the module's own comment predicted had already happened, in the
// one branch nobody looks at: past a week the four copies printed three
// different things. The fallback is the app's own formatter now.
ok(/return formatDate\(dateStr\)/.test(read('lib/time-ago.ts')),
  'the >7d fallback is formatDate, not the browser raw toLocaleDateString')

// Equipment keeps its own on purpose - "today"/"yesterday" over a 30-day window
// is different WORDING for a different question, not a copy of this one.
ok(/today/.test(code('app/(dashboard)/equipment/page.tsx')),
  'the equipment log keeps its own wording, deliberately')

done()
