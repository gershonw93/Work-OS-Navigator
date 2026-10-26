import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeLike } from '@/lib/personal-access'
import { logActivity } from '@/lib/log-activity'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding and editing a material purchase (a receipt) - the ONE home for both.
//
// Moved out of `POST /api/materials` and `PATCH /api/materials/[id]` unchanged,
// so the MCP server (Claude) writes a receipt through exactly the code the
// Materials screen does: the same coercions, the same pre-migration fallback
// for `client_paid`, the same activity line. The routes keep the gate
// (`materials: edit`, which carries the billing lock) and the ownership check
// on the job; this is everything after them.
//
// A material purchase pushes NOTHING to QuickBooks. It feeds Budget and the
// client-billable list (`lib/client-billable.ts`); it reaches a client only on
// a client invoice, which is born a draft.
// ─────────────────────────────────────────────────────────────────────────────

export async function createMaterialPurchase(
  db: SupabaseClient,
  { userId, companyId, body, via }: { userId: string; companyId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { project_id, store_name, amount, tax, purchase_date, category, notes, receipt_url, line_items, budget_line_id, save_store, client_paid } = body
  if (!project_id) return { status: 400, body: { error: 'Pick which job this is for.' } }

  // Optionally save the store as a supplier in the Directory (find or create by name).
  let store_company_id: string | null = null
  if (save_store && store_name?.trim()) {
    // In THIS company's Directory only, and escaped. It matched a bare name
    // across every company on the platform, so a receipt from "Home Depot"
    // attached itself to whichever company's row of that name came back first -
    // another tenant's Directory entry included.
    const { data: existing } = await db.from('companies').select('id')
      .eq('added_by_company_id', companyId)
      .ilike('name', escapeLike(store_name.trim()))
      .limit(1).maybeSingle()
    if (existing) store_company_id = existing.id
    else {
      const { data: created } = await db.from('companies').insert({
        name: store_name.trim(), type: 'supplier', trade: 'Materials',
        /* no address on file. NOT `noemail+<ts>@placeholder.com`: an invented address passes every is-this-an-address check, so the review screens listed the sub as emailable and a send would have recorded them TOLD. The column is NOT NULL, and '' is what 22 rows already use for absent. */ contact_email: '', insurance_status: 'missing', added_by_company_id: companyId,
      }).select('id').single()
      store_company_id = created?.id ?? null
    }
  }

  const row = {
    project_id,
    company_id: store_company_id,
    budget_line_id: budget_line_id || null,
    store_name: store_name || null,
    amount: Number(amount) || 0,
    tax: tax != null && tax !== '' ? Number(tax) : null,
    purchase_date: purchase_date || null,
    category: category || null,
    notes: notes || null,
    receipt_url: receipt_url || null,
    line_items: line_items ?? null,
    client_paid: !!client_paid,
    created_by: user.id,
  }

  let { data, error } = await db.from('material_purchases').insert(row).select('*').single()
  // Pre-migration fallback: client_paid column may not exist yet.
  if (error && (error as any).code === '42703') {
    const { client_paid: _omit, ...withoutClientPaid } = row
    const retry = await db.from('material_purchases').insert(withoutClientPaid).select('*').single()
    data = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  await logActivity(db, project_id, withVia((profile as any)?.full_name || 'Someone', via), 'material_purchased',
    `Material receipt: ${store_name || 'purchase'} - $${Number(amount || 0).toLocaleString()}`,
    { material_id: data.id, store_name, amount }, user.id)

  return { status: 200, body: { material: data } }
}

export async function updateMaterialPurchase(
  db: SupabaseClient,
  // `userId` and `via` are taken for the same shape as every other write here;
  // an edit records no name today, so neither is read yet.
  { id, projectId, body }: { userId: string; id: string; projectId?: string; body: any; via?: string },
): Promise<WriteResult> {
  const updates: Record<string, unknown> = {}
  for (const k of ['project_id', 'store_name', 'category', 'notes', 'purchase_date', 'budget_line_id']) {
    if (body[k] !== undefined) updates[k] = body[k] || null
  }
  if (body.amount !== undefined) updates.amount = Number(body.amount) || 0
  if (body.tax !== undefined) updates.tax = body.tax === '' || body.tax == null ? null : Number(body.tax)
  if (body.client_paid !== undefined) updates.client_paid = !!body.client_paid

  // Does this receipt carry the contractor fee?
  //
  // Same three states an invoice has, and the same reason null matters: an
  // explicit 0 means "no markup on this one", while null means "follow the
  // job" and keeps tracking a later change to the project rate. Storing 0 for
  // the second would silently freeze it. See lib/markup.ts.
  if (body.markup_excluded !== undefined) updates.markup_excluded = !!body.markup_excluded
  if (body.markup_pct !== undefined) {
    updates.markup_pct = body.markup_pct === '' || body.markup_pct == null ? null : Number(body.markup_pct)
  }

  // Scoped to the job it was found on when the caller knows it, so an edit
  // cannot land on a row the ownership check never looked at.
  const run = (u: Record<string, unknown>) => {
    let q = db.from('material_purchases').update(u).eq('id', id)
    if (projectId) q = q.eq('project_id', projectId)
    return q.select('*').single()
  }
  let { data, error } = await run(updates)
  // Pre-migration fallback: client_paid column may not exist yet.
  if (error && (error as any).code === '42703') {
    const { client_paid: _omit, ...rest } = updates
    const retry = await run(rest)
    data = retry.data; error = retry.error
  }
  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { material: data } }
}
