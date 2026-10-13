import { SELECTION_STATUSES, STATUS_LABEL, variance, urgency, type SelectionStatus } from '@/lib/selections'
import { toAmount } from '@/lib/schedule-dependencies'
import { createSelection, createSelectionOption, orderSelection, updateSelection } from '@/lib/writes/selection'
import {
  PROJECT_ID, DATE, VIA, capped, failed, str, isDate, money, given, onJob, outcome,
  type ToolDef, type WriteToolDef,
} from '../tool-kit'

// ─────────────────────────────────────────────────────────────────────────────
// Client selections - the allowance picks (tile, paint, fixtures) a client owes
// the GC. Claude can read the board, add a selection, put options in front of
// the client, record what was chosen and record that it was ordered.
//
// THE LIMITS: no delete (of a selection or an option), no photo upload, no
// change order from an overage (that is a separate decision with its own
// permission - the app's button does it), and nothing here contacts anybody:
// the client sees options on their portal link only when somebody shares it.
// Every write goes through `lib/writes/selection.ts`, the same code the
// Selections tab runs.
// ─────────────────────────────────────────────────────────────────────────────

const SELECTION_ID = { type: 'string', description: 'The selection id from list_selections.' }
const STATUS_KEYS = SELECTION_STATUSES.map(s => s.key)
/** `ordered` is not set by hand here - mark_selection_ordered books the cost that goes with it. */
const EDITABLE_STATUSES: SelectionStatus[] = STATUS_KEYS.filter(k => k !== 'ordered')

const n = (v: unknown) => toAmount(v)

function summarise(s: any) {
  return {
    record: 'selection', id: s.id, category: s.category, item: s.item, location: s.location ?? null,
    status: s.status, status_label: STATUS_LABEL[s.status as SelectionStatus] ?? s.status,
    allowance_amount: n(s.allowance_amount), selected_name: s.selected_name ?? null, selected_price: n(s.selected_price),
    budget_line_item_id: s.budget_line_item_id ?? null, needed_by: s.needed_by ?? null,
  }
}

export const SELECTIONS_READ: ToolDef[] = [
  {
    name: 'list_selections',
    title: 'List client selections',
    description:
      'The client selections on a job (or on every job when project_id is left out): each item with its category, location, ' +
      'status, allowance, needed-by date, what was chosen and at what price, how far over or under the allowance that is, the ' +
      'budget line it lands on, and the options put in front of the client. Use the ids to add an option or update a selection.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        status: { type: 'string', enum: STATUS_KEYS, description: 'Only selections in this status.' },
      },
      additionalProperties: false,
    },
    resource: 'selections',
    project: 'optional',
    async run({ db, args, projectIds, projectNames }) {
      if (!projectIds.length) return { data: { selections: [], truncated: false } }
      let q = db.from('project_selections')
        .select('id, project_id, category, item, location, status, allowance_amount, budget_line_item_id, needed_by, lead_time_days, selected_option_id, selected_name, selected_price, selected_at, ordered_at, expected_delivery, change_requested_at, change_request_note, notes, selection_options(id, name, brand, model_number, description, price, color_hex, link_url, vendor, is_allowance, sort_order)')
        .in('project_id', projectIds)
      if (typeof args.status === 'string' && STATUS_KEYS.includes(args.status as SelectionStatus)) q = q.eq('status', args.status)
      const { data, error } = await q.order('sort_order', { ascending: true })
      if (error) return failed('the selections', error)
      const { rows, truncated } = capped(data ?? [])
      return {
        data: {
          // NUMERIC comes back as a string - every amount is read, never passed on as "80.00".
          selections: rows.map((s: any) => ({
            ...summarise(s),
            project_id: s.project_id, project: projectNames.get(s.project_id) ?? null,
            lead_time_days: s.lead_time_days ?? null,
            urgency: urgency(s),
            selected_option_id: s.selected_option_id ?? null, selected_at: s.selected_at ?? null,
            // Positive is over the allowance (money the client owes on top), negative under. Null when either half is missing.
            over_allowance: variance({ allowance_amount: n(s.allowance_amount), selected_price: n(s.selected_price) }),
            ordered_at: s.ordered_at ?? null, expected_delivery: s.expected_delivery ?? null,
            change_requested: s.change_requested_at ? { at: s.change_requested_at, note: s.change_request_note ?? null } : null,
            notes: s.notes ?? null,
            options: ((s.selection_options ?? []) as any[])
              .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map(o => ({
                id: o.id, name: o.name, brand: o.brand ?? null, model_number: o.model_number ?? null, description: o.description ?? null,
                price: n(o.price), color_hex: o.color_hex ?? null, link_url: o.link_url ?? null, vendor: o.vendor ?? null,
                is_allowance: !!o.is_allowance, chosen: o.id === s.selected_option_id,
              })),
          })),
          truncated,
        },
      }
    },
  },
]

export const SELECTIONS_WRITE: WriteToolDef[] = [
  {
    name: 'add_selection',
    title: 'Add a client selection',
    write: true,
    description:
      'Add one item the client has to pick (e.g. "Primary bath floor tile", allowance $2,400), as the Selections tab does. ' +
      'It starts Not started; nothing is sent to the client. Check list_selections first so the same item is not added twice, ' +
      'and get_budget for the budget line id.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        item: { type: 'string', description: 'What is being selected.' },
        category: { type: 'string', description: 'e.g. Flooring, Plumbing Fixtures. Defaults to Other.' },
        location: { type: 'string', description: 'e.g. Primary bath.' },
        allowance_amount: { type: 'number', minimum: 0, description: 'Dollars the contract carries for it.' },
        budget_line_item_id: { type: 'string', description: 'From get_budget - where the money lands.' },
        needed_by: { ...DATE, description: 'When the choice is needed (YYYY-MM-DD).' },
        lead_time_days: { type: 'integer', minimum: 0 },
        notes: { type: 'string' },
      },
      required: ['project_id', 'item'],
      additionalProperties: false,
    },
    resource: 'selections',
    action: 'create',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const item = str(args.item)
      if (!item) return { error: 'Say what is being selected (item).' }
      const allowance = money(args.allowance_amount)
      if (allowance === 'bad') return { error: 'allowance_amount must be a number, zero or more.' }
      if (args.needed_by != null && !isDate(args.needed_by)) return { error: 'needed_by must be YYYY-MM-DD.' }
      const lead = args.lead_time_days
      if (lead != null && !(Number.isInteger(lead) && (lead as number) >= 0)) return { error: 'lead_time_days must be a whole number of days.' }
      const line = str(args.budget_line_item_id)
      if (line) {
        const where = await onJob(db, 'budget_line_items', line, projectId!)
        if (where) return { error: `Budget line: ${where}` }
      }
      const result = await createSelection(db, {
        userId: actor.userId, companyId: actor.companyId, projectId: projectId!, via: VIA,
        body: {
          item, category: str(args.category) ?? undefined, location: str(args.location),
          allowance_amount: allowance, budget_line_item_id: line, needed_by: args.needed_by ?? null,
          lead_time_days: lead ?? undefined, notes: str(args.notes),
        },
      })
      return outcome(result, 'selection', summarise)
    },
  },

  {
    name: 'add_selection_option',
    title: 'Add an option to a selection',
    write: true,
    description:
      'Put one option in front of the client for a selection - a product with its name, brand, model, price, swatch colour and ' +
      'product link - as the Selections tab does. Sends nothing; the client sees it on their portal link. No photo upload. ' +
      'Check the selection\'s options in list_selections first so the same option is not added twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        selection_id: SELECTION_ID,
        name: { type: 'string', description: 'e.g. "Alabaster SW 7008".' },
        brand: { type: 'string' }, model_number: { type: 'string' }, description: { type: 'string' },
        price: { type: 'number', minimum: 0, description: 'Dollars.' },
        color_hex: { type: 'string', description: 'A swatch colour, e.g. #EDEAE0.' },
        link_url: { type: 'string', description: 'The product page.' },
        vendor: { type: 'string', description: 'Where it comes from, as text.' },
        is_allowance: { type: 'boolean', description: 'True when this is the option the allowance covers.' },
      },
      required: ['project_id', 'selection_id', 'name'],
      additionalProperties: false,
    },
    resource: 'selections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'project_selections', args.selection_id, projectId!)
      if (where) return { error: where }
      const name = str(args.name)
      if (!name) return { error: 'Give the option a name.' }
      const price = money(args.price)
      if (price === 'bad') return { error: 'price must be a number, zero or more.' }
      const link = str(args.link_url)
      if (link && !/^https?:\/\//i.test(link)) return { error: 'link_url must start with http:// or https://.' }
      const result = await createSelectionOption(db, {
        userId: actor.userId, projectId: projectId!, selId: args.selection_id as string, via: VIA,
        body: {
          name, brand: str(args.brand), model_number: str(args.model_number), description: str(args.description),
          price, color_hex: str(args.color_hex), link_url: link, vendor: str(args.vendor), is_allowance: args.is_allowance === true,
        },
      })
      return outcome(result, 'option', o => ({
        record: 'selection_option', id: o.id, selection_id: o.selection_id, name: o.name, price: n(o.price),
      }))
    },
  },

  {
    name: 'update_selection',
    title: 'Change a selection',
    write: true,
    description:
      'Change a selection: its item, category, location, allowance, needed-by date, lead time, notes, budget line, what the ' +
      'client chose (selected_option_id from list_selections, or selected_name and selected_price for a write-in), the expected ' +
      'delivery, or its status (pending, waiting, chosen, installed). Only the fields you pass change. Chosen and Installed need ' +
      'a choice named AND a budget line, the same rule the app applies. To mark it ordered use mark_selection_ordered. This does ' +
      'not create a change order for an overage and sends nothing to the client.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        selection_id: SELECTION_ID,
        item: { type: 'string' }, category: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' },
        allowance_amount: { type: 'number', minimum: 0 },
        budget_line_item_id: { type: 'string', description: 'From get_budget.' },
        needed_by: { ...DATE }, expected_delivery: { ...DATE },
        lead_time_days: { type: 'integer', minimum: 0 },
        status: { type: 'string', enum: EDITABLE_STATUSES },
        selected_option_id: { type: 'string', description: 'One of this selection\'s option ids. Fills in the name and price from the option.' },
        selected_name: { type: 'string' },
        selected_price: { type: 'number', minimum: 0 },
      },
      required: ['project_id', 'selection_id'],
      additionalProperties: false,
    },
    resource: 'selections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'project_selections', args.selection_id, projectId!)
      if (where) return { error: where }
      const selId = args.selection_id as string
      const body = given(args, [
        'item', 'category', 'location', 'notes', 'allowance_amount', 'budget_line_item_id', 'needed_by', 'expected_delivery',
        'lead_time_days', 'status', 'selected_option_id', 'selected_name', 'selected_price',
      ])
      if (!Object.keys(body).length) return { error: 'Nothing to change - pass at least one field.' }

      if ('status' in body && !EDITABLE_STATUSES.includes(body.status as SelectionStatus)) {
        return { error: `status must be one of ${EDITABLE_STATUSES.join(', ')}. To mark it ordered use mark_selection_ordered.` }
      }
      for (const k of ['allowance_amount', 'selected_price']) {
        if (k in body && money(body[k]) === 'bad') return { error: `${k} must be a number, zero or more.` }
      }
      for (const k of ['needed_by', 'expected_delivery']) {
        if (k in body && body[k] != null && !isDate(body[k])) return { error: `${k} must be YYYY-MM-DD.` }
      }
      if ('item' in body && !str(body.item)) return { error: 'item cannot be blank.' }
      if ('budget_line_item_id' in body && body.budget_line_item_id != null && body.budget_line_item_id !== '') {
        const line = await onJob(db, 'budget_line_items', body.budget_line_item_id, projectId!)
        if (line) return { error: `Budget line: ${line}` }
      }
      // A picker that shows a fact fills it in: choosing an option names it and prices it.
      if ('selected_option_id' in body) {
        const { data: opt, error } = await db.from('selection_options')
          .select('id, name, price').eq('id', String(body.selected_option_id)).eq('selection_id', selId).maybeSingle()
        if (error) return failed('the option', error)
        if (!opt) return { error: 'That option is not on this selection. Use list_selections for its options.' }
        if (!('selected_name' in body)) body.selected_name = opt.name
        if (!('selected_price' in body) && opt.price != null) body.selected_price = n(opt.price)
      }

      const result = await updateSelection(db, { userId: actor.userId, projectId: projectId!, selId, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const row = result.body?.selection
      if (!row) return { error: 'SyteNav did not confirm the change. Check the app before trying again.' }
      return { data: { updated: true, ...summarise(row), changed: Object.keys(body) } }
    },
  },

  {
    name: 'mark_selection_ordered',
    title: 'Mark a selection ordered',
    write: true,
    description:
      'Record that a chosen selection has been ordered, as the Selections tab\'s Order button does: it books the price of what ' +
      'was chosen as a material purchase on the selection\'s budget line and moves it to Ordered. It does NOT place an order ' +
      'with anybody or contact the supplier. Needs a choice named and a budget line (update_selection). Check list_selections ' +
      'first - a selection already Ordered must not be booked twice.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: PROJECT_ID,
        selection_id: SELECTION_ID,
        amount: { type: 'number', minimum: 0, description: 'Dollars, only when it differs from the chosen price.' },
        expected_delivery: { ...DATE },
      },
      required: ['project_id', 'selection_id'],
      additionalProperties: false,
    },
    resource: 'selections',
    action: 'edit',
    project: 'required',
    async run({ db, actor, args, projectId }) {
      const where = await onJob(db, 'project_selections', args.selection_id, projectId!)
      if (where) return { error: where }
      const { data: sel, error } = await db.from('project_selections').select('status').eq('id', args.selection_id as string).maybeSingle()
      if (error) return failed('the selection', error)
      if (sel?.status === 'ordered' || sel?.status === 'installed') {
        return { error: 'That selection is already ordered - booking it again would count the cost twice.' }
      }
      const amount = money(args.amount)
      if (amount === 'bad') return { error: 'amount must be a number, zero or more.' }
      if (args.expected_delivery != null && !isDate(args.expected_delivery)) return { error: 'expected_delivery must be YYYY-MM-DD.' }
      const body: Record<string, unknown> = { expected_delivery: args.expected_delivery ?? null }
      if (amount != null) body.amount = amount
      const result = await orderSelection(db, { userId: actor.userId, projectId: projectId!, selId: args.selection_id as string, body, via: VIA })
      if (result.status >= 400) return { error: String(result.body?.error ?? 'SyteNav refused that.') }
      const row = result.body?.selection
      if (!row) return { error: 'SyteNav did not confirm the order was recorded. Check the app before trying again.' }
      return {
        data: {
          updated: true, ...summarise(row), material_purchase_id: result.body.material_purchase_id ?? null,
          amount_booked: n(result.body.amount), expected_delivery: row.expected_delivery ?? null,
        },
      }
    },
  },
]
