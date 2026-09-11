// The job's calendar only ever drew one table.
//
// Reported twice, the second time with the card open beside it: "IT CLEARLY
// SAYS Confirmed for Sep 15, 2026 · 5-7pm ... what am I missing here??"
//
// Nothing. The inspection was booked. The project's Schedule calendar had never
// drawn an inspection in its life: the page fetched
// /api/projects/[id]/schedule, that route queried `schedule_items` and
// `projects` and nothing else, and the page contained ZERO references to
// inspections or tasks.
//
// The omission is invisible, which is why it survived - an empty square looks
// exactly like a free day, and nobody gets an error for a calendar that answers
// a narrower question than its name promises.

import { calendarEvents, eventsOn, scheduleLabel, isDelivery } from '../schedule-events'
import { ok, done, code } from './_helpers'

const P = 'proj-1'
const bar = (over: any = {}) => ({
  id: 'b1', label: 'Foundation concrete labor', start_date: '2026-09-10', end_date: '2026-10-03',
  color: 'blue', subcontract_id: null, subcontracts: null, ...over,
})

const events = calendarEvents({
  projectId: P,
  items: [bar()],
  inspections: [
    // The one in the screenshot.
    { id: 'co', type: 'Certificate of Occupancy', trade: 'CO', status: 'scheduled', scheduled_date: '2026-09-15', scheduled_time: '5-7pm' },
    { id: 'fo', type: 'Foundation', status: 'scheduled', scheduled_date: '2026-09-18' },
    { id: 'dw', type: 'Drywall', trade: 'const', status: 'requested', scheduled_date: null },
    { id: 'vd', type: 'Old', status: 'void', scheduled_date: '2026-09-15' },
    { id: 'ps', type: 'Framing', status: 'passed', scheduled_date: '2026-09-04' },
  ],
  tasks: [
    { id: 't1', title: 'Order tile', due_date: '2026-09-15', status: 'open' },
    { id: 't2', title: 'Pull permit', due_date: '2026-09-15', status: 'completed' },
    { id: 't3', title: 'No date', due_date: null, status: 'open' },
  ],
})

// ── September 15 is the whole report ────────────────────────────────────────
const sep15 = eventsOn(events, '2026-09-15')
ok(sep15.some(e => e.kind === 'inspection' && e.label.startsWith('Certificate of Occupancy')),
  'THE BUG: a booked inspection is on its confirmed date')
ok(sep15.find(e => e.kind === 'inspection')?.detail === '5-7pm',
  '...with the window it was booked for')
ok(sep15.some(e => e.kind === 'schedule' && e.label === 'Foundation concrete labor'),
  '...beside the schedule bar that was the only thing there before')
ok(sep15.some(e => e.kind === 'task' && e.label === 'Order tile'), '...and a task due that day')

// ── what does NOT go on a calendar ──────────────────────────────────────────
ok(!events.some(e => e.label.includes('Drywall')),
  'A CALENDAR IS APPOINTMENTS: an inspection nobody has booked is not on it')
ok(!events.some(e => e.label === 'Old'), 'and a voided one is on nobody\'s calendar')
ok(!events.some(e => e.label === 'No date'), 'a task with no due date has no day to sit on')
{
  // The date that places it is the one the jurisdiction gave, never the wish.
  const wish = calendarEvents({
    projectId: P,
    inspections: [{ id: 'x', type: 'Drywall', status: 'requested', scheduled_date: null } as any],
  })
  ok(wish.length === 0, 'requested_date never places an inspection - that is the Outlook bug one screen over')
}

// ── a finished thing is struck through, not dropped ─────────────────────────
ok(eventsOn(events, '2026-09-15').some(e => e.label === 'Pull permit' && e.done),
  'a completed task is still on its day, marked done')
ok(eventsOn(events, '2026-09-04').some(e => e.kind === 'inspection' && e.done),
  '...and so is a passed inspection')

// ── a bar covers every day of its span, both ends ───────────────────────────
ok(eventsOn(events, '2026-09-10').some(e => e.kind === 'schedule'), 'the first day of a bar is covered')
ok(eventsOn(events, '2026-10-03').some(e => e.kind === 'schedule'), '...and the last, inclusive')
ok(!eventsOn(events, '2026-09-09').length && !eventsOn(events, '2026-10-04').length,
  '...and the days either side are empty')

// ── names come from one place ───────────────────────────────────────────────
ok(scheduleLabel(bar({ label: null, subcontracts: { scope: 'Sitework', trade: null, companies: null } })) === 'Sitework',
  'a bar with no label falls back to its scope')
ok(scheduleLabel(bar({ label: null, subcontracts: null })) === 'Untitled', '...and to Untitled')
ok(isDelivery(bar({ subcontracts: { scope: 'x', trade: null, companies: { name: 'ABC', type: 'supplier' } } })),
  'a supplier row is a delivery')
ok(scheduleLabel(bar({ label: null, subcontracts: { scope: 'x', trade: null, companies: { name: 'ABC', type: 'supplier' } } })) === 'Delivery - ABC',
  '...and reads as one')

// ── every event has somewhere to go, and only a bar is editable ─────────────
ok(events.filter(e => e.kind !== 'schedule').every(e => !!e.href),
  'an inspection and a task each link to their own tab')
ok(events.filter(e => e.kind === 'schedule').every(e => !e.href),
  '...and a bar has no href, because it opens its own edit dialog')

const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
ok(/calendarEvents\(\{ projectId: params\.id, items, inspections, tasks: dueTasks \}\)/.test(page),
  'the page derives the three kinds once')
ok(/eventsOn\(events, ds\)/.test(page), '...and the day cell filters that list')
ok(/e\.kind === 'schedule' && e\.item \?/.test(page) && /openEdit\(e\.item as ScheduleItem\)/.test(page),
  'ONLY a schedule bar opens the editor - nothing in that dialog could save the other two')
ok(!/setInspections\(\[\]\)\s*$/m.test(page), 'the inspections really are read off the response (fixture sanity)')

const route = code('app/api/projects/[id]/schedule/route.ts')
ok(/from\('inspections'\)/.test(route) && /from\('project_tasks'\)/.test(route),
  'THE CAUSE: the route fetches them at all now - it queried schedule_items and projects and nothing else')
ok(/\.not\('scheduled_date', 'is', null\)/.test(route),
  '...booked ones only, the same filter the master calendar and the ICS feed use')
ok(/Promise\.all/.test(route), 'and in one trip rather than three sequential ones')

done()
