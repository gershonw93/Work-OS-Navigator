// Claude reading and writing RFIs and submittals - the rfis-submittals area of
// the MCP server.
//
// What must hold, beyond the rules every write tool follows (mcp-write.ts):
//   - Claude asks an RFI, edits or answers one, and records a submittal review.
//     It never deletes, never sends the answer link (that goes to an architect
//     outside the company), never decides the change order riding on an RFI,
//     and never adds a submittal - a submittal IS its uploaded document.
//   - An RFI Claude files is the GC's own: no sub's company is ever put on it.
//   - A record an edit names must be on the job the dispatcher checked.
//   - The list never hands Claude `answer_token` (the outsider's answer link)
//     or a submittal's ten-year signed file URL.
//   - Every handler in every route file of the area is gated. The RFI routes
//     already asked which side of the job the caller is on (a SUB legitimately
//     asks RFIs on a job it does not own - lib/rfi-access.ts); the submittal
//     routes only asked "signed in", and now ask the permission AND that the
//     job is the caller's company's own - only the GC's tab calls them.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { RFIS_SUBMITTALS_READ, RFIS_SUBMITTALS_WRITE } from '../mcp/areas/rfis-submittals'
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
const written = (calls: Call[], table: string, method: 'insert' | 'update' | 'delete') =>
  calls.filter(c => c.table === table && has(c.ops, method)).map(c => opArg(c.ops, method))

const actor = (role = 'admin'): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})
const WRITE = { canWrite: true, tokenId: 'tok1' }
const READ = { canWrite: false, tokenId: 'tok1' }

function db(extra: (t: string, ops: Op[]) => Answer | undefined = () => undefined, onJobIds: string[] = ['rfi1', 'sm1']) {
  return fakeDb((t, ops) => {
    const e = extra(t, ops); if (e) return e
    // gc_company_id null: no notification audience to resolve in a unit test.
    if (t === 'projects') return { data: [{ id: 'p1', name: 'Maple Street Duplex', gc_company_id: null }] }
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', company_id: 'c1', role: 'admin' } }
    if (has(ops, 'select', 'id') && ops.some(([m, k]) => m === 'eq' && k === 'project_id')) {
      const id = ops.find(([m, k]) => m === 'eq' && k === 'id')?.[2]
      return { data: onJobIds.includes(id as string) ? { id } : null }
    }
    if (t === 'rfis' && has(ops, 'select', '*') && ops.some(([m, , o]) => m === 'select' && (o as any)?.head)) return { count: 4 }
    if (has(ops, 'insert')) return { data: { id: 'new1', ...opArg(ops, 'insert') } }
    if (has(ops, 'update')) return { data: { id: 'upd1', rfi_number: 2, title: 'TPO', ...opArg(ops, 'update') } }
    return { data: [] }
  })
}

async function main() {
  // ── the tools are there, and add or edit only ─────────────────────────────
  const reads = RFIS_SUBMITTALS_READ.map(t => t.name)
  const writes = RFIS_SUBMITTALS_WRITE.map(t => t.name)
  for (const n of ['list_rfis', 'list_submittals']) ok(reads.includes(n) && ALL_TOOLS.some(t => t.name === n), `${n} is a read tool, registered`)
  for (const n of ['create_rfi', 'update_rfi', 'update_submittal']) ok(writes.includes(n) && ALL_TOOLS.some(t => t.name === n), `${n} is a write tool, registered`)
  ok(RFIS_SUBMITTALS_WRITE.every(t => t.write === true && (t.action === 'create' || t.action === 'edit')), 'every write asks for create or edit, never delete')
  ok(RFIS_SUBMITTALS_WRITE.every(t => !/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name)), 'no tool is named for a forbidden act')
  ok(!writes.some(n => /submittal/.test(n) && /create|add/.test(n)), 'NO create_submittal: a submittal is its document, and Claude uploads nothing')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok([...RFIS_SUBMITTALS_READ, ...RFIS_SUBMITTALS_WRITE].every(t => keys.has(t.resource)), 'every resource is a real key in RESOURCES')

  // ── the area file writes nothing itself; the routes call the same functions ─
  const area = code('lib/mcp/areas/rfis-submittals.ts')
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'the area file writes nothing directly - every write goes through lib/writes')
  ok(!/select\('\*'\)/.test(area) && !/answer_token|answer_requested/.test(area), 'the list names its columns: no answer_token, no answer-link recipient')
  ok(!/given\(args, \[[^\]]*change_order_status/.test(area) && /given\(args, \['subject', 'description', 'response', 'status'\]\)/.test(area),
    'update_rfi passes an allow-list without change_order_status')
  const rfiList = code('app/api/projects/[id]/rfis/route.ts')
  const rfiOne = code('app/api/projects/[id]/rfis/[rfiId]/route.ts')
  const subOne = code('app/api/projects/[id]/submittals/[submittalId]/route.ts')
  ok(/await createRfi\(db, \{/.test(rfiList) && /import \{ createRfi \} from '@\/lib\/writes\/rfi'/.test(rfiList), 'POST /rfis calls createRfi - the function create_rfi calls')
  ok(/await updateRfi\(db, \{/.test(rfiOne), 'PATCH /rfis/[rfiId] calls updateRfi - the function update_rfi calls')
  ok(/await updateSubmittal\(db, \{/.test(subOne), 'PATCH /submittals/[submittalId] calls updateSubmittal - the function update_submittal calls')
  ok(/createRfi\(db/.test(area) && /updateRfi\(db/.test(area) && /updateSubmittal\(db/.test(area), '...and the tools call exactly those')
  ok(!/\.(insert|update)\(/.test(rfiList.slice(rfiList.indexOf('export async function POST'))) && !/\.update\(/.test(rfiOne) && !/\.update\(/.test(subOne),
    'the routes no longer carry a second copy of the write')

  // ── every handler in every route file of the area is gated ────────────────
  const GATE = /rfiSide\(db, request, params\.id\)|rfiGcGate\(db, request, params\.id, '(view|create|edit|delete)'\)|requirePermission\(db, request, '(rfis|submittals)', '(view|create|edit|delete)'\)/
  const files = [
    'app/api/projects/[id]/rfis/route.ts',
    'app/api/projects/[id]/rfis/[rfiId]/route.ts',
    'app/api/projects/[id]/rfis/[rfiId]/answer-link/route.ts',
    'app/api/projects/[id]/submittals/route.ts',
    'app/api/projects/[id]/submittals/[submittalId]/route.ts',
    'app/api/projects/[id]/submittals/analyze/route.ts',
  ]
  for (const f of files) {
    const src = code(f)
    const handlers = src.split(/(?=export async function (?:GET|POST|PATCH|PUT|DELETE)\b)/).filter(b => /^export async function/.test(b))
    ok(handlers.length > 0, `${f} has handlers`)
    for (const h of handlers) {
      const name = h.match(/function (\w+)/)![1]
      ok(GATE.test(h), `${f} ${name} is gated`)
      ok(!/auth\.getUser\(token\)/.test(h), `${f} ${name} does not settle for "signed in"`)
      if (f.includes('/submittals')) {
        ok(/ownedProject\(db, gate\.actor, (_?params)\.id, 'id'\)/.test(h), `${f} ${name} asks that the job is the caller's company's own`)
      }
    }
  }
  const subList = code('app/api/projects/[id]/submittals/route.ts')
  ok(/requirePermission\(db, request, 'submittals', 'view'\)/.test(subList) && /requirePermission\(db, request, 'submittals', 'edit'\)/.test(subList),
    'submittals: view to list, edit to add (Office Staff hold view+edit and add them today)')
  ok(/requirePermission\(db, request, 'submittals', 'edit'\)[\s\S]*ownedProject[\s\S]*guardScan\(/.test(code('app/api/projects/[id]/submittals/analyze/route.ts')),
    'the analyze scan is gated BEFORE the meter row is written')

  // ── behaviour through the dispatcher ──────────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_rfi', { project_id: 'p1', subject: 'Header size' }, READ)
    ok('error' in r && /only read/i.test(r.error) && !written(calls, 'rfis', 'insert').length, 'a read-only connection is refused and nothing is written')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor('office_staff'), 'create_rfi', { project_id: 'p1', subject: 'Header size' }, WRITE)
    ok('error' in r && /permission to create rfis/.test(r.error) && !written(calls, 'rfis', 'insert').length, 'a role with rfis: view only (Office Staff) cannot file one through Claude')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_rfi', {
      project_id: 'p1', subject: 'Header size over the kitchen', description: 'LVL or steel?',
      is_change_order: true, change_order_amount: 1250, company_id: 'evil', company_name: 'Somebody Else', attachments: ['x'],
    } as any, WRITE)
    const ins = written(calls, 'rfis', 'insert')[0]
    ok('data' in r && r.data.number === 5, 'create_rfi files the RFI, numbered after the four already there')
    ok(ins?.status === 'open' && ins?.change_order_status === 'pending' && ins?.change_order_amount === 1250, '...open, with its change order pending')
    ok(ins?.company_id === null && ins?.company_name === null, 'THE ESCALATION: Claude\'s RFI is the GC\'s own - no company off the arguments')
    ok(ins?.attachments === null, '...and no attachment rides in - Claude uploads nothing')
    ok(ins?.submitted_by_name === 'Dana Reyes', 'it is signed with the person\'s own name')
    const act = written(calls, 'activity_log', 'insert')[0] ?? written(calls, 'project_activity', 'insert')[0]
    ok(!act || /via Claude/.test(JSON.stringify(act)), '...and the activity feed says it came via Claude')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_rfi', { project_id: 'p1', subject: '   ' }, WRITE)
    ok('error' in r && !written(calls, 'rfis', 'insert').length, 'a blank subject is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_rfi', { project_id: 'p1', rfi_id: 'elsewhere', response: 'LVL' }, WRITE)
    ok('error' in r && /not on this job/.test(r.error) && !written(calls, 'rfis', 'update').length, 'an RFI on another job is refused and nothing is written')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_rfi', {
      project_id: 'p1', rfi_id: 'rfi1', response: 'Use a 3-ply LVL.', status: 'answered', change_order_status: 'approved', answer_token: 'x',
    } as any, WRITE)
    const upd = written(calls, 'rfis', 'update')[0]
    ok('data' in r && upd?.response === 'Use a 3-ply LVL.' && upd?.status === 'answered', 'update_rfi records the answer and the status')
    ok(!('change_order_status' in (upd ?? {})) && !('answer_token' in (upd ?? {})), 'THE CHANGE ORDER IS NOT CLAUDE\'S TO DECIDE: change_order_status is not passed through')
    ok(upd?.responded_by_name === 'Dana Reyes via Claude', '...and the answer is signed "via Claude"')
    const upCall = calls.find(c => c.table === 'rfis' && has(c.ops, 'update'))!
    ok(has(upCall.ops, 'eq', 'project_id', 'p1') && has(upCall.ops, 'eq', 'id', 'rfi1'), '...scoped to the job as well as the id')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_rfi', { project_id: 'p1', rfi_id: 'rfi1', subject: 'Header over kitchen' }, WRITE)
    const upd = written(calls, 'rfis', 'update')[0]
    ok('data' in r && upd?.subject === 'Header over kitchen' && !('responded_by_name' in (upd ?? {})), 'a wording fix is not stamped as an answer')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_rfi', { project_id: 'p1', rfi_id: 'rfi1', status: 'resolved' }, WRITE)
    ok('error' in r && !written(calls, 'rfis', 'update').length, 'a status the route does not know is refused by the route\'s own check')
    const r2: any = await callTool(d, actor(), 'update_rfi', { project_id: 'p1', rfi_id: 'rfi1' }, WRITE)
    ok('error' in r2 && /Nothing to change/.test(r2.error), 'an empty change is refused')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_submittal', {
      project_id: 'p1', submittal_id: 'sm1', status: 'revise', review_notes: 'Need the 60-mil sheet', title: 'Renamed', file_url: 'http://x',
    } as any, WRITE)
    const upd = written(calls, 'submittals', 'update')[0]
    ok('data' in r && upd?.status === 'revise' && upd?.review_notes === 'Need the 60-mil sheet', 'update_submittal records the review')
    ok(!('title' in (upd ?? {})) && !('file_url' in (upd ?? {})), 'a field outside the review is not passed through')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_submittal', { project_id: 'p1', submittal_id: 'other', status: 'approved' }, WRITE)
    ok('error' in r && !written(calls, 'submittals', 'update').length, 'a submittal on another job is refused')
    const r2: any = await callTool(d, actor(), 'update_submittal', { project_id: 'p1', submittal_id: 'sm1', status: 'lgtm' }, WRITE)
    ok('error' in r2 && !written(calls, 'submittals', 'update').length, 'a status the route does not know is refused')
  }
  {
    const { db: d } = db()
    const r: any = await callTool(d, actor('office_staff'), 'update_submittal', { project_id: 'p1', submittal_id: 'sm1', status: 'approved' }, WRITE)
    ok('data' in r, 'Office Staff (submittals: view+edit) can record a review')
    // Every role Claude serves holds submittals: view by default, so the denial is a company's override.
    const denied: ActorPerms = { ...actor('office_staff') }
    denied.permissions = { ...denied.permissions, submittals: { view: false, create: false, edit: false, delete: false } } as any
    const r2: any = await callTool(d, denied, 'list_submittals', { project_id: 'p1' }, READ)
    ok('error' in r2 && /permission to view submittals/.test(r2.error), 'somebody whose company took submittals away cannot list them')
  }

  // ── reads ─────────────────────────────────────────────────────────────────
  {
    const { db: d, calls } = db((t, ops) => t === 'rfis' && has(ops, 'in')
      ? { data: [{ id: 'rfi1', project_id: 'p1', rfi_number: 1, subject: 'Header', status: 'open', is_change_order: true, change_order_amount: '1250.00', change_order_status: 'pending', company_name: null, submitted_by_name: 'Dana' }] }
      : undefined)
    const r: any = await callTool(d, actor(), 'list_rfis', { project_id: 'p1' }, READ)
    ok('data' in r && r.data.rfis[0].change_order.amount === 1250, 'list_rfis reads a numeric amount through Number, not as "1250.00"')
    ok(r.data.rfis[0].project === 'Maple Street Duplex' && r.data.rfis[0].asked_by === 'Dana', '...with the job\'s name and who asked')
    const sel = opArg(calls.find(c => c.table === 'rfis')!.ops, 'select') as string
    ok(!/answer_token|\*/.test(sel), '...and never selects the answer token')
    ok(has(calls.find(c => c.table === 'rfis')!.ops, 'eq', 'status', 'open'), 'open ones by default')
  }
  {
    const { db: d } = db((t, ops) => t === 'submittals' && has(ops, 'in') ? { error: { message: 'boom' } } : undefined)
    const r: any = await callTool(d, actor(), 'list_submittals', { project_id: 'p1' }, READ)
    ok('error' in r && !('data' in r), 'A FAILED READ IS AN ERROR, never "there are none"')
  }
  {
    const { db: d } = db((t, ops) => t === 'submittals' && has(ops, 'in') ? { data: [{ id: 'sm1', project_id: 'p1', title: 'TPO', status: 'pending', file_url: 'https://signed/secret' }] } : undefined)
    const r: any = await callTool(d, actor(), 'list_submittals', { project_id: 'p1' }, READ)
    ok('data' in r && r.data.submittals[0].has_document === true && !JSON.stringify(r).includes('signed/secret'), 'list_submittals says a document is attached without handing over its signed link')
  }
  {
    const { db: d } = db()
    const r: any = await callTool(d, actor(), 'list_rfis', { project_id: 'not-mine' }, READ)
    ok('error' in r, 'a job that is not the company\'s own is refused')
  }

  done()
}

main()
