// Claude reading and editing client selections - the selections area of the
// MCP server - and the permission that area needed before it could have one.
//
// What must hold:
//   - `selections` is a real permission now. Every built-in role names it, and
//     each starts exactly where `budget` (which the tab used to borrow) left
//     it, so nobody who could open the screen loses it. A company role map
//     saved before the key existed inherits it from `budget`.
//   - Every handler under /api/projects/[id]/selections asks it, plus the
//     job-ownership question - they used to ask only "is somebody signed in".
//   - The tools add and edit only, through lib/writes/selection.ts, the same
//     code the routes run. An edit passes an allow-list: no change order from
//     an overage, no supplier id, no hand-set "ordered" (that books a cost).

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { SELECTIONS_READ, SELECTIONS_WRITE } from '../mcp/areas/selections'
import { RESOURCES, ROLE_DEFAULTS, getEffectivePermissions, getRoleDefaults, resolveRoleBase, can } from '../permissions'
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
const has = (ops: Op[], method: string) => ops.some(([m]) => m === method)
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any
const eqVal = (ops: Op[], key: string) => ops.find(([m, k]) => m === 'eq' && k === key)?.[2]
const written = (calls: Call[], table: string, method: 'insert' | 'update' | 'delete') =>
  calls.filter(c => c.table === table && has(c.ops, method)).map(c => opArg(c.ops, method))

const actor = (role = 'admin'): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})
/** A tool's answer, read loosely - the suite asserts on `error` and `data` either way. */
const call = (...a: Parameters<typeof callTool>): Promise<any> => callTool(...a)
const WRITE = { canWrite: true, tokenId: 'tok1' }
const READ_ONLY = { canWrite: false, tokenId: 'tok1' }

interface Sel { id: string; project_id: string; status: string; selected_name?: string | null; budget_line_item_id?: string | null }

function world(opts: { sels?: Sel[]; failList?: boolean } = {}) {
  const sels: Sel[] = opts.sels ?? [
    { id: 's1', project_id: 'p1', status: 'waiting', selected_name: null, budget_line_item_id: null },
    { id: 's2', project_id: 'p2', status: 'pending' },
  ]
  const options = [{ id: 'o1', selection_id: 's1', name: 'Alabaster', price: '2650.00' }, { id: 'o9', selection_id: 's2', name: 'Elsewhere', price: '1' }]
  return fakeDb((t, ops) => {
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'mcp_actions') return { data: null }
    if (t === 'company_billing') return { data: null }
    if (t === 'projects') return { data: [{ id: 'p1', name: 'Maple Street Duplex' }] }
    if (t === 'budget_line_items') {
      const id = eqVal(ops, 'id')
      return { data: id === 'b1' && eqVal(ops, 'project_id') === 'p1' ? { id } : null }
    }
    if (t === 'project_selections') {
      if (has(ops, 'insert')) return { data: { id: 'sNew', ...opArg(ops, 'insert') } }
      if (has(ops, 'update')) {
        const s = sels.find(x => x.id === eqVal(ops, 'id'))
        return { data: { ...s, item: 'Tile', category: 'Flooring', ...opArg(ops, 'update') } }
      }
      const id = eqVal(ops, 'id')
      if (id !== undefined) {
        const s = sels.find(x => x.id === id && (eqVal(ops, 'project_id') === undefined || x.project_id === eqVal(ops, 'project_id')))
        return { data: s ? { item: 'Tile', category: 'Flooring', ...s } : null }
      }
      if (opts.failList) return { error: { message: 'relation exploded' } }
      return {
        data: [{
          id: 's1', project_id: 'p1', category: 'Flooring', item: 'Primary bath tile', status: 'chosen',
          allowance_amount: '2400.00', selected_price: '2650.00', selected_name: 'Alabaster', selected_option_id: 'o1',
          selection_options: [{ id: 'o1', name: 'Alabaster', price: '2650.00', sort_order: 10 }],
        }],
      }
    }
    if (t === 'selection_options') {
      if (has(ops, 'insert')) return { data: { id: 'oNew', selection_id: 's1', ...opArg(ops, 'insert') } }
      const id = eqVal(ops, 'id')
      if (id !== undefined) return { data: options.find(o => o.id === id && o.selection_id === eqVal(ops, 'selection_id')) ?? null }
      return { data: null }
    }
    if (t === 'material_purchases' && has(ops, 'insert')) return { data: { id: 'mp1' } }
    if (t === 'change_orders' && has(ops, 'insert')) return { data: { id: 'co1' } }
    return { data: [] }
  })
}

const ROUTES = [
  'app/api/projects/[id]/selections/route.ts',
  'app/api/projects/[id]/selections/[selId]/route.ts',
  'app/api/projects/[id]/selections/[selId]/options/route.ts',
  'app/api/projects/[id]/selections/[selId]/options/upload/route.ts',
  'app/api/projects/[id]/selections/[selId]/order/route.ts',
  'app/api/projects/[id]/selections/link-budget/route.ts',
]
const handlers = (src: string) => {
  const out: [string, string][] = []
  const re = /export async function (GET|POST|PATCH|PUT|DELETE)\b/g
  let m: RegExpExecArray | null
  const starts: [string, number][] = []
  while ((m = re.exec(src))) starts.push([m[1], m.index])
  starts.forEach(([verb, at], i) => out.push([verb, src.slice(at, starts[i + 1]?.[1] ?? src.length)]))
  return out
}

async function main() {
  // ── the permission ────────────────────────────────────────────────────────
  const def = RESOURCES.find(r => r.key === 'selections')
  ok(!!def && def.label === 'Selections' && def.group === 'Finance' && def.slug === 'selections',
    'selections is a resource: Selections, under Finance, the tab at /selections')
  for (const role of Object.keys(ROLE_DEFAULTS)) {
    ok('selections' in ROLE_DEFAULTS[role], `${role} names selections EXPLICITLY - a resource a role never names resolves to "no"`)
    ok(can(ROLE_DEFAULTS[role], 'selections', 'view') === can(ROLE_DEFAULTS[role], 'budget', 'view'),
      `${role}: can open Selections exactly when it could before (the tab borrowed budget: view)`)
  }
  ok(!can(ROLE_DEFAULTS.read_only, 'selections', 'view'), 'an invited sub (read_only) cannot see the client\'s selections')
  ok(can(ROLE_DEFAULTS.project_manager, 'selections', 'delete') && can(ROLE_DEFAULTS.office_staff, 'selections', 'delete'),
    'PM and office staff keep the delete the screen gives them today')
  // A company that saved its own Project Manager map before the key existed.
  const stored = { project_manager: { budget: { view: true, create: true, edit: true, delete: true } } }
  ok(can(resolveRoleBase('project_manager', stored as any), 'selections', 'edit'),
    'a stored role map with no selections key inherits it from budget, so that company loses nothing')
  const storedNo = { custom_x: { budget: {} } }
  ok(!can(resolveRoleBase('custom_x', storedNo as any), 'selections', 'view'), '...and inherits a "no" just as faithfully')
  const storedSaid = { project_manager: { budget: { view: true }, selections: {} } }
  ok(!can(resolveRoleBase('project_manager', storedSaid as any), 'selections', 'view'), '...but never overrides a map that says selections itself')
  ok(!/selections: 'budget'/.test(code('components/layout/project-tabs.tsx')),
    'the tab asks selections, not budget - the tab and its routes ask one question')

  // ── the routes ────────────────────────────────────────────────────────────
  for (const f of ROUTES) {
    const src = code(f)
    ok(!/auth\.getUser\(/.test(src), `${f}: no handler is gated on sign-in alone any more`)
    ok(/requirePermission\(db, request, 'selections', /.test(src) && /ownedProject\(db, g(ate)?\.actor, (params\.id|projectId), 'id'\)/.test(src),
      `${f}: asks the selections permission and that the job is the caller's company's`)
    for (const [verb, body] of handlers(src)) {
      ok(/requirePermission\(|await gate\(request, params\.id, '(view|create|edit|delete)'\)/.test(body), `${f} ${verb} is gated`)
    }
  }
  const main_ = code(ROUTES[0]); const one = code(ROUTES[1]); const opts = code(ROUTES[2])
  ok(/gate\(request, params\.id, 'view'\)/.test(handlers(main_).find(h => h[0] === 'GET')![1]), 'reading the board is selections: view')
  ok(/gate\(request, params\.id, 'create'\)/.test(handlers(main_).find(h => h[0] === 'POST')![1]), 'adding or seeding is selections: create')
  ok(/gate\(request, params\.id, 'edit'\)/.test(handlers(one).find(h => h[0] === 'PATCH')![1]), 'editing is selections: edit')
  ok(/gate\(request, params\.id, 'delete'\)/.test(handlers(one).find(h => h[0] === 'DELETE')![1]), 'deleting is selections: delete')
  ok(/create_change_order && !actorCan\(actor, 'change-orders', 'create'\)/.test(one),
    'an overage turned into a change order also needs change-orders: create')
  ok(/actorCan\(actor, 'client-portal', 'view'\) \? project\?\.client_portal_token/.test(main_),
    'the GET hands out the client portal token only to someone allowed to see it')
  ok(/selectionOnJob\(/.test(code('lib/writes/selection.ts')) && /selectionOnJob\(db, params\.id, params\.selId\)/.test(opts)
    && /selectionOnJob\(db, params\.id, params\.selId\)/.test(code(ROUTES[3])),
    'an option is only added, deleted or uploaded onto a selection ON this job')
  ok(!/selections/.test(code('app/api/portal/[token]/selections/route.ts').match(/requirePermission[^\n]*/)?.[0] ?? ''),
    'the client portal route is untouched - the client has no account to ask')

  // ── the tools ─────────────────────────────────────────────────────────────
  const keys = new Set(RESOURCES.map(r => r.key))
  for (const n of ['list_selections']) ok(SELECTIONS_READ.some(t => t.name === n) && ALL_TOOLS.some(t => t.name === n && !('write' in t)), `${n} is a read tool`)
  for (const n of ['add_selection', 'add_selection_option', 'update_selection', 'mark_selection_ordered']) {
    ok(SELECTIONS_WRITE.some(t => t.name === n) && ALL_TOOLS.some(t => t.name === n && 'write' in t), `${n} is a write tool the server offers`)
  }
  for (const t of [...SELECTIONS_READ, ...SELECTIONS_WRITE]) ok(keys.has(t.resource), `${t.name} names a real resource (${t.resource})`)
  for (const t of SELECTIONS_WRITE) {
    ok(t.action === 'create' || t.action === 'edit', `${t.name} creates or edits - never deletes`)
    ok(!/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name), `${t.name} is not named for a forbidden act`)
  }
  const area = code('lib/mcp/areas/selections.ts')
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'the area file writes nothing itself - every write is lib/writes')
  const libFor: Record<string, [string, string]> = {
    createSelection: [ROUTES[0], 'add_selection'], updateSelection: [ROUTES[1], 'update_selection'],
    createSelectionOption: [ROUTES[2], 'add_selection_option'], orderSelection: [ROUTES[4], 'mark_selection_ordered'],
  }
  for (const [fn, [route, tool]] of Object.entries(libFor)) {
    ok(new RegExp(`await ${fn}\\(`).test(code(route)) && new RegExp(`await ${fn}\\(`).test(area), `${tool} and ${route.split('/selections')[1] || '/'} run the same ${fn}`)
  }

  // read-only connection
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'add_selection', { project_id: 'p1', item: 'Tile' }, READ_ONLY)
    ok(!!r.error && !written(calls, 'project_selections', 'insert').length, 'a read-only connection cannot add a selection')
  }
  // a person without the permission. (Assigned-only roles - the sub among them -
  // are refused before the permission is even asked; an office role with the
  // permission switched off is the case that reaches it.)
  {
    const noSel: ActorPerms = { ...actor('office_staff'), permissions: getEffectivePermissions('office_staff', { selections: { view: false, create: false, edit: false } }, getRoleDefaults('office_staff')) }
    const { db, calls } = world()
    const r = await call(db, noSel, 'update_selection', { project_id: 'p1', selection_id: 's1', notes: 'x' }, WRITE)
    ok(/permission to edit selections/.test(r.error ?? '') && !written(calls, 'project_selections', 'update').length,
      'somebody with selections switched off cannot edit one through Claude')
    const rr = await call(world().db, noSel, 'list_selections', { project_id: 'p1' })
    ok(/permission to view selections/.test(rr.error ?? ''), '...nor read the board')
    const sub = await call(world().db, actor('read_only'), 'list_selections', { project_id: 'p1' })
    ok(!!sub.error && !sub.data, '...and an invited sub gets nothing')
  }
  // add
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'add_selection', { project_id: 'p1', item: 'Primary bath tile', allowance_amount: 2400, budget_line_item_id: 'b1' }, WRITE)
    const ins = written(calls, 'project_selections', 'insert')[0]
    ok(!r.error && ins?.status === 'pending' && ins?.allowance_amount === 2400 && ins?.budget_line_item_id === 'b1',
      `add_selection writes a pending selection through the route's code (${r.error ?? 'ok'})`)
    const bad = await call(world().db, actor(), 'add_selection', { project_id: 'p1', item: 'Tile', budget_line_item_id: 'bOther' }, WRITE)
    ok(/not on this job/.test(bad.error ?? ''), 'a budget line from another job is refused')
  }
  // edit: another job, allow-list
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's2', notes: 'x' }, WRITE)
    ok(/not on this job/.test(r.error ?? '') && !written(calls, 'project_selections', 'update').length, 'a selection on another job is refused')
  }
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'update_selection', {
      project_id: 'p1', selection_id: 's1', notes: 'Client prefers matte', create_change_order: true,
      supplier_company_id: 'someone', change_requested_at: null, sort_order: 1,
    }, WRITE)
    const upd = written(calls, 'project_selections', 'update')[0] ?? {}
    ok(!r.error && upd.notes === 'Client prefers matte', `the allowed field is written (${r.error ?? 'ok'})`)
    ok(!('supplier_company_id' in upd) && !('change_requested_at' in upd) && !('sort_order' in upd),
      'fields off the allow-list are not passed through')
    ok(!written(calls, 'change_orders', 'insert').length, '...and no change order is created from an overage')
  }
  {
    const r = await call(world().db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's1' }, WRITE)
    ok(/Nothing to change/.test(r.error ?? ''), 'an empty change is refused')
    const o = await call(world().db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's1', status: 'ordered' }, WRITE)
    ok(/mark_selection_ordered/.test(o.error ?? ''), 'ordered is not set by hand - that is the step that books the cost')
  }
  // status via the route's own rule
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's1', status: 'chosen', selected_name: 'Alabaster' }, WRITE)
    ok(/budget line/.test(r.error ?? '') && !written(calls, 'project_selections', 'update').length,
      'Chosen with no budget line is refused by the same rule the app applies')
  }
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's1', selected_option_id: 'o1', budget_line_item_id: 'b1', status: 'chosen' }, WRITE)
    const upd = written(calls, 'project_selections', 'update')[0] ?? {}
    ok(!r.error && upd.selected_name === 'Alabaster' && upd.selected_price === 2650 && upd.status === 'chosen',
      `choosing an option names and prices it, and Chosen goes through with a line (${r.error ?? 'ok'})`)
    const other = await call(world().db, actor(), 'update_selection', { project_id: 'p1', selection_id: 's1', selected_option_id: 'o9' }, WRITE)
    ok(/not on this selection/.test(other.error ?? ''), 'an option from another selection is refused')
  }
  // options
  {
    const { db, calls } = world()
    const r = await call(db, actor(), 'add_selection_option', { project_id: 'p1', selection_id: 's1', name: 'Alabaster', price: 2650, link_url: 'https://example.com/p' }, WRITE)
    const ins = written(calls, 'selection_options', 'insert')[0] ?? {}
    ok(!r.error && ins.name === 'Alabaster' && ins.price === 2650 && ins.image_url === null && ins.vendor_company_id === null,
      `add_selection_option adds one option, with no image and no Directory id (${r.error ?? 'ok'})`)
    const elsewhere = await call(world().db, actor(), 'add_selection_option', { project_id: 'p1', selection_id: 's2', name: 'x' }, WRITE)
    ok(/not on this job/.test(elsewhere.error ?? ''), 'an option for a selection on another job is refused')
  }
  // order
  {
    const { db, calls } = world({ sels: [{ id: 's1', project_id: 'p1', status: 'chosen', selected_name: 'Alabaster', budget_line_item_id: 'b1' }] })
    const r = await call(db, actor(), 'mark_selection_ordered', { project_id: 'p1', selection_id: 's1' }, WRITE)
    ok(!r.error && written(calls, 'material_purchases', 'insert').length === 1 && written(calls, 'project_selections', 'update')[0]?.status === 'ordered',
      `mark_selection_ordered books the cost and moves it to Ordered (${r.error ?? 'ok'})`)
    const { db: db2, calls: c2 } = world({ sels: [{ id: 's1', project_id: 'p1', status: 'ordered', selected_name: 'A', budget_line_item_id: 'b1' }] })
    const twice = await call(db2, actor(), 'mark_selection_ordered', { project_id: 'p1', selection_id: 's1' }, WRITE)
    ok(/already ordered/.test(twice.error ?? '') && !written(c2, 'material_purchases', 'insert').length, 'an Ordered selection is not booked twice')
  }
  // read
  {
    const r = await call(world().db, actor(), 'list_selections', { project_id: 'p1' })
    const s = (r.data as any)?.selections?.[0]
    ok(s?.allowance_amount === 2400 && s?.selected_price === 2650 && s?.over_allowance === 250 && s?.options?.[0]?.chosen === true,
      'list_selections reads NUMERIC strings as numbers and says how far over the allowance a pick is')
    const f = await call(world({ failList: true }).db, actor(), 'list_selections', { project_id: 'p1' })
    ok(!!f.error && !f.data, 'a failed read is an error, never an empty list')
  }

  done()
}

main().catch(e => { console.error(e); process.exit(1) })
