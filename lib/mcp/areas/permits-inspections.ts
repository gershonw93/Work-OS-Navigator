import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type ToolDef, type WriteToolDef, PROJECT_ID, DATE, VIA, capped, failed, str, isDate, given, onJob, outcome,
} from '../tool-kit'
import { createPermit, updatePermit } from '@/lib/writes/permit'
import { updateInspection } from '@/lib/writes/inspection'
import { updateChangeOrder } from '@/lib/writes/change-order'
import { addRequiredInspections } from '@/lib/writes/required-inspection'
import { withVia } from '@/lib/writes/result'
import { expiryState } from '@/lib/expiry'

// ─────────────────────────────────────────────────────────────────────────────
// Claude's tools for PERMITS, INSPECTIONS (beyond request_inspection) and
// CHANGE ORDERS (beyond create_change_order). Reads go in READ, adds and edits
// in WRITE; the dispatcher in ../tools.ts gates every one before it runs -
// consent to write, the permission and action named here, the billing lock,
// the job being one of the company's own, and the duplicate claim.
//
// Every write goes through lib/writes - the same function the app's route
// calls - and nothing in this file inserts or updates a row itself. The only
// direct reads are lookups that a record is on the job.
//
// WHAT IS NOT HERE, on purpose:
//   - deleting a permit, voiding an inspection, taking a type off the required
//     list, deleting a change order (the owner's rule: never delete);
//   - the permit / inspection-card SCANS (they call a model and take a file);
//   - attaching a permit file (no uploads through Claude);
//   - APPROVING OR REJECTING A CHANGE ORDER. Approval folds the amount into the
//     subcontract's contract_amount at once (lib/writes/change-order.ts) and
//     raises the budget line and the schedule of values the client is billed
//     from - it moves money with no further step, and it is the GC's and the
//     client's decision. update_change_order never passes `status`;
//   - voiding an inspection by status: `void` is not a status this tool accepts;
//   - reassigning who books an inspection (`scheduler_profile_id`) - that puts a
//     person on the hook and notifies them, which is a manager's call.
// ─────────────────────────────────────────────────────────────────────────────

/** Permit statuses the table's check constraint allows (migration 012). */
export const PERMIT_STATUSES = ['pending', 'approved', 'active', 'recorded', 'expired', 'rejected'] as const

/** Statuses update_inspection may set. Never `void` - that is the void route's, and it is a removal. */
export const INSPECTION_TOOL_STATUSES = ['not_scheduled', 'requested', 'scheduled', 'passed', 'failed', 'pending_reinspection'] as const

/** What update_inspection passes. NOT scheduler_profile_id/name, NOT ready_marked_* (mark_inspection_ready). */
export const INSPECTION_TOOL_FIELDS = [
  'type', 'trade', 'status', 'requested_date', 'scheduled_date', 'scheduled_time', 'completed_date',
  'booked_with', 'booking_reference', 'inspector_name', 'inspector_phone', 'scheduling_phone',
  'failure_reason', 'notes',
] as const

/** What update_permit passes: the route's whitelist, minus nothing - a permit edit moves no money. */
export const PERMIT_TOOL_FIELDS = [
  'permit_type', 'permit_number', 'description', 'status', 'issued_date', 'expiry_date',
  'issuing_authority', 'inspector_name', 'inspector_phone', 'notes',
] as const

/** What update_change_order passes. Never `status`: see the header. */
export const CHANGE_ORDER_TOOL_FIELDS = ['review_notes', 'budget_line_item_id'] as const

const PERMIT_DATES = ['issued_date', 'expiry_date']
const INSPECTION_DATES = ['requested_date', 'scheduled_date', 'completed_date']

/** A date arg is a date or null (to clear it); anything else is refused with its name. */
function badDate(body: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) if (k in body && body[k] !== null && !isDate(body[k])) return `${k} must be YYYY-MM-DD.`
  return null
}

/** Text args trimmed; an empty string is a clear (null), the same as the app's form sends. */
function cleanText(body: Record<string, unknown>, dateKeys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (dateKeys.includes(k)) out[k] = v
    else if (v === null) out[k] = null
    else out[k] = typeof v === 'string' ? (v.trim() || null) : v
  }
  return out
}

const permitRow = (p: any, projectNames?: Map<string, string>) => ({
  id: p.id,
  project_id: p.project_id,
  ...(projectNames ? { project: projectNames.get(p.project_id) ?? null } : {}),
  permit_type: p.permit_type ?? null,
  permit_number: p.permit_number ?? null,
  status: p.status ?? null,
  description: p.description ?? null,
  issuing_authority: p.issuing_authority ?? null,
  issued_date: p.issued_date ?? null,
  expiry_date: p.expiry_date ?? null,
  // Derived from the date, never the stored status (lib/expiry.ts).
  expiry: expiryState(p.expiry_date),
  inspector_name: p.inspector_name ?? null,
  inspector_phone: p.inspector_phone ?? null,
  notes: p.notes ?? null,
  has_file: !!p.file_url,
})

const changeOrderRow = (c: any, projectNames?: Map<string, string>) => ({
  id: c.id,
  project_id: c.project_id,
  ...(projectNames ? { project: projectNames.get(c.project_id) ?? null } : {}),
  title: c.title,
  // numeric comes back as a string ("1500.00") - read it, never print it raw.
  amount: c.amount == null ? null : Number(c.amount),
  status: c.status ?? null,
  reason: c.reason ?? null,
  description: c.description ?? null,
  requested_by: c.requested_by_type === 'sub' ? 'subcontractor' : 'general contractor',
  subcontract_id: c.subcontract_id ?? null,
  budget_line_item_id: c.budget_line_item_id ?? null,
  review_notes: c.review_notes ?? null,
  created_at: c.created_at ?? null,
})

/** The inspection is on this job and not voided - a voided one is the record of a removal, not something to edit. */
async function liveInspection(db: SupabaseClient, id: unknown, projectId: string): Promise<string | null> {
  if (typeof id !== 'string' || !id.trim()) return 'Say which one: the inspection_id is missing.'
  const { data, error } = await db.from('inspections').select('id, status').eq('id', id).eq('project_id', projectId).maybeSingle()
  if (error) { console.error('[mcp] inspections lookup:', error.message); return 'SyteNav could not check that inspection just now.' }
  if (!data) return 'That inspection is not on this job. Use list_inspections for the ids.'
  if ((data as any).status === 'void') return 'That inspection was voided. Restoring it is done in SyteNav, on the Inspections tab.'
  return null
}

export const PERMITS_INSPECTIONS_READ: ToolDef[] = [
  {
    name: 'list_permits',
    title: 'List permits',
    description:
      'Permits on one job, or every job when project_id is left out: type, number, status, who issues it, ' +
      'issued and expiry dates, and the inspector on the permit. "expiry" is worked out from the expiry date ' +
      '(expired / soon / ok / none), not from the stored status.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      additionalProperties: false,
    },
    resource: 'permits',
    project: 'optional',
    async run({ db, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { permits: [], truncated: false } }
      const { data, error } = await db.from('permits')
        .select('id, project_id, permit_type, permit_number, status, description, issuing_authority, issued_date, expiry_date, inspector_name, inspector_phone, notes, file_url, created_at')
        .in('project_id', projectIds)
        .order('created_at', { ascending: false })
      if (error) return failed('permits', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      return { data: { permits: rows.map(p => permitRow(p, projectNames)), truncated } }
    },
  },

  {
    name: 'list_change_orders',
    title: 'List change orders',
    description:
      'Change orders on one job, or every job when project_id is left out: title, amount in dollars ' +
      '(negative is a credit), status (pending / approved / rejected), who asked for it, and the subcontract ' +
      'and budget line it is tied to. Check this before create_change_order so the same change is not raised twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'all'], description: 'Default "all".' },
      },
      additionalProperties: false,
    },
    resource: 'change-orders',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { change_orders: [], truncated: false } }
      let q = db.from('change_orders')
        .select('id, project_id, title, amount, status, reason, description, requested_by_type, subcontract_id, budget_line_item_id, review_notes, created_at')
        .in('project_id', projectIds)
      const status = str(args.status) ?? 'all'
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q.order('created_at', { ascending: false })
      if (error) return failed('change orders', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      return { data: { change_orders: rows.map(c => changeOrderRow(c, projectNames)), truncated } }
    },
  },

  {
    name: 'list_required_inspections',
    title: 'List the inspections a job needs',
    description:
      'The inspections on a job\'s REQUIRED list - the plan for what this job needs, not inspection requests. ' +
      'Where each one stands comes from list_inspections. Check this before add_required_inspections.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      required: ['project_id'],
      additionalProperties: false,
    },
    resource: 'inspections',
    project: 'required',
    async run({ db, projectIds }) {
      const { data, error } = await db.from('project_required_inspections')
        .select('id, type, sort_order, source, created_at')
        .eq('project_id', projectIds[0])
        .order('sort_order')
      if (error) return failed('required inspections', error)
      const { rows, truncated } = capped((data ?? []) as any[])
      return { data: { required: rows.map(r => ({ id: r.id, type: r.type })), truncated } }
    },
  },
]

export const PERMITS_INSPECTIONS_WRITE: WriteToolDef[] = [
  {
    name: 'create_permit',
    title: 'Add a permit',
    write: true,
    description:
      'Add a permit to a job, as the Permits tab does. It needs the permit type and one thing that tells it ' +
      'apart (number, description or issuing authority); a permit marked approved / active / recorded needs ' +
      'its number and issued date, and an expired one its expiry date. It does NOT apply for anything with the ' +
      'township and cannot attach the permit file - upload that on the permit in SyteNav. Check list_permits ' +
      'first so the same permit is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        permit_type: { type: 'string', description: 'e.g. Building, Electrical, Plumbing, Mechanical, Demolition.' },
        permit_number: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: [...PERMIT_STATUSES], description: 'Default pending (applied for, not yet issued).' },
        issued_date: { ...DATE, description: 'YYYY-MM-DD.' },
        expiry_date: { ...DATE, description: 'YYYY-MM-DD.' },
        issuing_authority: { type: 'string', description: 'Who issues it, e.g. the township or county.' },
        inspector_name: { type: 'string' },
        inspector_phone: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['project_id', 'permit_type'],
      additionalProperties: false,
    },
    resource: 'permits',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const dateProblem = badDate(args, PERMIT_DATES)
      if (dateProblem) return { error: dateProblem }
      const status = str(args.status)
      if (status && !(PERMIT_STATUSES as readonly string[]).includes(status)) {
        return { error: `status must be one of: ${PERMIT_STATUSES.join(', ')}.` }
      }
      const result = await createPermit(db, {
        userId: actor.userId, projectId: projectId!, via: VIA,
        // No uploadFile: Claude does not attach files.
        fields: {
          permit_type: str(args.permit_type), permit_number: str(args.permit_number), description: str(args.description),
          status, issued_date: (args.issued_date as string) ?? null, expiry_date: (args.expiry_date as string) ?? null,
          issuing_authority: str(args.issuing_authority), inspector_name: str(args.inspector_name),
          inspector_phone: str(args.inspector_phone), notes: str(args.notes),
        },
      })
      return outcome(result, 'permit', p => ({ record: 'permit', ...permitRow(p) }))
    },
  },

  {
    name: 'update_permit',
    title: 'Change a permit',
    write: true,
    description:
      'Change a permit\'s details or status - e.g. it was issued: status approved with the permit number and ' +
      'issued date. Only the fields you pass change; pass null to clear one. The same rules as adding one apply ' +
      'to the permit as it will be after the change. It cannot attach a file or delete a permit. Get the id from list_permits.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        permit_id: { type: 'string', description: 'From list_permits.' },
        permit_type: { type: 'string' },
        permit_number: { type: ['string', 'null'] },
        description: { type: ['string', 'null'] },
        status: { type: 'string', enum: [...PERMIT_STATUSES] },
        issued_date: { type: ['string', 'null'], pattern: DATE.pattern },
        expiry_date: { type: ['string', 'null'], pattern: DATE.pattern },
        issuing_authority: { type: ['string', 'null'] },
        inspector_name: { type: ['string', 'null'] },
        inspector_phone: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
      },
      required: ['project_id', 'permit_id'],
      additionalProperties: false,
    },
    resource: 'permits',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'permits', args.permit_id, projectId!)
      if (where) return { error: where === 'That record is not on this job.' ? 'That permit is not on this job. Use list_permits for the ids.' : where }
      const body = cleanText(given(args, [...PERMIT_TOOL_FIELDS]), PERMIT_DATES)
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      const dateProblem = badDate(body, PERMIT_DATES)
      if (dateProblem) return { error: dateProblem }
      if ('status' in body && !(PERMIT_STATUSES as readonly string[]).includes(String(body.status))) {
        return { error: `status must be one of: ${PERMIT_STATUSES.join(', ')}.` }
      }
      const result = await updatePermit(db, { userId: actor.userId, projectId: projectId!, permitId: args.permit_id as string, body, via: VIA })
      return outcome(result, 'permit', p => ({ record: 'permit', ...permitRow(p), changed: Object.keys(body) }))
    },
  },

  {
    name: 'update_inspection',
    title: 'Change an inspection',
    write: true,
    description:
      'Update an inspection, as the Inspections tab does: record that it was BOOKED (status scheduled, with ' +
      'scheduled_date and booked_with - who at the township or inspector\'s office confirmed it; SyteNav refuses a ' +
      'booking without them), record the RESULT (passed, or failed with failure_reason; completed_date is the day ' +
      'on the paperwork, defaulting to today), send it back for re-inspection, move it back to requested (which ' +
      'clears the booking), or edit its details. Only the fields you pass change. It does NOT call or book ' +
      'anybody - only record what a person was told. It cannot void an inspection or mark work ready ' +
      '(mark_inspection_ready). The people on the inspection hear about a booking or a result, as they do in the app. ' +
      'Get the id from list_inspections.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        inspection_id: { type: 'string', description: 'From list_inspections.' },
        status: { type: 'string', enum: [...INSPECTION_TOOL_STATUSES] },
        inspection_type: { type: 'string', description: 'e.g. Footing, Framing, Final.' },
        trade: { type: ['string', 'null'] },
        requested_date: { type: ['string', 'null'], pattern: DATE.pattern, description: 'When it is NEEDED BY.' },
        scheduled_date: { type: ['string', 'null'], pattern: DATE.pattern, description: 'The CONFIRMED date - only with booked_with.' },
        scheduled_time: { type: ['string', 'null'] },
        booked_with: { type: ['string', 'null'], description: 'Who confirmed the booking.' },
        booking_reference: { type: ['string', 'null'] },
        completed_date: { type: ['string', 'null'], pattern: DATE.pattern, description: 'Only on a passed or failed inspection.' },
        failure_reason: { type: ['string', 'null'] },
        inspector_name: { type: ['string', 'null'] },
        inspector_phone: { type: ['string', 'null'] },
        scheduling_phone: { type: ['string', 'null'] },
        notes: { type: ['string', 'null'] },
      },
      required: ['project_id', 'inspection_id'],
      additionalProperties: false,
    },
    resource: 'inspections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await liveInspection(db, args.inspection_id, projectId!)
      if (where) return { error: where }
      // The column is `type`; the argument is named for what it is.
      const renamed: Record<string, unknown> = { ...args }
      if ('inspection_type' in args) renamed.type = args.inspection_type
      const body = cleanText(given(renamed, [...INSPECTION_TOOL_FIELDS]), INSPECTION_DATES)
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      if ('type' in body && !body.type) return { error: 'An inspection keeps its type - pass a name, not an empty one.' }
      const dateProblem = badDate(body, INSPECTION_DATES)
      if (dateProblem) return { error: dateProblem }
      if ('status' in body && !(INSPECTION_TOOL_STATUSES as readonly string[]).includes(String(body.status))) {
        return { error: `status must be one of: ${INSPECTION_TOOL_STATUSES.join(', ')}.` }
      }
      // Every status rule - a booking needs who it was booked with, back to
      // requested clears the booking, a failure needs a reason - is the app's
      // own, in updateInspection.
      const result = await updateInspection(db, {
        userId: actor.userId, projectId: projectId!, inspectionId: args.inspection_id as string, updates: body, via: VIA,
      })
      return outcome(result, 'inspection', i => ({
        record: 'inspection', id: i.id, type: i.type, status: i.status,
        requested_date: i.requested_date ?? null, scheduled_date: i.scheduled_date ?? null, booked_with: i.booked_with ?? null,
        completed_date: i.completed_date ?? null, failure_reason: i.failure_reason ?? null, changed: Object.keys(body),
      }))
    },
  },

  {
    name: 'mark_inspection_ready',
    title: 'Mark work ready for inspection',
    write: true,
    description:
      'Say the work is finished and ready for its inspection (ready: true), or take that back (ready: false), ' +
      'as the Ready button does. The person who requested it and whoever books it are told. It does NOT book ' +
      'the inspection. Get the id from list_inspections.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        inspection_id: { type: 'string', description: 'From list_inspections.' },
        ready: { type: 'boolean', description: 'true to mark ready, false to take it back.' },
      },
      required: ['project_id', 'inspection_id', 'ready'],
      additionalProperties: false,
    },
    resource: 'mark-ready',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (typeof args.ready !== 'boolean') return { error: 'ready must be true or false.' }
      const where = await liveInspection(db, args.inspection_id, projectId!)
      if (where) return { error: where }
      let who: string | null = null
      if (args.ready) {
        const { data: me } = await db.from('profiles').select('full_name').eq('id', actor.userId).maybeSingle()
        who = withVia((me as any)?.full_name ?? 'Someone', VIA)
      }
      // The same two fields the app's button sends, and nothing else - which is
      // what puts this through the `mark-ready` door rather than `inspections`.
      const result = await updateInspection(db, {
        userId: actor.userId, projectId: projectId!, inspectionId: args.inspection_id as string, via: VIA,
        updates: { ready_marked_by: who, ready_marked_at: who ? new Date().toISOString() : null },
      })
      return outcome(result, 'inspection', i => ({
        record: 'inspection', id: i.id, type: i.type, status: i.status, ready: !!i.ready_marked_by, ready_marked_by: i.ready_marked_by ?? null,
      }))
    },
  },

  {
    name: 'update_change_order',
    title: 'Change a change order\'s notes or budget line',
    write: true,
    description:
      'Add review notes to a change order, or file it against a budget line on the same job (from get_budget). ' +
      'It does NOT approve or reject a change order and cannot change its amount: approving one changes the ' +
      'subcontract\'s contract amount and what the client is billed, so that decision stays with a person on the ' +
      'Change Orders tab. Get the id from list_change_orders.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        change_order_id: { type: 'string', description: 'From list_change_orders.' },
        review_notes: { type: ['string', 'null'] },
        budget_line_item_id: { type: ['string', 'null'], description: 'From get_budget; null to take it off its line.' },
      },
      required: ['project_id', 'change_order_id'],
      additionalProperties: false,
    },
    resource: 'change-orders',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'change_orders', args.change_order_id, projectId!)
      if (where) return { error: where === 'That record is not on this job.' ? 'That change order is not on this job. Use list_change_orders for the ids.' : where }
      // `status` is not on the list, whatever is passed: approval is a person's.
      const body = cleanText(given(args, [...CHANGE_ORDER_TOOL_FIELDS]), [])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass review_notes or budget_line_item_id.' }
      const result = await updateChangeOrder(db, {
        userId: actor.userId, projectId: projectId!, coId: args.change_order_id as string, body, via: VIA,
      })
      return outcome(result, 'changeOrder', c => ({ record: 'change_order', ...changeOrderRow(c), changed: Object.keys(body) }))
    },
  },

  {
    name: 'add_required_inspections',
    title: 'Add inspections a job needs',
    write: true,
    description:
      'Add inspection types to a job\'s REQUIRED list - the plan of what this job needs (e.g. Footing, Framing, ' +
      'Septic, Final). Types already on the list are skipped. It does NOT request or book any inspection and ' +
      'tells nobody - use request_inspection for that. Check list_required_inspections first.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        types: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 30 },
      },
      required: ['project_id', 'types'],
      additionalProperties: false,
    },
    resource: 'inspections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (!Array.isArray(args.types) || !args.types.length) return { error: 'Pass at least one inspection type.' }
      if (args.types.length > 30) return { error: 'At most 30 types at a time.' }
      const result = await addRequiredInspections(db, {
        userId: actor.userId, companyId: actor.companyId, projectId: projectId!,
        // `manual`, never `model`: a model update finds and replaces the lines
        // it put there, and these were asked for by a person.
        body: { types: args.types, source: 'manual' },
      })
      return outcome(result, 'required', rows => ({
        record: 'required_inspections', added: result.body?.added ?? 0, added_types: result.body?.addedTypes ?? [],
        now_required: (rows as any[]).map(r => r.type),
      }))
    },
  },
]
