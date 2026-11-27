import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, asMoney } from '@/lib/service-billing-server'
import { PRICE_COLS, priceItemProblem } from '@/lib/service-billing'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// PATCH - change a price item. A price change never reaches an invoice
// already written: a line copies the price when it is picked.
export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const body = await request.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) update.name = String(body.name).trim()
  if (body.unit !== undefined) update.unit = body.unit
  if (body.unit_price !== undefined) update.unit_price = asMoney(body.unit_price)
  if (body.active !== undefined) update.active = !!body.active
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) update.sort_order = Number(body.sort_order)
  const problem = priceItemProblem({ name: update.name ?? 'x', unit_price: update.unit_price ?? 0, unit: update.unit })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const { data, error } = await db.from('service_price_items').update(update)
    .eq('id', params.itemId).eq('company_id', gate.companyId).select(PRICE_COLS).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not save that item. Try again.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Price item not found' }, { status: 404 })
  return NextResponse.json({ item: data })
}

// DELETE - RETIRE an item: it leaves the picker, and nothing already billed
// changes (a line holds its own copy of the words and the price).
export async function DELETE(request: Request, { params }: { params: { itemId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const { data, error } = await db.from('service_price_items').update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', params.itemId).eq('company_id', gate.companyId).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not remove that item. Try again.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Price item not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
