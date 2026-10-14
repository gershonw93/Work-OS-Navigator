// Claude adding and editing customers, jobs, a job's team roster and
// Directory contacts - the customers-projects area of the MCP server.
//
// What must hold, beyond the rules every write tool follows (mcp-write.ts):
//   - Opening a job, or moving one back INTO a counted status, meets the plan's
//     project cap - and the cap lives in lib/writes/project.ts with the body,
//     so the app's route and Claude's tool meet the same one.
//   - An edit passes a NARROWER set of fields than the route: no money on a
//     project, no acknowledgement of the go-live pre-flight.
//   - A customer card and a Directory contact are the CALLER'S COMPANY'S or
//     they are refused - neither has a project_id for the dispatcher to check.
//   - Nothing here pushes to QuickBooks or emails anybody; the app's customer
//     routes still push on save, as they always did.
//   - Every route this area moved code out of is gated, and the ones that only
//     asked "are you signed in" now ask a permission.

import { callTool, ALL_TOOLS } from '../mcp/tools'
import { CUSTOMERS_PROJECTS_READ, CUSTOMERS_PROJECTS_WRITE } from '../mcp/areas/customers-projects'
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
const WRITE = { canWrite: true, tokenId: 'tok1' }
const READ_ONLY = { canWrite: false, tokenId: 'tok1' }

interface World {
  /** The plan: null is unmetered; otherwise an active plan with this many counted jobs open. */
  plan?: { key: string; open: number } | null
  /** Status the job p1 is in now. */
  status?: string
  /** Customers on this company. */
  customers?: string[]
  /** Team rows on p1. */
  team?: { id: string; name: string; email?: string }[]
  /** Directory rows: id -> who added it. */
  contacts?: Record<string, string | null>
}

function world(w: World = {}) {
  const customers = w.customers ?? ['cust1']
  const team = w.team ?? [{ id: 'm1', name: 'Jay Ortiz', email: 'jay@example.com' }]
  const contacts = w.contacts ?? { co1: 'c1', other: 'c2' }
  return fakeDb((t, ops) => {
    if (t === 'mcp_actions' && has(ops, 'insert')) return { data: { id: 'act1' } }
    if (t === 'mcp_actions') return { data: null }
    if (t === 'company_billing') {
      return w.plan ? { data: { company_id: 'c1', status: 'active', plan_key: w.plan.key, current_period_end: '2099-01-01T00:00:00Z' } } : { data: null }
    }
    if (t === 'ai_scans') return { data: null, count: 0 }
    if (t === 'profiles') return { data: { full_name: 'Dana Reyes' } }
    if (t === 'project_activity' || t === 'activity_log') return { data: null }
    if (t === 'projects') {
      if (has(ops, 'insert')) return { data: { id: 'pNew', ...opArg(ops, 'insert') } }
      if (has(ops, 'update')) return { data: { id: 'p1', name: 'Maple Street Duplex', ...opArg(ops, 'update') } }
      // The plan's meter: counted jobs open.
      if (ops.some(([m]) => m === 'in')) return { data: null, count: w.plan?.open ?? 0 }
      // The dispatcher's list of the company's own jobs.
      if (ops.some(([m]) => m === 'or')) return { data: [{ id: 'p1', name: 'Maple Street Duplex' }] }
      return { data: { id: 'p1', status: w.status ?? 'planning', gc_company_id: 'c1', is_site: false, customer_id: null, start_date: '2026-10-01', end_date: null } }
    }
    if (t === 'customers') {
      if (has(ops, 'insert')) return { data: { id: 'custNew', ...opArg(ops, 'insert') } }
      if (has(ops, 'update')) return { data: { id: eqVal(ops, 'id'), ...opArg(ops, 'update') } }
      const id = eqVal(ops, 'id')
      if (id !== undefined) return { data: customers.includes(id as string) && eqVal(ops, 'gc_company_id') !== 'nope' ? { id, name: 'Weisblum' } : null }
      return { data: customers.map(c => ({ id: c, name: 'Weisblum', email: 'w@example.com' })) }
    }
    if (t === 'project_team_members') {
      if (has(ops, 'insert')) return { data: { id: 'mNew', ...opArg(ops, 'insert') } }
      if (has(ops, 'update')) return { data: { id: eqVal(ops, 'id'), ...opArg(ops, 'update') } }
      const id = eqVal(ops, 'id')
      if (id !== undefined) return { data: team.some(m => m.id === id) && eqVal(ops, 'project_id') === 'p1' ? { id } : null }
      return { data: team }
    }
    if (t === 'companies') {
      if (has(ops, 'update')) return { data: { id: eqVal(ops, 'id'), type: 'subcontractor', ...opArg(ops, 'update') } }
      const id = eqVal(ops, 'id') as string
      if (id === 'c1') return { data: { id: 'c1', added_by_company_id: null, default_billing_mode: 'simple' } }
      return { data: id in contacts ? { id, added_by_company_id: contacts[id] } : null }
    }
    return { data: [] }
  })
}

const routeFn = (src: string, verb: string) => {
  const start = src.indexOf(`export async function ${verb}`)
  if (start < 0) return ''
  const next = src.indexOf('export async function', start + 10)
  return src.slice(start, next < 0 ? src.length : next)
}

async function main() {
  // ── the tools are there, and only add or edit ─────────────────────────────
  const writeNames = CUSTOMERS_PROJECTS_WRITE.map(t => t.name)
  for (const n of ['add_customer', 'update_customer', 'create_project', 'update_project', 'add_team_member', 'update_team_member', 'update_directory_contact']) {
    ok(writeNames.includes(n) && ALL_TOOLS.some(t => t.name === n && 'write' in t), `${n} is a write tool the server offers`)
  }
  ok(CUSTOMERS_PROJECTS_READ.some(t => t.name === 'list_customers') && ALL_TOOLS.some(t => t.name === 'list_customers' && !('write' in t)),
    'list_customers is a READ tool')
  ok(CUSTOMERS_PROJECTS_WRITE.every(t => t.write === true && (t.action === 'create' || t.action === 'edit')), 'every tool here asks create or edit - never delete')
  ok(![...CUSTOMERS_PROJECTS_READ, ...CUSTOMERS_PROJECTS_WRITE].some(t => /delete|remove|record_payment|apply_credit|approve|void|send_|invite/i.test(t.name)),
    'no tool name deletes, pays, approves, sends or invites')
  const keys = new Set(RESOURCES.map(r => r.key))
  ok([...CUSTOMERS_PROJECTS_READ, ...CUSTOMERS_PROJECTS_WRITE].every(t => keys.has(t.resource)), 'every resource named is a real permission')
  ok(new Set(ALL_TOOLS.map(t => t.name)).size === ALL_TOOLS.length, 'no tool name is used twice across the server')

  // ── nothing in the area file writes; the routes and the tools share lib ───
  const area = code('lib/mcp/areas/customers-projects.ts')
  ok(!/\.(insert|update|upsert|delete)\(/.test(area), 'THE AREA FILE WRITES NOTHING - every record goes through lib/writes')
  for (const [route, verb, fn] of [
    ['app/api/customers/route.ts', 'POST', 'createCustomer'],
    ['app/api/customers/route.ts', 'PATCH', 'updateCustomer'],
    ['app/api/customers/[customerId]/route.ts', 'PATCH', 'updateCustomer'],
    ['app/api/projects/route.ts', 'POST', 'createProject'],
    ['app/api/projects/[id]/route.ts', 'PATCH', 'updateProject'],
    ['app/api/projects/[id]/team/route.ts', 'POST', 'addTeamMember'],
    ['app/api/projects/[id]/team/[memberId]/route.ts', 'PATCH', 'updateTeamMember'],
    ['app/api/directory/[companyId]/route.ts', 'PATCH', 'updateDirectoryContact'],
  ] as const) {
    const body = routeFn(code(route), verb)
    ok(new RegExp(`${fn}\\(`).test(body) && !/\.(insert|update)\(/.test(body),
      `${verb} ${route.replace('app/api/', '')} calls ${fn} and writes nothing itself`)
    ok(new RegExp(`${fn}\\(`).test(area), `...and Claude's tool calls the same ${fn}`)
  }

  // ── the cap went with the body ────────────────────────────────────────────
  const lib = code('lib/writes/project.ts')
  const create = lib.slice(lib.indexOf('export async function createProject'), lib.indexOf('export async function updateProject'))
  const update = lib.slice(lib.indexOf('export async function updateProject'))
  ok(create.indexOf('projectSlotProblem(') > 0 && create.indexOf('projectSlotProblem(') < create.indexOf('.insert('),
    'THE CAP IS IN createProject, before the insert - so Claude cannot open the eleventh job')
  ok(/willCount && !wasCounted/.test(update) && update.indexOf('projectSlotProblem(') < update.indexOf('.update('),
    '...and in updateProject, before a job comes back into a counted status')
  ok(/billingLock\(/.test(routeFn(code('app/api/projects/route.ts'), 'POST')) && /billingLock\(/.test(routeFn(code('app/api/projects/[id]/route.ts'), 'PATCH')),
    'the routes still ask the read-only lock themselves (the dispatcher asks it for Claude)')

  // ── QuickBooks: the app still pushes, Claude's path never does ────────────
  for (const f of ['lib/writes/customer.ts', 'lib/writes/project.ts', 'lib/writes/team-member.ts', 'lib/writes/directory-contact-edit.ts', 'lib/mcp/areas/customers-projects.ts']) {
    ok(!/from '[^']*quickbooks|push(Customer|Invoice|Bill|Vendor|Payment)\w*\(|sendEmail\(/i.test(code(f)), `${f.split('/').pop()}: pushes nothing to QuickBooks and emails nobody`)
  }
  ok(/pushCustomer\(/.test(routeFn(code('app/api/customers/route.ts'), 'POST')) && /pushCustomer\(/.test(routeFn(code('app/api/customers/route.ts'), 'PATCH'))
    && /pushCustomer\(/.test(routeFn(code('app/api/customers/[customerId]/route.ts'), 'PATCH')),
    '...while the app\'s customer routes still push on save, as they always did')
  ok(/afterCustomerCreated: id => pushCustomer\(admin, id\)/.test(code('app/api/projects/route.ts')),
    '...including a customer the New Project form types into being')

  // ── every handler in the routes this area touched is gated ────────────────
  const gates: [string, string, RegExp][] = [
    ['app/api/customers/route.ts', 'GET', /actorCan\(actor, 'customers', 'view'\)/],
    ['app/api/customers/route.ts', 'POST', /requirePermission\(db, request, 'customers', 'edit'\)/],
    ['app/api/customers/route.ts', 'PATCH', /requirePermission\(db, request, 'customers', 'edit'\)/],
    ['app/api/customers/[customerId]/route.ts', 'GET', /requirePermission\(admin\(\), request, 'customers', 'view'\)/],
    ['app/api/customers/[customerId]/route.ts', 'PATCH', /requirePermission\(admin\(\), request, 'customers', 'edit'\)/],
    ['app/api/customers/[customerId]/route.ts', 'DELETE', /requirePermission\(admin\(\), request, 'customers', 'delete'\)/],
    ['app/api/projects/route.ts', 'GET', /requirePermission\(db, request, 'projects', 'view'\)/],
    ['app/api/projects/route.ts', 'POST', /actorCan\(actor, 'projects', 'create'\)/],
    ['app/api/projects/[id]/route.ts', 'GET', /requirePermission\(db, request, 'projects', 'view'\)/],
    ['app/api/projects/[id]/route.ts', 'PATCH', /actorCan\(actor, 'projects', 'edit'\)[\s\S]*ownedProject/],
    ['app/api/projects/[id]/route.ts', 'DELETE', /actorCan\(actor, 'projects', 'edit'\)[\s\S]*ownedProject/],
    ['app/api/projects/[id]/team/route.ts', 'POST', /requirePermission\(db, request, 'team', 'edit'\)[\s\S]*ownedProject/],
    ['app/api/projects/[id]/team/[memberId]/route.ts', 'PATCH', /requirePermission\(db, request, 'team', 'edit'\)[\s\S]*ownedProject/],
    ['app/api/projects/[id]/team/[memberId]/route.ts', 'DELETE', /requirePermission\(db, request, 'team', 'edit'\)[\s\S]*ownedProject/],
    ['app/api/directory/[companyId]/route.ts', 'PATCH', /directoryGate\(/],
    ['app/api/directory/[companyId]/route.ts', 'DELETE', /directoryGate\(/],
  ]
  for (const [route, verb, gate] of gates) {
    const fn = routeFn(code(route), verb)
    ok(fn.length > 0 && gate.test(fn), `${verb} ${route.replace('app/api/', '')} is gated`)
  }
  const dir = code('app/api/directory/[companyId]/route.ts')
  const dirGate = dir.slice(dir.indexOf('async function directoryGate'), dir.indexOf('export async function PATCH'))
  ok(/requirePermission\(db, request, 'directory', action\)/.test(dirGate) && /directoryContactProblem\(/.test(dirGate),
    'the Directory gate asks the permission for the act (a write, so the read-only lock comes with it) and WHOSE CONTACT IT IS')
  // The owner's call: somebody WITHOUT directory edit/delete cannot do either,
  // from the screen or around it - the route asks the act, the screen hides it.
  ok(/directoryGate\(db, request, params\.companyId, 'edit'\)/.test(routeFn(dir, 'PATCH')), 'changing a contact needs directory: edit')
  ok(/directoryGate\(db, request, params\.companyId, 'delete'\)/.test(routeFn(dir, 'DELETE')), 'removing a contact needs directory: delete')
  const dirPage = code('app/(dashboard)/directory/page.tsx')
  ok(/canEditContact = can\('directory', 'edit'\)/.test(dirPage) && /canDeleteContact = can\('directory', 'delete'\)/.test(dirPage)
    && (dirPage.match(/\{canEditContact && \(/g) ?? []).length === 3 && (dirPage.match(/\{canDeleteContact && \(/g) ?? []).length === 3,
    'the Directory screen offers Edit and Delete only to whoever holds them - all three places each appears')
  ok(/added_by_company_id !== myCompanyId/.test(code('lib/writes/directory-contact-edit.ts')),
    '...which is: one this company added - not another firm\'s own account')
  // The team roster read is not gated on `team: view` - workers and invited
  // subs read it from Daily Logs and Plans while holding `team: N` - but it is
  // no longer signed-in only: the caller has to be ON the job (lockdown-job.ts).
  ok(/jobSide\(db, actor, params\.id\)/.test(routeFn(code('app/api/projects/[id]/team/route.ts'), 'GET')), '(team GET asks "on this job", not team: view - documented, not forgotten)')

  // ── behaviour, through the dispatcher ─────────────────────────────────────
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'add_customer', { name: 'New Client' }, READ_ONLY)
    ok('error' in r && !written(calls, 'customers', 'insert').length, 'A READ-ONLY CONNECTION adds no customer')
  }
  {
    const { db, calls } = world()
    // A company that remapped Office Staff to view-only customers.
    const a = actor('office_staff'); a.permissions = { ...a.permissions, customers: { view: true } }
    const r: any = await callTool(db, a, 'add_customer', { name: 'New Client' }, WRITE)
    ok('error' in r && /permission/.test(r.error) && !written(calls, 'customers', 'insert').length, 'somebody who may only VIEW customers adds none through Claude either')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor('project_manager'), 'add_customer', { name: 'Brand New Client', email: 'new@example.com' }, WRITE)
    const row = written(calls, 'customers', 'insert')[0]
    ok(r.data?.created && row?.gc_company_id === 'c1' && row?.name === 'Brand New Client', 'a Project Manager files a customer, in THEIR company')
    ok(/QuickBooks is not updated/.test(r.data?.next ?? ''), '...and is told nothing went to QuickBooks')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'add_customer', { name: 'weisblum' }, WRITE)
    ok('error' in r && !written(calls, 'customers', 'insert').length, 'a customer already on file is refused by the app\'s own duplicate check')
  }
  {
    const { db, calls } = world({ customers: [] })
    const r: any = await callTool(db, actor(), 'update_customer', { customer_id: 'theirs', name: 'X' }, WRITE)
    ok('error' in r && !written(calls, 'customers', 'update').length, 'ANOTHER COMPANY\'S CUSTOMER is refused, and nothing is written')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_customer', { customer_id: 'cust1', phone: '555 0100', gc_company_id: 'c2' } as any, WRITE)
    const upd = written(calls, 'customers', 'update')[0]
    ok(upd?.phone === '555 0100' && !('gc_company_id' in (upd ?? {})), 'a customer edit cannot move the card to another company')
  }

  // ── jobs ─────────────────────────────────────────────────────────────────
  {
    const { db, calls } = world({ plan: { key: 'up-to-3', open: 3 } })
    const r: any = await callTool(db, actor(), 'create_project', { name: 'Lot 9', address: '9 Elm St', start_date: '2026-11-01', customer_id: 'cust1' }, WRITE)
    ok('error' in r && !written(calls, 'projects', 'insert').length, 'THE PLAN IS FULL: Claude cannot open another job')
  }
  {
    const { db, calls } = world({ plan: { key: 'up-to-3', open: 1 } })
    const r: any = await callTool(db, actor(), 'create_project', { name: 'Lot 9', address: '9 Elm St', start_date: '2026-11-01', customer_id: 'cust1' }, WRITE)
    const row = written(calls, 'projects', 'insert')[0]
    ok(r.data?.created && row?.status === 'planning' && row?.gc_company_id === 'c1' && row?.customer_id === 'cust1',
      'with room on the plan, the job opens in Planning, owned by the caller\'s company, under the picked customer')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'create_project', { name: 'Lot 9', address: '9 Elm St', start_date: '2026-11-01', customer_id: 'theirs' }, WRITE)
    ok('error' in r && !written(calls, 'projects', 'insert').length, 'a customer id from another company is refused, not linked')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'create_project', { name: 'Lot 9', start_date: '2026-11-01', client_name: 'A' }, WRITE)
    ok('error' in r && /address/i.test(r.error) && !written(calls, 'projects', 'insert').length, 'the New Project form\'s rules are asked: no address, no job')
  }
  {
    const { db, calls } = world({ plan: { key: 'up-to-3', open: 3 }, status: 'completed' })
    const r: any = await callTool(db, actor(), 'update_project', { project_id: 'p1', status: 'on_hold' }, WRITE)
    ok('error' in r && !written(calls, 'projects', 'update').length, 'BRINGING A JOB BACK opens a slot, and a full plan refuses it')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_project', {
      project_id: 'p1', name: 'Maple St Duplex', contractor_fee_pct: 0.5, sellout_amount: 1, billing_mode: 'aia',
      labor_rate: 999, acknowledge: ['all'], gc_company_id: 'c2',
    } as any, WRITE)
    const upd = written(calls, 'projects', 'update')[0]
    ok(upd?.name === 'Maple St Duplex', 'a job edit changes the name')
    ok(!['contractor_fee_pct', 'sellout_amount', 'billing_mode', 'labor_rate', 'gc_company_id', 'acknowledge'].some(k => k in (upd ?? {})),
      'MONEY AND OWNERSHIP ARE NOT CLAUDE\'S TO CHANGE: the fee, sale price, billing mode, labour rate and owner never reach the write')
  }
  {
    const { db } = world()
    const r: any = await callTool(db, actor(), 'update_project', { project_id: 'not-ours', name: 'X' }, WRITE)
    ok('error' in r, 'a job that is not the company\'s is refused before any tool body runs')
  }

  // ── team ─────────────────────────────────────────────────────────────────
  {
    const { db, calls } = world({ team: [] })
    const r: any = await callTool(db, actor(), 'update_team_member', { project_id: 'p1', member_id: 'm9', name: 'X' }, WRITE)
    ok('error' in r && !written(calls, 'project_team_members', 'update').length, 'A TEAM MEMBER ON ANOTHER JOB is refused, and nothing is written')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_team_member', { project_id: 'p1', member_id: 'm1', phone: '555-0101', project_id_override: 'p2', profile_id: 'u9' } as any, WRITE)
    const upd = written(calls, 'project_team_members', 'update')[0]
    ok(upd?.phone === '555-0101' && !('profile_id' in (upd ?? {})) && !('project_id' in (upd ?? {})), 'a team edit changes the phone and cannot re-link the login or the job')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'add_team_member', { project_id: 'p1', name: 'jay ortiz', role: 'Foreman' }, WRITE)
    ok('error' in r && !written(calls, 'project_team_members', 'insert').length, 'somebody already on the roster is not added twice')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'add_team_member', { project_id: 'p1', name: 'Rosa Lin', role: 'Electrician?' } as any, WRITE)
    ok('error' in r && !written(calls, 'project_team_members', 'insert').length, 'a role outside the job roles is refused')
    const r2: any = await callTool(db, actor(), 'add_team_member', { project_id: 'p1', name: 'Rosa Lin', role: 'Subcontractor', phone: '555 0199' }, WRITE)
    const row = written(calls, 'project_team_members', 'insert')[0]
    ok(r2.data?.created && row?.project_id === 'p1' && row?.name === 'Rosa Lin', 'a new person goes on THIS job\'s roster')
  }

  // ── Directory ────────────────────────────────────────────────────────────
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'update_directory_contact', { contact_id: 'other', name: 'Renamed' }, WRITE)
    ok('error' in r && !written(calls, 'companies', 'update').length, 'ANOTHER FIRM\'S OWN ACCOUNT is not renamed through the Directory')
    const own: any = await callTool(db, actor(), 'update_directory_contact', { contact_id: 'c1', name: 'Renamed' }, WRITE)
    ok('error' in own && !written(calls, 'companies', 'update').length, '...nor is the caller\'s own company - that is Settings')
  }
  {
    const { db, calls } = world()
    await callTool(db, actor(), 'update_directory_contact', { contact_id: 'co1', phone: '321-638-0808', added_by_company_id: 'c2', insurance_status: 'current' } as any, WRITE)
    const upd = written(calls, 'companies', 'update')[0]
    ok(upd?.phone === '321-638-0808' && !('added_by_company_id' in (upd ?? {})) && !('insurance_status' in (upd ?? {})),
      'a contact this company added is corrected - and cannot be handed to another company or marked insured')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor('project_manager'), 'update_directory_contact', { contact_id: 'co1', phone: '321' }, WRITE)
    ok('error' in r && !written(calls, 'companies', 'update').length, 'Claude asks `directory: edit`, which a Project Manager does not hold')
  }

  // ── reads ────────────────────────────────────────────────────────────────
  {
    const { db } = fakeDb(t => t === 'customers' ? { error: { message: 'boom' } } : { data: [] })
    const r: any = await callTool(db, actor(), 'list_customers', {})
    ok('error' in r, 'A FAILED READ IS AN ERROR, never an empty customer list')
  }
  {
    const { db, calls } = world()
    const r: any = await callTool(db, actor(), 'list_customers', { query: 'weis' })
    const c = calls.find(x => x.table === 'customers')!
    ok(r.data?.customers?.length === 1 && eqVal(c.ops, 'gc_company_id') === 'c1', 'list_customers reads this company\'s cards only')
  }

  done()
}

main()
