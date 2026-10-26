// THE CALENDAR FEED ANSWERS WITH THE HOLDER'S PERMISSIONS, NOT THE COMPANY'S.
// It handed a worker (schedule: N, inspections: N, assigned-only) every
// schedule line, task and inspection on every job the company owned. Behaviour
// against the real role defaults, then the route pinned to actually use it.

import { feedScope, feedProjects } from '../calendar-feed'
import { ROLE_DEFAULTS } from '../permissions'
import { ok, done, code } from './_helpers'

const as = (role: string) => ({ role, permissions: ROLE_DEFAULTS[role] })
const jobs = [{ id: 'job-assigned' }, { id: 'job-other' }, { id: 'job-private' }]
const mine = { projectIds: ['job-assigned'], taskIds: ['task-mine'] }

// An office role sees the company's calendar, all three kinds.
const office = feedScope(as('admin'), null)!
ok(office.schedule && office.tasks && office.inspections, 'admin: schedule, tasks and inspections')
ok(feedProjects(jobs, office).length === 3 && office.taskIds === null, 'admin: every company job, every task')

// A worker sees only their own tasks on the jobs they are on - and no
// schedule or inspections, which their role is denied in the app.
const worker = feedScope(as('worker'), mine)!
ok(!worker.schedule, 'worker: no schedule lines (schedule: N)')
ok(!worker.inspections, 'worker: no inspections (inspections: N)')
ok(worker.tasks, 'worker: tasks (tasks: view)')
ok(JSON.stringify(feedProjects(jobs, worker).map(j => j.id)) === '["job-assigned"]',
  'worker: only the job they are assigned to, not the company\'s other jobs')
ok(JSON.stringify(worker.taskIds) === '["task-mine"]', 'worker: only the tasks that are theirs')

// A field supervisor keeps the schedule (schedule: view) but is still scoped
// to their own jobs.
const sup = feedScope(as('field_supervisor'), mine)!
ok(sup.schedule && feedProjects(jobs, sup).length === 1, 'field supervisor: schedule, on assigned jobs only')

// Assigned to nothing is an empty calendar - a real empty.
const nobody = feedScope(as('worker'), { projectIds: [], taskIds: [] })!
ok(feedProjects(jobs, nobody).length === 0 && nobody.taskIds!.length === 0, 'worker on no jobs: nothing')

// A lookup that FAILED refuses the feed rather than shrinking it.
ok(feedScope(as('worker'), null) === null, 'assignment unreadable: no feed (not every job, not an empty one)')
ok(feedScope(as('worker'), { projectIds: ['job-assigned'], taskIds: null }) === null,
  'task lookup failed: no feed rather than a calendar missing their tasks')

// A company that turned a resource OFF for a role means it.
const remapped = { role: 'project_manager', permissions: { ...ROLE_DEFAULTS.project_manager, inspections: {} } }
ok(!feedScope(remapped, null)!.inspections, 'a role with inspections removed gets no inspections in its feed')

// ── the route uses it ──────────────────────────────────────────────────────
const route = code('app/api/calendar/[token]/route.ts')
ok(/const actor = await actorForUser\(db, profile\.id\)/.test(route), 'feed: resolves the holder\'s permissions at every poll')
ok(/const scope = feedScope\(actor, assignment\)/.test(route) && /if \(!scope\) return new NextResponse\([^)]*503/.test(route),
  'feed: asks feedScope, and refuses with 503 when it cannot answer')
ok(/const projects = feedProjects\(/.test(route) && /const ids = projects\.map\(p => p\.id\)/.test(route),
  'feed: reads only the jobs the scope allows')
ok(/scope\.schedule\s*\?/.test(route) && /scope\.inspections\s*\?/.test(route) && /taskQuery\.in\('id', scope\.taskIds\)/.test(route),
  'feed: each kind of event is read only when allowed, and tasks are narrowed to the holder\'s')

done()
