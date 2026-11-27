// SERVICE CALLS AND DISPATCH - a sub runs his own business in SyteNav.
//
// Spec "Sub company login + dispatch", items 3-5, and its release tests:
//   - crew see only the calls assigned to them;
//   - a GC sees a call tied to its job as a status, never the sub's pricing,
//     customer or notes - and cannot see the sub's other calls at all;
//   - another company sees none of it.
//
// The rules are pure (lib/service-calls.ts) and tested case by case; who may
// touch which call is lib/service-calls-server.ts, tested against a fake db;
// and every route is pinned to ask those, in order, before touching a table.

import { ok, done, code, read } from './_helpers'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

type Rows = Record<string, Record<string, unknown>[]>
function fakeDb(tables: Rows) {
  return {
    auth: { getUser: async (token: string) => ({ data: { user: token ? { id: token } : null } }) },
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
        single: async () => rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      }
      return q
    },
  } as any
}

const ISO = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 25, h, m)).toISOString()

async function main() {
  ;(globalThis as any).__dirname = '/'
  const S = await import('../service-calls')
  const { callGate, loadCall, withDerivedStatus, pickFields } = await import('../service-calls-server')

  // ── status moves ─────────────────────────────────────────────────────────
  ok(JSON.stringify(S.nextStatuses('new')) === '["scheduled"]', 'a new call goes to scheduled and nowhere else')
  ok(S.nextStatuses('on_site').includes('done') && S.nextStatuses('on_site').includes('en_route'), 'on site goes forward to done, or BACK to en route')
  ok(!S.nextStatuses('scheduled').includes('done'), 'nothing skips: a scheduled call is not done without anybody being there')
  ok(S.moveProblem('scheduled', 'done', { crew: false, userId: 'o' }, { assigned_to: 'w' }) !== null, '...refused at the route, for the office too')

  // ── what a status claims ─────────────────────────────────────────────────
  const base = { customer_name: 'Dana', site_address: '14 Harbor View Rd', issue: 'No cooling' }
  ok(S.callProblem({ ...base }) === null, 'a call needs only who, where and what')
  ok(/customer/i.test(S.callProblem({ ...base, customer_name: ' ' }) ?? ''), '...and says which is missing')
  ok(/crew member/.test(S.callProblem({ ...base, status: 'scheduled', scheduled_start: ISO(9) }) ?? ''), 'scheduled with nobody on it is refused')
  ok(/time/.test(S.callProblem({ ...base, status: 'scheduled', assigned_to: 'w' }) ?? ''), 'scheduled with no time is refused')
  ok(/what was done/i.test(S.callProblem({ ...base, status: 'done', assigned_to: 'w', scheduled_start: ISO(9) }) ?? ''), 'done without notes is refused - Done collects what was done')
  ok(/after the start/.test(S.callProblem({ ...base, scheduled_start: ISO(10), scheduled_end: ISO(9) }) ?? ''), 'a finish before the start is refused')
  ok(/contractor job/.test(S.callProblem({ ...base, source: 'gc_job' }) ?? ''), 'a call "from a GC job" names the job')

  // scheduled is DERIVED, never typed
  ok(withDerivedStatus('new', { assigned_to: 'w', scheduled_start: ISO(9) }) === 'scheduled', 'somebody + a time makes a new call scheduled')
  ok(withDerivedStatus('scheduled', { assigned_to: null, scheduled_start: ISO(9) }) === 'new', '...and taking the person off makes it new again')
  ok(withDerivedStatus('on_site', { assigned_to: 'w', scheduled_start: ISO(9) }) === 'on_site', '...and nothing past scheduled is touched by it')
  ok(!('status' in pickFields({ status: 'done', company_id: 'other', completed_at: 'x', issue: 'a' })) && !('company_id' in pickFields({ company_id: 'x' })),
    'a body cannot set the status, the company or the completion stamp (whitelist)')

  // ── who moves what ──────────────────────────────────────────────────────
  const crew = { crew: true, userId: 'wes' }
  ok(S.moveProblem('scheduled', 'en_route', crew, { assigned_to: 'wes' }) === null, 'crew move their own call along')
  ok(/not assigned to you/.test(S.moveProblem('scheduled', 'en_route', crew, { assigned_to: 'other' }) ?? ''), '...never somebody else\'s')
  ok(/office/.test(S.moveProblem('done', 'invoiced', crew, { assigned_to: 'wes' }) ?? ''), '...and never mark it invoiced')
  ok(/office/.test(S.moveProblem('scheduled', 'new', crew, { assigned_to: 'wes' }) ?? ''), '...or unschedule it')

  // ── double booking ───────────────────────────────────────────────────────
  const slot = (id: string, who: string | null, a: number, b: number | null, status = 'scheduled') =>
    ({ id, assigned_to: who, scheduled_start: ISO(a), scheduled_end: b === null ? null : ISO(b), status })
  const c1 = S.conflicts([slot('a', 'wes', 9, 11), slot('b', 'wes', 10, 12)])
  ok(JSON.stringify(c1.get('a')) === '["b"]' && JSON.stringify(c1.get('b')) === '["a"]', 'two calls for one person that overlap are both flagged')
  ok(!S.conflicts([slot('a', 'wes', 9, 10), slot('b', 'wes', 10, 11)]).size, '9-10 then 10-11 is a morning, not a double booking')
  ok(!S.conflicts([slot('a', 'wes', 9, 11), slot('b', 'kim', 10, 12)]).size, 'the same time for two different people is not a clash')
  ok(!S.conflicts([slot('a', 'wes', 9, 11, 'done'), slot('b', 'wes', 10, 12)]).size, 'a closed call holds nobody\'s time')
  ok(S.conflicts([slot('a', 'wes', 9, null), { ...slot('b', 'wes', 9, 11), scheduled_start: ISO(9, 30) }]).size === 2,
    `a call with no finish is taken as ${S.DEFAULT_CALL_MINUTES} minutes long`)
  ok(JSON.stringify(S.clashesWith(slot('n', 'wes', 10, 11), [slot('a', 'wes', 9, 11)])) === '["a"]', 'clashesWith answers before a drop lands')

  // ── what a GC sees ───────────────────────────────────────────────────────
  const row = { id: 'c', call_number: 42, status: 'on_site', scheduled_start: ISO(9), scheduled_end: ISO(10), completed_at: null, updated_at: ISO(9),
    customer_name: 'Dana Whitfield', contact_phone: '555', notes: 'gate code 1234', issue: 'No cooling', assigned_to: 'wes', site_address: '14 Harbor' } as any
  const v = S.gcView(row, 'Blue Wave')
  const keys = Object.keys(v).sort().join(',')
  ok(keys === 'company,completed_at,id,number,scheduled_end,scheduled_start,status,status_label,updated_at', `the GC's view is exactly status and timing (${keys})`)
  ok(!JSON.stringify(v).includes('Dana') && !JSON.stringify(v).includes('1234') && !JSON.stringify(v).includes('No cooling'),
    '...never the sub\'s customer, notes or issue')
  ok(S.directionsUrl('14 Harbor View Rd, Tampa') === 'https://www.google.com/maps/dir/?api=1&destination=14%20Harbor%20View%20Rd%2C%20Tampa' && S.directionsUrl('') === null,
    'Directions opens the maps app on the address, and offers nothing for no address')

  // ── who may touch which call ────────────────────────────────────────────
  const db = fakeDb({
    profiles: [
      { id: 'owner', role: 'admin', company_id: 'pool' },
      { id: 'wes', role: 'worker', company_id: 'pool' },
      { id: 'kim', role: 'worker', company_id: 'pool' },
      { id: 'rival', role: 'admin', company_id: 'other' },
      { id: 'lite', role: 'admin', company_id: 'light' },
    ],
    companies: [
      { id: 'pool', type: 'subcontractor', invited_only: false, added_by_company_id: null },
      { id: 'other', type: 'subcontractor', invited_only: false, added_by_company_id: null },
      { id: 'light', type: 'subcontractor', invited_only: true, added_by_company_id: null },
    ],
    service_calls: [{ id: 'call-1', company_id: 'pool', assigned_to: 'wes', status: 'scheduled' }],
    company_roles: [], company_billing: [],
  })
  const req = (who: string) => new Request('https://app.sytenav.com/api/service-calls/call-1', { headers: { Authorization: `Bearer ${who}` } })
  const load = async (who: string) => {
    const g = await callGate(db, req(who), 'view')
    if ('denied' in g) return g.denied.status
    const r = await loadCall(db, g, 'call-1')
    return 'denied' in r ? r.denied.status : 'ok'
  }
  ok(await load('owner') === 'ok', 'the company\'s office opens its call')
  ok(await load('wes') === 'ok', 'RELEASE: the crew member on it opens it')
  ok(await load('kim') === 404, 'RELEASE: crew NOT on it do not - in the words a missing call gets')
  ok(await load('rival') === 404, 'RELEASE: another company does not, whatever the id')
  ok(await load('lite') === 403, 'a light sub account has no calls of its own until it runs its own jobs')

  // ── every route asks, in order, and scopes to the caller's company ──────
  const root = process.env.SYTENAV_ROOT ?? process.cwd()
  const walk = (d: string): string[] => readdirSync(join(root, d)).flatMap(n => {
    const p = join(d, n); return statSync(join(root, p)).isDirectory() ? walk(p) : p.endsWith('route.ts') ? [p] : []
  })
  const routes = walk('app/api/service-calls')
  ok(routes.length === 6, `the service-call routes are found (${routes.length})`)
  for (const f of routes) {
    const src = code(f)
    for (const h of src.split(/(?=export async function )/).slice(1)) {
      const name = h.match(/export async function (\w+)/)![1]
      const gateAt = h.indexOf('await callGate(db, request,')
      const firstTable = h.search(/\.from\('service_call/)
      ok(gateAt > 0 && (firstTable < 0 || gateAt < firstTable), `${f} ${name}: asks callGate before touching a table`)
      if (/params\.callId/.test(h)) ok(/await loadCall\(db, gate, params\.callId\)/.test(h), `${f} ${name}: finds the call only through loadCall`)
      ok(!/body\??\.company_id/.test(h), `${f} ${name}: never takes a company from the body`)
    }
  }
  const list = code('app/api/service-calls/route.ts')
  ok(/if \(gate\.crew\) q = q\.eq\('assigned_to', gate\.actor\.userId\)/.test(list), 'RELEASE: the list gives crew only their own calls')
  ok(/if \(gate\.crew\) return NextResponse\.json\(\{ error: 'The office takes new calls\.' \}/.test(list), '...and crew do not take new ones')
  ok(/referenceProblem\(db, gate\.companyId, f\)/.test(list) && /referenceProblem\(db, gate\.companyId, f\)/.test(code('app/api/service-calls/[callId]/route.ts')),
    'every id a body names (person, customer, contractor job) is checked against the caller\'s company')
  const status = code('app/api/service-calls/[callId]/status/route.ts')
  ok(/\.eq\('status', from\)/.test(status), 'a status move is claimed on the status it was read with - two phones make one move')
  ok(/patch\.completed_at = null/.test(status) && /patch\.assigned_to = null/.test(status), '...reopening clears the completion stamp, unscheduling frees the person')
  const punch = code('app/api/service-calls/[callId]/punch/route.ts')
  ok(/punchLocation\(worker, \{ lat: call\.site_lat, lng: call\.site_lng \}\)/.test(punch) && /in_fix: loc\.fix/.test(punch),
    'a punch is measured against the call\'s site by the job rule, and the outcome is stored')
  ok(/profile_id: gate\.actor\.userId/.test(punch) && !/body\??\.profile_id/.test(punch), '...only ever for the person punching')

  const dispatch = code('app/api/dispatch/route.ts')
  ok(/requirePermission\(db, request, 'dispatch', 'view'\)/.test(dispatch) && /isAssignedOnly\(gate\.actor\.role\)/.test(dispatch),
    'the dispatch board is the office\'s - refused to every assigned-only role whatever a saved map says')
  ok(/\.eq\('company_id', companyId\)/.test(dispatch), '...and shows only this company\'s calls')

  const gc = code('app/api/projects/[id]/service-calls/route.ts')
  ok(/ownedProject\(db, gate\.actor, params\.id/.test(gc) && /gcView\(r, /.test(gc), 'RELEASE: the GC reads calls on ITS job only, through gcView')
  ok(!/customer_name|notes|contact_|issue|assigned_to/.test(gc.slice(gc.indexOf(".from('service_calls')"), gc.indexOf('if (error)'))),
    '...and the route never even selects the sub\'s private columns')

  const server = code('lib/service-calls-server.ts')
  ok(/if \(!call\.assigned_to \|\| call\.assigned_to === actorId\) return/.test(server), 'the assignee is told; the person who made the change is not')
  ok(!/scheduled_start/.test(server.slice(server.indexOf('await notify({'), server.indexOf('link:', server.indexOf('await notify({')))),
    '...and the message carries no time - the server does not know the reader\'s clock')

  const mig = read('supabase/migrations/170_service_calls.sql')
  const tables = ['service_calls', 'service_call_events', 'service_call_time', 'service_call_photos']
  ok(tables.every(t => new RegExp(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`).test(mig)) && !/CREATE POLICY/.test(mig),
    'RLS is on every table and there is no policy: the browser reads none of it')
  ok(/company_id\s+uuid NOT NULL REFERENCES companies \(id\) ON DELETE CASCADE/.test(mig) && /gc_project_id\s+uuid REFERENCES projects \(id\) ON DELETE SET NULL/.test(mig),
    'a call is the sub company\'s (CASCADE); the GC job is a link (SET NULL)')
  ok(/service_call_time_one_open/.test(mig), 'one open punch per person')

  done()
}

main()
