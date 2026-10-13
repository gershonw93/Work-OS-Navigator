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
