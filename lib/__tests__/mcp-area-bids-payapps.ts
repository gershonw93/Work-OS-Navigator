// Claude on pay applications, quote requests, task notes, daily-log edits and
// bills still waiting for approval - lib/mcp/areas/bids-payapps.ts.
//
// The owner's limits, and how each is held here:
//   - Add and edit only: no tool asks for delete, none is named like a send,
//     an approval, a payment or a void.
//   - Nothing leaves the company: a pay application is born a draft and its
//     status is never Claude's to move; a quote request invites nobody.
//   - Nothing approved: a bill is only changed while `pending_approval`, and
//     never its status - approval is the QuickBooks push.
//   - A daily log Claude edits goes back to review before the client sees it.
//   - Every write goes through lib/writes/*, the same function the route calls,
//     and every handler in the routes behind these tools is gated.

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { callTool } from '../mcp/tools'
import { BIDS_PAYAPPS_READ, BIDS_PAYAPPS_WRITE } from '../mcp/areas/bids-payapps'
import { updateDailyLog } from '../writes/daily-log'
import { updateSubBill } from '../writes/sub-bill'
import { updatePayApp } from '../writes/pay-app'
import { getEffectivePermissions, getRoleDefaults, RESOURCES } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { ok, done, code, root } from './_helpers'

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
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'x' } }), remove: async () => ({ error: null }) }) },
  }
  return { db, calls }
}
const has = (ops: Op[], method: string, ...args: unknown[]) =>
  ops.some(([m, ...a]) => m === method && args.every((x, i) => a[i] === x))
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any
const written = (calls: Call[], table: string, method: 'insert' | 'update' | 'delete') =>
  calls.filter(c => c.table === table && has(c.ops, method)).map(c => opArg(c.ops, method))
const anyWrite = (calls: Call[], table: string) =>
  calls.some(c => c.table === table && ['insert', 'update', 'upsert', 'delete'].some(m => has(c.ops, m)))
const eqVal = (ops: Op[], key: string) => ops.find(([m, k]) => m === 'eq' && k === key)?.[2]

const actor = (role = 'admin'): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})
const WRITE = { canWrite: true, tokenId: 'tok1' }

/**
 * The world these tools read. Records are on the job only when their id is in
 * `onJob`; a pay application's, a bill's and invites' statuses are settable.
 */
function world(o: { onJob?: string[]; appStatus?: string; billStatus?: string; billQbo?: string | null; invites?: string[] } = {}) {
  const onJob = o.onJob ?? ['app1', 'req1', 't1', 'log1', 'bill1', 'sc1', 'bl1', 'bl2']
  return fakeDb((t, ops) => {
    if (t === 'projects') return { data: [{ id: 'p1', name: 'Maple Street Duplex', default_retainage_pct: '10' }] }
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', email: 'dana@example.com', company_id: 'c1', role: 'admin' } }
    if (has(ops, 'insert')) {
      const row = opArg(ops, 'insert')
      return { data: Array.isArray(row) ? row : { id: 'new1', ...row } }
    }
    if (has(ops, 'update')) return { data: { id: 'upd1', ...opArg(ops, 'update') } }

    const scoped = ops.some(([m, k]) => m === 'eq' && k === 'project_id')
    const id = eqVal(ops, 'id') as string | undefined
    const here = !!id && onJob.includes(id)
    if (t === 'pay_applications' && id) return { data: scoped && here ? { id, status: o.appStatus ?? 'draft', subcontract_id: null } : null }
    if (t === 'pay_application_lines') return { data: [{ id: 'line1', description: 'Framing', scheduled_value: '1000.00', previous_completed: '0', this_period: '0', materials_stored: '0' }] }
    if (t === 'invoices' && id) return { data: scoped && here ? { id, status: o.billStatus ?? 'pending_approval', qbo_id: o.billQbo ?? null, amount: '500.00', invoice_number: 'INV-1' } : null }
    if (t === 'bid_invites') return { data: (o.invites ?? []).map(status => ({ status })) }
    if (t === 'budget_line_items' && has(ops, 'in')) {
      const ids = (ops.find(([m]) => m === 'in')?.[2] ?? []) as string[]
      return { data: ids.filter(i => onJob.includes(i)).map(i => ({ id: i })) }
    }
    if (t === 'budget_line_items') return { data: [{ id: 'bl1', cost_code: null, description: 'Framing', budgeted_amount: '1000.00', sort_order: 0 }] }
    if (t === 'invoice_allocations') return { data: [] }
    if (t === 'project_tasks' && id) return { data: scoped && here ? { id, title: 'Order windows' } : null }
    if (id && scoped) return { data: here ? { id } : null }
    return { data: [] }
  })
}

const AREA = 'lib/mcp/areas/bids-payapps.ts'

async function main() {
  // ── the tools are there, and they add or edit only ───────────────────────
  const reads = BIDS_PAYAPPS_READ.map(t => t.name)
  const writes = BIDS_PAYAPPS_WRITE.map(t => t.name)
  for (const n of ['list_pay_apps', 'get_pay_app', 'list_bid_requests', 'list_task_notes', 'list_daily_logs']) ok(reads.includes(n), `${n} is a read tool`)
  for (const n of ['create_pay_app', 'update_pay_app', 'create_bid_request', 'update_bid_request', 'add_task_note', 'update_daily_log', 'update_sub_bill']) ok(writes.includes(n), `${n} is a write tool`)
  ok(BIDS_PAYAPPS_READ.every(t => !('write' in t)), 'the read tools are not marked as writes')
  ok(BIDS_PAYAPPS_WRITE.every(t => t.write === true && (t.action === 'create' || t.action === 'edit')), 'every write tool asks for create or edit - never delete')
  ok(BIDS_PAYAPPS_WRITE.every(t => !/delete|remove|record_payment|apply_credit|approve|void|send_/i.test(t.name)),
    'no tool is named for deleting, sending, approving, voiding or recording money')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok([...BIDS_PAYAPPS_READ, ...BIDS_PAYAPPS_WRITE].every(t => keys.has(t.resource)), 'every resource a tool names is a real permission')
  ok(BIDS_PAYAPPS_WRITE.every(t => t.project === 'required'), 'every write names its job, so the dispatcher checks it is the company\'s')

  // ── the area file writes nothing itself ──────────────────────────────────
  const area = code(AREA)
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'NOTHING IN THE AREA FILE WRITES - every record goes through lib/writes/*')
  ok(/bid_invites\(id, vendor_name/.test(area) && !/bid_invites\([^)]*\btoken\b/.test(area), 'the quote-request read never selects an invite token (the sub\'s private link)')

  // ── the tool calls the function the route calls ──────────────────────────
  for (const [route, fn] of [
    ['app/api/projects/[id]/pay-apps/route.ts', 'createPayApp'],
    ['app/api/projects/[id]/pay-apps/[appId]/route.ts', 'updatePayApp'],
    ['app/api/projects/[id]/bid-requests/route.ts', 'createBidRequest'],
    ['app/api/projects/[id]/bid-requests/[reqId]/route.ts', 'updateBidRequest'],
    ['app/api/projects/[id]/tasks/[taskId]/notes/route.ts', 'addTaskNote'],
    ['app/api/projects/[id]/daily-logs/[logId]/route.ts', 'updateDailyLog'],
    ['app/api/projects/[id]/invoices/[invoiceId]/route.ts', 'updateSubBill'],
  ] as const) {
    ok(new RegExp(`${fn}\\(`).test(code(route)) && new RegExp(`${fn}\\(`).test(area), `${fn}: ONE HOME - the route and Claude call the same function`)
  }
  {
    const route = code('app/api/projects/[id]/invoices/[invoiceId]/route.ts')
    ok(/pushBill\(db, params\.invoiceId\)/.test(route) && /updateBillInQbo\(/.test(route),
      'the QuickBooks pushes after an approval or a corrected amount stay in the ROUTE - nothing under lib/writes reaches QuickBooks')
  }

  // ── every handler behind these tools is gated ────────────────────────────
  const GATES: [string, string, boolean][] = [
    ['app/api/projects/[id]/pay-apps/route.ts', 'pay-apps', false],
    ['app/api/projects/[id]/pay-apps/[appId]/route.ts', 'pay-apps', false],
    ['app/api/projects/[id]/bid-requests/route.ts', 'request-quotes', true],
    ['app/api/projects/[id]/bid-requests/[reqId]/route.ts', 'request-quotes', true],
    ['app/api/projects/[id]/bid-requests/[reqId]/invites/route.ts', 'request-quotes', true],
    ['app/api/projects/[id]/bid-requests/[reqId]/invites/[inviteId]/send/route.ts', 'request-quotes', true],
    ['app/api/projects/[id]/bid-requests/[reqId]/to-comparison/route.ts', 'request-quotes', true],
    ['app/api/projects/[id]/tasks/[taskId]/notes/route.ts', 'tasks', false],
    ['app/api/projects/[id]/daily-logs/[logId]/route.ts', 'daily-logs', false],
    ['app/api/projects/[id]/invoices/[invoiceId]/route.ts', 'invoices', false],
  ]
  const walk = (dir: string): string[] => readdirSync(join(root(), dir)).flatMap(n => {
    const rel = `${dir}/${n}`
    return statSync(join(root(), rel)).isDirectory() ? walk(rel) : n === 'route.ts' ? [rel] : []
  })
  for (const f of walk('app/api/projects/[id]/bids')) GATES.push([f, 'bids', true])
  for (const [file, resource, owned] of GATES) {
    const src = code(file)
    const handlers = src.split(/export async function /).slice(1)
    const short = file.replace('app/api/projects/[id]/', '')
    ok(handlers.length > 0 && handlers.every(h => new RegExp(`requirePermission\\([^\\n]*'${resource}'`).test(h)),
      `${short}: every handler asks for \`${resource}\``)
    if (owned) ok(handlers.every(h => /ownedProject\(/.test(h)), `${short}: ...and that the caller's company OWNS the job`)
  }
  {
    const daily = code('app/api/projects/[id]/daily-logs/[logId]/route.ts')
    ok(/'daily-logs', 'edit'/.test(daily) && /'daily-logs', 'delete'/.test(daily), 'a daily-log edit needs edit and a delete needs delete - the actions the screen already hides behind')
    const notes = code('app/api/projects/[id]/tasks/[taskId]/notes/route.ts')
    ok(/billingLock\(/.test(notes), 'a task note is gated on view (everybody who can open a task can comment) and still meets the billing lock')
    for (const f of ['app/api/projects/[id]/bid-requests/[reqId]/invites/route.ts', 'app/api/projects/[id]/bid-requests/[reqId]/invites/[inviteId]/send/route.ts', 'app/api/projects/[id]/bid-requests/[reqId]/to-comparison/route.ts']) {
      ok(/bidRequestOnJob\(/.test(code(f)), `${f.split('[reqId]/')[1]}: the request is checked against the job, not only the job against the company`)
    }
  }

  // ── a read-only connection is refused every write ────────────────────────
  for (const t of BIDS_PAYAPPS_WRITE) {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), t.name, { project_id: 'p1' }, { canWrite: false, tokenId: 'tok1' })
    ok('error' in r && /only read/i.test(r.error) && !calls.some(c => ['insert', 'update', 'delete'].some(m => has(c.ops, m))),
      `${t.name}: a read-only connection is refused before anything is read or written`)
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor('field_supervisor'), 'create_pay_app', { project_id: 'p1' }, WRITE)
    ok('error' in r && !anyWrite(calls, 'pay_applications'), 'a Field Supervisor (no pay-apps) cannot start a pay application through Claude')
  }

  // ── a record on another job is refused before anything is written ────────
  for (const [tool, args, table] of [
    ['update_pay_app', { pay_app_id: 'elsewhere', notes: 'x' }, 'pay_applications'],
    ['update_bid_request', { request_id: 'elsewhere', title: 'x' }, 'bid_requests'],
    ['add_task_note', { task_id: 'elsewhere', content: 'x' }, 'task_notes'],
    ['update_daily_log', { log_id: 'elsewhere', notes: 'x' }, 'daily_logs'],
    ['update_sub_bill', { bill_id: 'elsewhere', amount: 10 }, 'invoices'],
  ] as const) {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), tool, { project_id: 'p1', ...args }, WRITE)
    ok('error' in r && !anyWrite(calls, table), `${tool}: a record that is not on this job is refused, nothing written`)
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'create_pay_app', { project_id: 'p1', subcontract_id: 'elsewhere' }, WRITE)
    ok('error' in r && !anyWrite(calls, 'pay_applications'), 'create_pay_app: a subcontract from another job is refused')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'update_sub_bill', { project_id: 'p1', bill_id: 'bill1', allocations: [{ budget_line_item_id: 'foreign', amount: 10 }] }, WRITE)
    ok('error' in r && !anyWrite(calls, 'invoices') && !anyWrite(calls, 'invoice_allocations'),
      'update_sub_bill: a budget line from another job is refused - the route takes a line id as given')
  }

  // ── pay applications: born a draft, and the status is never Claude's ─────
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'create_pay_app', { project_id: 'p1', period_end: '2026-10-31', status: 'submitted' } as any, WRITE)
    const app = written(calls, 'pay_applications', 'insert')[0]
    ok(app?.status === 'draft' && r.data?.status === 'draft', 'A PAY APPLICATION IS BORN A DRAFT, whatever the call asks for')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_pay_app', {
      project_id: 'p1', pay_app_id: 'app1', notes: 'October', status: 'certified', certified_by: 'Architect', action: 'resync_sov',
    } as any, WRITE)
    const header = written(calls, 'pay_applications', 'update')[0]
    ok(header?.notes === 'October' && !('status' in (header ?? {})) && !('certified_by' in (header ?? {})) && !('certified_at' in (header ?? {})),
      'a pay-app edit writes the notes and NOT a status or a certifier')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_pay_app', { project_id: 'p1', pay_app_id: 'app1', lines: [{ line_id: 'line1', this_period: 250 }] }, WRITE)
    const line = written(calls, 'pay_application_lines', 'update')[0]
    ok(line?.this_period === 250, 'a line\'s work this period is written through the app\'s own line check')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'update_pay_app', { project_id: 'p1', pay_app_id: 'app1', lines: [{ line_id: 'not-on-it', this_period: 1 }] }, WRITE)
    ok('error' in r && !anyWrite(calls, 'pay_application_lines'), 'a line id that is not on the application is refused rather than skipped in silence')
  }
  {
    const { db, calls } = world({ appStatus: 'submitted' })
    const r: any = await callTool(db, actor(), 'update_pay_app', { project_id: 'p1', pay_app_id: 'app1', notes: 'x' }, WRITE)
    ok('error' in r && !anyWrite(calls, 'pay_applications') && !anyWrite(calls, 'pay_application_lines'),
      'A PAY APPLICATION THAT HAS GONE OUT IS NOT CHANGED through Claude')
  }
  {
    const { db, calls } = world()
    const r = await updatePayApp(db, { userId: 'u1', projectId: 'p1', appId: 'app1', body: { status: 'submitted' }, via: 'Claude' })
    ok(r.status === 400 && !anyWrite(calls, 'pay_applications'), '...and the shared function refuses a status via Claude even if a tool forgot to')
  }
  {
    const { db, calls } = world()
    const r = await updatePayApp(db, { userId: 'u1', projectId: 'p1', appId: 'elsewhere', body: { lines: [{ id: 'line1', this_period: 5 }] } })
    ok(r.status === 404 && !anyWrite(calls, 'pay_application_lines'),
      'THE HOLE: the app\'s own PATCH no longer edits the lines of an application on another job')
  }

  // ── quote requests invite nobody, and change only before anybody is told ─
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'create_bid_request', {
      project_id: 'p1', title: 'Framing', trade: 'Framing', package_type: 'labor_only', material_by: 'sub', included: ['Walls', ''],
    }, WRITE)
    const req = written(calls, 'bid_requests', 'insert')[0]
    ok(req?.title === 'Framing' && !anyWrite(calls, 'bid_invites') && /invite/i.test(r.data?.next ?? ''),
      'A QUOTE REQUEST INVITES NOBODY - inviting emails the subs, and stays a button')
    ok(req?.material_by === 'gc' && JSON.stringify(req?.included) === '["Walls"]',
      '...the package answers who supplies material (labor only = we do), whatever the call says')
  }
  {
    const { db, calls } = world({ invites: ['pending', 'invited'] })
    const r: any = await callTool(db, actor(), 'update_bid_request', { project_id: 'p1', request_id: 'req1', title: 'New title' }, WRITE)
    ok('error' in r && !anyWrite(calls, 'bid_requests'), 'a request already SENT to a sub is not changed through Claude')
  }
  {
    const { db, calls } = world({ invites: ['pending'] })
    await callTool(db, actor(), 'update_bid_request', { project_id: 'p1', request_id: 'req1', title: 'New title', status: 'closed' } as any, WRITE)
    const upd = written(calls, 'bid_requests', 'update')[0]
    ok(upd?.title === 'New title' && !('status' in (upd ?? {})), 'a request nobody has been told about can be changed - its title, not its status')
  }

  // ── task notes ───────────────────────────────────────────────────────────
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'add_task_note', { project_id: 'p1', task_id: 't1', content: 'Supplier says Thursday.' }, WRITE)
    const note = written(calls, 'task_notes', 'insert')[0]
    ok(note?.content === 'Supplier says Thursday.' && note?.author_name === 'Dana Reyes via Claude', 'a task note is credited "via Claude"')
  }

  // ── daily logs go back to review ─────────────────────────────────────────
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'update_daily_log', {
      project_id: 'p1', log_id: 'log1', notes: 'Poured the east footing.', signed_by_name: 'Somebody', survey: { a: 1 }, workers_onsite: 40,
    } as any, WRITE)
    const upd = written(calls, 'daily_logs', 'update')[0]
    ok(upd?.notes === 'Poured the east footing.' && upd?.review_status === 'pending' && upd?.reviewed_at === null,
      'A DAILY LOG CLAUDE EDITS GOES BACK TO REVIEW before the client\'s PDF can show it')
    ok(!('signed_by_name' in (upd ?? {})) && !('survey' in (upd ?? {})) && !('workers_onsite' in (upd ?? {})),
      '...and the signature, the survey and the head count are not Claude\'s to change')
    ok(/review/i.test(r.data?.next ?? ''), '...and Claude is told so')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'update_daily_log', { project_id: 'p1', log_id: 'log1', notes: '   ' }, WRITE)
    ok('error' in r && !anyWrite(calls, 'daily_logs'), 'a log\'s notes cannot be blanked through Claude')
  }
  {
    const { db, calls } = world()
    await updateDailyLog(db, { userId: 'u1', projectId: 'p1', logId: 'log1', body: { notes: 'typo fixed' } })
    ok(!('review_status' in (written(calls, 'daily_logs', 'update')[0] ?? {})), '...while an edit in the app leaves the review alone, as it always did')
  }

  // ── bills: only while waiting for approval, and never the status ─────────
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_sub_bill', {
      project_id: 'p1', bill_id: 'bill1', amount: 480, status: 'approved', markup_pct: 0, client_paid: 480,
      allocations: [{ budget_line_item_id: 'bl1', amount: 300 }, { budget_line_item_id: 'bl2', amount: 180 }],
    } as any, WRITE)
    const upd = written(calls, 'invoices', 'update')[0]
    ok(upd?.amount === 480 && !('status' in (upd ?? {})) && !('approved_at' in (upd ?? {})) && !('markup_pct' in (upd ?? {})) && !('client_paid' in (upd ?? {})),
      'A BILL EDIT WRITES THE AMOUNT AND NEVER THE STATUS - approval is the QuickBooks push, and a person\'s')
    const alloc = written(calls, 'invoice_allocations', 'insert')[0] as any[]
    ok(Array.isArray(alloc) && alloc.length === 2 && alloc[0].invoice_id === 'bill1', '...and the split across budget lines is replaced through the app\'s own check')
  }
  for (const status of ['approved', 'paid', 'sent']) {
    const { db, calls } = world({ billStatus: status })
    const r: any = await callTool(db, actor(), 'update_sub_bill', { project_id: 'p1', bill_id: 'bill1', amount: 1 }, WRITE)
    ok('error' in r && !anyWrite(calls, 'invoices'), `a bill that is ${status} is not changed through Claude`)
  }
  {
    const { db, calls } = world()
    const r = await updateSubBill(db, { userId: 'u1', projectId: 'p1', invoiceId: 'bill1', body: { status: 'approved' }, via: 'Claude' })
    ok(r.status === 400 && !anyWrite(calls, 'invoices'), '...and the shared function refuses an approval via Claude even if a tool forgot to')
  }
  {
    const { db, calls } = world({ billQbo: '123' })
    const r = await updateSubBill(db, { userId: 'u1', projectId: 'p1', invoiceId: 'bill1', body: { amount: 9 }, via: 'Claude' })
    ok(r.status === 400 && !anyWrite(calls, 'invoices'), 'a bill already in QuickBooks is not corrected via Claude - the correction push is the route\'s')
  }
  {
    const { db, calls } = world()
    const r = await updateSubBill(db, { userId: 'u1', projectId: 'p1', invoiceId: 'elsewhere', body: { status: 'approved' } })
    ok(r.status === 404 && !anyWrite(calls, 'invoices'), 'THE HOLE: the app\'s own PATCH no longer reaches a bill on another job by id')
  }

  done()
}

main()
