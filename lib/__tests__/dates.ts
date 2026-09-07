// A calendar date is not a moment in time.
//
// THE BUG A TESTER FOUND. Every date in Inspections rendered a day early:
// typed 2020-01-15, card said 1/14/2020; marked passed at 6:16pm on Sep 6, card
// said "Completed 9/5/2026". For a product sold on records that hold up in a
// dispute, an inspection dated the day before it happened is the defect that
// makes the claim untrue.
//
// THE FIX ALREADY EXISTED. lib/dates.ts was written for this exact fault on the
// project list. The inspections page never imported it - and neither had 54
// other files, including the client portal. So the interesting half of this
// suite is not the unit tests, it is the SOURCE CHECK at the bottom: the one
// that makes the other 54 stay fixed.
//
// TZ IS PINNED BELOW. Under UTC every one of these assertions passes on the
// BROKEN code, which is exactly how this survived so long.

process.env.TZ = 'America/Los_Angeles'

import { parseDate, formatDate, formatDateShort, formatDateRange, toDateInput, todayDateInput } from '../dates'
import { ok, done, code, walk } from './_helpers'

ok(new Date().getTimezoneOffset() > 0,
  'the tests run behind UTC, where the bug is visible (offset ' + new Date().getTimezoneOffset() + ')')

// ── the tester's own value ───────────────────────────────────────────────────
const typed = '2020-01-15'
const d = parseDate(typed)!
ok(d.getFullYear() === 2020 && d.getMonth() === 0 && d.getDate() === 15,
  'a date typed as 2020-01-15 is the 15th, not the 14th')
ok(/15/.test(formatDate(typed)), `formatDate keeps the day: ${formatDate(typed)}`)
ok(!/14/.test(formatDate(typed)), '...and does not walk it back one')

// The raw call this replaced, proving the bug is real rather than assumed.
ok(new Date(typed).toLocaleDateString().includes('14'),
  'the old idiom really does render the 14th here - this is the bug, reproduced')

// ── the system-stamped half ──────────────────────────────────────────────────
// Stored as 2026-09-06 and rendered as "9/5/2026" - the same shift, on a value
// nobody typed.
ok(/6/.test(formatDate('2026-09-06')) && !/9\/5/.test(formatDate('2026-09-06')),
  'a completed_date of 2026-09-06 renders as the 6th')

// ── a timestamp is an instant and must NOT be shifted ────────────────────────
// The opposite mistake, and just as wrong. 2026-09-06T22:16:00Z is 3:16pm in
// Los Angeles - still the 6th - and must stay the 6th.
const stamp = parseDate('2026-09-06T22:16:00Z')!
ok(stamp.getDate() === 6, 'a UTC timestamp keeps its local day when that is the same day')
// ...and one that genuinely crosses midnight locally must be allowed to.
ok(parseDate('2026-09-07T02:00:00Z')!.getDate() === 6,
  'a timestamp that falls on the previous local day is NOT forced forward')

// ── the shapes the codebase actually passes ──────────────────────────────────
ok(formatDate(null) === '-', 'a missing date is a dash, not an error')
ok(formatDate(undefined, undefined, 'None') === 'None', 'the fallback is respected')
ok(formatDate('') === '-', 'an empty string is missing, not Invalid Date')
ok(formatDate('not a date') === '-', 'unparseable input degrades rather than throwing')
ok(parseDate(new Date('2020-01-15T00:00:00')) instanceof Date, 'a Date passes through')
ok(/2020/.test(formatDate(new Date('2020-01-15T12:00:00'))), '...and still formats')

// The `x + 'T12:00:00'` hand-rolled workaround appeared in the codebase; it must
// keep working, since parseDate leaves anything with a time alone.
ok(parseDate('2020-01-15T12:00:00')!.getDate() === 15, 'the old T12:00:00 workaround still lands right')

ok(formatDateShort('2020-01-15').includes('15'), 'the short form keeps the day too')
ok(!/2020/.test(formatDateShort('2020-01-15')), '...and drops the year, which is the point of it')
ok(formatDateRange('2026-09-01', '2026-12-31').includes('→'), 'a range renders as a range')
ok(!formatDateRange('2026-09-01', '2026-12-31').includes('Aug'),
  'a range does not shift EITHER end - the project list shifted both')

// ── round-tripping into an <input type="date"> ───────────────────────────────
ok(toDateInput('2020-01-15') === '2020-01-15', 'a date survives a round trip to the input and back')
ok(/^\d{4}-\d{2}-\d{2}$/.test(todayDateInput()), 'today is a date-only string')
ok(todayDateInput() === toDateInput(new Date()), "today is the browser's day")
// toISOString() here is what reintroduces the bug; this is the assertion that
// catches somebody "simplifying" toDateInput back to it.
const evening = new Date(2026, 8, 6, 18, 16)
ok(toDateInput(evening) === '2026-09-06',
  'an evening on the west coast is still that day, not tomorrow in UTC')
ok(evening.toISOString().split('T')[0] === '2026-09-07',
  '...whereas toISOString would have said the 7th - the bug in the completed_date write')

// ── the source check: nothing renders a date by hand any more ────────────────
// This is the assertion that matters. 100 call sites across 55 files each made
// their own decision, and one screen's worth of them is what the tester found.
const offenders: string[] = []
for (const f of [...walk('app'), ...walk('components')]) {
  if (/\.toLocaleDateString/.test(code(f))) offenders.push(f)
}
ok(offenders.length === 0,
  `no file renders a date with .toLocaleDateString (${offenders.slice(0, 5).join(', ') || 'none'})`)

// toLocaleString on a real timestamp is CORRECT and deliberately not banned -
// created_at and signed_at are instants. Banning it would push people back to
// hand-rolling, which is the disease rather than the cure.
const inspections = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
ok(/formatDate\(/.test(inspections), 'the inspections page formats through the shared helper')
ok(/from '@\/lib\/dates'/.test(inspections), '...which it did not even import before')

// The client sends its own day for a completed inspection; the server's UTC
// derivation is a fallback, not the source of truth.
ok(/todayDateInput\(\)/.test(inspections),
  'marking an inspection passed sends the browser day, not the server day')
const route = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')
ok(/!updates\.completed_date/.test(route),
  'the server only derives completed_date when the client sent none')

// lib/dates.ts is the one place allowed to touch Intl for dates.
ok(/toLocaleDateString/.test(code('lib/dates.ts')), 'the helper itself still does the formatting')

done()
