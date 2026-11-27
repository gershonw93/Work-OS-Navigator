import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, asMoney } from '@/lib/service-billing-server'
import { PRICE_COLS, priceItemProblem } from '@/lib/service-billing'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET - this company's price list (the active items; `?all=1` includes retired).
export async function GET(request: Request) {
  const db = admin()
  const gate = await billingGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  let q = db.from('service_price_items').select(PRICE_COLS).eq('company_id', gate.companyId)
  if (new URL(request.url).searchParams.get('all') !== '1') q = q.eq('active', true)
  const { data, error } = await q.order('sort_order').order('name')
  if (error) {
    console.error('[service-prices] read failed', { company: gate.companyId, error: error.message })
    return NextResponse.json({ error: 'Could not load the price list. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}

// POST - add an item to the price list.
export async function POST(request: Request) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const body = await request.json().catch(() => ({}))
  const problem = priceItemProblem(body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const { data, error } = await db.from('service_price_items').insert({
    company_id: gate.companyId,
    name: String(body.name).trim(),
    unit: body.unit ?? 'each',
    unit_price: asMoney(body.unit_price),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  }).select(PRICE_COLS).single()
  if (error) {
    console.error('[service-prices] insert failed', { company: gate.companyId, error: error.message })
    return NextResponse.json({ error: 'Could not save that item. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ item: data }, { status: 201 })
}
