// Claude reading and adding/editing MATERIALS (receipts on a job) and
// EQUIPMENT (the company's tools), through the MCP server.
//
// What must hold:
//   - add and edit only: no delete, no scan, no "client paid", no markup, no
//     moving a receipt to another job, no office repair decisions;
//   - every write goes through the same lib/writes function the app's route
//     calls, and the area file writes nothing itself;
//   - every handler on every route in the area is gated - several used to ask
//     only "is somebody signed in" - and a receipt is checked against the
//     company's OWN jobs, because a sub's admin holds `materials: edit` too;
//   - equipment is the COMPANY's, so a write tool is scoped by company, and a
//     job named on a check-out must be one of the company's own.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { MATERIALS_EQUIPMENT_READ, MATERIALS_EQUIPMENT_WRITE } from '../mcp/areas/materials-equipment'
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
 * The company owns job p1 only. Receipts/budget lines on p1 are `onJobIds`;
 * equipment at c1 is `equipIds`; equipment `out1` has an open checkout.
 */
function db(opts: { onJobIds?: string[]; equipIds?: string[]; extra?: (t: string, ops: Op[]) => Answer | undefined } = {}) {
  const onJobIds = opts.onJobIds ?? ['m1', 'line1']
  const equipIds = opts.equipIds ?? ['e1', 'out1']
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
    if (t === 'equipment' && has(ops, 'update')) return { data: { id: eqVal(ops, 'id'), name: 'Saw', status: 'available', ...opArg(ops, 'update') } }
    if (t === 'equipment' && !has(ops, 'insert')) {
      const id = eqVal(ops, 'id')
      const owned = equipIds.includes(id as string) && eqVal(ops, 'company_id') === 'c1'
      return { data: owned ? { id, name: 'Saw', status: id === 'out1' ? 'checked_out' : 'available', repair_needed_at: null } : null }
    }
    if (t === 'equipment_assignments' && has(ops, 'is') && !has(ops, 'update')) {
      return { data: eqVal(ops, 'equipment_id') === 'out1' ? { id: 'as1', project_id: 'p1', holder_name: 'Luis' } : null }
    }
    if (has(ops, 'select', 'id') && eqVal(ops, 'project_id') !== undefined) {
      const id = eqVal(ops, 'id')
      return { data: onJobIds.includes(id as string) && eqVal(ops, 'project_id') === 'p1' ? { id } : null }
    }
    if (has(ops, 'insert')) return { data: { id: 'new1', ...opArg(ops, 'insert') } }
    if (has(ops, 'update')) return { data: { id: 'upd1', ...opArg(ops, 'update') } }
    return { data: [] }
  })
}

async function main() {
  const area = code('lib/mcp/areas/materials-equipment.ts')
  const all = [...MATERIALS_EQUIPMENT_READ, ...MATERIALS_EQUIPMENT_WRITE]

  // ── the tools are there, and add or edit only ─────────────────────────────
  for (const n of ['list_materials', 'list_equipment']) {
    ok(ALL_TOOLS.some(t => t.name === n && !('write' in t)), `${n} is a READ tool the dispatcher knows`)
  }
  for (const n of ['add_material_purchase', 'update_material_purchase', 'add_equipment', 'update_equipment',
    'check_out_equipment', 'check_in_equipment', 'flag_equipment_repair']) {
    ok(ALL_TOOLS.some(t => t.name === n && (t as any).write === true), `${n} is a WRITE tool the dispatcher knows`)
  }
  ok(MATERIALS_EQUIPMENT_WRITE.every(t => t.action === 'create' || t.action === 'edit'), 'no tool here asks for delete')
  ok(all.every(t => !/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name)), 'no tool is named for a forbidden act')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok(all.every(t => keys.has(t.resource)), 'every tool names a real permission resource')
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'THE AREA FILE WRITES NOTHING ITSELF - every write goes through lib/writes')
  ok(!/scan/i.test(MATERIALS_EQUIPMENT_WRITE.map(t => t.name).join(' ')), 'the receipt scan (a model call and an upload) is not a tool')

  // ── each tool's lib function is the one the route calls ───────────────────
  const pairs: [string, string, string][] = [
    ['createMaterialPurchase', 'app/api/materials/route.ts', 'add_material_purchase'],
    ['updateMaterialPurchase', 'app/api/materials/[id]/route.ts', 'update_material_purchase'],
    ['createEquipment', 'app/api/equipment/route.ts', 'add_equipment'],
    ['updateEquipment', 'app/api/equipment/route.ts', 'update_equipment'],
    ['checkOutEquipment', 'app/api/equipment/[id]/assignment/route.ts', 'check_out_equipment'],
    ['checkInEquipment', 'app/api/equipment/[id]/assignment/route.ts', 'check_in_equipment'],
    ['equipmentRepairMove', 'app/api/equipment/[id]/repair/route.ts', 'flag_equipment_repair'],
  ]
  for (const [fn, route, tool] of pairs) {
    const r = code(route)
    ok(new RegExp(`await ${fn}\\(`).test(r), `${route} calls ${fn}`)
    ok(new RegExp(`await ${fn}\\(`).test(area), `...and so does ${tool}`)
  }

  // ── every handler on every route in the area is gated ─────────────────────
  const routes: [string, Record<string, RegExp>][] = [
    ['app/api/materials/route.ts', { GET: /'materials', 'view'/, POST: /'materials', 'edit'/ }],
    ['app/api/materials/[id]/route.ts', { PATCH: /'materials', 'edit'/, DELETE: /'materials', 'edit'/ }],
    ['app/api/materials/scan/route.ts', { POST: /'materials', 'edit'/ }],
    ['app/api/equipment/route.ts', { GET: /'equipment', 'view'/, POST: /'equipment', 'create'/, PATCH: /'equipment', 'edit'/, DELETE: /'equipment', 'delete'/ }],
    ['app/api/equipment/[id]/assignment/route.ts', { GET: /'equipment', 'view'/, POST: /'equipment', 'create'/, PATCH: /'equipment', 'create'/ }],
    ['app/api/equipment/[id]/repair/route.ts', { POST: /'equipment', action === 'flag' \? 'create' : 'edit'/ }],
  ]
  for (const [file, gates] of routes) {
    const src = code(file)
    const handlers = Array.from(src.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)).map(m => m[1])
    ok(handlers.length === Object.keys(gates).length && handlers.every(h => h in gates), `${file}: every handler is listed here (${handlers.join(', ')})`)
    for (const h of handlers) {
      const start = src.indexOf(`export async function ${h}`)
      const next = src.slice(start + 10).search(/export async function /)
      const body = next < 0 ? src.slice(start) : src.slice(start, start + 10 + next)
      ok(/requirePermission\(/.test(body) && !!gates[h] && gates[h].test(body), `${file} ${h} is gated on the right permission`)
    }
  }
  const matCreate = code('app/api/materials/route.ts')
  ok(/ownedProject\(db, actor, String\(body\.project_id\)/.test(matCreate), 'a receipt is only added to one of the company\'s OWN jobs')
  const matEdit = code('app/api/materials/[id]/route.ts')
  ok((matEdit.match(/ownedReceipt\(db, gate\.actor, params\.id\)/g) ?? []).length === 2, 'editing or deleting a receipt checks it sits on one of the company\'s own jobs')
  ok(/body\.project_id !== found\.projectId[\s\S]{0,120}ownedProject\(/.test(matEdit), '...and moving it checks the job it moves to')
  ok(/ownsProject\(companyId/.test(code('lib/writes/equipment-assignment.ts')), 'a check-out onto a job checks the job is the company\'s, at both doors')

  // ── behaviour, through the dispatcher ─────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_material_purchase', { project_id: 'p1', store_name: 'Home Depot', amount: 412.8 }, READ)
    ok('error' in r && !written(calls, 'material_purchases', 'insert').length, 'a READ-ONLY connection cannot add a receipt')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_equipment', { name: 'Saw' }, READ)
    ok('error' in r && !written(calls, 'equipment', 'insert').length, '...or a piece of equipment')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('materials', { view: true, create: true }), 'add_material_purchase', { project_id: 'p1', store_name: 'Home Depot', amount: 10 }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'insert').length, 'materials view+create without edit is refused, exactly as the route refuses it')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_material_purchase', {
      project_id: 'p1', store_name: 'Home Depot', amount: 412.8, tax: 27.1, purchase_date: '2026-10-12', category: 'Lumber',
      client_paid: true, markup_pct: 0, receipt_url: 'https://evil', save_store: true,
    } as any, WRITE)
    const ins = written(calls, 'material_purchases', 'insert')[0]
    ok('data' in r && ins?.amount === 412.8 && ins?.tax === 27.1 && ins?.project_id === 'p1', 'a receipt is added to the job with its amount and tax')
    ok(ins && ins.client_paid === false && !ins.receipt_url && !('markup_pct' in ins), '...and never as "client paid", with an image, or with markup')
    ok(!written(calls, 'companies', 'insert').length, '...and never adds the store to the Directory')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_material_purchase', { project_id: 'elsewhere', store_name: 'X', amount: 1 }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'insert').length, 'a receipt on another company\'s job is refused')
  }
  {
    const { db: d, calls } = db({ onJobIds: ['m1'] })
    const r: any = await callTool(d, actor(), 'add_material_purchase', { project_id: 'p1', store_name: 'X', amount: 1, budget_line_id: 'line-elsewhere' }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'insert').length, 'a budget line from another job is refused')
  }
  {
    const { db: d, calls } = db({ onJobIds: [] })
    const r: any = await callTool(d, actor(), 'update_material_purchase', { project_id: 'p1', material_id: 'm-elsewhere', notes: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'update').length, 'A RECEIPT ON ANOTHER JOB is refused before anything is written')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_material_purchase', {
      project_id: 'p1', material_id: 'm1', amount: 500, client_paid: true, markup_pct: 0, markup_excluded: true, project_id_to: 'p2',
    } as any, WRITE)
    const upd = written(calls, 'material_purchases', 'update')[0]
    ok(upd?.amount === 500 && !('client_paid' in (upd ?? {})) && !('markup_pct' in (upd ?? {})) && !('markup_excluded' in (upd ?? {})),
      'AN EDIT CHANGES THE AMOUNT AND NOT WHAT THE CLIENT IS BILLED: client_paid and markup are not passed through')
    ok(!('project_id' in (upd ?? {})), '...and never moves the receipt to another job')
    const call = calls.find(c => c.table === 'material_purchases' && has(c.ops, 'update'))
    ok(!!call && eqVal(call.ops, 'project_id') === 'p1', '...and the write itself is scoped to the job')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_material_purchase', { project_id: 'p1', material_id: 'm1' }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'update').length, 'an edit with nothing to change is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_material_purchase', { project_id: 'p1', material_id: 'm1', amount: -5 }, WRITE)
    ok('error' in r && !written(calls, 'material_purchases', 'update').length, 'a negative amount is refused - the route would store it')
  }

  // ── equipment ─────────────────────────────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'add_equipment', { name: 'Table saw', serial_number: 'SN1', status: 'retired', company_id: 'c2' } as any, WRITE)
    const ins = written(calls, 'equipment', 'insert')[0]
    ok('data' in r && ins?.company_id === 'c1' && ins?.status === 'available', 'equipment is added to the ACTOR\'s company, Available - never a company or status from the arguments')
  }
  {
    const { db: d, calls } = db({ equipIds: [] })
    const r: any = await callTool(d, actor(), 'update_equipment', { equipment_id: 'e-other', name: 'Mine now' }, WRITE)
    ok('error' in r && !written(calls, 'equipment', 'update').length, 'ANOTHER COMPANY\'S EQUIPMENT is refused before anything is written')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_equipment', { equipment_id: 'e1', notes: 'New blade', status: 'retired', repair_needed_at: null } as any, WRITE)
    const upd = written(calls, 'equipment', 'update')[0]
    ok(upd?.notes === 'New blade' && !('status' in (upd ?? {})) && !('repair_needed_at' in (upd ?? {})), 'a details edit never moves its status or clears a repair report')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'check_out_equipment', { equipment_id: 'e1', holder_name: 'Luis', project_id: 'p-other' }, WRITE)
    ok('error' in r && !written(calls, 'equipment_assignments', 'insert').length, 'checking out onto ANOTHER COMPANY\'S JOB is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'check_out_equipment', { equipment_id: 'e1', holder_name: 'Luis', project_id: 'p1' }, WRITE)
    const ins = written(calls, 'equipment_assignments', 'insert')[0]
    ok('data' in r && ins?.holder_name === 'Luis' && ins?.project_id === 'p1' && ins?.company_id === 'c1', 'a check-out onto our own job is written')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'check_out_equipment', { equipment_id: 'out1', holder_name: 'Luis' }, WRITE)
    ok('error' in r && !written(calls, 'equipment_assignments', 'insert').length, 'something already out is not checked out twice - the app\'s own rule')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'check_in_equipment', { equipment_id: 'out1', condition: 'needs_repair' }, WRITE)
    ok('error' in r && !written(calls, 'equipment', 'update').length, 'a "needs repair" return without saying what is wrong is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'check_in_equipment', { equipment_id: 'out1', condition: 'needs_repair', note: 'cord nicked' }, WRITE)
    const upd = written(calls, 'equipment', 'update')[0]
    ok('data' in r && upd?.status === 'available' && !!upd?.repair_needed_at, 'a bad return goes back on the shelf with the flag on it')
    const ev = written(calls, 'equipment_events', 'insert')[0]
    ok(ev?.actor_name === 'Dana Reyes via Claude', '...credited "Dana via Claude" in the history')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('equipment', { view: true, create: true }), 'flag_equipment_repair', { equipment_id: 'out1', note: 'blade bent' }, WRITE)
    const upd = written(calls, 'equipment', 'update')[0]
    ok('data' in r && !!upd?.repair_needed_at && !('status' in upd), 'equipment `create` (no edit) can REPORT a tool broken, and the report does not move it')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('equipment', { view: true }), 'flag_equipment_repair', { equipment_id: 'e1', note: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'equipment', 'update').length, 'equipment view-only cannot')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, narrowed('equipment', { view: true, create: true }), 'update_equipment', { equipment_id: 'e1', name: 'x' }, WRITE)
    ok('error' in r && !written(calls, 'equipment', 'update').length, 'editing details needs equipment `edit`, as the route now asks')
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  {
    const { db: d } = db({ extra: t => t === 'material_purchases' ? { error: { message: 'boom' } } : undefined })
    const r: any = await callTool(d, actor(), 'list_materials', { project_id: 'p1' }, READ)
    ok('error' in r, 'A FAILED READ IS AN ERROR, never "there are no receipts"')
  }
  {
    const { db: d } = db({ extra: t => t === 'equipment' ? { error: { message: 'boom' } } : undefined })
    const r: any = await callTool(d, actor(), 'list_equipment', {}, READ)
    ok('error' in r, '...and the same for equipment')
  }
  {
    const { db: d, calls } = db({ extra: t => t === 'equipment' ? { data: [{ id: 'e1', name: 'Saw', status: 'maintenance' }] } : undefined })
    const r: any = await callTool(d, actor(), 'list_equipment', {}, READ)
    const q = calls.find(c => c.table === 'equipment')
    ok('data' in r && r.data.equipment[0]?.status === 'In for repair', 'equipment status is read in words')
    ok(!!q && eqVal(q.ops, 'company_id') === 'c1', '...and only the actor\'s company\'s equipment is read')
  }

  done()
}

main()
