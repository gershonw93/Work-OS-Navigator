// THE JOB ROUTES: daily logs, tasks, the time clock, the roster, the plan
// viewer and the header's helpers. Each of these answered "is somebody signed
// in" and then read or wrote the job named in the URL - so any account in the
// product, at any company, could read any job's logs, timesheets and drawings,
// tick its tasks, approve its hours or rewrite its dates by id.
//
// They cannot simply take `ownedProject`: the people using them most are NOT
// the job's owner - a worker clocking in, an invited sub filing a log from My
// Jobs, a sub opening the plans they were hired to build from. So the question
// is "is this person ON this job" (`lib/job-access.ts`): the owning company, a
// company with a subcontract on it, or somebody on its team. The GC-only
// screens (overview, readiness, setup, the client's email, a sub's payment
// schedule, a sub's own-job planner) take `ownedProject` as before.
//
// Half of this file is behaviour (`jobSide` against a fake db), half is the
// source of each handler: the gate is there, and it runs before any record.

import { ROLE_DEFAULTS } from '../permissions'
import { ok, done, code } from './_helpers'

// ── a fake db: enough PostgREST to answer the reads `jobSide` makes ─────────
type Rows = Record<string, Record<string, unknown>[]>
function fakeDb(tables: Rows, fail: string[] = []) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q,
        eq: (col: string, val: unknown) => { rows = rows.filter(r => r[col] === val); return q },
        ilike: (col: string, pat: string) => {
          const want = pat.replace(/\\(.)/g, '$1').toLowerCase()
          rows = rows.filter(r => String(r[col] ?? '').toLowerCase() === want); return q
        },
        limit: (n: number) => { rows = rows.slice(0, n); return q },
        maybeSingle: async () => fail.includes(table)
          ? { data: null, error: { message: 'boom' } }
          : { data: rows[0] ?? null, error: null },
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(fail.includes(table) ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }).then(res, rej),
      }
      return q
    },
  } as any
}

const P = 'proj-1'
const world: Rows = {
  projects: [{ id: P, gc_company_id: 'gc', created_by_company_id: 'gc' }],
  subcontracts: [{ id: 's1', project_id: P, company_id: 'subco' }],
  project_team_members: [
    { id: 'm1', project_id: P, profile_id: 'linked-user', email: null },
    { id: 'm2', project_id: P, profile_id: null, email: 'Jay@Example.com' },
    { id: 'm3', project_id: 'other-job', profile_id: 'stranger', email: 'stranger@x.com' },
  ],
  profiles: [
    { id: 'jay', email: 'jay@example.com', company_id: 'elsewhere' },
    { id: 'stranger', email: 'stranger@x.com', company_id: 'nope' },
    { id: 'crew-1', company_id: 'subco' },
    { id: 'crew-2', company_id: 'subco' },
  ],
}

async function main() {
  // next/server's compiled bundle reads __dirname, which an ES module does not
  // have; load the gate lazily after providing one (as lockdown-docs does).
  ;(globalThis as any).__dirname = '/'
  const { jobSide, actorJobGate, companyProfileIds } = await import('../job-access')
  const db = fakeDb(world)
  const side = async (userId: string, companyId: string | null, projectId = P) => {
    const r = await jobSide(db, { userId, companyId }, projectId)
    return 'denied' in r ? r.denied.status : r.side
  }

  ok(await side('u', 'gc') === 'gc', 'jobSide: the owning company is the gc side')
  ok(await side('u', 'subco') === 'sub', '...a company holding a subcontract on the job is the sub side')
  ok(await side('linked-user', 'elsewhere') === 'member', '...a team row carrying the person\'s profile_id is a member')
  ok(await side('jay', 'elsewhere') === 'member', '...and so is a team row typed with their address, whatever its capitals')
  ok(await side('stranger', 'nope') === 404, 'a stranger - on another job\'s team, not this one - is refused')
  ok(await side('u', 'gc', 'no-such-job') === 404, 'a missing job is refused')
  {
    const a = await jobSide(db, { userId: 'stranger', companyId: 'nope' }, P)
    const b = await jobSide(db, { userId: 'u', companyId: 'gc' }, 'no-such-job')
    const ja = 'denied' in a ? await a.denied.json() : null
    const jb = 'denied' in b ? await b.denied.json() : null
    ok(!!ja && JSON.stringify(ja) === JSON.stringify(jb), '...in the SAME words, so probing ids says nothing about which exist')
  }
  ok(await side('nobody', null) === 404, 'no company and no team row: refused (a profile-less account is on no job)')
  {
    const r = await jobSide(fakeDb(world, ['projects']), { userId: 'u', companyId: 'gc' }, P)
    ok('denied' in r && r.denied.status === 500, 'a project read that FAILED is a 500, never a "not on this job"')
  }

  // the permission is asked first, and in requirePermission's words
  {
    const worker = { userId: 'u', role: 'worker', companyId: null, permissions: ROLE_DEFAULTS.worker }
    const r = await actorJobGate(db, worker as any, P, 'team', 'view')
    ok('denied' in r && r.denied.status === 403, 'actorJobGate: no permission is 403 before the job is even looked up')
    const r2 = await actorJobGate(db, { ...worker, companyId: 'gc' } as any, P, 'time', 'create')
    ok(!('denied' in r2) && r2.side === 'gc', '...and a worker at the GC clocks in on the GC\'s job')
  }

  ok(JSON.stringify(await companyProfileIds(db, 'subco')) === '["crew-1","crew-2"]', 'companyProfileIds: the caller\'s company\'s people')
  ok(await companyProfileIds(fakeDb(world, ['profiles']), 'subco') === null, '...and null - never "everybody" - when the read failed')

  // ── the handlers ──────────────────────────────────────────────────────────
  const R = (p: string) => code(`app/api/projects/[id]/${p}`)
  const fn = (src: string, name: string) => {
    const at = src.indexOf(`export async function ${name}(`)
    if (at < 0) return ''
    const next = src.indexOf('export async function ', at + 10)
    return src.slice(at, next < 0 ? undefined : next)
  }
  const signedInOnly = (h: string) => /auth\.getUser\(/.test(h)
  // The gate is asked before the first record of the job is touched.
  const before = (h: string, gate: string, firstRead: string) =>
    h.indexOf(gate) > 0 && (h.indexOf(firstRead) < 0 || h.indexOf(gate) < h.indexOf(firstRead))

  const cases: [string, string, RegExp, string][] = [
    ['daily-logs/route.ts', 'GET', /jobGate\(db, request, params\.id, 'daily-logs', 'view'\)/, "from('daily_logs')"],
    ['daily-logs/route.ts', 'POST', /jobGate\(db, request, params\.id, 'daily-logs', 'view', \{ write: true \}\)/, 'createDailyLog('],
    ['daily-logs/[logId]/pdf/route.ts', 'GET', /jobGate\(db, request, params\.id, 'daily-logs', 'view'/, "from('daily_logs')"],
    ['daily-logs/[logId]/photos/route.ts', 'POST', /jobGate\(db, request, params\.id, 'daily-logs', 'view', \{ write: true \}\)/, 'storage'],
    ['daily-logs/[logId]/photos/[photoId]/route.ts', 'PATCH', /jobGate\(db, request, params\.id, 'daily-logs', 'view', \{ write: true \}\)/, "from('daily_log_photos')"],
    ['daily-logs/[logId]/photos/[photoId]/route.ts', 'DELETE', /jobGate\(db, request, params\.id, 'daily-logs', 'view', \{ write: true \}\)/, "from('daily_log_photos')"],
    ['daily-logs/[logId]/updates/route.ts', 'POST', /jobGate\(db, request, params\.id, 'daily-logs', 'view', \{ write: true \}\)/, "from('daily_log_updates')"],
    ['tasks/route.ts', 'GET', /jobGate\(db, request, params\.id, 'tasks', 'view'\)/, "from('project_tasks')"],
    ['tasks/[taskId]/route.ts', 'PATCH', /jobGate\(db, request, params\.id, 'tasks', 'view', \{ write: true \}\)/, 'updateTask('],
    ['tasks/[taskId]/route.ts', 'DELETE', /jobGate\(db, request, params\.id, 'tasks', 'delete'\)/, '.delete()'],
    ['tasks/[taskId]/signoff/route.ts', 'POST', /jobGate\(db, request, params\.id, 'tasks', 'view', \{ write: true \}\)/, "from('project_tasks')"],
    ['tasks/[taskId]/pin/route.ts', 'GET', /jobGate\(db, request, params\.id, 'tasks', 'view'\)/, "from('plan_pins')"],
    ['time/punch/route.ts', 'POST', /jobGate\(db, request, params\.id, 'time', 'create'\)/, "from('projects')"],
    ['time/[entryId]/route.ts', 'PATCH', /jobGate\(db, request, params\.id, 'time', 'edit'\)/, ".update("],
    ['time/export/route.ts', 'GET', /jobGate\(db, request, params\.id, 'time', 'view'\)/, "from('time_entries')"],
    ['team/route.ts', 'GET', /jobSide\(db, actor, params\.id\)/, "from('project_team_members')"],
    ['job-schedule/route.ts', 'GET', /gate\(request, params\.id, false\)/, "from('projects')"],
    ['job-schedule/route.ts', 'PATCH', /gate\(request, params\.id, true\)/, ".update("],
    ['overview/route.ts', 'GET', /requirePermission\(db, request, 'projects', 'view'\)/, "from('projects')"],
    ['readiness/route.ts', 'GET', /ownedProject\(db, gate\.actor, params\.id, 'id'\)/, 'count('],
    ['setup/route.ts', 'GET', /ownedProject\(db, gate\.actor, params\.id, 'id'\)/, 'count('],
    ['setup/route.ts', 'POST', /ownedProject\(db, gate\.actor, params\.id, 'id'\)/, "from('project_setup_dismissals')"],
    ['activity/route.ts', 'GET', /jobGate\(db, request, params\.id, 'projects', 'view'\)/, "from('project_activity')"],
    ['documents/route.ts', 'GET', /jobGate\(db, request, params\.id, 'files', 'view'\)/, "from('project_plans')"],
    ['client-email/route.ts', 'GET', /ownedProject\(db, gate\.actor, params\.id, 'id'\)/, "from('customers')"],
    ['plans/[planId]/file/route.ts', 'GET', /actorJobGate\(db, actor, params\.id, 'plans', 'view'\)/, "from('project_plans')"],
    ['subcontracts/[subId]/payment-schedule/route.ts', 'GET', /ownedProject\(db, gate\.actor, params\.id, 'id'\)/, "from('payment_schedule_items')"],
  ]
  for (const [file, name, gate, firstRead] of cases) {
    const h = fn(R(file), name)
    const m = h.match(gate)
    ok(!!h && !!m && before(h, m[0], firstRead), `${file} ${name}: gated (${m ? m[0].split('(')[0] : 'MISSING'}) before the job is read`)
    // The plan viewer resolves its user from cookies (`<img>` and pdf.js cannot
    // send a header) - that sign-in is now followed by the job gate above.
    if (!file.startsWith('plans/')) ok(!signedInOnly(h), `${file} ${name}: no bare auth.getUser left`)
  }

  // ── the specifics that matter as much as the gate ─────────────────────────
  const dlPost = fn(R('daily-logs/route.ts'), 'POST')
  ok(/onJob\.side === 'gc' && !actorCan\(onJob\.actor, 'daily-logs', 'create'\)/.test(dlPost),
    'daily-logs POST: the GC\'s own staff still need create; a sub filing from My Jobs needs view')
  ok(!/profiles'\)\.upsert/.test(dlPost) && !/role: 'admin'/.test(dlPost),
    '...and filing a log no longer writes a missing profile in as an ADMIN of the job\'s company')

  for (const [file, name] of [
    ['daily-logs/[logId]/photos/route.ts', 'POST'],
    ['daily-logs/[logId]/photos/[photoId]/route.ts', 'PATCH'],
    ['daily-logs/[logId]/photos/[photoId]/route.ts', 'DELETE'],
    ['daily-logs/[logId]/updates/route.ts', 'POST'],
  ]) {
    ok(/logOnJob\(db, params\.id, params\.logId\)/.test(fn(R(file), name)), `${file} ${name}: the log has to be on this job`)
  }
  ok(/\.eq\('id', updates\.subcontract_id\)\.eq\('project_id', params\.id\)/.test(fn(R('daily-logs/[logId]/photos/[photoId]/route.ts'), 'PATCH')),
    'photo PATCH: a sub tag must be a sub on THIS job')

  const tPatch = fn(R('tasks/[taskId]/route.ts'), 'PATCH')
  ok(/\.eq\('id', params\.taskId\)\s*\.eq\('project_id', params\.id\)\.maybeSingle\(\)/.test(tPatch),
    'task PATCH: the task has to be on this job')
  const tGet = fn(R('tasks/route.ts'), 'GET')
  ok(/restrictedRoles\.includes\(profile\.role\)/.test(tGet) && /taskIdsFor\(db,/.test(tGet),
    'tasks GET: the assigned-only narrowing is still there')
  const sign = fn(R('tasks/[taskId]/signoff/route.ts'), 'POST')
  ok((sign.match(/\.eq\('id', params\.taskId\)\.eq\('project_id', params\.id\)/g) ?? []).length >= 3,
    'signoff: the read and BOTH writes are scoped to this job')

  const entry = fn(R('time/[entryId]/route.ts'), 'PATCH')
  ok(/gate\.side !== 'gc'[\s\S]{0,200}companyProfileIds\(db, gate\.actor\.companyId\)/.test(entry) &&
    entry.indexOf('companyProfileIds(') < entry.indexOf('.update('),
    'time approval on somebody else\'s job: only your own crew\'s entries')
  const exp = fn(R('time/export/route.ts'), 'GET')
  ok(/if \(!manages\) q = q\.eq\('profile_id', gate\.actor\.userId\)/.test(exp),
    'time export: without time: edit, your own hours only - what the Time tab shows you')
  ok(/gate\.side !== 'gc'[\s\S]{0,160}q\.in\('profile_id'/.test(exp), '...and a manager on another company\'s job, their own crew')

  const team = fn(R('team/route.ts'), 'GET')
  ok(/const seesMoney = on\.side === 'gc' && actorCan\(actor, 'team', 'view'\)/.test(team) &&
    /contract_amount: _amount, proposal_url: _proposal/.test(team),
    'team GET: contract amounts and proposals only reach the owner\'s Subs & Team tab')
  ok(/ROSTER_READERS = \['team', 'daily-logs', 'plans'\]/.test(code('app/api/projects/[id]/team/route.ts')),
    '...and the floor is any screen that reads the roster, not team: view alone')

  const docs = fn(R('documents/route.ts'), 'GET')
  ok((docs.match(/!owner \? Promise\.resolve\(\[\]\)/g) ?? []).length === 3,
    'documents: permits, submittals and compliance only for the owner of the job')
  ok(!/from\('profiles'\)/.test(docs), '...and the company files are the ACTOR\'s company, read off the gate')

  const ov = fn(R('overview/route.ts'), 'GET')
  ok(/ownsProject\(gate\.actor\.companyId, project as any\)/.test(ov), 'overview: ownership through ownsProject, not a hand-rolled gc_company_id compare')

  const sched = code('app/api/projects/[id]/subcontracts/[subId]/payment-schedule/route.ts')
  ok(/\.eq\('id', params\.subId\)\.eq\('project_id', params\.id\)/.test(sched.replace(/\n\s+/g, '')),
    'payment schedule: the subcontract has to be on this job')

  // Every role that reads the roster through Daily Logs or Plans still can.
  for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
    const reads = ['team', 'daily-logs', 'plans'].some(r => (perms as any)[r]?.view)
    ok(reads, `${role}: still reaches the roster through a screen it can open`)
  }

  done()
}

main()
