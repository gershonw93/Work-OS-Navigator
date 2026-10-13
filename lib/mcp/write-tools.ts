import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActorPerms } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import { createTask } from '@/lib/writes/task'
import { createSubBill } from '@/lib/writes/sub-bill'
import { createInspection } from '@/lib/writes/inspection'
import { createChangeOrder } from '@/lib/writes/change-order'
import { createDirectoryContact } from '@/lib/writes/directory-contact'
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
