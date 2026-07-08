import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data, error },
    { data: subcontracts },
    { data: invoices },
    { data: materials },
  ] = await Promise.all([
    db
      .from('budget_line_items')
      .select('*')
      .eq('project_id', params.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    db
      .from('subcontracts')
      .select('id, trade, contract_amount, companies(name)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db
      .from('invoices')
      .select('subcontract_id, amount, status')
      .eq('project_id', params.id),
    db
      .from('material_purchases')
      .select('id, budget_line_id, amount, store_name, category, purchase_date, receipt_url, client_paid')
      .eq('project_id', params.id)
      .order('purchase_date', { ascending: false, nullsFirst: false }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Actual = billed & accepted invoices (approved / sent / paid), per subcontract.
  // (Approving an invoice should move the line, not only marking it paid.)
  const ACTUAL_STATUSES = new Set(['approved', 'sent', 'paid'])
  const actualBySub = new Map<string, number>()
  for (const inv of invoices ?? []) {
    if (ACTUAL_STATUSES.has(inv.status) && inv.subcontract_id) {
      actualBySub.set(inv.subcontract_id, (actualBySub.get(inv.subcontract_id) ?? 0) + Number(inv.amount ?? 0))
    }
  }
  const subById = new Map((subcontracts ?? []).map((s: any) => [s.id, s]))

  // Material receipts assigned to a budget line also count toward its Actual.
  const materialsByLine = new Map<string, number>()
  for (const m of materials ?? []) {
    if (m.budget_line_id) materialsByLine.set(m.budget_line_id, (materialsByLine.get(m.budget_line_id) ?? 0) + Number(m.amount ?? 0))
  }

  // For linked lines, derive committed (contract amount) and actual (billed invoices + materials).
  const items = (data ?? []).map((line: any) => {
    const materialsAmount = materialsByLine.get(line.id) ?? 0
    if (line.subcontract_id && subById.has(line.subcontract_id)) {
      const sub: any = subById.get(line.subcontract_id)
      return {
        ...line,
        committed_amount: Number(sub.contract_amount ?? 0),
        actual_amount: (actualBySub.get(line.subcontract_id) ?? 0) + materialsAmount,
        materials_amount: materialsAmount,
        linked: true,
        linked_label: sub.companies?.name ?? sub.trade ?? 'Subcontract',
      }
    }
    return { ...line, actual_amount: Number(line.actual_amount ?? 0) + materialsAmount, materials_amount: materialsAmount, linked: false, linked_label: null }
  })

  const subOptions = (subcontracts ?? []).map((s: any) => ({
    id: s.id,
    label: s.companies?.name ? `${s.companies.name}${s.trade ? ` · ${s.trade}` : ''}` : (s.trade ?? 'Subcontract'),
    contract_amount: Number(s.contract_amount ?? 0),
  }))

  const materials_total = (materials ?? []).reduce((s: number, m: any) => s + Number(m.amount ?? 0), 0)

  return NextResponse.json({ items, subcontracts: subOptions, materials: materials ?? [], materials_total })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { cost_code, category, description, budgeted_amount, committed_amount, actual_amount, notes, subcontract_id } = body

  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  const { count } = await db
    .from('budget_line_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const { data, error } = await db
    .from('budget_line_items')
    .insert({
      project_id: params.id,
      cost_code: cost_code || null,
      category: category || 'General',
      description,
      budgeted_amount: Number(budgeted_amount) || 0,
      committed_amount: Number(committed_amount) || 0,
      actual_amount: Number(actual_amount) || 0,
      notes: notes || null,
      subcontract_id: subcontract_id || null,
      sort_order: count ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}
