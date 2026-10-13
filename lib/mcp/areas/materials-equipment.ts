import type { SupabaseClient } from '@supabase/supabase-js'
import type { ToolOutcome } from '../protocol'
import {
  type ToolDef, type WriteToolDef, PROJECT_ID, DATE, VIA, capped, failed, str, isDate, money, given, onJob, outcome,
} from '../tool-kit'
import { createMaterialPurchase, updateMaterialPurchase } from '@/lib/writes/material-purchase'
import { createEquipment, updateEquipment } from '@/lib/writes/equipment'
import { checkInEquipment, checkOutEquipment } from '@/lib/writes/equipment-assignment'
import { equipmentRepairMove } from '@/lib/writes/equipment-repair'
import { ownedProjectsFilter } from '@/lib/project-access'
import { STATUS_LABEL, type EquipmentStatus } from '@/lib/equipment-state'

// ─────────────────────────────────────────────────────────────────────────────
// Claude's tools for MATERIALS (receipts on a job) and EQUIPMENT (the
// company's tools and machines). Reads go in READ, adds and edits in WRITE;
// the dispatcher in ../tools.ts gates every one before it runs.
//
// Every write goes through lib/writes - the same function the app's route
// calls - and nothing in this file inserts or updates a row itself.
//
// WHAT IS NOT HERE, on purpose:
//   - deleting a receipt or a piece of equipment (the owner's rule: never delete);
//   - the receipt SCAN (it calls a model and uploads a file);
//   - a receipt's markup or "client paid" flag - they decide what the client is
//     billed, so they stay a person's call on the Materials screen;
//   - moving a receipt to another job;
//   - the office's repair decisions (sent for repair, repaired, retire,
//     reactivate). Claude can REPORT a tool broken; deciding stays a person's.
//
// A material purchase pushes nothing to QuickBooks: it feeds Budget and the
// client-billable list, and reaches a client only on a draft client invoice.
// ─────────────────────────────────────────────────────────────────────────────

const RECEIPT_FIELDS = 'id, project_id, store_name, category, amount, tax, purchase_date, notes, budget_line_id, client_paid, markup_pct, markup_excluded, receipt_url, created_at'

const receipt = (m: any, projectNames?: Map<string, string>) => ({
  id: m.id,
  project_id: m.project_id,
  ...(projectNames ? { project: projectNames.get(m.project_id) ?? null } : {}),
  store: m.store_name ?? null,
  category: m.category ?? null,
  amount: m.amount == null ? null : Number(m.amount),
  tax: m.tax == null ? null : Number(m.tax),
  purchase_date: m.purchase_date ?? null,
  notes: m.notes ?? null,
  budget_line_id: m.budget_line_id ?? null,
  client_paid: !!m.client_paid,
  has_receipt_image: !!m.receipt_url,
})

const equipmentRow = (e: any) => ({
  id: e.id,
  name: e.name,
  category: e.category ?? null,
  asset_tag: e.asset_tag ?? null,
  serial_number: e.serial_number ?? null,
  status: STATUS_LABEL[e.status as EquipmentStatus] ?? e.status,
  needs_repair: !!e.repair_needed_at,
  repair_note: e.repair_note ?? null,
})

/** Is this piece of equipment the company's? A failed read is not a "no" - it says so. */
async function companyEquipment(db: SupabaseClient, companyId: string | null, id: unknown): Promise<string | null> {
  if (typeof id !== 'string' || !id.trim()) return 'Say which one: equipment_id is missing. Use list_equipment for the ids.'
  if (!companyId) return 'This person is not in a company.'
  const { data, error } = await db.from('equipment').select('id').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (error) { console.error('[mcp] equipment lookup:', error.message); return 'SyteNav could not check that equipment just now.' }
  return data ? null : 'No equipment with that id at this company. Use list_equipment for the ids.'
}

/** A job named on a check-out must be one of the company's own. */
async function ownedJob(db: SupabaseClient, companyId: string, id: string): Promise<string | null> {
  const { data, error } = await db.from('projects').select('id').eq('id', id).or(ownedProjectsFilter(companyId)).maybeSingle()
  if (error) { console.error('[mcp] project lookup:', error.message); return 'SyteNav could not check that job just now.' }
  return data ? null : 'No project with that id among this person\'s jobs. Use list_projects for the ids.'
}

const plain = (result: { status: number; body: Record<string, any> }, data: Record<string, unknown>): ToolOutcome =>
  result.status >= 400 ? { error: String(result.body?.error ?? 'SyteNav refused that.') } : { data }

// ── reading ─────────────────────────────────────────────────────────────────

export const MATERIALS_EQUIPMENT_READ: ToolDef[] = [
  {
    name: 'list_materials',
    title: 'List material purchases',
    description:
      'Material purchases (store receipts) on one job, or on every job this person can see when no project_id is given - ' +
      'store, category, amount, tax, date, notes and the budget line it is filed against. Newest first.',
    inputSchema: {
      type: 'object',
      properties: { project_id: PROJECT_ID },
      additionalProperties: false,
    },
    resource: 'materials',
    project: 'optional',
    async run({ db, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { materials: [], truncated: false } }
      const { data, error } = await db.from('material_purchases')
        .select(RECEIPT_FIELDS)
        .in('project_id', projectIds)
        .order('purchase_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) return failed('the material purchases', error)
      const { rows, truncated } = capped(data ?? [])
      return { data: { materials: rows.map(m => receipt(m, projectNames)), truncated } }
    },
  },

  {
    name: 'list_equipment',
    title: 'List equipment',
    description:
      'The company\'s equipment (tools, machines) - each with its status (Available, Checked out, In for repair, Retired), ' +
      'whether somebody has reported it needs repair, and who has it and where when it is checked out.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    resource: 'equipment',
    project: 'none',
    async run({ db, actor }) {
      const companyId = actor.companyId
      if (!companyId) return { data: { equipment: [], truncated: false } }
      const [items, open, projects] = await Promise.all([
        db.from('equipment').select('id, name, category, asset_tag, serial_number, status, repair_needed_at, repair_note').eq('company_id', companyId).order('name'),
        db.from('equipment_assignments').select('equipment_id, project_id, holder_name, checked_out_at').eq('company_id', companyId).is('checked_in_at', null),
        db.from('projects').select('id, name').or(ownedProjectsFilter(companyId)),
      ])
      for (const r of [items, open, projects]) if (r.error) return failed('the equipment', r.error)
      const names = new Map((projects.data ?? []).map((p: any) => [p.id, p.name]))
      const holder = new Map((open.data ?? []).map((a: any) => [a.equipment_id, a]))
      const { rows, truncated } = capped(items.data ?? [])
      return {
        data: {
          equipment: rows.map((e: any) => {
            const a = holder.get(e.id)
            return {
              ...equipmentRow(e),
              checked_out: a ? {
                holder: a.holder_name,
                project_id: a.project_id ?? null,
                location: a.project_id ? (names.get(a.project_id) ?? 'Project') : 'Shop / Yard',
                since: a.checked_out_at,
              } : null,
            }
          }),
          truncated,
        },
      }
    },
  },
]

// ── adding and editing ──────────────────────────────────────────────────────

export const MATERIALS_EQUIPMENT_WRITE: WriteToolDef[] = [
  {
    name: 'add_material_purchase',
    title: 'Add a material purchase',
    write: true,
    description:
      'Record a material purchase (a store receipt) on a job, as the Materials screen does - e.g. "Home Depot, lumber, $412.80, ' +
      'tax $27.10, 2026-10-12". It counts toward the job\'s costs and becomes billable to the client on a later draft invoice. ' +
      'Does not attach a receipt image, does not mark it paid by the client, and pushes nothing to QuickBooks. ' +
      'Check list_materials first so the same receipt is not entered twice; budget_line_id comes from get_budget.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        store_name: { type: 'string' },
        amount: { type: 'number', minimum: 0, description: 'The receipt total in dollars.' },
        tax: { type: 'number', minimum: 0 },
        purchase_date: { ...DATE },
        category: { type: 'string', description: 'e.g. Lumber, Electrical, Plumbing, Hardware, Concrete, Paint, Drywall, Tools, Fuel, Rental, Other.' },
        notes: { type: 'string' },
        budget_line_id: { type: 'string', description: 'From get_budget - the line this cost is filed against.' },
      },
      required: ['project_id', 'store_name', 'amount'],
      additionalProperties: false,
    },
    resource: 'materials',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      if (!str(args.store_name)) return { error: 'Say which store or supplier it was bought from.' }
      const amount = money(args.amount)
      if (amount === 'bad' || amount === null) return { error: 'amount must be a number, zero or more.' }
      const tax = money(args.tax)
      if (tax === 'bad') return { error: 'tax must be a number, zero or more.' }
      if (args.purchase_date != null && !isDate(args.purchase_date)) return { error: 'purchase_date must be YYYY-MM-DD.' }
      if (args.budget_line_id != null) {
        const where = await onJob(db, 'budget_line_items', args.budget_line_id, projectId!)
        if (where) return { error: where === 'That record is not on this job.' ? 'That budget line is not on this job. Use get_budget for the ids.' : where }
      }
      // The body the Materials form would send - and only that. No receipt
      // image, no saving the store to the Directory, never "client paid".
      const body = {
        project_id: projectId,
        store_name: str(args.store_name),
        amount,
        tax,
        purchase_date: args.purchase_date ?? null,
        category: str(args.category),
        notes: str(args.notes),
        budget_line_id: str(args.budget_line_id),
      }
      const result = await createMaterialPurchase(db, { userId: actor.userId, companyId: actor.companyId!, body, via: VIA })
      return outcome(result, 'material', m => ({ record: 'material_purchase', ...receipt(m) }))
    },
  },

  {
    name: 'update_material_purchase',
    title: 'Change a material purchase',
    write: true,
    description:
      'Change a material purchase\'s store, category, notes, date, amount, tax or budget line. Only the fields you pass change. ' +
      'Cannot move it to another job, change its markup or mark it paid by the client - those stay on the Materials screen. ' +
      'Get the id from list_materials.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        material_id: { type: 'string', description: 'From list_materials.' },
        store_name: { type: 'string' }, category: { type: 'string' }, notes: { type: 'string' },
        purchase_date: { ...DATE },
        amount: { type: 'number', minimum: 0 }, tax: { type: 'number', minimum: 0 },
        budget_line_id: { type: 'string', description: 'From get_budget.' },
      },
      required: ['project_id', 'material_id'],
      additionalProperties: false,
    },
    resource: 'materials',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'material_purchases', args.material_id, projectId!)
      if (where) return { error: where }
      const body = given(args, ['store_name', 'category', 'notes', 'purchase_date', 'amount', 'tax', 'budget_line_id'])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }
      if ('store_name' in body && !str(body.store_name)) return { error: 'store_name cannot be blank.' }
      for (const k of ['amount', 'tax']) {
        if (k in body && (money(body[k]) === 'bad' || (k === 'amount' && money(body[k]) === null))) return { error: `${k} must be a number, zero or more.` }
      }
      if ('purchase_date' in body && !isDate(body.purchase_date)) return { error: 'purchase_date must be YYYY-MM-DD.' }
      if ('budget_line_id' in body) {
        const line = await onJob(db, 'budget_line_items', body.budget_line_id, projectId!)
        if (line) return { error: line === 'That record is not on this job.' ? 'That budget line is not on this job. Use get_budget for the ids.' : line }
      }
      const result = await updateMaterialPurchase(db, {
        userId: actor.userId, id: args.material_id as string, projectId: projectId!, body, via: VIA,
      })
      return outcome(result, 'material', m => ({ record: 'material_purchase', ...receipt(m), changed: Object.keys(body) }))
    },
  },

  {
    name: 'add_equipment',
    title: 'Add equipment',
    write: true,
    description:
      'Add a tool or machine to the company\'s equipment list, as the Equipment screen does. It starts Available, in the shop. ' +
      'Check list_equipment first so the same item is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }, category: { type: 'string' },
        asset_tag: { type: 'string' }, serial_number: { type: 'string' }, notes: { type: 'string' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    resource: 'equipment',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      if (!actor.companyId) return { error: 'This person is not in a company.' }
      const name = str(args.name)
      if (!name) return { error: 'Say what it is: name is required.' }
      const body = {
        name, category: str(args.category), asset_tag: str(args.asset_tag),
        serial_number: str(args.serial_number), notes: str(args.notes),
      }
      const result = await createEquipment(db, { userId: actor.userId, companyId: actor.companyId, body, via: VIA })
      return outcome(result, 'equipment', e => ({ record: 'equipment', ...equipmentRow(e) }))
    },
  },

  {
    name: 'update_equipment',
    title: 'Change equipment details',
    write: true,
    description:
      'Change a piece of equipment\'s name, category, asset tag, serial number or notes. Only the fields you pass change. ' +
      'Does not change its status - use check_out_equipment, check_in_equipment or flag_equipment_repair for that. ' +
      'Get the id from list_equipment.',
    inputSchema: {
      type: 'object',
      properties: {
        equipment_id: { type: 'string', description: 'From list_equipment.' },
        name: { type: 'string' }, category: { type: 'string' },
        asset_tag: { type: 'string' }, serial_number: { type: 'string' }, notes: { type: 'string' },
      },
      required: ['equipment_id'],
      additionalProperties: false,
    },
    resource: 'equipment',
    action: 'edit',
    project: 'none',
    async run({ db, actor, args }) {
      const where = await companyEquipment(db, actor.companyId, args.equipment_id)
      if (where) return { error: where }
      const fields = given(args, ['name', 'category', 'asset_tag', 'serial_number', 'notes'])
      if (!Object.keys(fields).length) return { error: 'Nothing to change - pass at least one field.' }
      const result = await updateEquipment(db, {
        userId: actor.userId, companyId: actor.companyId!, body: { ...fields, id: args.equipment_id }, via: VIA,
      })
      return outcome(result, 'equipment', e => ({ record: 'equipment', ...equipmentRow(e), changed: Object.keys(fields) }))
    },
  },

  {
    name: 'check_out_equipment',
    title: 'Check equipment out',
    write: true,
    description:
      'Check a piece of equipment out to a person - optionally onto one of the company\'s jobs - as the Equipment screen does. ' +
      'Refused if it is already checked out, in for repair or retired. holder_profile_id is a teammate id from list_team; ' +
      'holder_name is always required. Check list_equipment first for its status.',
    inputSchema: {
      type: 'object',
      properties: {
        equipment_id: { type: 'string', description: 'From list_equipment.' },
        holder_name: { type: 'string', description: 'Who has it.' },
        holder_profile_id: { type: 'string', description: 'The teammate\'s id, when they are a SyteNav user.' },
        project_id: { ...PROJECT_ID, description: 'The job it is going to. Leave out for the shop or yard.' },
        note: { type: 'string' },
      },
      required: ['equipment_id', 'holder_name'],
      additionalProperties: false,
    },
    resource: 'equipment',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      const where = await companyEquipment(db, actor.companyId, args.equipment_id)
      if (where) return { error: where }
      const holder = str(args.holder_name)
      if (!holder) return { error: 'Say who has it: holder_name is required.' }
      const project = str(args.project_id)
      if (project) {
        const job = await ownedJob(db, actor.companyId!, project)
        if (job) return { error: job }
      }
      const body = { holder_name: holder, holder_profile_id: str(args.holder_profile_id), project_id: project, note: str(args.note) }
      const result = await checkOutEquipment(db, {
        userId: actor.userId, companyId: actor.companyId!, equipmentId: args.equipment_id as string, body, via: VIA,
      })
      return outcome(result, 'assignment', a => ({
        record: 'equipment_checkout', id: a.id, equipment_id: a.equipment_id, holder: a.holder_name, project_id: a.project_id ?? null,
      }))
    },
  },

  {
    name: 'check_in_equipment',
    title: 'Check equipment back in',
    write: true,
    description:
      'Check a piece of equipment back in, as the Equipment screen does. condition is "ok" or "needs_repair"; needs_repair ' +
      'requires a note saying what is wrong, and puts it back on the shelf with the repair flag on it for the office to decide.',
    inputSchema: {
      type: 'object',
      properties: {
        equipment_id: { type: 'string', description: 'From list_equipment.' },
        condition: { type: 'string', enum: ['ok', 'needs_repair'] },
        note: { type: 'string' },
      },
      required: ['equipment_id', 'condition'],
      additionalProperties: false,
    },
    resource: 'equipment',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      const where = await companyEquipment(db, actor.companyId, args.equipment_id)
      if (where) return { error: where }
      if (args.condition !== 'ok' && args.condition !== 'needs_repair') return { error: 'condition must be "ok" or "needs_repair".' }
      const { data: open, error } = await db.from('equipment_assignments')
        .select('id').eq('equipment_id', args.equipment_id as string).is('checked_in_at', null).maybeSingle()
      if (error) return failed('the equipment checkout', error)
      if (!open) return { error: 'It is not checked out. Use list_equipment to see where it is.' }
      const body = { condition: args.condition, note: str(args.note) }
      const result = await checkInEquipment(db, {
        userId: actor.userId, companyId: actor.companyId!, equipmentId: args.equipment_id as string, body, via: VIA,
      })
      return plain(result, { checked_in: true, id: args.equipment_id, condition: args.condition })
    },
  },

  {
    name: 'flag_equipment_repair',
    title: 'Report equipment needs repair',
    write: true,
    description:
      'Report that a piece of equipment needs repair, with a note saying what is wrong - wherever it is, even out on a job. ' +
      'It does not take it out of service: sending it for repair, clearing the report and retiring it stay the office\'s call in the app.',
    inputSchema: {
      type: 'object',
      properties: {
        equipment_id: { type: 'string', description: 'From list_equipment.' },
        note: { type: 'string', description: 'What is wrong with it.' },
      },
      required: ['equipment_id', 'note'],
      additionalProperties: false,
    },
    resource: 'equipment',
    action: 'create',
    project: 'none',
    async run({ db, actor, args }) {
      const where = await companyEquipment(db, actor.companyId, args.equipment_id)
      if (where) return { error: where }
      if (!str(args.note)) return { error: 'Say what is wrong with it, so whoever fixes it knows.' }
      const result = await equipmentRepairMove(db, {
        userId: actor.userId, companyId: actor.companyId!, equipmentId: args.equipment_id as string,
        action: 'flag', body: { note: str(args.note) }, via: VIA,
      })
      return outcome(result, 'equipment', e => ({ record: 'equipment', ...equipmentRow(e) }))
    },
  },
]
