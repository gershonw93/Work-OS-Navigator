import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCEPTED_STATUSES, SELECTION_CATEGORIES, categoryDef, itemsForType, normalizeHex, parseOptionLines, variance } from '@/lib/selections'
import { money } from '@/lib/validate'
import { friendlyDbError } from '@/lib/db-error'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding and editing a client selection, its options, and ordering one - the
// ONE home for each.
//
// Moved out of the routes under `app/api/projects/[id]/selections/` unchanged,
// so the MCP server (Claude) writes through exactly the code the Selections tab
// does: the same allowance and price checks, the same ACCEPTED_STATUSES rule
// (a "Chosen" with nothing named, or with no budget line to land on, is
// refused), the same seeding. The routes keep the gate (`selections`, which
// carries the billing lock) and the ownership check on the job; this is
// everything after them.
//
// Nothing here sends anything to anybody. The client sees a selection on
// their portal link; ordering books a material purchase, which pushes nothing
// to QuickBooks.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A database failure, said in words - and written down in full.
 *
 * THE REPORT: "shows the user a raw Postgres error". The add route ended
 * `{ error: error.message }` and the page put that straight on screen through
 * useNotice, so somebody adding a bathroom tile read `null value in column
 * "status" of relation "project_selections" violates not-null constraint`.
 * `friendlyDbError` names the FIELD; the raw text goes to the log.
 */
function dbFailure(error: { message?: string | null; code?: string | null }, doing: string): WriteResult {
  console.error(`[selections] ${doing} failed`, error)
  return { status: 500, body: { error: friendlyDbError(error) } }
}

/** `POST /selections` - seed the board from the standard categories, or add one selection. */
export async function createSelection(
  db: SupabaseClient,
  { userId, companyId, projectId, body }: { userId: string; companyId: string | null; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const company_id = companyId

  // Starting a board from the standard categories. Far more useful than an
  // empty page - most houses need most of these, and deleting is faster than
  // remembering.
  if (body.seed) {
    const wanted: string[] = Array.isArray(body.categories) && body.categories.length
      ? body.categories
      : SELECTION_CATEGORIES.map(c => c.category)

    // The kind of job also decides which ITEMS make sense. A medical suite that
    // asked for Cabinets still shouldn't get laundry cabinets.
    const { data: proj } = await db.from('projects').select('type').eq('id', projectId).single()
    const type = proj?.type ?? null

    const { data: existing } = await db.from('project_selections')
      .select('category, item').eq('project_id', projectId)
    const seen = new Set((existing ?? []).map((e: any) => `${e.category}|${e.item}`.toLowerCase()))

    const rows: any[] = []
    let order = (existing?.length ?? 0) * 10
    for (const cat of SELECTION_CATEGORIES) {
      if (!wanted.includes(cat.category)) continue
      for (const item of itemsForType(cat, type)) {
        if (seen.has(`${cat.category}|${item}`.toLowerCase())) continue
        rows.push({
          project_id: projectId, company_id, category: cat.category, item,
          lead_time_days: cat.lead_time_days, status: 'pending',
          sort_order: (order += 10), created_by: user.id,
        })
      }
    }
    if (!rows.length) return { status: 200, body: { created: 0 } }
    const { error } = await db.from('project_selections').insert(rows)
    if (error) return dbFailure(error, 'seeding the board')
    return { status: 200, body: { created: rows.length } }
  }

  const item = String(body.item ?? '').trim()
  if (!item) return { status: 400, body: { error: 'What is being selected?' } }
  const category = String(body.category ?? 'Other').trim() || 'Other'

  const { data: last } = await db.from('project_selections')
    .select('sort_order').eq('project_id', projectId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  // An allowance of -$500 was saving happily and rendering as "Allowance $-500"
  // on the client's own screen. Blank is a real answer here (no allowance set),
  // so only a value that IS present has to make sense.
  let allowance: number | null = null
  if (body.allowance_amount != null && String(body.allowance_amount).trim() !== '') {
    const checked = money(body.allowance_amount, { allowZero: true, label: 'allowance' })
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
    allowance = checked.value
  }

  const { data, error } = await db.from('project_selections').insert({
    project_id: projectId,
    company_id,
    category,
    item,
    location: body.location || null,
    allowance_amount: allowance,
    budget_line_item_id: body.budget_line_item_id || null,
    needed_by: body.needed_by || null,
    lead_time_days: body.lead_time_days ?? categoryDef(category)?.lead_time_days ?? null,
    notes: body.notes || null,
    sort_order: ((last as any)?.sort_order ?? 0) + 10,
    // SAID OUT LOUD, not left to the column default - the seed path above
    // already says it, and two doors writing the same row should not depend
    // on one of them being right about the schema it happens to be pointed at.
    status: 'pending',
    created_by: user.id,
  }).select('*, selection_options(*)').single()

  if (error) return dbFailure(error, 'adding a selection')
  return { status: 200, body: { selection: data } }
}

/** What the PATCH route lets through. Anything else in a body is dropped. */
export const SELECTION_FIELDS = [
  'category', 'item', 'location', 'allowance_amount', 'budget_line_item_id',
  'needed_by', 'lead_time_days', 'status', 'selected_option_id', 'selected_name',
  'selected_price', 'notes', 'sort_order', 'reference_url', 'reference_label',
  'change_requested_at', 'change_request_note', 'supplier_company_id', 'expected_delivery',
]

/** `PATCH /selections/[selId]`. */
export async function updateSelection(
  db: SupabaseClient,
  { projectId, selId, body }: { userId: string; projectId: string; selId: string; body: any; via?: string },
): Promise<WriteResult> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of SELECTION_FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f]

  // The money fields have to make sense on the way through here too. Creating
  // a selection refused a negative allowance while EDITING one accepted it,
  // which is the same split the reviewer spotted on sub bills: "the guard
  // exists in one place and not the others".
  for (const [field, label] of [['allowance_amount', 'allowance'], ['selected_price', 'price']] as const) {
    if (patch[field] == null) continue
    const checked = money(patch[field], { allowZero: true, label })
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
    patch[field] = checked.value
  }

  // Recording the choice stamps who and when, so "when did they decide?" has an
  // answer months later when it matters.
  if (body.status === 'chosen' && !('selected_at' in body)) {
    patch.selected_at = new Date().toISOString()
  }

  // Accepting a selection is a commitment of money, so it has to land somewhere
  // the money is tracked. A chosen selection with no budget line is a cost the
  // budget cannot see - which is the exact thing this board exists to prevent.
  //
  // The client picking on their own link is NOT blocked by this (that goes
  // through the portal route) - it is the GC accepting it that needs a home.
  if (typeof body.status === 'string' && ACCEPTED_STATUSES.has(body.status as never)) {
    const { data: current } = await db.from('project_selections')
      .select('budget_line_item_id, selected_name').eq('id', selId).eq('project_id', projectId).single()

    // Chosen means a decision was made, so there has to be a decision. A
    // status that claims a choice nobody can name is a lie the client's link
    // repeats back to them ("You currently have "). Same rule as the order
    // route, both doors.
    const name = 'selected_name' in patch ? patch.selected_name : current?.selected_name
    if (!name || !String(name).trim()) {
      return {
        status: 409,
        body: {
          error: 'Put what they chose in first - "Chosen" with nothing named is a decision nobody can look up.',
          needs_selected_name: true,
        },
      }
    }

    const lineId = 'budget_line_item_id' in patch ? patch.budget_line_item_id : current?.budget_line_item_id
    if (!lineId) {
      return {
        status: 409,
        body: {
          error: 'Link this to a budget line first - or add a new one for it. An accepted selection is money, and it needs somewhere on the budget to land.',
          needs_budget_line: true,
        },
      }
    }
  }

  const { data, error } = await db.from('project_selections')
    .update(patch).eq('id', selId).eq('project_id', projectId)
    .select('*, selection_options(*)').single()
  if (error) return { status: 500, body: { error: error.message } }

  // Turn an overage into a change order. This is the whole reason allowances
  // are tracked here rather than in someone's head - the difference is real
  // money and it needs a paper trail, not a conversation.
  if (body.create_change_order && data) {
    const over = variance(data)
    if (over != null && over !== 0) {
      // Onto the SAME budget line the allowance came out of. An overage that
      // floats free of its line is money the budget cannot see.
      const co_row: Record<string, unknown> = {
        project_id: projectId,
        title: `Selection: ${data.item}${data.location ? ` (${data.location})` : ''}`,
        description: `Client selected "${data.selected_name ?? 'an upgrade'}" at $${Number(data.selected_price).toLocaleString()} against an allowance of $${Number(data.allowance_amount).toLocaleString()}.`,
        amount: over,
        reason: 'Allowance variance on a client selection',
        requested_by_type: 'gc',
        status: 'pending',
        budget_line_item_id: data.budget_line_item_id ?? null,
      }
      let co = (await db.from('change_orders').insert(co_row).select('id').single()).data
      // Pre-migration fallback: the link column may not exist yet.
      if (!co) {
        delete co_row.budget_line_item_id
        co = (await db.from('change_orders').insert(co_row).select('id').single()).data
      }
      if (co) {
        await db.from('project_selections').update({ change_order_id: co.id }).eq('id', selId)
        return { status: 200, body: { selection: { ...data, change_order_id: co.id }, change_order_id: co.id } }
      }
    }
  }

  return { status: 200, body: { selection: data } }
}

/**
 * Is this selection on this job? The option routes are keyed by `selId` alone,
 * so without this a selection id from another job - or another company - took
 * options happily through any job's URL.
 */
export async function selectionOnJob(db: SupabaseClient, projectId: string, selId: string): Promise<WriteResult | null> {
  const { data, error } = await db.from('project_selections').select('id').eq('id', selId).eq('project_id', projectId).maybeSingle()
  if (error) return dbFailure(error, 'checking the selection')
  return data ? null : { status: 404, body: { error: 'Selection not found' } }
}

/**
 * `POST /selections/[selId]/options` - what the client gets to choose from.
 *
 * A selection is a VISUAL decision - you cannot pick a paint color off a text
 * label - so an option carries a swatch, a photo and a link to the product page
 * alongside the price.
 */
export async function createSelectionOption(
  db: SupabaseClient,
  { projectId, selId, body }: { userId: string; projectId: string; selId: string; body: any; via?: string },
): Promise<WriteResult> {
  const where = await selectionOnJob(db, projectId, selId)
  if (where) return where

  const { data: last } = await db.from('selection_options')
    .select('sort_order').eq('selection_id', selId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  let order = (last as any)?.sort_order ?? 0

  // Bulk paste. Twelve colors off a fan deck is not twelve trips through a form.
  if (typeof body.paste === 'string' && body.paste.trim()) {
    const parsed = parseOptionLines(body.paste)
    if (!parsed.length) {
      return { status: 422, body: { error: 'Could not read any options out of that.' } }
    }
    const rows = parsed.map(p => ({
      selection_id: selId,
      name: p.name,
      brand: p.brand ?? null,
      price: p.price ?? null,
      color_hex: p.color_hex ?? null,
      link_url: p.link_url ?? null,
      vendor_company_id: body.vendor_company_id || null,
      sort_order: (order += 10),
    }))
    const { data, error } = await db.from('selection_options').insert(rows).select()
    if (error) return { status: 500, body: { error: error.message } }
    return { status: 200, body: { options: data, created: data?.length ?? 0 } }
  }

  const name = String(body.name ?? '').trim()
  if (!name) return { status: 400, body: { error: 'Give the option a name' } }

  const { data, error } = await db.from('selection_options').insert({
    selection_id: selId,
    name,
    brand: body.brand || null,
    model_number: body.model_number || null,
    description: body.description || null,
    price: body.price ?? null,
    color_hex: normalizeHex(body.color_hex),
    image_url: body.image_url || null,
    link_url: body.link_url || null,
    vendor: body.vendor || null,
    vendor_company_id: body.vendor_company_id || null,
    is_allowance: !!body.is_allowance,
    sort_order: order + 10,
  }).select().single()

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { option: data } }
}

/**
 * `POST /selections/[selId]/order` - place the order for a selection that's
 * been chosen.
 *
 * A decision that's chosen and never ordered is still a decision nobody acted
 * on, and "did we order the windows?" is exactly the question this board exists
 * to answer. So ordering is a real step, not a status you remember to change.
 *
 * The amount comes from what they chose - it was already priced when the option
 * was put in front of them, so nobody retypes it. It lands as a material
 * purchase against the budget line, which is how it reaches the money side
 * rather than living only here. It contacts NOBODY: it records that the order
 * was placed.
 */
export async function orderSelection(
  db: SupabaseClient,
  { userId, projectId, selId, body }: { userId: string; projectId: string; selId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { data: sel } = await db.from('project_selections')
    .select('*').eq('id', selId).eq('project_id', projectId).single()
  if (!sel) return { status: 404, body: { error: 'Selection not found' } }

  if (!sel.selected_name) {
    return { status: 400, body: { error: 'Nothing has been chosen yet, so there is nothing to order.' } }
  }

  // Ordering spends money. Without a budget line the purchase has nowhere to
  // land and the cost never reaches the budget at all.
  if (!sel.budget_line_item_id) {
    return {
      status: 409,
      body: {
        error: 'Link this to a budget line first - or add a new one for it. Ordering books a cost, and it needs a line to book it against.',
        needs_budget_line: true,
      },
    }
  }

  const supplierId = body.supplier_company_id || sel.supplier_company_id || null
  // What they chose was already priced. Only fall back to the allowance when
  // the pick was a write-in with no price against it.
  const amount = body.amount ?? sel.selected_price ?? sel.allowance_amount ?? 0

  let supplierName: string | null = null
  if (supplierId) {
    const { data: co } = await db.from('companies').select('name').eq('id', supplierId).single()
    supplierName = co?.name ?? null
  }

  const { data: purchase, error: purchaseErr } = await db.from('material_purchases').insert({
    project_id: projectId,
    company_id: supplierId,
    budget_line_id: sel.budget_line_item_id,
    store_name: supplierName,
    amount,
    category: sel.category,
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: `Selection: ${sel.item}${sel.location ? ` (${sel.location})` : ''} - ${sel.selected_name}`,
    created_by: user.id,
  }).select('id').single()

  if (purchaseErr) return { status: 500, body: { error: purchaseErr.message } }

  const { data: updated, error } = await db.from('project_selections').update({
    status: 'ordered',
    ordered_at: new Date().toISOString(),
    supplier_company_id: supplierId,
    expected_delivery: body.expected_delivery || null,
    material_purchase_id: purchase?.id ?? null,
    // Ordering answers any outstanding change request one way or the other.
    change_requested_at: null,
    change_request_note: null,
    updated_at: new Date().toISOString(),
  }).eq('id', selId).eq('project_id', projectId).select('*, selection_options(*)').single()

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { selection: updated, material_purchase_id: purchase?.id, amount } }
}
