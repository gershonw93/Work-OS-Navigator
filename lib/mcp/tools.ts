import type { SupabaseClient } from '@supabase/supabase-js'
import { actorCan, type ActorPerms } from '@/lib/server-permissions'
import { ASSIGNED_ONLY_ROLES } from '@/lib/permissions'
import { clientLabel, ownedProjectsFilter } from '@/lib/project-access'
import { assigneeNames, type TaskAssignee } from '@/lib/task-assignees'
import { inspectionDate, visibleInspections, isOpen } from '@/lib/inspection-status'
import { lineTrade, scheduleLabel, scheduleSubLabel } from '@/lib/schedule-events'
import { toAmount, toPct } from '@/lib/schedule-dependencies'
import { settlementsFor } from '@/lib/invoice-settlement-db'
import { readBilling } from '@/lib/billing-read'
import { billingAccess } from '@/lib/billing-state'
import type { ToolOutcome, ToolSpec } from './protocol'
import { WRITE_TOOLS, type WriteToolDef } from './write-tools'
import { runWrite } from './actions'

// ─────────────────────────────────────────────────────────────────────────────
// What Claude can read out of SyteNav. PHASE 1: READ ONLY.
//
// THE GATES ARE IN THE DISPATCHER, NOT IN THE TOOLS. Every tool declares the
// permission it needs and whether it takes a project, and `callTool` asks
// both before a tool body runs - so a tool cannot be added that forgets to
// check, the same reasoning that put `requirePermission` in one place. Pinned
// in `mcp-server.ts`.
//
// WHICH JOBS. Only projects the person's company OWNS (`ownedProjectsFilter`,
// the same filter as the Projects list). Several app routes check only the
// permission and not the job; this is deliberately stricter, because a
// project id here comes from a model, not from a link somebody clicked.
//
// WHO. Not yet the roles scoped to their assigned jobs (`ASSIGNED_ONLY_ROLES`):
// what they see inside a job - only their own tasks - is decided inline in
// several routes, and a second copy of that here is how the two would drift.
// They are refused with a sentence rather than handed a wider view.
//
// A FAILED READ IS NOT AN EMPTY ONE. Every query's error is logged and becomes
// an error result. An `[]` handed to a model is a confident "there are none",
// which is the sentence it then repeats to a person.
// ─────────────────────────────────────────────────────────────────────────────

/** More than this many rows and the result says it was cut, rather than silently stopping. */
export const ROW_LIMIT = 200

type ProjectArg = 'required' | 'optional' | 'none'

interface RunContext {
  db: SupabaseClient
  actor: ActorPerms
  args: Record<string, unknown>
  /** The jobs this call covers: the one asked for, or every job the person can see. */
  projectIds: string[]
  projectNames: Map<string, string>
}

export interface ToolDef extends ToolSpec {
  /** The permission (resource) a person needs, at `view`. */
  resource: string
  project: ProjectArg
  run: (ctx: RunContext) => Promise<ToolOutcome>
}

const PROJECT_ID = {
  type: 'string',
  description: 'The project id from list_projects.',
}
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

const failed = (what: string, error: { message: string }): ToolOutcome => {
  console.error(`[mcp] ${what} read failed:`, error.message)
  return { error: `SyteNav could not read ${what} just now. Try again in a moment.` }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** The rows, and whether there were more than we sent. */
function capped<T>(rows: T[]): { rows: T[]; truncated: boolean } {
  return rows.length > ROW_LIMIT ? { rows: rows.slice(0, ROW_LIMIT), truncated: true } : { rows, truncated: false }
}

export const TOOLS: ToolDef[] = [
  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'Every job the signed-in person\'s company runs in SyteNav, newest first: id, name, status, ' +
      'type, address, client and start/end dates. Call this first - the other tools take its ids.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Only projects with this status, e.g. "active".' },
      },
      additionalProperties: false,
    },
    resource: 'projects',
    project: 'none',
    async run({ db, actor, args }) {
      let q = db.from('projects')
        .select('id, name, status, type, address, client, start_date, end_date, customers(name)')
        .or(ownedProjectsFilter(actor.companyId!))
        .order('created_at', { ascending: false })
      const status = str(args.status)
      if (status) q = q.eq('status', status)
      const { data, error } = await q
      if (error) return failed('projects', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          projects: rows.map((p: any) => ({
            id: p.id, name: p.name, status: p.status, type: p.type, address: p.address,
            client: clientLabel(p.customers?.name, p.client),
            start_date: p.start_date, end_date: p.end_date,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'get_project',
    title: 'Get a project',
    description: 'One job in full: status, type, address, client, dates, contract type and description.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'projects',
    project: 'required',
    async run({ db, projectIds }) {
      const { data, error } = await db.from('projects')
        .select('id, name, status, type, address, client, start_date, end_date, description, contract_type, customers(name)')
        .eq('id', projectIds[0])
        .maybeSingle()
      if (error) return failed('that project', error)
      if (!data) return { error: 'That project no longer exists.' }
      const p = data as any
      return {
        data: {
          id: p.id, name: p.name, status: p.status, type: p.type, address: p.address,
          client: clientLabel(p.customers?.name, p.client),
          start_date: p.start_date, end_date: p.end_date,
          contract_type: p.contract_type, description: p.description,
        },
      }
    },
  },

  {
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'Tasks on one job, or across every job when project_id is left out. Open tasks by default. ' +
      'To find what is overdue, pass due_before as today\'s date: a task is overdue when its ' +
      'due_date is before today and its status is not "completed".',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: ['open', 'completed', 'all'], description: 'Default "open" (everything not completed).' },
        due_before: { ...DATE, description: 'Only tasks due before this date (YYYY-MM-DD).' },
      },
      additionalProperties: false,
    },
    resource: 'tasks',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { tasks: [], truncated: false } }
      let q = db.from('project_tasks')
        .select('id, project_id, title, description, status, priority, due_date, completed_at')
        .in('project_id', projectIds)
        .order('due_date', { ascending: true, nullsFirst: false })
      const status = str(args.status) ?? 'open'
      if (status === 'open') q = q.neq('status', 'completed')
      else if (status === 'completed') q = q.eq('status', 'completed')
      const dueBefore = str(args.due_before)
      if (dueBefore) q = q.lt('due_date', dueBefore)
      const { data, error } = await q.limit(ROW_LIMIT + 1)
      if (error) return failed('tasks', error)
      const { rows, truncated } = capped(data ?? [])

      // Who is on each task. A refused read leaves the list as null - "nobody"
      // is a statement somebody acts on, never the sound of a failed query.
      const byTask = new Map<string, TaskAssignee[]>()
      let assigneesKnown = true
      if (rows.length) {
        const { data: a, error: aErr } = await db.from('project_task_assignees')
          .select('task_id, member_id, company_id, name')
          .in('task_id', rows.map((t: any) => t.id))
        if (aErr) { console.error('[mcp] task assignees read failed:', aErr.message); assigneesKnown = false }
        for (const r of (a ?? []) as any[]) byTask.set(r.task_id, [...(byTask.get(r.task_id) ?? []), r])
      }
      return {
        data: {
          tasks: rows.map((t: any) => ({
            id: t.id, project_id: t.project_id, project: projectNames.get(t.project_id) ?? null,
            title: t.title, description: t.description, status: t.status, priority: t.priority,
            due_date: t.due_date, completed_at: t.completed_at,
            assigned_to: assigneesKnown ? assigneeNames(byTask.get(t.id)) : null,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'get_schedule',
    title: 'Get a job\'s schedule',
    description:
      'The schedule for one job: each line\'s name, trade, subcontractor, start and end dates, and ' +
      'percent complete (null when nobody has said).',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'schedule',
    project: 'required',
    async run({ db, projectIds }) {
      const { data, error } = await db.from('schedule_items')
        .select('id, label, trade, start_date, end_date, progress_pct, subcontracts(scope, trade, companies(name, type))')
        .eq('project_id', projectIds[0])
        .order('start_date', { ascending: true })
      if (error) return failed('the schedule', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          schedule: rows.map((i: any) => ({
            id: i.id, name: scheduleLabel(i), trade: lineTrade(i), subcontractor: scheduleSubLabel(i),
            start_date: i.start_date, end_date: i.end_date,
            // NUMERIC comes back as a string - read it, never pass "80.00" on.
            percent_complete: toPct(i.progress_pct),
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_inspections',
    title: 'List inspections',
    description:
      'Inspections on one job, or every job when project_id is left out. Open ones by default. ' +
      '"date_label" says whether "date" is a confirmed booking ("Confirmed for") or only when it is ' +
      'wanted ("Needed by") - never describe a "Needed by" date as booked.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: ['open', 'all'], description: 'Default "open" (not yet passed or failed).' },
      },
      additionalProperties: false,
    },
    resource: 'inspections',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { inspections: [], truncated: false } }
      const { data, error } = await db.from('inspections')
        .select('id, project_id, type, trade, status, requested_date, scheduled_date, scheduled_time, inspector_name, booked_with, completed_date, failure_reason')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      if (error) return failed('inspections', error)
      let list = visibleInspections((data ?? []) as any[])
      if ((str(args.status) ?? 'open') === 'open') list = list.filter(i => isOpen(i.status))
      const { rows, truncated } = capped(list)
      return {
        data: {
          inspections: rows.map((i: any) => {
            const d = inspectionDate(i)
            return {
              id: i.id, project_id: i.project_id, project: projectNames.get(i.project_id) ?? null,
              type: i.type, trade: i.trade, status: i.status,
              date_label: d.label, date: d.value, time: i.scheduled_time,
              inspector: i.inspector_name, booked_with: i.booked_with,
              completed_date: i.completed_date, failure_reason: i.failure_reason,
            }
          }),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_sub_bills',
    title: 'List bills from subcontractors',
    description:
      'Bills subcontractors and vendors have sent, on one job or every job: who, invoice number, ' +
      'amount, status and dates. Filter by status, e.g. "submitted", "approved" or "paid".',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', description: 'Only bills with this status.' },
      },
      additionalProperties: false,
    },
    resource: 'invoices',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { bills: [], truncated: false } }
      let q = db.from('invoices')
        .select('id, project_id, company_name, invoice_number, description, amount, status, due_date, submitted_at, approved_at, paid_at, subcontracts(trade)')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      const status = str(args.status)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.limit(ROW_LIMIT + 1)
      if (error) return failed('bills', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          bills: rows.map((b: any) => ({
            id: b.id, project_id: b.project_id, project: projectNames.get(b.project_id) ?? null,
            from: b.company_name, trade: b.subcontracts?.trade ?? null,
            invoice_number: b.invoice_number, description: b.description,
            amount: toAmount(b.amount), status: b.status, due_date: b.due_date,
            submitted_at: b.submitted_at, approved_at: b.approved_at, paid_at: b.paid_at,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_client_invoices',
    title: 'List invoices to clients',
    description:
      'Invoices the company has billed its clients, on one job or every job: number, status, dates, ' +
      'total, how much has been paid and what is still owed.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', description: 'Only invoices with this status, e.g. "draft", "sent" or "paid".' },
      },
      additionalProperties: false,
    },
    resource: 'payments',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { invoices: [], truncated: false } }
      let q = db.from('client_invoices')
        .select('id, project_id, invoice_number, status, issue_date, due_date, sent_at, paid_at, client_invoice_lines(amount)')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      const status = str(args.status)
      if (status) q = q.eq('status', status)
      const { data, error } = await q.limit(ROW_LIMIT + 1)
      if (error) return failed('client invoices', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      // What the money says, from the same reader the invoices screen uses.
      // Missing from the map means it could not be read: null, not "unpaid".
      const settled = await settlementsFor(db, rows)
      return {
        data: {
          invoices: rows.map(i => {
            const s = settled.get(i.id)
            return {
              id: i.id, project_id: i.project_id, project: projectNames.get(i.project_id) ?? null,
              invoice_number: i.invoice_number, status: i.status,
              issue_date: i.issue_date, due_date: i.due_date, sent_at: i.sent_at, paid_at: i.paid_at,
              total: s?.total ?? null, paid: s?.paid ?? null, balance: s?.balance ?? null,
            }
          }),
          truncated,
        },
      }
    },
  },

  {
    name: 'list_subcontracts',
    title: 'List a job\'s subcontracts',
    description:
      'The subcontractors and suppliers on one job: subcontract id, company, trade, scope and status. ' +
      'Use the id to enter a bill or a change order against the right sub.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'team',
    project: 'required',
    async run({ db, projectIds }) {
      const { data, error } = await db.from('subcontracts')
        .select('id, trade, scope, status, company_id, companies ( name, type )')
        .eq('project_id', projectIds[0])
        .order('created_at', { ascending: true })
      if (error) return failed('subcontracts', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          subcontracts: rows.map((c: any) => ({
            id: c.id, company: c.companies?.name ?? null, company_type: c.companies?.type ?? null,
            trade: c.trade, scope: c.scope, status: c.status,
          })),
          truncated,
        },
      }
    },
  },

  {
    name: 'search_directory',
    title: 'Search the Directory',
    description:
      'Find subcontractors, suppliers and inspectors in the company Directory by name or email. ' +
      'Search before adding a contact, so nobody is added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Part of a name or email address.' },
        type: { type: 'string', enum: ['subcontractor', 'supplier', 'inspector', 'other'] },
      },
      required: ['query'],
      additionalProperties: false,
    },
    resource: 'directory',
    project: 'none',
    async run({ db, actor, args }) {
      // Only characters a name or address uses: the value goes into an ilike
      // pattern, where % and _ are wildcards, so they are taken out first.
      const q = (str(args.query) ?? '').replace(/[%_\\,()]/g, ' ').trim().slice(0, 80)
      if (q.length < 2) return { error: 'Search for at least two characters.' }
      const base = () => {
        let b = db.from('companies').select('id, name, type, trade, contact_email, phone')
          .eq('added_by_company_id', actor.companyId!)
        if (str(args.type)) b = b.eq('type', str(args.type)!)
        return b
      }
      const [byName, byEmail] = await Promise.all([
        base().ilike('name', `%${q}%`).limit(50),
        base().ilike('contact_email', `%${q}%`).limit(50),
      ])
      if (byName.error) return failed('the Directory', byName.error)
      if (byEmail.error) return failed('the Directory', byEmail.error)
      const seen = new Map<string, any>()
      for (const c of [...(byName.data ?? []), ...(byEmail.data ?? [])] as any[]) seen.set(c.id, c)
      return {
        data: {
          contacts: Array.from(seen.values()).map(c => ({
            id: c.id, name: c.name, type: c.type, trade: c.trade, email: c.contact_email, phone: c.phone,
          })),
        },
      }
    },
  },
]

/** The person cannot use the MCP server at all, and the sentence that says why - or null. */
export function actorProblem(actor: ActorPerms): string | null {
  if (!actor.companyId) return 'This SyteNav account is not linked to a company yet, so there is nothing to read.'
  if (ASSIGNED_ONLY_ROLES.includes(actor.role)) {
    return 'Connecting Claude is not available for your role yet - it is for people who see every job at their company. Ask your SyteNav admin.'
  }
  return null
}

/** Every tool this server has, reading and adding. */
export const ALL_TOOLS: (ToolDef | WriteToolDef)[] = [...TOOLS, ...WRITE_TOOLS]

/**
 * The tools a connection is shown. A connection the person did not allow to
 * add records is never even told the write tools exist - a model offered a
 * tool will try it, and "you may not" after the fact is a worse answer than
 * not offering.
 */
export function toolsFor(canWrite: boolean): ToolSpec[] {
  return ALL_TOOLS
    .filter(t => canWrite || !('write' in t && t.write))
    .map(({ name, title, description, inputSchema, ...rest }) => ({
      name, title, description, inputSchema, ...('write' in rest && rest.write ? { write: true } : {}),
    }))
}

export interface CallOptions {
  /** The person allowed this connection to add records. */
  canWrite: boolean
  /** Which connection made the call, for the record of what it did. */
  tokenId: string | null
}

/**
 * Run one tool for one person. Every gate is here, before any tool body:
 * who they are, whether this connection may add, the permission and action
 * the tool names, the billing lock for a write, the job, and - for a write -
 * the claim that stops a retried call making a second record.
 */
export async function callTool(
  db: SupabaseClient,
  actor: ActorPerms,
  name: string,
  args: Record<string, unknown>,
  opts: CallOptions = { canWrite: false, tokenId: null },
): Promise<ToolOutcome> {
  const tool = ALL_TOOLS.find(t => t.name === name)
  if (!tool) return { error: `Unknown tool: ${name}` }
  const write = 'write' in tool && tool.write === true

  const who = actorProblem(actor)
  if (who) return { error: who }

  if (write && !opts.canWrite) {
    return { error: 'This connection can only read SyteNav. To let Claude add records, turn on "Can add records" for it on Settings -> Integrations.' }
  }

  const action = write ? (tool as WriteToolDef).action : 'view'
  if (!actorCan(actor, tool.resource, action)) {
    return { error: `This person does not have permission to ${action} ${tool.resource.replace(/-/g, ' ')} in SyteNav.` }
  }

  if (write) {
    // The same lock every write route meets: an account past its trial is
    // still fully READABLE, and that includes through Claude.
    const access = billingAccess(await readBilling(db, actor.companyId!))
    if (!access.writable) return { error: access.reason }
  }

  let projectIds: string[] = []
  let projectNames = new Map<string, string>()
  if (tool.project !== 'none') {
    const { data: owned, error } = await db.from('projects')
      .select('id, name')
      .or(ownedProjectsFilter(actor.companyId!))
    if (error) return failed('projects', error)
    projectNames = new Map((owned ?? []).map((p: any) => [p.id as string, p.name as string]))

    const asked = str(args.project_id)
    if (asked) {
      // Not "not found": an id for a job at another company is refused in the
      // same words as one that never existed, so the answer leaks nothing.
      if (!projectNames.has(asked)) return { error: 'No project with that id among this person\'s jobs. Use list_projects for the ids.' }
      projectIds = [asked]
    } else if (tool.project === 'required') {
      return { error: 'project_id is required. Use list_projects for the ids.' }
    } else {
      projectIds = Array.from(projectNames.keys())
    }
  }

  if (!write) return (tool as ToolDef).run({ db, actor, args, projectIds, projectNames })
  return runWrite(db, actor, tool as WriteToolDef, args, projectIds[0] ?? null, opts.tokenId)
}
