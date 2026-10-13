import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorPerms } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import { createTask, updateTask } from '@/lib/writes/task'
import { createSubBill } from '@/lib/writes/sub-bill'
import { createInspection } from '@/lib/writes/inspection'
import { createChangeOrder } from '@/lib/writes/change-order'
import { createDirectoryContact } from '@/lib/writes/directory-contact'
import { createBudgetLine, updateBudgetLine } from '@/lib/writes/budget-line'
import { createSubcontract, updateSubcontract } from '@/lib/writes/subcontract'
import { createScheduleItem, updateScheduleItem } from '@/lib/writes/schedule-item'
import { createDailyLog } from '@/lib/writes/daily-log'
import { createClientInvoice } from '@/lib/writes/client-invoice'
import { createPaymentRequest } from '@/lib/writes/payment-request'
import { applyScheduleMove } from '@/lib/writes/schedule-move'
import type { WriteResult } from '@/lib/writes/result'
import type { ToolOutcome, ToolSpec } from './protocol'

// ─────────────────────────────────────────────────────────────────────────────
// What Claude can ADD to SyteNav. PHASE 3.
//
// EVERY RECORD IS MADE BY THE APP'S OWN CODE. Each tool turns Claude's
// arguments into the body the app's form would send and calls the same
// function the route does (`lib/writes/*`) - so the validation, the activity
// line and the notification are the ones a person pressing the button gets,
// and none of it has a second copy here. Nothing in this file inserts a record
// itself; the pin in `mcp-write.ts` reads it for exactly that.
//
// ONLY ADDING, AND ONLY WHAT A PERSON STILL CHECKS. No edits, no deletes, no
// payments. A bill is born waiting for approval, so the QuickBooks push - which
// runs on approval - happens only after a person has looked at it: Claude can
// never book an expense, and a bill it read out of QuickBooks cannot be pushed
// back in as a second one without somebody approving the duplicate. A change
// order is born pending. Recording money received pushes to QuickBooks the
// moment it is saved, which is why there is no tool for it.
//
// THE GATES ARE IN THE DISPATCHER (`callTool` in tools.ts): that the person
// allowed this connection to add, the permission and action each tool names,
// the billing lock, the job, and the duplicate guard. A tool body here only
// runs once all of them have said yes.
// ─────────────────────────────────────────────────────────────────────────────

/** Who to credit in the activity feed: "Dana via Claude". */
export const VIA = 'Claude'

/** A document attached to a bill. Vercel caps a request body near 4.5MB; base64 adds a third. */
export const MAX_DOCUMENT_BYTES = 3 * 1024 * 1024
const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']

export interface WriteRunContext {
  db: SupabaseClient
  actor: ActorPerms
  args: Record<string, unknown>
  /** The one job this call is for - checked against the company's own by the dispatcher. */
  projectId: string | null
}

export interface WriteToolDef extends ToolSpec {
  write: true
  resource: string
  action: Action
  project: 'required' | 'none'
  run: (ctx: WriteRunContext) => Promise<ToolOutcome>
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const fold = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const PROJECT_ID = { type: 'string', description: 'The project id from list_projects.' }
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }

/** The app's answer, as Claude reads it: the record on success, the app's own sentence on refusal. */
function outcome(result: WriteResult, key: string, summary: (row: any) => Record<string, unknown>): ToolOutcome {
  if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
  const row = result.body?.[key]
  if (!row) return { error: 'SyteNav did not confirm the record was created. Check the app before trying again.' }
  return { data: { created: true, ...summary(row) } }
}

/**
 * A person's name, matched to EXACTLY ONE roster member on the job or nobody.
 * A name is not a key (`lib/inspector-link.ts`): a partial or shared name stays
 * a name on the task, which is how the app stores a typed assignee anyway.
 */
async function assigneesFor(db: SupabaseClient, projectId: string, names: unknown): Promise<{ member_id?: string; name: string }[]> {
  const list = Array.isArray(names) ? names.map(str).filter(Boolean) as string[] : []
  if (!list.length) return []
  const { data } = await db.from('project_team_members').select('id, name').eq('project_id', projectId)
  const roster = (data ?? []) as { id: string; name: string | null }[]
  return list.slice(0, 10).map(name => {
    const hits = roster.filter(m => fold(m.name) === fold(name))
    return hits.length === 1 ? { member_id: hits[0].id, name: hits[0].name ?? name } : { name }
  })
}

/** Store a bill's document where the scan route stores them, or say why not. */
async function storeDocument(
  db: SupabaseClient, projectId: string, doc: unknown,
): Promise<{ url: string; name: string; path: string } | { problem: string } | null> {
  if (doc == null) return null
  if (typeof doc !== 'object' || Array.isArray(doc)) return { problem: 'document must be an object with filename, content_type and data_base64.' }
  const d = doc as Record<string, unknown>
  const filename = str(d.filename) ?? 'document'
  const type = str(d.content_type)?.toLowerCase() ?? ''
  if (!DOCUMENT_TYPES.includes(type)) return { problem: 'Attach a PDF or a photo (PNG, JPEG, WebP or HEIC).' }
  const b64 = typeof d.data_base64 === 'string' ? d.data_base64.replace(/^data:[^,]*,/, '') : ''
  const buf = Buffer.from(b64, 'base64')
  if (!buf.length) return { problem: 'The attached document is empty.' }
  if (buf.length > MAX_DOCUMENT_BYTES) {
    return { problem: `That document is over ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB, too big to send through Claude. Enter the bill without it and upload the file on the bill in SyteNav.` }
  }
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${projectId}/invoices/${Date.now()}-${safe}`
  const { error } = await db.storage.from('submittals').upload(path, buf, { contentType: type, upsert: false })
  if (error) {
    console.error('[mcp] bill document upload:', error.message)
    return { problem: 'SyteNav could not store the document, so the bill was not entered. Try again, or enter it without the document.' }
  }
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  return { url: signed?.signedUrl ?? '', name: filename, path }
}

export const WRITE_TOOLS: WriteToolDef[] = [
  {
    name: 'create_task',
    title: 'Create a task',
    write: true,
    description:
      'Add a task to a job, as the Tasks tab does. Everyone it is assigned to is notified. ' +
      'Confirm the title, job and due date with the person first.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        title: { type: 'string', description: 'What needs doing.' },
        description: { type: 'string' },
        due_date: { ...DATE, description: 'YYYY-MM-DD' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        assignee_names: { type: 'array', items: { type: 'string' }, description: 'People to put on it, by name as they appear on the job\'s team.' },
      },
      required: ['project_id', 'title'],
      additionalProperties: false,
    },
    resource: 'tasks',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (args.due_date != null && !isDate(args.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }
      const assignees = await assigneesFor(db, projectId!, args.assignee_names)
      const result = await createTask(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: {
          title: str(args.title), description: str(args.description), due_date: args.due_date ?? null,
          priority: ['low', 'medium', 'high'].includes(args.priority as string) ? args.priority : undefined,
          assignees,
        },
      })
      return outcome(result, 'task', t => ({
        record: 'task', id: t.id, title: t.title, due_date: t.due_date, status: t.status,
        assigned_to: assignees.map(a => a.name),
      }))
    },
  },

  {
    name: 'create_sub_bill',
    title: 'Enter a bill from a sub or vendor',
    write: true,
    description:
      'Enter a bill a subcontractor or vendor sent, as the Invoices tab does. It is created WAITING ' +
      'FOR APPROVAL and the people who approve bills are notified; nothing goes to QuickBooks until a ' +
      'person approves it in SyteNav. Prefer subcontract_id (from list_subcontracts) when the vendor ' +
      'has one on the job; otherwise give vendor_name. Check list_sub_bills first so the same bill is ' +
      'not entered twice. The original document (PDF or photo, under 3MB) can be attached.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        amount: { type: 'number', exclusiveMinimum: 0, description: 'The bill total in dollars.' },
        subcontract_id: { type: 'string', description: 'From list_subcontracts, when the vendor has a subcontract on this job.' },
        vendor_name: { type: 'string', description: 'Who sent it, when there is no subcontract_id.' },
        vendor_invoice_number: { type: 'string', description: 'The number printed on their invoice.' },
        description: { type: 'string', description: 'What it is for.' },
        due_date: { ...DATE, description: 'YYYY-MM-DD' },
        document: {
          type: 'object',
          description: 'The bill itself, e.g. the PDF from the email.',
          properties: {
            filename: { type: 'string' },
            content_type: { type: 'string', enum: DOCUMENT_TYPES },
            data_base64: { type: 'string' },
          },
          required: ['filename', 'content_type', 'data_base64'],
        },
      },
      required: ['project_id', 'amount'],
      additionalProperties: false,
    },
    resource: 'invoices',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const amount = typeof args.amount === 'number' ? args.amount : Number(args.amount)
      if (!Number.isFinite(amount) || amount <= 0) return { error: 'amount must be a number above zero.' }
      if (args.due_date != null && !isDate(args.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }

      // WHOSE BILL. A subcontract on THIS job names the company; otherwise the
      // vendor's name, matched to the company's own Directory exactly or not
      // at all - a near miss stays a typed name rather than the wrong vendor.
      let company_id: string | null = null
      let company_name: string | null = null
      const scId = str(args.subcontract_id)
      if (scId) {
        const { data: sc, error } = await db.from('subcontracts')
          .select('id, company_id, companies ( name )')
          .eq('id', scId).eq('project_id', projectId!).maybeSingle()
        if (error) { console.error('[mcp] subcontract read:', error.message); return { error: 'SyteNav could not check that subcontract just now.' } }
        if (!sc) return { error: 'That subcontract is not on this job. Use list_subcontracts for the ids.' }
        company_id = (sc as any).company_id ?? null
        company_name = (sc as any).companies?.name ?? null
      } else {
        const vendor = str(args.vendor_name)
        if (!vendor) return { error: 'Say who the bill is from: subcontract_id, or vendor_name.' }
        company_name = vendor
        const { data: dir } = await db.from('companies').select('id, name').eq('added_by_company_id', actor.companyId!)
        const hits = ((dir ?? []) as { id: string; name: string }[]).filter(c => fold(c.name) === fold(vendor))
        if (hits.length === 1) { company_id = hits[0].id; company_name = hits[0].name }
      }

      const doc = await storeDocument(db, projectId!, args.document)
      if (doc && 'problem' in doc) return { error: doc.problem }

      const ref = str(args.vendor_invoice_number)
      const description = [ref ? `Vendor invoice #${ref}` : null, str(args.description)].filter(Boolean).join(' - ') || null
      const result = await createSubBill(db, {
        userId: actor.userId, projectId: projectId!, company_id, company_name, via: VIA,
        fields: {
          subcontract_id: scId, amount, description, due_date: (args.due_date as string) ?? null,
          document_url: doc?.url ?? null, document_name: doc?.name ?? null,
        },
      })
      if (result.status >= 400 && doc) {
        // The bill was refused, so the file it would have carried goes too.
        const { error } = await db.storage.from('submittals').remove([doc.path])
        if (error) console.error('[mcp] removing an orphaned bill document:', error.message)
      }
      return outcome(result, 'invoice', b => ({
        record: 'bill', id: b.id, number: b.invoice_number, from: b.company_name, amount: Number(b.amount),
        status: b.status, document_attached: !!b.document_url,
        next: 'It is waiting for approval on the Invoices tab. Nothing has gone to QuickBooks.',
      }))
    },
  },

  {
    name: 'request_inspection',
    title: 'Request an inspection',
    write: true,
    description:
      'Ask for an inspection to be booked, as the Inspections tab does. The people who book inspections ' +
      'are told, with the numbers to call. It does NOT book anything with the township or inspector - a ' +
      'person still calls. requested_date is when it is NEEDED BY, not a confirmed appointment.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        inspection_type: { type: 'string', description: 'e.g. Footing, Framing, Rough Electrical, Final.' },
        requested_date: { ...DATE, description: 'When it is needed by, YYYY-MM-DD.' },
        trade: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['project_id', 'inspection_type', 'requested_date'],
      additionalProperties: false,
    },
    resource: 'inspections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (!isDate(args.requested_date)) return { error: 'requested_date must be YYYY-MM-DD.' }
      const result = await createInspection(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        // `requested`, never `scheduled`: a booking needs who it was booked
        // with, and that is a phone call this tool cannot make.
        fields: {
          inspection_type: str(args.inspection_type), trade: str(args.trade), status: 'requested',
          requested_date: args.requested_date, notes: str(args.notes),
        },
      })
      return outcome(result, 'inspection', i => ({
        record: 'inspection', id: i.id, type: i.type, status: i.status, needed_by: i.requested_date,
        people_told: result.body?.notified ?? 0,
      }))
    },
  },

  {
    name: 'create_change_order',
    title: 'Raise a change order',
    write: true,
    description:
      'Raise a change order on a job, as the Change Orders tab does. It is created PENDING - approving it ' +
      'is a person\'s decision in SyteNav.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        title: { type: 'string' },
        amount: { type: 'number', description: 'Dollars; negative for a credit.' },
        description: { type: 'string' },
        reason: { type: 'string' },
        subcontract_id: { type: 'string', description: 'From list_subcontracts, when it is a sub\'s change.' },
      },
      required: ['project_id', 'title'],
      additionalProperties: false,
    },
    resource: 'change-orders',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const amount = args.amount == null ? 0 : Number(args.amount)
      if (!Number.isFinite(amount)) return { error: 'amount must be a number.' }
      const scId = str(args.subcontract_id)
      if (scId) {
        const { data: sc } = await db.from('subcontracts').select('id').eq('id', scId).eq('project_id', projectId!).maybeSingle()
        if (!sc) return { error: 'That subcontract is not on this job. Use list_subcontracts for the ids.' }
      }
      const result = await createChangeOrder(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: { title: str(args.title), amount, description: str(args.description), reason: str(args.reason), subcontract_id: scId, requested_by_type: 'gc' },
      })
      return outcome(result, 'changeOrder', c => ({
        record: 'change_order', id: c.id, title: c.title, amount: Number(c.amount), status: c.status,
      }))
    },
  },

  {
    name: 'add_directory_contact',
    title: 'Add a Directory contact',
    write: true,
    description:
      'Add a subcontractor, supplier or inspector to the company Directory. Search with search_directory ' +
      'first - a contact already there is refused rather than added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Company or person.' },
        type: { type: 'string', enum: ['subcontractor', 'supplier', 'inspector', 'other'] },
        contact_email: { type: 'string' },
        phone: { type: 'string' },
        trade: { type: 'string' },
        address: { type: 'string' },
      },
      required: ['name', 'type', 'contact_email'],
      additionalProperties: false,
    },
    resource: 'directory',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      const name = str(args.name)
      const email = str(args.contact_email)
      if (name || email) {
        const { data: mine } = await db.from('companies').select('id, name, contact_email').eq('added_by_company_id', actor.companyId!)
        const dupe = ((mine ?? []) as any[]).find(c =>
          (name && fold(c.name) === fold(name)) || (email && fold(c.contact_email) === fold(email)))
        if (dupe) return { error: `Already in the Directory as "${dupe.name}" (${dupe.contact_email ?? 'no email'}). Nothing was added.` }
      }
      const result = await createDirectoryContact(db, {
        myCompanyId: actor.companyId,
        body: { name, type: args.type, contact_email: email, phone: str(args.phone), trade: str(args.trade), address: str(args.address) },
      })
      return outcome(result, 'company', c => ({ record: 'directory_contact', id: c.id, name: c.name, type: c.type }))
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: budget, subcontracts, schedule, tasks, daily logs and client billing.
//
// Same rules as above, plus three of their own, each because the app's route
// is wider than an AI should be:
//   - EDIT TOOLS EXPOSE A NARROWER SET OF FIELDS THAN THE ROUTE TAKES. No
//     markup on a budget line (that is the margin), no payment schedule on a
//     subcontract (the route wipes and replaces it), no vendor name or email
//     (that renames them on every job), no status a check constraint refuses.
//   - EVERYTHING CLIENT-FACING STAYS A DRAFT. A client invoice is born `draft`
//     and a payment request unsent - the send is a separate route a person
//     presses - and a daily log Claude writes waits for review before it can
//     reach the client's PDF.
//   - THE RECORD AN EDIT NAMES IS CHECKED AGAINST THE JOB FIRST. Some update
//     routes look a row up by id alone; here it must belong to the job the
//     dispatcher already checked is the company's.
// ─────────────────────────────────────────────────────────────────────────────

const money = (v: unknown): number | null | 'bad' => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 'bad'
}
const pct = (v: unknown): number | null | 'bad' => {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 'bad'
}

/** Only the keys the caller actually gave - an absent key is "leave it alone", never "clear it". */
function given(args: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (k in args && args[k] !== undefined) out[k] = args[k]
  return out
}

/** Does this row belong to this job? A failed read is not a "no" - it says so. */
async function onJob(db: SupabaseClient, table: string, id: unknown, projectId: string): Promise<string | null> {
  if (typeof id !== 'string' || !id.trim()) return 'Say which one: the id is missing.'
  const { data, error } = await db.from(table).select('id').eq('id', id).eq('project_id', projectId).maybeSingle()
  if (error) { console.error(`[mcp] ${table} lookup:`, error.message); return 'SyteNav could not check that record just now.' }
  return data ? null : 'That record is not on this job.'
}

export const MORE_WRITE_TOOLS: WriteToolDef[] = [
  {
    name: 'add_budget_line',
    title: 'Add a budget line',
    write: true,
    description: 'Add a line to a job\'s budget, as the Budget tab does - e.g. "Preconstruction - sewer, $1,520". Check get_budget first so the same line is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        description: { type: 'string' },
        budgeted_amount: { type: 'number', minimum: 0, description: 'Dollars.' },
        category: { type: 'string', description: 'e.g. Preconstruction, Sitework. Defaults to General.' },
        cost_code: { type: 'string' },
        cost_type: { type: 'string', enum: ['hard', 'soft'] },
        notes: { type: 'string' },
      },
      required: ['project_id', 'description'],
      additionalProperties: false,
    },
    resource: 'budget',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const amount = money(args.budgeted_amount)
      if (amount === 'bad') return { error: 'budgeted_amount must be a number, zero or more.' }
      const result = await createBudgetLine(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: {
          description: str(args.description), budgeted_amount: amount ?? 0, category: str(args.category) ?? undefined,
          cost_code: str(args.cost_code), cost_type: args.cost_type === 'soft' ? 'soft' : 'hard', notes: str(args.notes),
        },
      })
      return outcome(result, 'item', l => ({
        record: 'budget_line', id: l.id, description: l.description, category: l.category, budgeted_amount: Number(l.budgeted_amount),
      }))
    },
  },

  {
    name: 'update_budget_line',
    title: 'Change a budget line',
    write: true,
    description: 'Change a budget line\'s description, cost code, category, notes or amounts (budgeted, committed, actual). Only the fields you pass change. Markup cannot be changed here.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        line_id: { type: 'string', description: 'From get_budget.' },
        description: { type: 'string' }, category: { type: 'string' }, cost_code: { type: 'string' }, notes: { type: 'string' },
        budgeted_amount: { type: 'number', minimum: 0 }, committed_amount: { type: 'number', minimum: 0 }, actual_amount: { type: 'number', minimum: 0 },
      },
      required: ['project_id', 'line_id'],
      additionalProperties: false,
    },
    resource: 'budget',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'budget_line_items', args.line_id, projectId!)
      if (where) return { error: where }
      const body = given(args, ['description', 'category', 'cost_code', 'notes', 'budgeted_amount', 'committed_amount', 'actual_amount'])
      for (const k of ['budgeted_amount', 'committed_amount', 'actual_amount']) {
        if (k in body && money(body[k]) === 'bad') return { error: `${k} must be a number, zero or more.` }
      }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateBudgetLine(db, { userId: actor.userId, projectId: projectId!, lineId: args.line_id as string, body, via: VIA })
      return outcome(result, 'item', l => ({
        record: 'budget_line', id: l.id, description: l.description, budgeted_amount: Number(l.budgeted_amount),
        committed_amount: Number(l.committed_amount), actual_amount: Number(l.actual_amount), changed: Object.keys(body),
      }))
    },
  },

  {
    name: 'create_subcontract',
    title: 'Add a subcontract',
    write: true,
    description:
      'Put a subcontractor or supplier on a job with a contract, as the Subs & Team tab does. Prefer existing_company_id from ' +
      'search_directory; a company_name not in the Directory is added to it. Sends nothing to the sub. Check list_subcontracts first.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        existing_company_id: { type: 'string', description: 'From search_directory.' },
        company_name: { type: 'string', description: 'When they are not in the Directory yet.' },
        trade: { type: 'string' }, scope: { type: 'string' },
        contract_amount: { type: 'number', minimum: 0 },
        contact_email: { type: 'string' }, phone: { type: 'string' },
        start_date: { ...DATE }, end_date: { ...DATE },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'team',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const amount = money(args.contract_amount)
      if (amount === 'bad') return { error: 'contract_amount must be a number, zero or more.' }
      for (const k of ['start_date', 'end_date']) if (args[k] != null && !isDate(args[k])) return { error: `${k} must be YYYY-MM-DD.` }
      let existing = str(args.existing_company_id)
      const name = str(args.company_name)
      if (!existing && !name) return { error: 'Say who: existing_company_id from search_directory, or company_name.' }
      if (existing) {
        const { data } = await db.from('companies').select('id').eq('id', existing).eq('added_by_company_id', actor.companyId!).maybeSingle()
        if (!data) return { error: 'That company is not in this Directory. Use search_directory for the id.' }
      } else {
        // A name already in the Directory IS that company - never a second copy of it.
        const { data: mine } = await db.from('companies').select('id, name').eq('added_by_company_id', actor.companyId!)
        const hits = ((mine ?? []) as { id: string; name: string }[]).filter(c => fold(c.name) === fold(name))
        if (hits.length === 1) existing = hits[0].id
      }
      const body: Record<string, unknown> = {
        trade: str(args.trade), scope: str(args.scope), contact_email: str(args.contact_email), phone: str(args.phone),
        start_date: args.start_date ?? null, end_date: args.end_date ?? null,
        ...(amount != null ? { contract_amount: amount } : {}),
        ...(existing ? { existing_company_id: existing } : { company_name: name }),
      }
      const result = await createSubcontract(db, { userId: actor.userId, projectId: projectId!, body, via: VIA })
      return outcome(result, 'subcontract', s => ({
        record: 'subcontract', id: s.id, trade: s.trade, contract_amount: s.contract_amount != null ? Number(s.contract_amount) : null,
        ...(result.body?.reused ? { note: 'That company already had a subcontract on this job; nothing new was made.' } : {}),
      }))
    },
  },

  {
    name: 'update_subcontract',
    title: 'Change a subcontract',
    write: true,
    description: 'Change a subcontract\'s scope, trade, contract amount, percent complete or billing notes. Only the fields you pass change. Its payment schedule, status and the vendor\'s own details cannot be changed here.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        subcontract_id: { type: 'string', description: 'From list_subcontracts.' },
        scope: { type: 'string' }, trade: { type: 'string' }, billing_notes: { type: 'string' },
        contract_amount: { type: 'number', minimum: 0 },
        progress_percent: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['project_id', 'subcontract_id'],
      additionalProperties: false,
    },
    resource: 'team',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'subcontracts', args.subcontract_id, projectId!)
      if (where) return { error: where }
      const body = given(args, ['scope', 'trade', 'billing_notes', 'contract_amount', 'progress_percent'])
      if ('contract_amount' in body && money(body.contract_amount) === 'bad') return { error: 'contract_amount must be a number, zero or more.' }
      if ('progress_percent' in body && pct(body.progress_percent) === 'bad') return { error: 'progress_percent must be 0 to 100.' }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateSubcontract(db, { userId: actor.userId, projectId: projectId!, subId: args.subcontract_id as string, body, via: VIA })
      return outcome(result, 'subcontract', s => ({ record: 'subcontract', id: s.id, changed: Object.keys(body) }))
    },
  },

  {
    name: 'add_schedule_item',
    title: 'Add a schedule item',
    write: true,
    description: 'Add a bar to a job\'s schedule: a named milestone (label) or a subcontractor\'s work (subcontract_id), with start and end dates. Sends nothing.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        label: { type: 'string' },
        subcontract_id: { type: 'string', description: 'From list_subcontracts.' },
        start_date: { ...DATE }, end_date: { ...DATE },
        trade: { type: 'string' },
      },
      required: ['project_id', 'start_date', 'end_date'],
      additionalProperties: false,
    },
    resource: 'schedule',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (!isDate(args.start_date) || !isDate(args.end_date)) return { error: 'start_date and end_date must be YYYY-MM-DD.' }
      if (args.end_date < args.start_date) return { error: 'end_date is before start_date.' }
      const scId = str(args.subcontract_id)
      if (scId) { const where = await onJob(db, 'subcontracts', scId, projectId!); if (where) return { error: where } }
      const result = await createScheduleItem(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: { label: str(args.label), subcontract_id: scId, start_date: args.start_date, end_date: args.end_date, trade: str(args.trade) },
      })
      return outcome(result, 'item', i => ({ record: 'schedule_item', id: i.id, label: i.label, start_date: i.start_date, end_date: i.end_date }))
    },
  },

  {
    name: 'update_schedule_item',
    title: 'Change a schedule item',
    write: true,
    description: 'Change a schedule item\'s name, trade or percent complete. To MOVE its dates use move_schedule_item, which works out who else moves and asks whether to tell the subs.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        item_id: { type: 'string', description: 'From get_schedule.' },
        label: { type: 'string' }, trade: { type: 'string' },
        progress_pct: { type: 'number', minimum: 0, maximum: 100 },
      },
      required: ['project_id', 'item_id'],
      additionalProperties: false,
    },
    resource: 'schedule',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'schedule_items', args.item_id, projectId!)
      if (where) return { error: where }
      const body = given(args, ['label', 'trade', 'progress_pct'])
      if ('progress_pct' in body && pct(body.progress_pct) === 'bad') return { error: 'progress_pct must be 0 to 100.' }
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateScheduleItem(db, { userId: actor.userId, projectId: projectId!, itemId: args.item_id as string, body, via: VIA })
      return outcome(result, 'item', i => ({ record: 'schedule_item', id: i.id, changed: Object.keys(body) }))
    },
  },

  {
    name: 'update_task',
    title: 'Change or complete a task',
    write: true,
    description:
      'Change a task - mark it in progress or completed, change its title, description, due date, priority or who is on it. ' +
      'Only the fields you pass change; assignee_names REPLACES everyone on it. People on the task may be notified.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        task_id: { type: 'string', description: 'From list_tasks.' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed'] },
        title: { type: 'string' }, description: { type: 'string' },
        due_date: { ...DATE }, priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        assignee_names: { type: 'array', items: { type: 'string' } },
      },
      required: ['project_id', 'task_id'],
      additionalProperties: false,
    },
    resource: 'tasks',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      // The task route reads the task by id alone - so it is checked against
      // the job here, before anything reaches it.
      const where = await onJob(db, 'project_tasks', args.task_id, projectId!)
      if (where) return { error: where }
      if (args.due_date != null && !isDate(args.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }
      if (args.status != null && !['open', 'in_progress', 'completed'].includes(args.status as string)) return { error: 'status must be open, in_progress or completed.' }
      if (args.priority != null && !['low', 'medium', 'high'].includes(args.priority as string)) return { error: 'priority must be low, medium or high.' }
      const body: Record<string, unknown> = given(args, ['status', 'title', 'description', 'due_date', 'priority'])
      if (Array.isArray(args.assignee_names)) body.assignees = await assigneesFor(db, projectId!, args.assignee_names)
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateTask(db, { userId: actor.userId, projectId: projectId!, taskId: args.task_id as string, body, via: VIA })
      return outcome(result, 'task', t => ({ record: 'task', id: t.id, title: t.title, status: t.status, due_date: t.due_date, changed: Object.keys(body) }))
    },
  },

  {
    name: 'create_daily_log',
    title: 'Write a daily log',
    write: true,
    description:
      'Write a job\'s daily log - what happened, weather, safety and quality notes, issues. It goes in WAITING FOR REVIEW, so a ' +
      'person reads it before it can appear on anything the client sees. Photos cannot be attached here.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        log_date: { ...DATE, description: 'The day it is about, YYYY-MM-DD.' },
        notes: { type: 'string', description: 'What happened on site.' },
        weather_condition: { type: 'string' },
        temp_f: { type: 'number' },
        safety_observation: { type: 'string' },
        quality_observation: { type: 'string' },
        has_issues: { type: 'boolean' },
        issue_description: { type: 'string' },
      },
      required: ['project_id', 'log_date'],
      additionalProperties: false,
    },
    resource: 'daily-logs',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (!isDate(args.log_date)) return { error: 'log_date must be YYYY-MM-DD.' }
      const result = await createDailyLog(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: {
          log_date: args.log_date, notes: str(args.notes), weather_condition: str(args.weather_condition),
          temp_f: typeof args.temp_f === 'number' ? Math.round(args.temp_f) : null,
          safety_observation: str(args.safety_observation), quality_observation: str(args.quality_observation),
          has_issues: args.has_issues === true, issue_description: str(args.issue_description),
        },
      })
      return outcome(result, 'log', l => ({
        record: 'daily_log', id: l.id, log_date: l.log_date, review_status: l.review_status,
        next: 'It is waiting for review on the Daily Logs tab before the client can see it.',
      }))
    },
  },

  {
    name: 'create_client_invoice',
    title: 'Draft a client invoice',
    write: true,
    description:
      'Draft an invoice to the client from costs already on the job - approved sub bills and material purchases (from ' +
      'list_billable_costs) - with the job\'s markup applied as the app does. It is a DRAFT: the client does not see it and ' +
      'nothing goes to QuickBooks until a person sends it in SyteNav.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: { kind: { type: 'string', enum: ['invoice', 'material'] }, source_id: { type: 'string' } },
            required: ['kind', 'source_id'],
          },
          description: 'The costs to bill, from list_billable_costs.',
        },
        due_date: { ...DATE }, notes: { type: 'string' }, terms: { type: 'string' },
      },
      required: ['project_id', 'sources'],
      additionalProperties: false,
    },
    resource: 'payments',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (args.due_date != null && !isDate(args.due_date)) return { error: 'due_date must be YYYY-MM-DD.' }
      const sources = Array.isArray(args.sources)
        ? (args.sources as any[]).filter(s => s && ['invoice', 'material'].includes(s.kind) && typeof s.source_id === 'string')
          .map(s => ({ kind: s.kind, source_id: s.source_id }))
        : []
      // The app fixes `status: 'draft'` and decides markup itself; nothing here
      // can ask for a sent invoice or a different rate.
      const result = await createClientInvoice(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        body: { sources, due_date: args.due_date ?? null, notes: str(args.notes), terms: str(args.terms) },
      })
      return outcome(result, 'invoice', i => ({
        record: 'client_invoice', id: i.id, number: i.invoice_number, status: i.status,
        total: Array.isArray(i.client_invoice_lines) ? Math.round(i.client_invoice_lines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0) * 100) / 100 : null,
        next: 'It is a draft on the Billing the client tab. The client has not seen it and nothing has gone to QuickBooks.',
      }))
    },
  },

  {
    name: 'create_payment_request',
    title: 'Prepare a payment request',
    write: true,
    description:
      'Prepare a deposit or stage-payment request to the client - either a stage from the estimate\'s payment terms ' +
      '(stage_index) or a one-off amount or percent of the quote. It is NOT SENT: the client sees nothing until a person ' +
      'presses Send in SyteNav.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        stage_index: { type: 'integer', minimum: 0, description: 'Which stage of the estimate\'s payment terms.' },
        label: { type: 'string', description: 'For a one-off, e.g. "Deposit".' },
        amount: { type: 'number', exclusiveMinimum: 0 },
        percent: { type: 'number', exclusiveMinimum: 0, maximum: 100, description: 'Of the quote total.' },
        due_hint: { type: 'string', description: 'e.g. "on signing".' },
      },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'payments',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const body: Record<string, unknown> = Number.isInteger(args.stage_index)
        ? { stage_index: args.stage_index }
        : {
          label: str(args.label) ?? 'Deposit', due_hint: str(args.due_hint),
          ...(args.amount != null ? { amount: args.amount } : args.percent != null ? { percent: args.percent } : {}),
        }
      if (!('stage_index' in body) && !('amount' in body) && !('percent' in body)) {
        return { error: 'Say how much: stage_index, amount or percent.' }
      }
      const result = await createPaymentRequest(db, { userId: actor.userId, projectId: projectId!, body, via: VIA })
      return outcome(result, 'request', r => ({
        record: 'payment_request', id: r.id, label: r.label, amount: Number(r.amount), sent: !!r.sent_at,
        next: 'It is prepared but NOT sent. Press Send on it in SyteNav when you want the client to see it.',
      }))
    },
  },
  {
    name: 'move_schedule_item',
    title: 'Move a schedule item\'s dates',
    write: true,
    description:
      'Move a schedule item to new dates through the app\'s own cascade: lines linked to it move by the same amount, hand-dated ' +
      'lines are left alone, and history is kept. Call preview_schedule_move FIRST and show the person what moves. notify is ' +
      'REQUIRED and has no default: true emails each affected subcontractor ONCE about their new dates (real email, outside ' +
      'the company); false changes the dates and tells nobody. Ask the person which they want - never assume.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        item_id: { type: 'string', description: 'From get_schedule.' },
        start_date: { ...DATE }, end_date: { ...DATE },
        notify: { type: 'boolean', description: 'Email the affected subs? The person must decide.' },
        kind: { type: 'string', enum: ['replan', 'delay'], description: 'A delay needs a reason.' },
        reason: { type: 'string' },
      },
      required: ['project_id', 'item_id', 'start_date', 'end_date', 'notify'],
      additionalProperties: false,
    },
    resource: 'schedule',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'schedule_items', args.item_id, projectId!)
      if (where) return { error: where }
      // `notify` has NO default anywhere - not here, not in the app. A missing
      // one is refused by applyScheduleMove itself; it is never guessed.
      const result = await applyScheduleMove(db, {
        userId: actor.userId, projectId: projectId!, itemId: args.item_id as string, via: VIA,
        body: {
          start_date: args.start_date, end_date: args.end_date, notify: args.notify,
          kind: args.kind === 'delay' ? 'delay' : 'replan', reason: str(args.reason),
        },
      })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const b = result.body ?? {}
      return {
        data: {
          moved: true, id: args.item_id, start_date: args.start_date, end_date: args.end_date,
          lines_moved: Array.isArray(b.moved) ? b.moved.length : b.moved, skipped: b.skipped, failed: b.failed,
          subs_emailed: b.emailed, people_notified: b.notified,
        },
      }
    },
  },
]
