import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { rollupBudgetLines } from '@/lib/invoice-budget'

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
    { data: projectRow },
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
    db
      .from('projects')
      .select('interior_sqft, exterior_sqft, contractor_fee_pct, status, billing_mode, sellout_amount')
      .eq('id', params.id)
      .single(),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // billing_mode arrived in a later migration - fall back if it isn't there yet.
  let projectMeta: any = projectRow
  if (!projectMeta) {
    const retry = await db.from('projects')
      .select('interior_sqft, exterior_sqft, contractor_fee_pct, status')
      .eq('id', params.id).single()
    projectMeta = retry.data
  }

  // Committed = the contract; Actual = accepted invoices + assigned receipts.
  // Shared with the Invoices tab so the "already billed" figure shown next to an
  // invoice is the same number this sheet shows for the line it lands on.
  const items = rollupBudgetLines({
    lines: (data ?? []) as any,
    invoices: (invoices ?? []) as any,
    materials: (materials ?? []) as any,
    subs: (subcontracts ?? []) as any,
  })

  const subOptions = (subcontracts ?? []).map((s: any) => ({
    id: s.id,
    label: s.companies?.name ? `${s.companies.name}${s.trade ? ` · ${s.trade}` : ''}` : (s.trade ?? 'Subcontract'),
    contract_amount: Number(s.contract_amount ?? 0),
  }))

  const materials_total = (materials ?? []).reduce((s: number, m: any) => s + Number(m.amount ?? 0), 0)

  // Categories this company has already used anywhere. A category typed by
  // hand on one job then shows up in the dropdown on the next one, so custom
  // trades don't have to be retyped. Best-effort - never fail the page over it.
  let knownCategories: string[] = []
  try {
    const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
    const cid = profile?.company_id
    if (cid) {
      const { data: companyProjects } = await db
        .from('projects').select('id')
        .or(`gc_company_id.eq.${cid},created_by_company_id.eq.${cid}`)
        .limit(500)
      const ids = (companyProjects ?? []).map((p: any) => p.id)
      if (ids.length) {
        const { data: cats } = await db
          .from('budget_line_items').select('category').in('project_id', ids).limit(5000)
        knownCategories = Array.from(new Set(
          (cats ?? []).map((c: any) => (c.category ?? '').trim()).filter(Boolean)
        ))
      }
    }
  } catch { /* dropdown falls back to the built-in catalog */ }

  const spaceTotals = { interior: 0, exterior: 0, unassigned: 0 }
  for (const it of items) {
    const key = it.space_type === 'interior' ? 'interior' : it.space_type === 'exterior' ? 'exterior' : 'unassigned'
    spaceTotals[key] += Number(it.budgeted_amount ?? 0)
  }

  return NextResponse.json({
    items,
    subcontracts: subOptions,
    materials: materials ?? [],
    materials_total,
    space_totals: spaceTotals,
    project_sqft: { interior: projectMeta?.interior_sqft ?? null, exterior: projectMeta?.exterior_sqft ?? null },
    contractor_fee_pct: Number(projectMeta?.contractor_fee_pct ?? 0),
    project_status: projectMeta?.status ?? null,
    billing_mode: projectMeta?.billing_mode ?? 'simple',
    sellout_amount: projectMeta?.sellout_amount ?? null,
    known_categories: knownCategories,
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { cost_code, category, description, budgeted_amount, committed_amount, actual_amount, notes, subcontract_id, space_type, cost_type } = body

  if (!description) return NextResponse.json({ error: 'Description is required' }, { status: 400 })

  const { count } = await db
    .from('budget_line_items')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const row = {
    project_id: params.id,
    cost_code: cost_code || null,
    category: category || 'General',
    description,
    budgeted_amount: Number(budgeted_amount) || 0,
    committed_amount: Number(committed_amount) || 0,
    actual_amount: Number(actual_amount) || 0,
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'budget_line_added',
    `Budget line added: ${description} - $${Number(budgeted_amount || 0).toLocaleString()}`,
    { line_id: data.id, description, budgeted_amount }, user.id)

  return NextResponse.json({ item: data })
}
