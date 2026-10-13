// Claude adding AND EDITING across budget, subcontracts, schedule, tasks,
// daily logs and client billing - MCP phase 4.
//
// The owner's rule for this batch: add and edit, never delete, never record a
// payment. What must hold beyond phase 3's rules (see mcp-write.ts):
//   - An edit tool passes a NARROWER set of fields than the app's route takes:
//     no markup, no payment schedule, no vendor rename, no raw status.
//   - A record an edit names must belong to the job the dispatcher checked.
//   - Everything client-facing stays a draft: invoices are `draft`, payment
//     requests unsent, and a daily log Claude writes waits for review.
//   - Moving dates goes through the app's cascade, and `notify` - which emails
//     people outside the company - has no default anywhere.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { MORE_WRITE_TOOLS } from '../mcp/write-tools'
import { billableCosts } from '../client-billable'
import { createDailyLog } from '../writes/daily-log'
import { getEffectivePermissions, getRoleDefaults } from '../permissions'
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
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'x' } }), remove: async () => ({ error: null }) }) },
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

/** Everything the write path reads answers sensibly; `onJob` lookups find the row only for the ids given. */
function db(extra: (t: string, ops: Op[]) => Answer | undefined = () => undefined, onJobIds: string[] = ['line1', 'sc1', 'si1', 't1']) {
  return fakeDb((t, ops) => {
    const e = extra(t, ops); if (e) return e
    if (t === 'projects') return { data: [{ id: 'p1', name: 'Maple Street Duplex', contractor_fee_pct: '0.10' }] }
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', email: 'dana@example.com', company_id: 'c1', role: 'admin' } }
    // An id lookup scoped to the job: found only for the ids this test says are on it.
    if (has(ops, 'select', 'id') && ops.some(([m, k]) => m === 'eq' && k === 'project_id')) {
      const id = ops.find(([m, k]) => m === 'eq' && k === 'id')?.[2]
      return { data: onJobIds.includes(id as string) ? { id } : null }
    }
    if (has(ops, 'insert')) return { data: { id: 'new1', ...opArg(ops, 'insert') } }
    if (has(ops, 'update')) return { data: { id: 'upd1', ...opArg(ops, 'update') } }
    return { data: [] }
  })
}

async function main() {
  // ── the batch is there, and adds or edits only ────────────────────────────
  const names = MORE_WRITE_TOOLS.map(t => t.name)
  for (const n of ['add_budget_line', 'update_budget_line', 'create_subcontract', 'update_subcontract', 'add_schedule_item',
    'update_schedule_item', 'move_schedule_item', 'update_task', 'create_daily_log', 'create_client_invoice', 'create_payment_request']) {
    ok(names.includes(n), `${n} is a tool`)
  }
  for (const n of ['get_budget', 'list_team', 'list_billable_costs', 'preview_schedule_move']) {
    ok(ALL_TOOLS.some(t => t.name === n && !('write' in t)), `${n} is a READ tool`)
  }
  ok(MORE_WRITE_TOOLS.every(t => t.action === 'create' || t.action === 'edit'), 'no new tool asks for delete')

  // ── edits pass a narrower set of fields than the route takes ──────────────
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_budget_line', { project_id: 'p1', line_id: 'line1', budgeted_amount: 1520, markup_pct: 0, markup_excluded: true } as any, WRITE)
    const upd = written(calls, 'budget_line_items', 'update')[0]
    ok(upd?.budgeted_amount === 1520 && !('markup_pct' in (upd ?? {})) && !('markup_excluded' in (upd ?? {})),
      'MARKUP IS NOT CLAUDE\'S TO CHANGE: a budget edit carrying markup fields writes the amount and not the margin')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'update_subcontract', {
      project_id: 'p1', subcontract_id: 'sc1', scope: 'Footings', status: 'cancelled',
      payment_schedule: [{ label: 'All', amount: 1 }], company_name: 'Renamed Co', contact_email: 'x@y.z',
    } as any, WRITE)
    const upd = written(calls, 'subcontracts', 'update')[0]
    ok(upd?.scope === 'Footings' && !('status' in (upd ?? {})), 'a subcontract edit changes the scope and not the status')
    ok(!written(calls, 'payment_schedule_items', 'delete').length && !written(calls, 'payment_schedule_items', 'insert').length,
      'THE PAYMENT SCHEDULE IS NEVER WIPED-AND-REPLACED by Claude')
    ok(!written(calls, 'companies', 'update').length, 'and the vendor is never renamed on every job by a subcontract edit')
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_subcontract', { project_id: 'p1', subcontract_id: 'sc1', contract_amount: -500 }, WRITE)
    ok('error' in r && !written(calls, 'subcontracts', 'update').length, 'a negative contract amount is refused - the route itself does not check it')
  }

  // ── a record an edit names must be on the job ─────────────────────────────
  for (const [tool, idKey, table] of [
    ['update_task', 'task_id', 'project_tasks'],
    ['update_budget_line', 'line_id', 'budget_line_items'],
    ['update_subcontract', 'subcontract_id', 'subcontracts'],
    ['update_schedule_item', 'item_id', 'schedule_items'],
  ] as const) {
    const { db: d, calls } = db(undefined, [])
    const r: any = await callTool(d, actor(), tool, { project_id: 'p1', [idKey]: 'elsewhere', title: 'x', scope: 'x', label: 'x', description: 'x' } as any, WRITE)
    ok('error' in r && !written(calls, table, 'update').length,
      `${tool}: a ${table} row that is not on this job is refused before anything is written`)
  }
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'update_task', { project_id: 'p1', task_id: 't1', status: 'archived' } as any, WRITE)
    ok('error' in r && !written(calls, 'project_tasks', 'update').length, 'a task status the table does not allow is refused, not sent to a check constraint')
  }

  // ── everything client-facing stays a draft ────────────────────────────────
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'create_daily_log', { project_id: 'p1', log_date: '2026-10-13', notes: 'Poured footings.' }, WRITE)
    const log = written(calls, 'daily_logs', 'insert')[0]
    ok(log?.review_status === 'pending' && /review/i.test(r.data?.next ?? ''),
      'A DAILY LOG CLAUDE WRITES WAITS FOR REVIEW before it can reach the client\'s PDF')
    ok(log?.created_by_name === 'Dana Reyes via Claude', '...credited "via Claude"')
  }
  {
    const { db: d, calls } = db()
    await createDailyLog(d, { userId: 'u1', projectId: 'p1', body: { log_date: '2026-10-13', notes: 'Poured footings.' } })
    ok(written(calls, 'daily_logs', 'insert')[0]?.review_status === 'reviewed', '...while an office log written in the app is unchanged (reviewed)')
  }
  {
    const { db: d, calls } = db((t, ops) => {
      if (t === 'invoices' && !has(ops, 'insert')) return { data: [{ id: 'b1', amount: '1000.00', status: 'approved', company_name: 'QA', markup_pct: null, markup_excluded: false }] }
      if (t === 'client_invoices' && has(ops, 'insert')) return { data: { id: 'ci1', ...opArg(ops, 'insert') } }
      if (t === 'client_invoice_lines' && has(ops, 'insert')) return { data: opArg(ops, 'insert') }
      return undefined
    })
    await callTool(d, actor(), 'create_client_invoice', { project_id: 'p1', sources: [{ kind: 'invoice', source_id: 'b1' }], status: 'sent' } as any, WRITE)
    const inv = written(calls, 'client_invoices', 'insert')[0]
    ok(inv?.status === 'draft', 'A CLIENT INVOICE IS BORN A DRAFT, whatever the call asks for - the client and QuickBooks see nothing')
  }
  {
    const { db: d, calls } = db()
    await callTool(d, actor(), 'create_payment_request', { project_id: 'p1', label: 'Deposit', amount: 5000 }, WRITE)
    const req = written(calls, 'client_payment_requests', 'insert')[0]
    ok(req?.amount === 5000 && !req?.sent_at, 'a payment request is PREPARED, not sent - no sent_at, so the client sees nothing')
  }
  for (const f of ['lib/writes/client-invoice.ts', 'lib/writes/payment-request.ts', 'lib/writes/budget-line.ts', 'lib/writes/subcontract.ts', 'lib/writes/daily-log.ts', 'lib/writes/schedule-item.ts']) {
    ok(!/from '[^']*quickbooks|push(Bill|Invoice|ClientInvoice|Payment|ClientPayment|Customer|Vendor)\w*\(|sendEmail\(/.test(code(f)),
      `${f.split('/').pop()}: nothing on this create/edit path emails anybody or pushes to QuickBooks`)
  }

  // ── moving dates ──────────────────────────────────────────────────────────
  const move = MORE_WRITE_TOOLS.find(t => t.name === 'move_schedule_item')!
  ok((move.inputSchema.required as string[]).includes('notify'), 'move_schedule_item REQUIRES notify - it emails people outside the company')
  {
    const { db: d, calls } = db()
    const r: any = await callTool(d, actor(), 'move_schedule_item', { project_id: 'p1', item_id: 'si1', start_date: '2026-11-02', end_date: '2026-11-06' }, WRITE)
    ok('error' in r && /notify/i.test(r.error) && !written(calls, 'schedule_items', 'update').length,
      'A MOVE WITH NO notify IS REFUSED BY THE APP\'S OWN CODE - never guessed, nothing moved')
  }
  ok(!/notify:\s*args\.notify\s*\?\?/.test(code('lib/mcp/write-tools.ts')) && /notify: args\.notify,/.test(code('lib/mcp/write-tools.ts')),
    '...and the tool passes the person\'s answer through untouched, with no fallback of its own')
  const preview = code('lib/mcp/tools.ts')
  ok(/previewScheduleMove\(/.test(preview) && !/applyScheduleMove/.test(preview), 'the preview tool calls the preview and only the preview')

  // ── one answer for what is billable ───────────────────────────────────────
  const costs = billableCosts({
    invoices: [
      { id: 'a', amount: '100', status: 'approved' }, { id: 'b', amount: '100', status: 'approved' },
      { id: 'c', amount: '100', status: 'approved' }, { id: 'd', amount: '100', status: 'pending_approval' },
    ],
    materials: [],
    bills: [
      { status: 'draft', client_invoice_lines: [{ source_invoice_id: 'a' }] },
      { status: 'void', client_invoice_lines: [{ source_invoice_id: 'b' }] },
    ],
    projectPct: 10,
  })
  const ids = costs.map((c: any) => c.source_id).sort()
  ok(JSON.stringify(ids) === JSON.stringify(['b', 'c']),
    'billable = approved, not on a live client invoice: a cost on a draft is taken, one on a VOID invoice is free again, an unapproved bill is not offered')
  ok(/billableCosts\(/.test(code('app/api/projects/[id]/client-invoices/route.ts')) && /billableCosts\(/.test(preview),
    'ONE HOME: the Billing screen and Claude ask the same function what is billable')

  // ── the hole found on the way ─────────────────────────────────────────────
  const pr = code('app/api/projects/[id]/payment-requests/route.ts')
  const post = pr.slice(pr.indexOf('export async function POST'))
  ok(/requirePermission\(db, request, 'payments', 'edit'\)/.test(post) && /ownedProject\(/.test(post),
    'raising a payment request needs payments:edit on a job the company OWNS - it used to need only a login')

  done()
}

main()
