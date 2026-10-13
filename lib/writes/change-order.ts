import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Raising a change order - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/change-orders` unchanged, so the MCP
// server raises one through the same checks: a title, and a budget line that is
// verified against THIS project rather than trusted. Born `pending` - approving
// a change order is a person's decision on the Change Orders tab.
// ─────────────────────────────────────────────────────────────────────────────

export async function createChangeOrder(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const {
    title,
    description,
    amount,
    reason,
    requested_by_type,
    subcontract_id,
    budget_line_item_id,
  } = body

  if (!title) return { status: 400, body: { error: 'title is required' } }

  // THE BUDGET LINE THIS RAISES.
  //
  // The column has existed since migration 069 and `approvedChangesByLine`
  // reads it, but this route never accepted it - so every change order raised
  // from the Change Orders screen was an unmapped owner-side one, and
  // `scheduleOfValues` gave it a catch-all "Approved change orders" row rather
  // than raising the line it belongs to. A GC told "this line is $12,000 over
  // its scheduled value, raise a change order" could raise one, approve it, and
  // find the line exactly as over as before.
  //
  // Same rule the selections overage flow already follows: an overage that
  // floats free of its line is money the budget cannot see.
  //
  // Verified against THIS project, not trusted: an id from another job would
  // move money onto a budget nobody is looking at.
  let budgetLineId: string | null = null
  if (budget_line_item_id) {
    const { data: line } = await db
      .from('budget_line_items')
      .select('id')
      .eq('id', budget_line_item_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!line) {
      return { status: 400, body: { error: 'That budget line is not on this project.' } }
    }
    budgetLineId = budget_line_item_id
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    title,
    description: description || null,
    amount: amount ?? 0,
    reason: reason || null,
    requested_by_type: requested_by_type ?? 'gc',
    subcontract_id: subcontract_id || null,
    status: 'pending',
    budget_line_item_id: budgetLineId,
  }

  let { data: changeOrder, error } = await db.from('change_orders').insert(row).select().single()

  // Pre-migration fallback: the link column may not exist yet. Same shape as
  // the selections route, which hit this first.
  if (error && (error as any).code === '42703' && 'budget_line_item_id' in row) {
    const { budget_line_item_id: _b, ...noLink } = row
    const retry = await db.from('change_orders').insert(noLink).select().single()
    changeOrder = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)
  await logActivity(
    db,
    projectId,
    actorName,
    'change_order_created',
    `Change order created: ${title}`,
    { change_order_id: changeOrder.id, title, amount, requested_by_type },
  )

  return { status: 201, body: { changeOrder } }
}

/**
 * Changing a change order - moved out of
 * `PATCH /api/projects/[id]/change-orders/[coId]` unchanged, plus one check the
 * create door already had: a budget line named here is verified against THIS
 * project, never trusted. A rule that exists on one door has to exist on the
 * others, and an id from another job would move money onto a budget nobody is
 * looking at.
 *
 * APPROVING IS MONEY. A change order tied to a subcontract folds its amount
 * into that subcontract's `contract_amount` the moment it is approved (and
 * takes it back out when un-approved), and an approved one raises the budget
 * line and the schedule of values the client is billed from. That is why the
 * MCP tool never passes `status` - only the route's own caller, a person on the
 * Change Orders tab, makes that decision.
 */
export async function updateChangeOrder(
  db: SupabaseClient,
  { userId, projectId, coId, body, via }: { userId: string; projectId: string; coId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single()

  const { status, review_notes, budget_line_item_id } = body

  // Load the current CO so we can fold/unfold its amount into the linked sub.
  const { data: existing } = await db
    .from('change_orders').select('*').eq('id', coId).eq('project_id', projectId).single()
  if (!existing) return { status: 404, body: { error: 'Change order not found' } }

  const updates: Record<string, any> = {}
  if (status !== undefined) updates.status = status
  if (review_notes !== undefined) updates.review_notes = review_notes
  // Filing an approved change order against a budget line, from the Budget
  // page's "Not on a budget line" panel. An approved change with no line is
  // real money the rows below cannot show, and this is how it gets a home.
  if (budget_line_item_id !== undefined) updates.budget_line_item_id = budget_line_item_id || null
  if (updates.budget_line_item_id) {
    const { data: line } = await db
      .from('budget_line_items')
      .select('id')
      .eq('id', updates.budget_line_item_id)
      .eq('project_id', projectId)
      .maybeSingle()
    if (!line) return { status: 400, body: { error: 'That budget line is not on this project.' } }
  }

  // When a change order is tied to a subcontract, approving it adds its amount
  // to that subcontract's contract_amount; un-approving removes it. The
  // applied_to_contract flag guarantees this happens exactly once.
  const newStatus = status !== undefined ? status : existing.status
  if (existing.subcontract_id) {
    const isApplied = !!existing.applied_to_contract
    const shouldApply = newStatus === 'approved'
    if (shouldApply !== isApplied) {
      const { data: sub } = await db.from('subcontracts').select('contract_amount').eq('id', existing.subcontract_id).single()
      if (sub) {
        const delta = shouldApply ? Number(existing.amount || 0) : -Number(existing.amount || 0)
        await db.from('subcontracts').update({ contract_amount: Number(sub.contract_amount || 0) + delta }).eq('id', existing.subcontract_id)
        updates.applied_to_contract = shouldApply
      }
    }
  }

  let { data: changeOrder, error } = await db
    .from('change_orders')
    .update(updates)
    .eq('id', coId)
    .eq('project_id', projectId)
    .select()
    .single()

  // Older DBs without the applied_to_contract column: retry without the flag.
  if (error && (error as any).code === '42703') {
    delete updates.applied_to_contract
    const retry = await db.from('change_orders').update(updates).eq('id', coId).eq('project_id', projectId).select().single()
    changeOrder = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)
  const message = status
    ? `Change order "${changeOrder.title}" marked ${status}`
    : `Change order "${changeOrder.title}" notes updated`

  await logActivity(db, projectId, actorName, 'change_order_updated', message, {
    change_order_id: changeOrder.id,
    status,
  })

  return { status: 200, body: { changeOrder } }
}
