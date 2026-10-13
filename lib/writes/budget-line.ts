import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { budgetAmount } from '@/lib/validate'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding and editing a budget line - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/budget` and
// `PATCH /api/projects/[id]/budget/[lineId]` unchanged, so the MCP server
// (Claude) writes a line through exactly the code the Budget tab does: the same
// amount checks (no negative committed or actual), the same whitelist, the
// same pre-migration fallbacks and the same activity line. The routes keep the
// gate (`budget: edit`, which also carries the billing lock); this is
// everything after it.
// ─────────────────────────────────────────────────────────────────────────────

export async function createBudgetLine(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { cost_code, category, description, budgeted_amount, committed_amount, actual_amount, notes, subcontract_id, space_type, cost_type } = body

  // Same three costs, same rule as the PATCH beside it - a negative committed
  // or actual amount subtracts from the job's totals, and nothing used to stop
  // one being typed.
  const checkedBudgeted = budgetAmount(budgeted_amount, 'budget')
  const checkedCommitted = budgetAmount(committed_amount, 'committed amount')
  const checkedActual = budgetAmount(actual_amount, 'actual amount')
  for (const c of [checkedBudgeted, checkedCommitted, checkedActual]) {
    if (!c.ok) return { status: 400, body: { error: c.error } }
  }

  if (!description) return { status: 400, body: { error: 'Description is required' } }

  const { count } = await db
    .from('budget_line_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const row = {
    project_id: projectId,
    cost_code: cost_code || null,
    category: category || 'General',
    description,
    budgeted_amount: checkedBudgeted.value,
    committed_amount: checkedCommitted.value,
    actual_amount: checkedActual.value,
    notes: notes || null,
    subcontract_id: subcontract_id || null,
    space_type: space_type === 'interior' || space_type === 'exterior' ? space_type : null,
    cost_type: cost_type === 'soft' ? 'soft' : 'hard',
    sort_order: count ?? 0,
  }

  let { data, error } = await db.from('budget_line_items').insert(row).select().single()
  // Pre-migration fallback: space_type column may not exist yet.
  if (error && (error as any).code === '42703') {
    const { space_type: _omit, ...withoutSpaceType } = row
    const retry = await db.from('budget_line_items').insert(withoutSpaceType).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, projectId, withVia(profile?.full_name || 'Someone', via), 'budget_line_added',
    `Budget line added: ${description} - $${Number(budgeted_amount || 0).toLocaleString()}`,
    { line_id: data.id, description, budgeted_amount }, user.id)

  return { status: 200, body: { item: data } }
}

export async function updateBudgetLine(
  db: SupabaseClient,
  // `userId` and `via` are taken for the same shape as every other write here;
  // an edit records no name today, so neither is read yet.
  { projectId, lineId, body }: { userId: string; projectId: string; lineId: string; body: any; via?: string },
): Promise<WriteResult> {
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of ['cost_code', 'category', 'description', 'notes', 'subcontract_id']) {
    if (key in body) updates[key] = body[key] || null
  }
  // Costs, checked rather than coerced. `Number(x) || 0` took a negative
  // happily - a line saved Committed -1 and Actual -2.50 and SUBTRACTED them
  // from the project totals - and turned a typo into a silent, confident zero.
  const LABELS: Record<string, string> = {
    budgeted_amount: 'budget', committed_amount: 'committed amount', actual_amount: 'actual amount',
  }
  for (const key of ['budgeted_amount', 'committed_amount', 'actual_amount']) {
    if (!(key in body)) continue
    const checked = budgetAmount(body[key], LABELS[key])
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
    updates[key] = checked.value
  }
  // Not money - a position in a list, where 0 is the right fallback.
  if ('sort_order' in body) updates.sort_order = Number(body.sort_order) || 0
  if ('space_type' in body) updates.space_type = body.space_type === 'interior' || body.space_type === 'exterior' ? body.space_type : null
  if ('cost_type' in body) updates.cost_type = body.cost_type === 'soft' ? 'soft' : 'hard'
  // Markup for this trade. NULL is "follow the project rate" and 0 is "zero on
  // this line" - deliberately different, because storing 0 for the former would
  // stop the line following a later change to the project rate.
  if ('markup_pct' in body) {
    updates.markup_pct = body.markup_pct === '' || body.markup_pct === null
      ? null
      : Math.max(0, Number(body.markup_pct) || 0)
  }
  if ('markup_excluded' in body) updates.markup_excluded = !!body.markup_excluded

  let { data, error } = await db
    .from('budget_line_items')
    .update(updates)
    .eq('id', lineId)
    .eq('project_id', projectId)
    .select()
    .single()

  // Pre-migration fallback: space_type / cost_type / markup may not exist yet.
  if (error && (error as any).code === '42703') {
    const { space_type: _s, cost_type: _c, markup_pct: _mp, markup_excluded: _me, ...core } = updates
    const retry = await db
      .from('budget_line_items')
      .update(core)
      .eq('id', lineId)
      .eq('project_id', projectId)
      .select()
      .single()
    data = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  return { status: 200, body: { item: data } }
}
