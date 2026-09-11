// "Whoever is on the job site should see what's coming for that day."
//
// They could not. The Master Calendar is the only screen that gathers a day,
// and it is `role === 'admin' || role === 'manager'` - a foreman, office staff,
// a worker or a sub cannot open it at all. It is also a month grid with no
// "what is next", so even an admin had to already know which square to look in:
// an inspection booked for Sep 15 was invisible on Sep 11 unless you clicked
// forward to find it. Which is the reverse of what a calendar is for.

import { todayOnJob, isToday, spansToday, todayDateInput } from '../today'
import { ok, done, code } from './_helpers'

const TODAY = '2026-09-11'
const P = 'proj-1'

// ── the day belongs to whoever is living it ─────────────────────────────────
ok(todayDateInput() === new Date().toLocaleDateString('en-CA'),
  'today is the reader\'s own day (local), not UTC\'s')
// The bug this shares with `completed_date` - `toISOString()` being UTC's day,
// so a west-coast evening is already tomorrow - is proved in the `dates` suite
// against a fixed offset. Repeating it here would only assert the runner's
// timezone, which is not a fact about this module.
ok(/todayDateInput/.test(code('lib/today.ts')) && !/toISOString/.test(code('lib/today.ts')),
  'this module borrows the shared day rather than growing a fifth private copy')
ok(isToday('2026-09-11', TODAY) && !isToday('2026-09-10', TODAY), 'a date matches its own day')
ok(isToday('2026-09-11T14:27:08.678+00:00', TODAY),
  'a timestamp and a date compare the same way - booked_at is one, scheduled_date the other')
ok(!isToday(null, TODAY) && !isToday('', TODAY), 'no date is not today')

ok(spansToday('2026-09-09', '2026-09-14', TODAY), 'a schedule bar covering today is on today')
ok(spansToday('2026-09-11', null, TODAY), '...and a one-day bar with no end is its start day')
ok(!spansToday('2026-09-12', '2026-09-14', TODAY), 'one that starts tomorrow is not')
ok(!spansToday('2026-09-01', '2026-09-10', TODAY), '...nor one that finished yesterday')

// ── the day, in the order somebody on site cares about it ───────────────────
const rows = todayOnJob({
  projectId: P, today: TODAY,
  inspections: [
    { id: 'a', type: 'Certificate of Occupancy', trade: 'CO', status: 'scheduled', scheduled_date: TODAY, scheduled_time: '5-7pm' },
    { id: 'b', type: 'Drywall', trade: 'const', status: 'requested', requested_date: '2026-09-16', scheduled_date: null },
    { id: 'c', type: 'Foundation', status: 'scheduled', scheduled_date: '2026-09-18' },
    { id: 'd', type: 'Old', status: 'void', scheduled_date: TODAY },
    { id: 'e', type: 'Done', status: 'passed', scheduled_date: null },
  ],
  schedule: [{ id: 's1', label: 'Framing crew', start_date: '2026-09-09', end_date: '2026-09-14' }],
  tasks: [
    { id: 't1', title: 'Order tile', due_date: TODAY, status: 'open' },
    { id: 't2', title: 'Already done', due_date: TODAY, status: 'completed' },
    { id: 't3', title: 'Next week', due_date: '2026-09-18', status: 'open' },
  ],
})

const kinds = rows.map(r => r.kind)
ok(kinds.join(',') === 'inspection,schedule,task,needs_booking',
  `who is coming, who is working, what is due, what is not booked (got ${kinds.join(',')})`)
ok(rows[0].label.includes('Certificate of Occupancy') && rows[0].detail === '5-7pm',
  'a booked inspection carries the window it was booked for')
ok(rows.every(r => r.href?.startsWith(`/projects/${P}/`)), 'every row goes to the record it is about')

// A REQUESTED INSPECTION IS NOT AN APPOINTMENT. Same rule that took 14 unbooked
// ones out of everyone's Outlook: it appears, under its own name, as work.
const booking = rows.filter(r => r.kind === 'needs_booking')
ok(booking.length === 1 && booking[0].label.includes('Drywall'),
  'THE RULE: an unbooked inspection is listed as needing booking, never among the day\'s appointments')
ok(booking[0].detail === 'Needed by 2026-09-16', '...with the date somebody asked for, said as a wish')
ok(!kinds.includes('inspection') || rows.filter(r => r.kind === 'inspection').every(r => r.label !== 'Drywall'),
  '...and never as one')

ok(!rows.some(r => r.label === 'Old'), 'a voided inspection is not on anybody\'s day')
ok(!rows.some(r => r.label === 'Done'), 'and a finished one needs no booking')
ok(!rows.some(r => r.label === 'Already done'), 'a completed task is not still due')
ok(!rows.some(r => r.label === 'Next week' || r.label === 'Foundation'), 'and tomorrow is not today')

ok(todayOnJob({ projectId: P, today: TODAY }).length === 0, 'an empty job is an empty day, not a crash')

// ── it is on the screens the field actually opens ───────────────────────────
for (const [what, f] of [
  ['the project Overview', 'app/(dashboard)/projects/[id]/overview/page.tsx'],
  ['My Jobs', 'app/(dashboard)/my-jobs/[projectId]/page.tsx'],
] as const) {
  ok(/<TodayStrip/.test(code(f)), `${what} shows the day`)
}
const strip = code('components/projects/today-strip.tsx')
ok(/Nothing booked or due on this job today/.test(strip),
  'an empty day is a sentence - "nothing here" and "we could not work it out" must not look the same')
ok(/min-h-11/.test(strip), 'and a row is a touch target')

// The Master Calendar keeps its gate; this is not a second calendar that
// quietly widens who can see everything.
ok(/role === 'admin' \|\| role === 'manager'/.test(code('app/(dashboard)/master-calendar/page.tsx')),
  'the Master Calendar is still admins and managers only')

// ── the three screens agree about what "booked" means ───────────────────────
//
// The Today band, the job's calendar and the Master Calendar each decide
// whether an inspection is an appointment. If they ever disagree, one of them
// is putting a wish on a square - which is how 14 unbooked inspections ended
// up in people's Outlook.
ok(/if \(i\.scheduled_date\) continue/.test(code('lib/today.ts')),
  'the Today band treats an inspection WITHOUT a booked date as needing booking')
ok(/const d = day\(i\.scheduled_date\)/.test(code('lib/schedule-events.ts'))
  && !/requested_date/.test(code('lib/schedule-events.ts')),
  '...and the job calendar places one only by its booked date, never the requested one')
ok(/\.not\('scheduled_date', 'is', null\)/.test(code('app/api/master/calendar/route.ts'))
  && /\.not\('scheduled_date', 'is', null\)/.test(code('app/api/projects/[id]/schedule/route.ts')),
  '...and both routes filter on the same column')

done()
