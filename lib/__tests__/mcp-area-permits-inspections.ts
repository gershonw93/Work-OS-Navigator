// Claude reading and adding/editing PERMITS, INSPECTIONS (beyond requesting
// one) and CHANGE ORDERS (beyond raising one), through the MCP server.
//
// What must hold:
//   - add and edit only: no delete, no void, no scan, no file, and NO APPROVING
//     A CHANGE ORDER - approval folds the amount into the subcontract's contract
//     at once, so update_change_order never passes a status;
//   - every write goes through the same lib/writes function the app's route
//     calls, and the area file writes nothing itself;
//   - an inspection booking meets the route's own `scheduleProblem` (who it was
//     booked with), and moving back to requested clears the booking;
//   - every handler on every route in the area is gated - the permits routes,
//     and the inspections list and create, used to ask only "is somebody signed
//     in" - and the GC's own records (permits, change orders, the required
//     list) are checked against the company's OWN jobs, because a sub's admin
//     holds those permissions at their own company.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { PERMITS_INSPECTIONS_READ, PERMITS_INSPECTIONS_WRITE } from '../mcp/areas/permits-inspections'
import { RESOURCES, getEffectivePermissions, getRoleDefaults } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { ok, done, code } from './_helpers'

type Op = [string, ...unknown[]]
type Call = { table: string; ops: Op[] }
type Answer = { data?: unknown; error?: { message: string; code?: string } | null; count?: number }

function fakeDb(answer: (table: string, ops: Op[]) => Answer | undefined) {
  const calls: Call[] = []
  const db: any = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const settle = () => {
        const a = answer(table, call.ops) ?? { data: [] }
        return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null }
      }
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: any) => resolve(settle())
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args])
            if (prop === 'maybeSingle' || prop === 'single') {
              const r = settle()
              return Promise.resolve(Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r)
            }
            return chain
          }
        },
      })
      return chain
    },
  }
  return { db, calls }
}
const has = (ops: Op[], method: string, ...args: unknown[]) =>
  ops.some(([m, ...a]) => m === method && args.every((x, i) => a[i] === x))
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any
const eqVal = (ops: Op[], key: string) => ops.find(([m, k]) => m === 'eq' && k === key)?.[2]
const written = (calls: Call[], table: string, method: 'insert' | 'update' | 'delete') =>
  calls.filter(c => c.table === table && has(c.ops, method)).map(c => opArg(c.ops, method))

const actor = (role = 'admin'): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})
/** A Project Manager whose company narrowed one resource - the map, not the role name, is what is asked. */
const narrowed = (resource: string, acts: Record<string, boolean>): ActorPerms => {
  const a = actor('project_manager')
  return { ...a, permissions: { ...a.permissions, [resource]: { view: false, create: false, edit: false, delete: false, ...acts } as any } }
}
const WRITE = { canWrite: true, tokenId: 'tok1' }
const READ = { canWrite: false, tokenId: 'tok1' }

/**
 * The company owns job p1 only. Rows on p1 are `onJobIds`; inspection `v1` is
 * voided. Change order co1 is tied to subcontract sc1 and is pending.
 */
function db(opts: { onJobIds?: string[]; extra?: (t: string, ops: Op[]) => Answer | undefined } = {}) {
  const onJobIds = opts.onJobIds ?? ['pm1', 'i1', 'v1', 'co1', 'line1']
  return fakeDb((t, ops) => {
    const e = opts.extra?.(t, ops); if (e) return e
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', company_id: 'c1', role: 'admin' } }
    if (t === 'projects') {
      const id = eqVal(ops, 'id')
      if (id !== undefined) return { data: id === 'p1' ? { id: 'p1', name: 'Maple Street Duplex', gc_company_id: 'c1' } : null }
      return { data: [{ id: 'p1', name: 'Maple Street Duplex' }] }
    }
    const onJob = () => onJobIds.includes(eqVal(ops, 'id') as string) && eqVal(ops, 'project_id') === 'p1'
    if (t === 'inspections' && has(ops, 'update')) {
      return { data: { id: eqVal(ops, 'id'), type: 'Framing', status: 'requested', requested_by_id: 'u2', scheduler_profile_id: null, ...opArg(ops, 'update') } }
    }
    if (t === 'inspections' && has(ops, 'select', 'id, status')) {
      if (!onJob()) return { data: null }
      return { data: { id: eqVal(ops, 'id'), status: eqVal(ops, 'id') === 'v1' ? 'void' : 'requested' } }
    }
    if (t === 'inspections') return { data: onJob() ? { scheduled_date: null, booked_with: null, booked_at: null, status: 'requested', failure_reason: null } : null }
    if (t === 'permits' && !has(ops, 'insert') && !has(ops, 'update') && !has(ops, 'select', 'id')) {
      return { data: onJob() ? { permit_type: 'Building', permit_number: 'B-1', status: 'pending', description: null, issuing_authority: null } : null }
    }
    if (t === 'change_orders' && has(ops, 'select', '*')) {
      return { data: onJob() ? { id: 'co1', title: 'Extra footing', amount: '1500.00', status: 'pending', subcontract_id: 'sc1', applied_to_contract: false } : null }
    }
    if (t === 'change_orders' && has(ops, 'update')) return { data: { id: 'co1', title: 'Extra footing', amount: '1500.00', status: 'pending', ...opArg(ops, 'update') } }
    if (has(ops, 'select', 'id') && eqVal(ops, 'project_id') !== undefined) return { data: onJob() ? { id: eqVal(ops, 'id') } : null }
    if (t === 'project_required_inspections' && has(ops, 'select', 'type')) return { data: [{ type: 'Footing' }] }
    if (has(ops, 'insert')) return { data: { id: 'new1', ...opArg(ops, 'insert') } }
    if (has(ops, 'update')) return { data: { id: 'upd1', ...opArg(ops, 'update') } }
    return { data: [] }
  })
}

async function main() {
  const area = code('lib/mcp/areas/permits-inspections.ts')
  const all = [...PERMITS_INSPECTIONS_READ, ...PERMITS_INSPECTIONS_WRITE]

  // ── the tools are there, and add or edit only ─────────────────────────────
  for (const n of ['list_permits', 'list_change_orders', 'list_required_inspections']) {
    ok(ALL_TOOLS.some(t => t.name === n && !('write' in t)), `${n} is a READ tool the dispatcher knows`)
  }
  for (const n of ['create_permit', 'update_permit', 'update_inspection', 'mark_inspection_ready', 'update_change_order', 'add_required_inspections']) {
    ok(ALL_TOOLS.some(t => t.name === n && (t as any).write === true), `${n} is a WRITE tool the dispatcher knows`)
  }
  ok(PERMITS_INSPECTIONS_WRITE.every(t => t.action === 'create' || t.action === 'edit'), 'no tool here asks for delete')
  ok(all.every(t => !/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name)), 'no tool is named for a forbidden act')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok(all.every(t => keys.has(t.resource)), 'every tool names a real permission resource')
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'THE AREA FILE WRITES NOTHING ITSELF - every write goes through lib/writes')
  ok(!/analyze|scan/i.test(PERMITS_INSPECTIONS_WRITE.map(t => t.name).join(' ')), 'the permit and card scans (a model call and a file) are not tools')
  const coTool = PERMITS_INSPECTIONS_WRITE.find(t => t.name === 'update_change_order')!
  ok(!('status' in ((coTool.inputSchema as any).properties ?? {})), 'update_change_order does not even OFFER a status')
  const inspTool = PERMITS_INSPECTIONS_WRITE.find(t => t.name === 'update_inspection')!
  ok(!((inspTool.inputSchema as any).properties.status.enum as string[]).includes('void'), 'update_inspection cannot void by status')

  // ── each tool's lib function is the one the route calls ───────────────────
  const pairs: [string, string, string][] = [
    ['createPermit', 'app/api/projects/[id]/permits/route.ts', 'create_permit'],
    ['updatePermit', 'app/api/projects/[id]/permits/[permitId]/route.ts', 'update_permit'],
    ['updateInspection', 'app/api/projects/[id]/inspections/[inspectionId]/route.ts', 'update_inspection / mark_inspection_ready'],
    ['updateChangeOrder', 'app/api/projects/[id]/change-orders/[coId]/route.ts', 'update_change_order'],
    ['addRequiredInspections', 'app/api/projects/[id]/required-inspections/route.ts', 'add_required_inspections'],
  ]
  for (const [fn, route, tool] of pairs) {
    ok(new RegExp(`await ${fn}\\(`).test(code(route)), `${route} calls ${fn}`)
    ok(new RegExp(`await ${fn}\\(`).test(area), `...and so does ${tool}`)
  }

  // ── every handler on every route in the area is gated ─────────────────────
  const routes: [string, Record<string, RegExp>, string[]][] = [
    ['app/api/projects/[id]/permits/route.ts', { GET: /'permits', 'view'/, POST: /'permits', 'edit'/ }, ['POST']],
    ['app/api/projects/[id]/permits/[permitId]/route.ts', { PATCH: /'permits', 'edit'/, DELETE: /'permits', 'edit'/ }, ['PATCH', 'DELETE']],
    ['app/api/projects/[id]/inspections/route.ts', { GET: /'inspections', 'view'/, POST: /'inspections', 'edit'/ }, []],
    ['app/api/projects/[id]/inspections/[inspectionId]/route.ts', {
      PATCH: /readyOnly \? 'mark-ready' : 'inspections', 'edit'/, DELETE: /'inspections', 'edit'/, POST: /'inspections', 'edit'/,
    }, []],
    ['app/api/projects/[id]/change-orders/route.ts', { GET: /'change-orders', 'view'/, POST: /'change-orders', 'edit'/ }, ['POST']],
    ['app/api/projects/[id]/change-orders/[coId]/route.ts', { PATCH: /'change-orders', 'edit'/, DELETE: /'change-orders', 'edit'/ }, ['PATCH', 'DELETE']],
    ['app/api/projects/[id]/required-inspections/route.ts', {
      GET: /'inspections', 'view'/, POST: /'inspections', 'edit'/, DELETE: /'inspections', 'edit'/,
    }, ['POST', 'DELETE']],
  ]
  for (const [file, gates, owned] of routes) {
    const src = code(file)
    const handlers = Array.from(src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)).map(m => m[1])
    ok(handlers.length === Object.keys(gates).length && handlers.every(h => h in gates), `${file}: every handler is listed here (${handlers.join(', ')})`)
    for (const h of handlers) {
      const start = src.indexOf(`export async function ${h}`)
      const next = src.slice(start + 10).search(/export async function /)
      const body = next < 0 ? src.slice(start) : src.slice(start, start + 10 + next)
      ok(/requirePermission\(/.test(body) && !!gates[h] && gates[h].test(body), `${file} ${h} is gated on the right permission`)
      ok(!/auth\.getUser\(token\)[\s\S]*requirePermission\(/.test(body), `${file} ${h}: the gate comes before anything else`)
      if (owned.includes(h)) {
        ok(/ownedProject\(/.test(body), `${file} ${h} checks the job is the company's OWN - a sub's admin holds this permission too`)
      }
    }
  }

  // ── behaviour, through the dispatcher ─────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_permit', { project_id: 'p1', permit_type: 'Building', permit_number: 'B-22' }, READ)
    ok('error' in r && !written(calls, 'permits', 'insert').length, 'a READ-ONLY connection cannot add a permit')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_permit', {
      project_id: 'p1', permit_type: 'Building', permit_number: 'B-22', issuing_authority: 'Lakewood Township',
      file_url: 'https://evil', project_id_to: 'p2',
    } as any, WRITE)
    const ins = written(calls, 'permits', 'insert')[0]
    ok('data' in r && ins?.permit_type === 'Building' && ins?.status === 'pending' && ins?.project_id === 'p1', 'a permit is added to the job, pending')
    ok(ins && ins.file_url === null, '...and never with a file Claude named')
    ok(written(calls, 'project_activity', 'insert')[0]?.actor_name === 'Dana Reyes via Claude', '...credited "Dana via Claude" in Job History')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_permit', { project_id: 'p1', permit_type: 'Building' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'insert').length, 'A BLANK PERMIT is refused by the app\'s own permitProblem')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_permit', { project_id: 'p1', permit_type: 'Building', description: 'Main', status: 'approved' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'insert').length, '...and so is an "approved" permit with no number or issued date')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_permit', { project_id: 'elsewhere', permit_type: 'Building', permit_number: 'X' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'insert').length, 'a permit on another company\'s job is refused')
  }
  {
    const { db: d, calls } = db({ onJobIds: [] })
    const r: any = await callTool(d, actor(), 'update_permit', { project_id: 'p1', permit_id: 'pm-elsewhere', notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'update').length, 'A PERMIT ON ANOTHER JOB is refused before anything is written')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_permit', { project_id: 'p1', permit_id: 'pm1', permit_number: '' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'update').length, 'editing a permit down to blank is refused - the rule is asked of the row AS IT WILL BE')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_permit', { project_id: 'p1', permit_id: 'pm1', notes: 'Card posted', file_url: 'x' } as any, WRITE)
    const upd = written(calls, 'permits', 'update')[0]
    ok('data' in r && upd?.notes === 'Card posted' && !('file_url' in (upd ?? {})), 'a permit edit changes the notes and never the file')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('permits', { view: true }), 'update_permit', { project_id: 'p1', permit_id: 'pm1', notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'permits', 'update').length, 'permits view-only cannot edit one')
  }

  // ── inspections ───────────────────────────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i1', status: 'scheduled', scheduled_date: '2026-10-20' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length,
      'A BOOKING WITH NOBODY SPOKEN TO is refused - the route\'s own scheduleProblem, inside updateInspection')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', {
      project_id: 'p1', inspection_id: 'i1', status: 'scheduled', scheduled_date: '2026-10-20', booked_with: 'Lakewood building dept, Pat',
    }, WRITE)
    const upd = written(calls, 'inspections', 'update')[0]
    ok('data' in r && upd?.status === 'scheduled' && upd?.booked_with === 'Lakewood building dept, Pat' && !!upd?.booked_at,
      'a booking with who confirmed it is written, and booked_at is stamped by the app')
    ok(upd?.booked_by_name === 'Dana Reyes via Claude', '...credited "via Claude"')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i1', status: 'requested' }, WRITE)
    const upd = written(calls, 'inspections', 'update')[0]
    ok(upd && upd.scheduled_date === null && upd.booked_with === null && upd.booked_at === null,
      'MOVING BACK TO REQUESTED CLEARS THE BOOKING, or the false appointment stays in everyone\'s calendar')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i1', status: 'failed' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length, 'a failure with no reason is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i1', status: 'void' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length, 'void is not a status Claude can set')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_inspection', {
      project_id: 'p1', inspection_id: 'i1', notes: 'Gate code 1234',
      scheduler_profile_id: 'u9', booked_at: '2020-01-01', ready_marked_by: 'Someone',
    } as any, WRITE)
    const upd = written(calls, 'inspections', 'update')[0]
    ok(upd?.notes === 'Gate code 1234' && !('scheduler_profile_id' in upd) && !('booked_at' in upd) && !('ready_marked_by' in upd),
      'an inspection edit never reassigns the scheduler, back-dates a booking, or marks work ready')
  }
  {
    const { db: d, calls } = db({ onJobIds: [] })
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i-elsewhere', notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length, 'AN INSPECTION ON ANOTHER JOB is refused before anything is written')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'v1', notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length, 'a VOIDED inspection is not edited behind the void')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_inspection', { project_id: 'p1', inspection_id: 'i1' }, WRITE)
    ok('error' in r && !written(calls, 'inspections', 'update').length, 'an edit with nothing to change is refused')
  }
  {
    const fieldOnly = narrowed('inspections', {})
    fieldOnly.permissions = { ...fieldOnly.permissions, 'mark-ready': { view: true, edit: true } as any }
    const { db: d, calls } = db()
    const r: any = await callTool(d, fieldOnly, 'mark_inspection_ready', { project_id: 'p1', inspection_id: 'i1', ready: true }, WRITE)
    const upd = written(calls, 'inspections', 'update')[0]
    ok('data' in r && upd?.ready_marked_by === 'Dana Reyes via Claude' && !!upd?.ready_marked_at && Object.keys(upd).length === 2,
      'mark-ready alone is enough to say the work is ready - and only the two ready fields are written')
    const { db: d2, calls: c2 } = db()
    const r2: any = await callTool(d2, fieldOnly, 'update_inspection', { project_id: 'p1', inspection_id: 'i1', notes: 'x' }, WRITE)
    ok('error' in r2 && !written(c2, 'inspections', 'update').length, '...but not to run the inspection')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'mark_inspection_ready', { project_id: 'p1', inspection_id: 'i1', ready: false }, WRITE)
    const upd = written(calls, 'inspections', 'update')[0]
    ok(upd && upd.ready_marked_by === null && upd.ready_marked_at === null, 'taking "ready" back clears both fields')
  }

  // ── change orders ─────────────────────────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_change_order', {
      project_id: 'p1', change_order_id: 'co1', review_notes: 'Owner OK by phone', status: 'approved', amount: 99999,
    } as any, WRITE)
    const upd = written(calls, 'change_orders', 'update')[0]
    ok('data' in r && upd?.review_notes === 'Owner OK by phone' && !('status' in (upd ?? {})) && !('amount' in (upd ?? {})),
      'APPROVAL IS A PERSON\'S: a change-order edit carrying status writes the notes and not the status')
    ok(!written(calls, 'subcontracts', 'update').length, '...so the subcontract\'s contract amount is never moved by Claude')
    ok(r.data?.amount === 1500, '...and the amount reads back as a number, not "1500.00"')
  }
  {
    const { db: d, calls } = db({ onJobIds: ['co1'] })
    const r: any = await callTool(d, actor(), 'update_change_order', { project_id: 'p1', change_order_id: 'co1', budget_line_item_id: 'line-elsewhere' }, WRITE)
    ok('error' in r && !written(calls, 'change_orders', 'update').length, 'a budget line from another job is refused - by updateChangeOrder, so the route refuses it too')
  }
  {
    const { db: d, calls } = db({ onJobIds: [] })
    const r: any = await callTool(d, actor(), 'update_change_order', { project_id: 'p1', change_order_id: 'co-elsewhere', review_notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'change_orders', 'update').length, 'A CHANGE ORDER ON ANOTHER JOB is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_change_order', { project_id: 'p1', change_order_id: 'co1', status: 'approved' } as any, WRITE)
    ok('error' in r && !written(calls, 'change_orders', 'update').length, 'a call that ONLY asks to approve is refused as nothing to change')
  }

  // ── the required list ─────────────────────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_required_inspections', { project_id: 'p1', types: ['Footing', 'Septic'] }, WRITE)
    const rows = written(calls, 'project_required_inspections', 'insert')[0] as any[]
    ok('data' in r && Array.isArray(rows) && rows.length === 1 && rows[0].type === 'Septic' && rows[0].source === 'manual',
      'a type already on the list is skipped, a new one is added as manual')
    ok(!written(calls, 'inspections', 'insert').length, '...and nothing is REQUESTED - no inspection row, nobody told')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('inspections', { view: true }), 'add_required_inspections', { project_id: 'p1', types: ['Septic'] }, WRITE)
    ok('error' in r && !written(calls, 'project_required_inspections', 'insert').length, 'inspections view-only cannot change the plan')
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  for (const [tool, table] of [['list_permits', 'permits'], ['list_change_orders', 'change_orders'], ['list_required_inspections', 'project_required_inspections']] as const) {
    const { db: d } = db({ extra: t => t === table ? { error: { message: 'boom' } } : undefined })
    const r: any = await callTool(d, actor(), tool, { project_id: 'p1' }, READ)
    ok('error' in r, `${tool}: A FAILED READ IS AN ERROR, never "there are none"`)
  }
  {
    const { db: d } = db({ extra: t => t === 'change_orders' ? { data: [{ id: 'co1', project_id: 'p1', title: 'X', amount: '80.00', status: 'approved' }] } : undefined })
    const r: any = await callTool(d, actor(), 'list_change_orders', {}, READ)
    ok('data' in r && r.data.change_orders[0]?.amount === 80, 'a numeric amount is read as a number')
  }
  {
    const { db: d } = db()
    const r: any = await callTool(d, narrowed('change-orders', {}), 'list_change_orders', {}, READ)
    ok('error' in r, 'no change-orders view, no list')
  }

  done()
}

main()
