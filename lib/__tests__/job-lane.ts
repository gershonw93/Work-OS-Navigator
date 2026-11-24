// EVERY ROUTE UNDER /api/projects/<id>/ ASKS WHETHER THE CALLER IS ON THE JOB.
//
// `requirePermission` answered "may this person edit budgets" and never
// "whose". About a hundred handlers under /api/projects/[id]/ asked nothing
// else, so any company holding the permission - every GC's admin, and a sub's
// own admin, who holds everything in their own company - could read or write
// any job by id: the budget, the bills, the payments (which push into the
// owner's QuickBooks), the quote comparisons. The tab menu hid those screens
// from a sub; the routes behind them did not.
//
// Now `requirePermission` reads the project id off the PATH and asks
// `jobSide`: a stranger gets the 404 a missing job gets, a sub or an outside
// team member gets only the lane in lib/sub-scope.ts (the menu's own list),
// and assigned-only crew reach only the jobs on their My Jobs list.
//
// Behaviour, against a fake db with REAL role defaults, then source pins for
// the route-level fixes that shipped beside it (spec section 6).

import { ok, done, code } from './_helpers'

type Rows = Record<string, Record<string, unknown>[]>

// Enough PostgREST for getActor, readBilling, jobSide and myJobs.
function fakeDb(tables: Rows) {
  return {
    auth: { getUser: async (token: string) => ({ data: { user: token ? { id: token } : null } }) },
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q,
        order: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
        ilike: (c: string, pat: string) => {
          const want = pat.replace(/\\(.)/g, '$1').toLowerCase()
          rows = rows.filter(r => String(r[c] ?? '').toLowerCase() === want); return q
        },
        or: (expr: string) => {
          const parts = expr.split(',').map(p => p.split('.eq.'))
          rows = rows.filter(r => parts.some(([c, v]) => r[c] === v)); return q
        },
        limit: (n: number) => { rows = rows.slice(0, n); return q },
        single: async () => rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(res, rej),
      }
      return q
    },
  } as any
}

const A_JOB = '11111111-1111-4111-8111-111111111111'   // GC A's job, sub awarded
const B_JOB = '22222222-2222-4222-8222-222222222222'   // GC B's job, same sub awarded
const SUB_JOB = '33333333-3333-4333-8333-333333333333' // the sub's OWN job, its own customer
const A_OTHER = '44444444-4444-4444-8444-444444444444' // GC A's job nobody assigned the worker to

const world: Rows = {
  projects: [
    { id: A_JOB, gc_company_id: 'gc-a', created_by_company_id: 'gc-a' },
    { id: B_JOB, gc_company_id: 'gc-b', created_by_company_id: 'gc-b' },
    { id: SUB_JOB, gc_company_id: 'pool-co', created_by_company_id: 'pool-co' },
    { id: A_OTHER, gc_company_id: 'gc-a', created_by_company_id: 'gc-a' },
  ],
  subcontracts: [
    { id: 'sc-a', project_id: A_JOB, company_id: 'pool-co' },
    { id: 'sc-b', project_id: B_JOB, company_id: 'pool-co' },
  ],
  project_team_members: [
    { id: 'tm-1', project_id: A_JOB, profile_id: 'a-worker', email: 'worker@gca.com', name: 'Wes Worker' },
  ],
  profiles: [
    { id: 'a-admin', role: 'admin', company_id: 'gc-a', email: 'admin@gca.com' },
    { id: 'b-admin', role: 'admin', company_id: 'gc-b', email: 'admin@gcb.com' },
    { id: 'pool-owner', role: 'admin', company_id: 'pool-co', email: 'owner@pool.com' },
    { id: 'a-worker', role: 'worker', company_id: 'gc-a', email: 'worker@gca.com', full_name: 'Wes Worker' },
  ],
}

async function main() {
  ;(globalThis as any).__dirname = '/'
  const { requirePermission } = await import('../api-guard')
  const { projectIdFromUrl, subLaneAllows, SUB_AWARDED_TABS } = await import('../sub-scope')
  const { contactBackfill } = await import('../award-vendor')
  const db = fakeDb(world)

  const call = async (who: string, path: string, resource: string, action: any, opts?: any) => {
    const req = new Request(`https://app.sytenav.com${path}`, { headers: { Authorization: `Bearer ${who}` } })
    const g = await requirePermission(db, req, resource, action, opts)
    return 'denied' in g ? g.denied.status : (g.side ?? 'no-job')
  }

  // ── the reading of the URL ────────────────────────────────────────────────
  ok(projectIdFromUrl(`https://x.com/api/projects/${A_JOB}/budget`) === A_JOB, 'the project id is read off /api/projects/<uuid>/...')
  ok(projectIdFromUrl(`https://x.com/api/projects/${A_JOB}`) === A_JOB, '...including the project itself')
  ok(projectIdFromUrl('https://x.com/api/projects/stats') === null, 'a non-uuid segment (stats) is not a project')
  ok(projectIdFromUrl(`https://x.com/api/directory?project=${A_JOB}`) === null, 'a query string never names the project - only the path')
  ok(projectIdFromUrl('not a url') === null, 'an unparseable URL names nothing')

  // ── THE REPORTED HOLE: another company's admin, by id ────────────────────
  ok(await call('b-admin', `/api/projects/${A_JOB}/budget`, 'budget', 'view') === 404,
    'GC B\'s admin reading GC A\'s budget by id: refused, as a job that does not exist')
  ok(await call('b-admin', `/api/projects/${A_JOB}/payments`, 'payments', 'edit') === 404,
    '...and recording a payment on it (which pushes to GC A\'s QuickBooks): refused')
  ok(await call('a-admin', `/api/projects/${A_JOB}/budget`, 'budget', 'view') === 'gc',
    'GC A\'s own admin on GC A\'s job: through, on the gc side')

  // ── spec 2: the sub sees eight things, enforced on the server ─────────────
  ok(await call('pool-owner', `/api/projects/${A_JOB}/budget`, 'budget', 'view') === 403,
    'the sub\'s own admin opening GC A\'s costs URL directly: 403 (they hold budget:view in their own company)')
  for (const [r, a] of [['financials', 'view'], ['invoices', 'view'], ['pay-apps', 'view'], ['quotes', 'view'], ['equipment', 'view'], ['reports', 'view'], ['projects', 'edit'], ['team', 'edit']] as const) {
    ok(await call('pool-owner', `/api/projects/${A_JOB}/x`, r, a) === 403, `...${r}:${a} on GC A's job: 403`)
  }
  for (const r of SUB_AWARDED_TABS) {
    ok(await call('pool-owner', `/api/projects/${A_JOB}/x`, r, 'view') === 'sub', `...${r}: readable on GC A's job (the lane)`)
  }
  ok(await call('pool-owner', `/api/projects/${A_JOB}/schedule`, 'schedule', 'edit') === 403,
    '...the schedule is READ: a sub moves their dates through My Jobs, never by rewriting the GC\'s')
  ok(await call('pool-owner', `/api/projects/${A_JOB}/daily-logs`, 'daily-logs', 'create') === 'sub', '...a daily log is written')
  ok(await call('pool-owner', `/api/projects/${A_JOB}/inspections/x`, 'mark-ready', 'edit') === 'sub', '...and "ready for inspection" is reported')
  ok(await call('pool-owner', `/api/projects/${A_JOB}/invoices/x/lien-waiver`, 'invoices', 'edit', { subOwnRecord: true }) === 'sub',
    'a route that checks the RECORD is theirs opts in (subOwnRecord) and is let through, with the side to check against')

  // ── release tests: one sub, two GCs, and the GC on the sub's own job ──────
  ok(await call('pool-owner', `/api/projects/${B_JOB}/tasks`, 'tasks', 'view') === 'sub', 'the same sub reaches GC B\'s job as well, separately')
  ok(await call('pool-owner', `/api/projects/${B_JOB}/budget`, 'budget', 'view') === 403, '...and cannot read GC B\'s money there either')
  ok(await call('a-admin', `/api/projects/${B_JOB}/tasks`, 'tasks', 'view') === 404, 'GC A cannot read GC B\'s job through the sub they share')
  ok(await call('a-admin', `/api/projects/${SUB_JOB}/budget`, 'budget', 'view') === 404, 'GC A cannot read the sub\'s own job (the sub\'s other customer)')
  ok(await call('pool-owner', `/api/projects/${SUB_JOB}/budget`, 'budget', 'edit') === 'gc', '...which the sub runs in full, as its owner')

  // ── crew limited to assigned jobs (spec 6) ────────────────────────────────
  ok(await call('a-worker', `/api/projects/${A_JOB}/tasks`, 'tasks', 'view') === 'gc', 'a worker on the job\'s team: through')
  ok(await call('a-worker', `/api/projects/${A_OTHER}/tasks`, 'tasks', 'view') === 404,
    'a worker NOT assigned to another of their company\'s jobs: refused - it is not on their My Jobs list either')

  // ── nothing changes for a URL that is not a job ──────────────────────────
  ok(await call('b-admin', '/api/directory', 'directory', 'view') === 'no-job', 'a route outside /api/projects/<id>/ is not asked about any job')
  ok(await call('pool-owner', `/api/projects/${A_JOB}/budget`, 'budget-nope', 'view') === 403, 'the permission is still asked first')

  // ── the menu and the server read one list ────────────────────────────────
  const tabs = code('components/layout/project-tabs.tsx')
  ok(/new Set<string>\(SUB_AWARDED_TABS\)/.test(tabs) && !/SUB_AWARDED_ALLOWED = new Set\(\[/.test(tabs),
    'the tab menu builds its sub list from lib/sub-scope.ts rather than spelling a second one')
  ok(subLaneAllows('plans', 'view') && !subLaneAllows('plans', 'edit') && subLaneAllows('rfis', 'create') && !subLaneAllows('budget', 'view'),
    'subLaneAllows: plans read, RFIs written, budget never')
  const guard = code('lib/api-guard.ts')
  ok(guard.indexOf('billingLock(db, actor.companyId)') < guard.indexOf('projectIdFromUrl(request.url)'),
    'requirePermission asks permission and the billing lock BEFORE the job, so a 403 for permission is still a 403')

  // ── spec 6, route by route ───────────────────────────────────────────────
  const bids = code('app/api/projects/[id]/bids/[packageId]/award/route.ts')
  ok(/from\('bid_packages'\)\.select\('id'\)\.eq\('id', params\.packageId\)\.eq\('project_id', params\.id\)/.test(bids)
    && bids.indexOf("from('bid_packages').select('id')") < bids.indexOf(".update({ status: 'awarded' })"),
    'old bids award: the package is checked against THIS job before any bid is awarded or rejected')

  const award = code('app/api/projects/[id]/quotes/[compId]/award/route.ts')
  const invitedAt = award.indexOf("eq('id', invitedId)")
  ok(invitedAt > 0 && /eq\('added_by_company_id', myCompanyId\)/.test(award.slice(invitedAt, invitedAt + 200)),
    'quote award: an invited vendor id counts only when it is a row in THIS GC\'s Directory')
  ok(/contactBackfill\(existing/.test(award) && !/backfill\.contact_email = contact\.email/.test(award),
    '...and the contact backfill goes through contactBackfill, never a straight overwrite')

  const fromQuote = { name: 'Sam Estimator', email: 'sales@bluewave.com', phone: '555-0100' }
  ok(JSON.stringify(contactBackfill({ contact_name: 'Dana Owner', contact_email: 'dana@bluewave.com', phone: '555-0199' }, fromQuote)) === '{}',
    'contactBackfill: what the GC typed is never replaced by what a quote says')
  ok(JSON.stringify(contactBackfill({ contact_name: 'Dana Owner', contact_email: '', phone: null }, fromQuote)) === '{"contact_email":"sales@bluewave.com","phone":"555-0100"}',
    '...and only the blanks are filled ("" is what 22 rows use for absent)')

  const invites = code('app/api/projects/[id]/bid-requests/[reqId]/invites/route.ts')
  ok(/\.in\('id', claimed\)\.eq\('added_by_company_id', gate\.actor\.companyId\)/.test(invites) && /vendor_company_id: v\.company_id \|\| null/.test(invites)
    && invites.indexOf('inDirectory') < invites.indexOf('vendor_company_id: v.company_id'),
    'bid invites: a company id from the body is kept only when it is in this GC\'s Directory')

  const review = code('app/api/projects/[id]/daily-logs/[logId]/review/route.ts')
  ok(/ownedProject\(db, actor, params\.id/.test(review) && review.indexOf('ownedProject(') < review.indexOf(".from('daily_logs')"),
    'reviewing a daily log is the owning company\'s act, asked before the log is touched')

  const waiver = code('app/api/projects/[id]/invoices/[invoiceId]/lien-waiver/route.ts')
  ok(/subOwnRecord: true/.test(waiver) && /\.eq\('project_id', params\.id\)/.test(waiver) && /gate\.side !== 'gc'/.test(waiver),
    'lien waiver: the bill is on THIS job, and on someone else\'s job it is the caller\'s own')
  const billing = code('app/api/projects/[id]/subcontracts/[subId]/billing/route.ts')
  ok(/subOwnRecord: true/.test(billing) && /gate\.side !== 'gc' && sub\.company_id !== gate\.actor\.companyId/.test(billing),
    'subcontract billing: a sub bills its own subcontract, never another sub\'s')
  for (const f of ['upload/route.ts', '[quoteId]/route.ts']) {
    const src = code(`app/api/projects/[id]/quotes/[compId]/${f}`)
    ok(/from\('quote_comparisons'\)\.select\('id'\)\.eq\('id', params\.compId\)\.eq\('project_id', params\.id\)/.test(src),
      `quotes/${f}: the comparison is checked against this job`)
  }

  // Every requirePermission that opts in to the sub side must check the record
  // itself - otherwise the flag is a hole with a comment on it.
  const { execSync } = await import('node:child_process')
  const optIns = execSync('grep -rl "subOwnRecord: true" app', { cwd: process.env.SYTENAV_ROOT ?? process.cwd() }).toString().trim().split('\n').filter(Boolean)
  ok(optIns.length === 2, `exactly the two known routes opt in to subOwnRecord (${optIns.length}) - a new one needs its own record check and a line here`)
  for (const f of optIns) ok(/gate\.side !== 'gc'/.test(code(f)), `${f}: branches on gate.side to check the record`)

  done()
}

main()
