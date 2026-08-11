import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Place the order for a selection that's been chosen.
 *
 * A decision that's chosen and never ordered is still a decision nobody acted
 * on, and "did we order the windows?" is exactly the question this board exists
 * to answer. So ordering is a real step, not a status you remember to change.
 *
 * The amount comes from what they chose - it was already priced when the option
 * was put in front of them, so nobody retypes it. It lands as a material
 * purchase against the budget line, which is how it reaches the money side
 * rather than living only here.
 */
export async function POST(request: Request, { params }: { params: { id: string; selId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: sel } = await db.from('project_selections')
    .select('*').eq('id', params.selId).eq('project_id', params.id).single()
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  if (!sel.selected_name) {
    return NextResponse.json({ error: 'Nothing has been chosen yet, so there is nothing to order.' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({} as any))
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
    project_id: params.id,
    company_id: supplierId,
    budget_line_id: sel.budget_line_item_id,
    store_name: supplierName,
    amount,
    category: sel.category,
    purchase_date: new Date().toISOString().slice(0, 10),
    notes: `Selection: ${sel.item}${sel.location ? ` (${sel.location})` : ''} - ${sel.selected_name}`,
    created_by: user.id,
  }).select('id').single()

  if (purchaseErr) return NextResponse.json({ error: purchaseErr.message }, { status: 500 })

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
  }).eq('id', params.selId).select('*, selection_options(*)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ selection: updated, material_purchase_id: purchase?.id, amount })
}
