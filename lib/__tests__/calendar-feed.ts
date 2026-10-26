// WHAT GOES ON A CALENDAR - the page (/api/my-calendar) and the calendar-app
// feed (/api/calendar/<token>) are one answer: `loadCalendar` -> `feedScope`
// (whose permissions) -> `calendarItems` (which rows).
//
// Two holes this closes, both shipped:
//   1. The feed handed a worker (schedule: N, inspections: N, assigned-only)
//      every schedule line, task and inspection on every company job.
//   2. A subcontractor had no calendar: Master Calendar is admin-only and reads
//      only jobs the company OWNS. On a GC's awarded job the owner's rule is
//      ONLY THEIR OWN WORK - their schedule lines, tasks assigned to their
//      company, inspections for their trade - never the other trades' dates.
// Behaviour against the real role defaults, then the routes pinned to use it.

import { feedScope } from '../calendar-feed'
import { calendarItems, type CalendarInput } from '../calendar-items'
import { ROLE_DEFAULTS } from '../permissions'
import { ok, done, code } from './_helpers'

const as = (role: string) => ({ role, permissions: ROLE_DEFAULTS[role] })
const mine = { projectIds: ['job-assigned'], taskIds: ['task-mine'] }

// ── whose permissions ───────────────────────────────────────────────────────
const office = feedScope(as('admin'), null)!
ok(office.schedule && office.tasks && office.inspections, 'admin: schedule, tasks and inspections')
ok(office.projectIds === null && office.taskIds === null, 'admin: every job, every task')

const worker = feedScope(as('worker'), mine)!
ok(!worker.schedule, 'worker: no schedule lines (schedule: N)')
ok(!worker.inspections, 'worker: no inspections (inspections: N)')
ok(worker.tasks, 'worker: tasks (tasks: view)')
ok(JSON.stringify(worker.projectIds) === '["job-assigned"]' && JSON.stringify(worker.taskIds) === '["task-mine"]',
  'worker: only the jobs they are on and the tasks that are theirs')

const sup = feedScope(as('field_supervisor'), mine)!
ok(sup.schedule && JSON.stringify(sup.projectIds) === '["job-assigned"]', 'field supervisor: schedule, on assigned jobs only')

ok(feedScope(as('worker'), null) === null, 'assignment unreadable: no calendar (not every job, not an empty one)')
ok(feedScope(as('worker'), { projectIds: ['job-assigned'], taskIds: null }) === null,
  'task lookup failed: no calendar rather than one missing their tasks')

const remapped = { role: 'project_manager', permissions: { ...ROLE_DEFAULTS.project_manager, inspections: {} } }
ok(!feedScope(remapped, null)!.inspections, 'a role with inspections removed gets no inspections')

// ── which rows: Blue Wave Pools, with its own job and an awarded GC job ─────
// "pool-own" is Blue Wave's; "acme-job" is Acme's, where Blue Wave holds
// subcontract "sc-bw" (Pool) and "Sparky Electric" holds "sc-other".
const base = (scope: ReturnType<typeof feedScope>): CalendarInput => ({
  ownProjects: [{ id: 'pool-own', name: '5 Windsong' }],
  awarded: [{ id: 'sc-bw', project_id: 'acme-job', project_name: 'Acme - Oak St', trade: 'Pool' }],
  schedule: [
    { id: 'own-line', project_id: 'pool-own', start_date: '2026-11-02', end_date: '2026-11-04', label: 'Dig', subcontract_id: null },
    { id: 'bw-line', project_id: 'acme-job', start_date: '2026-11-10', end_date: '2026-11-12', label: 'Pool shell', subcontract_id: 'sc-bw' },
    { id: 'other-line', project_id: 'acme-job', start_date: '2026-11-05', end_date: '2026-11-06', label: 'Rough electric', subcontract_id: 'sc-other' },
    { id: 'gc-line', project_id: 'acme-job', start_date: '2026-11-01', end_date: '2026-11-01', label: 'GC walkthrough', subcontract_id: null },
    { id: 'stranger-line', project_id: 'unrelated', start_date: '2026-11-01', end_date: '2026-11-01', label: 'Not ours', subcontract_id: null },
  ],
  tasks: [
    { id: 'own-task', project_id: 'pool-own', title: 'Order coping', due_date: '2026-11-03', status: 'open' },
    { id: 'bw-task', project_id: 'acme-job', title: 'Submit shell drawings', due_date: '2026-11-08', status: 'open' },
    { id: 'gc-task', project_id: 'acme-job', title: 'GC: chase permit', due_date: '2026-11-08', status: 'open' },
  ],
  inspections: [
    { id: 'own-insp', project_id: 'pool-own', type: 'Steel', trade: null, status: 'scheduled', scheduled_date: '2026-11-04' },
    { id: 'bw-insp', project_id: 'acme-job', type: 'Bonding', trade: ' pool ', status: 'scheduled', scheduled_date: '2026-11-11' },
    { id: 'other-insp', project_id: 'acme-job', type: 'Rough', trade: 'Electric', status: 'scheduled', scheduled_date: '2026-11-06' },
    { id: 'blank-insp', project_id: 'acme-job', type: 'Final', trade: null, status: 'scheduled', scheduled_date: '2026-11-20' },
  ],
  companyTaskIds: ['bw-task'],
  scope: scope!,
})
const ids = (input: CalendarInput) => calendarItems(input).map(i => i.id).sort().join(',')

const owner = ids(base(feedScope(as('admin'), null)))
ok(owner === ['i_bw-insp', 'i_own-insp', 's_bw-line', 's_own-line', 't_bw-task', 't_own-task'].sort().join(','),
  `sub owner: everything on their own job, and only their own work on the GC's (got ${owner})`)
ok(!owner.includes('other-line') && !owner.includes('gc-line'), 'GC job: another trade\'s dates and the GC\'s own lines stay hidden')
ok(!owner.includes('gc-task'), 'GC job: a task not assigned to their company stays hidden')
ok(!owner.includes('other-insp') && !owner.includes('blank-insp'), 'GC job: only inspections for THEIR trade - another trade and a blank trade are not theirs')
ok(!owner.includes('stranger-line'), 'a job they neither own nor hold a contract on shows nothing')

const items = calendarItems(base(feedScope(as('admin'), null)))
const bw = items.find(i => i.id === 's_bw-line')!
ok(bw.source === 'awarded' && bw.href === '/my-jobs/acme-job' && bw.project_name === 'Acme - Oak St',
  'awarded rows open the sub\'s view of the job and say they are GC work')
ok(items.find(i => i.id === 's_own-line')!.href === '/projects/pool-own/schedule', 'own rows open the job itself')

// Crew on their own job, assigned to it, with one task of theirs - and a
// teammate's task on the same job that is not.
const withTeammate = (scope: ReturnType<typeof feedScope>) => {
  const input = base(scope)
  input.tasks = [...input.tasks, { id: 'teammate-task', project_id: 'pool-own', title: 'Teammate: skim coat', due_date: '2026-11-03', status: 'open' }]
  return input
}
const crewScope = feedScope(as('worker'), { projectIds: ['pool-own'], taskIds: ['own-task'] })
ok(ids(withTeammate(crewScope)) === 't_own-task',
  'sub crew: only their own task on the job they are on - not a teammate\'s, no schedule (role), nothing from the GC job')
// A supervisor sees schedule lines - but only on the job they are on.
const supScope = feedScope(as('field_supervisor'), { projectIds: ['pool-own'], taskIds: [] })
const supIds = ids(withTeammate(supScope))
ok(supIds.includes('s_own-line') && !supIds.includes('s_bw-line'),
  `sub field supervisor: schedule on their own assigned job, none from the GC job they are not on (got ${supIds})`)

// A job the company owns AND holds a contract on is its own job: the wider rule.
const both = base(feedScope(as('admin'), null))
both.awarded = [...both.awarded, { id: 'sc-self', project_id: 'pool-own', project_name: '5 Windsong', trade: 'Pool' }]
ok(calendarItems(both).filter(i => i.project_id === 'pool-own').every(i => i.source === 'own'), 'owned beats awarded on the same job')

// ── the routes use it ──────────────────────────────────────────────────────
const loader = code('lib/calendar-load.ts')
ok(/const actor = await actorForUser\(db, profile\.id\)/.test(loader) && /const scope = feedScope\(actor, assignment\)/.test(loader),
  'loader: the holder\'s own permissions, read every time')
ok(/if \(!scope\) return null/.test(loader) && /companyTaskIds === null\) \{[\s\S]{0,200}return null/.test(loader),
  'loader: a failed read is null, never a shorter calendar')
ok(/return calendarItems\(\{/.test(loader), 'loader: the rows go through calendarItems')
ok(/\.from\('subcontracts'\)\.select\('id, project_id, trade, projects\(name\)'\)\.eq\('company_id', profile\.company_id\)/.test(loader),
  'loader: awarded jobs are the company\'s own subcontracts')

const feed = code('app/api/calendar/[token]/route.ts')
ok(/const items = await loadCalendar\(db,/.test(feed) && /if \(!items\) return new NextResponse\([^)]*503/.test(feed),
  'feed: reads through loadCalendar, and refuses with 503 when it cannot answer')
ok(!/from\('(schedule_items|project_tasks|inspections|projects)'\)/.test(feed), 'feed: no query of its own beside the loader')

const page = code('app/api/my-calendar/route.ts')
ok(/getActor\(/.test(page) && /const items = await loadCalendar\(db,/.test(page) && /if \(!items\) return NextResponse\.json\(\{ error/.test(page),
  'my-calendar: signed in, through loadCalendar, and a failure is an error not an empty month')

const sidebar = code('components/layout/sidebar.tsx')
ok(/label: 'Calendar', href: '\/calendar'/.test(sidebar), 'a sub has Calendar in their menu')
ok(/href: '\/calendar', label: 'Calendar'/.test(code('components/layout/mobile-tab-bar.tsx')), '...and on the phone bar')
ok(/isSub \? '\/api\/my-calendar' : '\/api\/master\/calendar'/.test(code('app/(dashboard)/master-calendar/page.tsx')),
  'the calendar screen reads the sub\'s own calendar for a sub')

done()
