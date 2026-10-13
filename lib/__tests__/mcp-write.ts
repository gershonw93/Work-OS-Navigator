// Claude ADDING records to SyteNav - phase 3 of the MCP server.
//
// What must hold, and why each is here:
//   - ADDING IS A SEPARATE CONSENT, off unless the person gave it. Every
//     connection made before this was told "it cannot change anything".
//   - A connection without that consent is never even SHOWN a write tool.
//   - Every gate runs before a record exists: consent, the permission AND the
//     action the tool names, the billing lock, the job.
//   - A retried call does not make a second record - the claim is written
//     first, and the second call gets the first one's result.
//   - Records are made by the app's own code (`lib/writes/*`), never by an
//     insert in the MCP layer, and a bill is born waiting for approval, so
//     nothing reaches QuickBooks until a person approves it.

import { handleRpc, WRITE_INSTRUCTIONS, INSTRUCTIONS } from '../mcp/protocol'
import { callTool, toolsFor, ALL_TOOLS, TOOLS } from '../mcp/tools'
import { WRITE_TOOLS, VIA } from '../mcp/write-tools'
import { idempotencyKey } from '../mcp/actions'
import { decideAuthorize, exchangeToken } from '../mcp/oauth-server'
import { RESOURCES, getEffectivePermissions, getRoleDefaults } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { createHash } from 'crypto'
import { ok, done, code, read, walk } from './_helpers'

type Op = [string, ...unknown[]]
type Call = { table: string; ops: Op[] }
type Answer = { data?: unknown; error?: { message: string; code?: string } | null; count?: number }

function fakeDb(answer: (table: string, ops: Op[]) => Answer) {
  const calls: Call[] = []
  const storage: string[] = []
  const db: any = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const settle = () => {
        const a = answer(table, call.ops)
        return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null }
      }
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: any) => resolve(settle())
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args])
            if (prop === 'maybeSingle' || prop === 'single') {
              const r = settle()
              // A one-row read of a list answers with its first row, or none.
              return Promise.resolve(Array.isArray(r.data) ? { ...r, data: r.data[0] ?? null } : r)
            }
            return chain
          }
        },
      })
      return chain
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string) => { storage.push(`upload ${bucket}/${path}`); return { error: null } },
          createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://signed/${path}` } }),
          remove: async (paths: string[]) => { storage.push(`remove ${paths.join(',')}`); return { error: null } },
        }
      },
    },
  }
  return { db, calls, storage }
}
const has = (ops: Op[], method: string, ...args: unknown[]) =>
  ops.some(([m, ...a]) => m === method && args.every((x, i) => a[i] === x))
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any
const inserted = (calls: Call[], table: string) => calls.filter(c => c.table === table).map(c => opArg(c.ops, 'insert')).filter(Boolean)

const actor = (role: string, overrides: any = null): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, overrides, getRoleDefaults(role)),
})
const PROJECTS = { data: [{ id: 'p1', name: 'Henderson' }] }
const WRITE = { canWrite: true, tokenId: 'tok1' }

/** A database where everything the write path reads answers sensibly. */
function writeDb(extra: (table: string, ops: Op[]) => Answer | undefined = () => undefined) {
  return fakeDb((t, ops) => {
    const e = extra(t, ops)
    if (e) return e
    if (t === 'projects') return PROJECTS
    if (t === 'company_billing') return { data: null }
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes', email: 'dana@example.com' } }
    if (t === 'project_tasks' && has(ops, 'insert')) return { data: { id: 't1', ...opArg(ops, 'insert') } }
    if (t === 'invoices' && has(ops, 'insert')) return { data: { id: 'b1', ...opArg(ops, 'insert') } }
    if (t === 'invoices') return { count: 4 }
    if (t === 'inspections' && has(ops, 'insert')) return { data: { id: 'i1', ...opArg(ops, 'insert') } }
    if (t === 'change_orders' && has(ops, 'insert')) return { data: { id: 'co1', ...opArg(ops, 'insert') } }
    if (t === 'companies' && has(ops, 'insert')) return { data: { id: 'k1', ...opArg(ops, 'insert') } }
    return { data: [] }
  })
}

async function main() {
  // ── who is shown what ─────────────────────────────────────────────────────
  const readOnly = toolsFor(false).map(t => t.name)
  const writable = toolsFor(true).map(t => t.name)
  ok(WRITE_TOOLS.every(t => !readOnly.includes(t.name)),
    'A READ-ONLY CONNECTION IS NEVER SHOWN A WRITE TOOL - a model offered a tool will try it')
  ok(WRITE_TOOLS.every(t => writable.includes(t.name)) && TOOLS.every(t => writable.includes(t.name)),
    'a connection allowed to add sees every tool')
  const listed: any = await handleRpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { tools: toolsFor(true), callTool: async () => ({ data: null }) })
  const ann = new Map<string, any>(listed.result.tools.map((t: any) => [t.name, t.annotations]))
  ok(WRITE_TOOLS.every(t => ann.get(t.name)?.readOnlyHint === false && ann.get(t.name)?.destructiveHint === false),
    'every write tool is annotated as adding (not read-only) and never destructive')
  ok(TOOLS.every(t => ann.get(t.name)?.readOnlyHint === true), '...and every read tool still says read-only')
  ok(listed.result.tools.every((t: any) => !('write' in t)), 'the internal `write` flag is not sent to the client')
  const init: any = await handleRpc({ jsonrpc: '2.0', id: 2, method: 'initialize' }, { tools: [], instructions: WRITE_INSTRUCTIONS, callTool: async () => ({ data: null }) })
  ok(init.result.instructions === WRITE_INSTRUCTIONS && /show the person exactly what you will enter/i.test(WRITE_INSTRUCTIONS)
    && /nothing reaches QuickBooks until a person approves/i.test(WRITE_INSTRUCTIONS),
    'a writing connection is told up front: confirm first, bills wait for approval')
  ok(/Payments cannot be recorded/.test(WRITE_INSTRUCTIONS) && !/can ADD/i.test(INSTRUCTIONS), '...and that payments are not something it can record')

  // ── the shape of the write tools ──────────────────────────────────────────
  const keys = new Set(RESOURCES.map(r => r.key))
  for (const t of WRITE_TOOLS) {
    ok(t.write === true && keys.has(t.resource) && ['create', 'edit'].includes(t.action),
      `${t.name} names a real permission and an adding action (${t.resource}:${t.action})`)
  }
  ok(!ALL_TOOLS.some(t => /delete|remove|update|edit_|payment|approve|void/i.test(t.name)),
    'NO TOOL edits, deletes, approves, voids or records a payment - adding only')

  // ── the gates ─────────────────────────────────────────────────────────────
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x' }, { canWrite: false, tokenId: 't' })
    ok('error' in r && /only read/.test(r.error) && calls.length === 0,
      'NO CONSENT, NO WRITE: a read-only connection is refused before anything is read')
  }
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin', { invoices: { view: true, create: false, edit: false, delete: false } }),
      'create_sub_bill', { project_id: 'p1', amount: 10, vendor_name: 'X' }, WRITE)
    ok('error' in r && /permission to edit invoices/.test(r.error) && !inserted(calls, 'invoices').length && !inserted(calls, 'mcp_actions').length,
      'THE ACTION IS ASKED, not just the resource: view-only on bills enters no bill')
  }
  {
    const { db, calls } = writeDb(t => t === 'company_billing' ? { data: { status: 'canceled', plan: 'starter' } } : undefined)
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x' }, WRITE)
    ok('error' in r && !inserted(calls, 'project_tasks').length && !inserted(calls, 'mcp_actions').length,
      'A LOCKED ACCOUNT IS STILL READABLE AND NOT WRITABLE - through Claude as through the app')
  }
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'someone-elses', title: 'x' }, WRITE)
    ok('error' in r && !inserted(calls, 'mcp_actions').length && !inserted(calls, 'project_tasks').length,
      'a job outside the company is refused before anything is claimed or created')
  }

  // ── a task, through the app's own code ────────────────────────────────────
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'Order trusses', due_date: '2026-10-20', priority: 'high' }, WRITE)
    const row = inserted(calls, 'project_tasks')[0]
    ok(r.data?.created === true && r.data.id === 't1', 'a task is created and Claude is told its id')
    ok(row?.project_id === 'p1' && row?.title === 'Order trusses' && row?.priority === 'high' && row?.status === 'open',
      '...through createTask: the job, the title, the whitelisted priority and status')
    ok(row?.created_by === `Dana Reyes via ${VIA}`, 'and it is credited "Dana Reyes via Claude", not to Dana as if she typed it')
    const act = inserted(calls, 'project_activity')[0]
    ok(act?.actor_name === 'Dana Reyes via Claude', '...in the activity feed too')
    const claim = inserted(calls, 'mcp_actions')[0]
    ok(claim?.token_id === 'tok1' && claim?.profile_id === 'u1' && claim?.tool === 'create_task' && claim?.project_id === 'p1',
      'THE RECORD: who, through which connection, which tool, which job')
    ok(calls.some(c => c.table === 'mcp_actions' && has(c.ops, 'update') && opArg(c.ops, 'update')?.record_id === 't1'),
      '...and what it made, written back once it exists')
    ok(calls.findIndex(c => c.table === 'mcp_actions') < calls.findIndex(c => c.table === 'project_tasks'),
      'THE CLAIM IS WRITTEN BEFORE THE RECORD')
  }
  {
    const { db } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x', due_date: 'next tuesday' }, WRITE)
    ok('error' in r, 'a date that is not YYYY-MM-DD is refused, not guessed at')
  }

  // ── the same request twice ────────────────────────────────────────────────
  {
    const { db, calls } = writeDb((t, ops) => {
      if (t === 'mcp_actions' && has(ops, 'insert')) return { error: { message: 'duplicate', code: '23505' } }
      if (t === 'mcp_actions' && has(ops, 'select', 'record_id, result')) return { data: { record_id: 't1', result: { created: true, id: 't1', record: 'task' } } }
      return undefined
    })
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x' }, WRITE)
    ok(r.data?.id === 't1' && !!r.data?.already_done && !inserted(calls, 'project_tasks').length,
      'A RETRIED CALL GETS THE FIRST RESULT and creates nothing new')
  }
  {
    const { db, calls } = writeDb((t, ops) => {
      if (t === 'mcp_actions' && has(ops, 'insert')) return { error: { message: 'duplicate', code: '23505' } }
      if (t === 'mcp_actions') return { data: { record_id: null, result: null } }
      return undefined
    })
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x' }, WRITE)
    ok('error' in r && /already being carried out/.test(r.error) && !inserted(calls, 'project_tasks').length,
      '...and one still in flight is not run a second time')
  }
  {
    const { db, calls } = writeDb((t, ops) => (t === 'mcp_actions' && has(ops, 'insert') ? { error: { message: 'down' } } : undefined))
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1', title: 'x' }, WRITE)
    ok('error' in r && !inserted(calls, 'project_tasks').length,
      'A WRITE THAT CANNOT BE RECORDED IS NOT MADE - a create nobody can trace is worse than none')
  }
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_task', { project_id: 'p1' }, WRITE)
    ok('error' in r && calls.some(c => c.table === 'mcp_actions' && has(c.ops, 'delete')),
      'a write the app refused gives its claim back, so asking again (fixed) works')
  }
  const a1 = idempotencyKey('u1', 'create_task', { title: 'x', project_id: 'p1' }, new Date('2026-10-13T10:00:00Z'))
  ok(a1 === idempotencyKey('u1', 'create_task', { project_id: 'p1', title: 'x' }, new Date('2026-10-13T18:00:00Z')),
    'the same request, arguments in any order, on the same day, is one key')
  ok(a1 !== idempotencyKey('u1', 'create_task', { project_id: 'p1', title: 'x' }, new Date('2026-10-14T10:00:00Z'))
    && a1 !== idempotencyKey('u2', 'create_task', { project_id: 'p1', title: 'x' }, new Date('2026-10-13T10:00:00Z'))
    && a1 !== idempotencyKey('u1', 'create_task', { project_id: 'p1', title: 'y' }, new Date('2026-10-13T10:00:00Z')),
    '...and a different day, person or detail is a different request')

  // ── a bill ────────────────────────────────────────────────────────────────
  {
    const pdf = Buffer.from('%PDF-1.4 test').toString('base64')
    const { db, calls, storage } = writeDb((t, ops) => (t === 'companies' && !has(ops, 'insert')
      ? { data: [{ id: 'k9', name: 'QA Concrete' }] } : undefined))
    const r: any = await callTool(db, actor('admin'), 'create_sub_bill', {
      project_id: 'p1', amount: 4250.5, vendor_name: 'qa  concrete', vendor_invoice_number: '1182', description: 'Footings',
      document: { filename: 'inv 1182.pdf', content_type: 'application/pdf', data_base64: pdf },
    }, WRITE)
    const bill = inserted(calls, 'invoices')[0]
    ok(bill?.status === 'pending_approval',
      'A BILL IS BORN WAITING FOR APPROVAL - the QuickBooks push runs on approval, so a person sees it first')
    ok(bill?.company_id === 'k9' && bill?.company_name === 'QA Concrete',
      'the vendor is matched to the company\'s own Directory exactly (case and spacing folded), and named as the Directory names it')
    ok(bill?.description === 'Vendor invoice #1182 - Footings' && bill?.amount === 4250.5, 'their invoice number and the amount are kept')
    ok(storage.some(x => x.startsWith('upload submittals/p1/invoices/')) && !!bill?.document_url && bill?.document_name === 'inv 1182.pdf',
      'the PDF from the email is stored where scanned bills are and attached to the bill')
    ok(r.data?.created && /Nothing has gone to QuickBooks/.test(r.data.next), 'and Claude is told nothing has gone to QuickBooks')
  }
  {
    const { db, calls } = writeDb((t, ops) => (t === 'companies' && !has(ops, 'insert')
      ? { data: [{ id: 'k9', name: 'QA Concrete' }, { id: 'k8', name: 'QA Concrete Supply' }] } : undefined))
    await callTool(db, actor('admin'), 'create_sub_bill', { project_id: 'p1', amount: 10, vendor_name: 'QA Conc' }, WRITE)
    const bill = inserted(calls, 'invoices')[0]
    ok(bill?.company_id === null && bill?.company_name === 'QA Conc', 'a NEAR MISS is not a match - the typed name stays, no company is guessed')
  }
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_sub_bill', { project_id: 'p1', amount: 10, subcontract_id: 'sc-elsewhere' }, WRITE)
    ok('error' in r && !inserted(calls, 'invoices').length, 'a subcontract that is not on this job is refused')
  }
  for (const amount of [0, -5, 'lots']) {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_sub_bill', { project_id: 'p1', amount, vendor_name: 'X' }, WRITE)
    ok('error' in r && !inserted(calls, 'invoices').length, `an amount of ${JSON.stringify(amount)} enters no bill`)
  }
  {
    const big = Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64')
    const { db, calls, storage } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'create_sub_bill', {
      project_id: 'p1', amount: 10, vendor_name: 'X', document: { filename: 'a.pdf', content_type: 'application/pdf', data_base64: big },
    }, WRITE)
    ok('error' in r && !storage.length && !inserted(calls, 'invoices').length, 'a document too big to carry is refused with a way round it, and no bill is half-made')
  }

  // ── an inspection, a change order, a contact ──────────────────────────────
  {
    const { db, calls } = writeDb()
    await callTool(db, actor('admin'), 'request_inspection', { project_id: 'p1', inspection_type: 'Framing', requested_date: '2026-10-22' }, WRITE)
    const row = inserted(calls, 'inspections')[0]
    ok(row?.status === 'requested' && row?.requested_date === '2026-10-22' && row?.scheduled_date === null,
      'AN INSPECTION IS REQUESTED, NEVER BOOKED - the date is "needed by", and the confirmed date stays empty')
  }
  {
    const { db, calls } = writeDb()
    const r: any = await callTool(db, actor('admin'), 'request_inspection', { project_id: 'p1', inspection_type: ' ', requested_date: '2026-10-22' }, WRITE)
    ok('error' in r && !inserted(calls, 'inspections').length, 'a blank request is refused by the app\'s own requestProblem')
  }
  {
    const { db, calls } = writeDb()
    await callTool(db, actor('admin'), 'create_change_order', { project_id: 'p1', title: 'Add window', amount: 1800 }, WRITE)
    const row = inserted(calls, 'change_orders')[0]
    ok(row?.status === 'pending' && row?.amount === 1800 && row?.requested_by_type === 'gc', 'a change order is born PENDING')
  }
  {
    const { db, calls } = writeDb((t, ops) => (t === 'companies' && !has(ops, 'insert')
      ? { data: [{ id: 'k9', name: 'Bob\'s Electric', contact_email: 'bob@example.com' }] } : undefined))
    const r: any = await callTool(db, actor('admin'), 'add_directory_contact', { name: 'Someone New', type: 'subcontractor', contact_email: 'BOB@example.com' }, WRITE)
    ok('error' in r && /Already in the Directory/.test(r.error) && !inserted(calls, 'companies').length,
      'a contact already in the Directory (same name OR email) is refused, not added twice')
  }
  {
    const { db, calls } = writeDb()
    await callTool(db, actor('admin'), 'add_directory_contact', { name: 'Ace Drywall', type: 'subcontractor', contact_email: 'ace@example.com', phone: '321-555-0101' }, WRITE)
    const row = inserted(calls, 'companies')[0]
    ok(row?.added_by_company_id === 'c1' && row?.type === 'subcontractor', 'a new contact lands in THIS company\'s address book')
  }

  // ── consent, through the sign-in ──────────────────────────────────────────
  const CB = 'https://claude.ai/api/mcp/auth_callback'
  const VERIFIER = 'dBjftJeZ4CVP-mJ0moQsOyFbUiyXo7W3iE0F6x5gBu1zf6xwBQ0'
  const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')
  const client = { client_id: 'snvc_x', client_secret_hash: null, client_name: 'Claude', redirect_uris: [CB], token_endpoint_auth_method: 'none' }
  const req = { response_type: 'code', client_id: 'snvc_x', redirect_uri: CB, code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 's' }
  for (const allowWrite of [undefined, true] as const) {
    const { db, calls } = fakeDb(t => (t === 'oauth_clients' ? { data: client } : {}))
    await (allowWrite === undefined ? decideAuthorize(db, actor('admin'), req, true) : decideAuthorize(db, actor('admin'), req, true, allowWrite))
    const row = inserted(calls, 'oauth_codes')[0]
    ok(row?.can_write === (allowWrite === true),
      allowWrite ? 'ticking "also let it add records" carries onto the code' : 'ADDING IS OFF UNLESS THE PERSON TICKED IT - Allow alone grants reading')
  }
  for (const canWrite of [false, true]) {
    const { db, calls } = fakeDb(t => {
      if (t === 'oauth_clients') return { data: client }
      if (t === 'oauth_codes') return { data: { client_id: 'snvc_x', profile_id: 'u1', redirect_uri: CB, code_challenge: CHALLENGE, can_write: canWrite } }
      if (t === 'profiles') return { data: { role: 'admin', permission_overrides: null, company_id: 'c1' } }
      if (t === 'company_roles') return { data: [] }
      return {}
    })
    const r = await exchangeToken(db, { grant_type: 'authorization_code', code: 'c', code_verifier: VERIFIER, redirect_uri: CB, client_id: 'snvc_x' })
    const token = inserted(calls, 'mcp_tokens')[0]
    ok(token?.can_write === canWrite && /sytenav:write/.test(String(r.body.scope)) === canWrite,
      `the token carries exactly the consent on its code (${canWrite ? 'read and add' : 'read only'})`)
  }

  // ── source pins ───────────────────────────────────────────────────────────
  const migration = read('supabase/migrations/143_mcp_writes.sql')
  ok(/ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS can_write boolean NOT NULL DEFAULT false/.test(migration),
    'every EXISTING connection stays read-only: the column defaults to false')
  ok(/idempotency_key\s+text NOT NULL UNIQUE/.test(migration), 'the duplicate guard is a unique index, not a check-then-act')
  const wt = code('lib/mcp/write-tools.ts')
  ok(/createSubBill\(/.test(wt) && /createTask\(/.test(wt), '(the scan below can see the write tools calling the app\'s functions)')
  ok(!/\.from\([^)]*\)\s*\.(insert|update|upsert|delete)\(/.test(wt.replace(/\s+/g, ' ')) && !/\.insert\(/.test(wt),
    'NO RECORD IS INSERTED IN THE MCP LAYER - every one goes through lib/writes/*')
  ok(!/\.(insert|update|upsert|delete)\(/.test(code('lib/mcp/tools.ts')), 'the dispatcher itself still writes nothing')
  const actions = code('lib/mcp/actions.ts')
  ok(!/\.from\('(?!mcp_actions)/.test(actions), 'the action record touches mcp_actions and nothing else')
  const writes = walk('lib/writes').concat(['lib/mcp/write-tools.ts'])
  ok(writes.length >= 6 && writes.every(f => !/from '[^']*quickbooks|push(Bill|Invoice|Payment|ClientPayment|Customer|Vendor)\w*\(/i.test(code(f))),
    'NOTHING ON THE WRITE PATH PUSHES TO QUICKBOOKS - that happens on approval, by a person')
  for (const [route, fn] of [
    ['app/api/projects/[id]/tasks/route.ts', 'createTask'],
    ['app/api/projects/[id]/invoices/route.ts', 'createSubBill'],
    ['app/api/projects/[id]/inspections/route.ts', 'createInspection'],
    ['app/api/projects/[id]/change-orders/route.ts', 'createChangeOrder'],
    ['app/api/directory/route.ts', 'createDirectoryContact'],
  ]) {
    const src = code(route)
    ok(new RegExp(`${fn}\\(`).test(src) && !/\.from\('(project_tasks|invoices|inspections|change_orders|companies)'\)\s*\.insert/.test(src.replace(/\s+/g, ' ')),
      `ONE HOME: ${route.split('/').slice(-2).join('/')} creates through ${fn}, with no insert of its own`)
  }
  const mcpRoute = code('app/api/mcp/route.ts')
  ok(/return actor \? \{ actor, canWrite: false, tokenId: null \} : null/.test(mcpRoute),
    'a SyteNav session token reads and never writes - the consent belongs to a connection')
  ok(/canWrite: data\.can_write === true/.test(mcpRoute), 'a connection writes only when its own row says so')
  ok(/useState\(false\)/.test(code('app/(auth)/oauth/authorize/page.tsx')) && /allow_write: allow && allowWrite/.test(code('app/(auth)/oauth/authorize/page.tsx')),
    'the Allow page\'s "add records" box starts UNTICKED')
  const card = code('components/settings/claude-connector-card.tsx')
  ok(/const \[newCanWrite, setNewCanWrite\] = useState\(false\)/.test(card), '...and so does the one on a new token')
  ok(/guard\(\(\) => setWrite\(c, true\)/.test(card), 'turning adding ON for an existing connection asks first; turning it off does not need to')

  done()
}

main()
