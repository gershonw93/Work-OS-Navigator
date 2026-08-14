import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { ACTUAL_STATUSES, budgetTotals, rollupBudgetLines } from '@/lib/invoice-budget'
import { feeForInvoice } from '@/lib/allocations'

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
    { data: changeOrders },
    { data: allocations },
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
      .select('id, subcontract_id, amount, status, markup_pct, markup_excluded')
      .eq('project_id', params.id),
    db
      .from('material_purchases')
      .select('id, budget_line_id, amount, store_name, category, purchase_date, receipt_url, client_paid')
      .eq('project_id', params.id)
      .order('purchase_date', { ascending: false, nullsFirst: false }),
    db
      .from('projects')
      .select('interior_sqft, exterior_sqft, contractor_fee_pct, status, billing_mode, sellout_amount, client, contract_type')
      .eq('id', params.id)
      .single(),
    db
      .from('change_orders')
      .select('amount, status, budget_line_item_id, subcontract_id')
      .eq('project_id', params.id),
    // Invoice splits. Filtered to this project through the invoices that own
    // them - allocations have no project_id of their own, deliberately: the
    // invoice already answers that question and duplicating it invites drift.
    db
      .from('invoice_allocations')
      .select('id, invoice_id, budget_line_item_id, amount, invoices!inner(project_id)')
      .eq('invoices.project_id', params.id),
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
    changeOrders: (changeOrders ?? []) as any,
    allocations: (allocations ?? []) as any,
  })
  const totals = budgetTotals(items)

  const subOptions = (subcontracts ?? []).map((s: any) => ({
    id: s.id,
    label: s.companies?.name ? `${s.companies.name}${s.trade ? ` · ${s.trade}` : ''}` : (s.trade ?? 'Subcontract'),
    contract_amount: Number(s.contract_amount ?? 0),
  }))

  const materials_total = (materials ?? []).reduce((s: number, m: any) => s + Number(m.amount ?? 0), 0)

  // Cost-plus fee earned to date. Same item-by-item rule as Payments & Escrow,
  // so the two screens cannot report different fees for the same work: an
  // invoice ticked "bill at cost" earns nothing, one given its own percent uses
  // that percent, and only the rest follow the project rate.
  const projectPct = Number(projectMeta?.contractor_fee_pct ?? 0) * 100
  const lineRates = (data ?? []).map((l: any) => ({
    id: l.id, markup_pct: l.markup_pct, markup_excluded: l.markup_excluded,
  }))
  const allocsByInvoice = new Map<string, any[]>()
  for (const a of (allocations ?? []) as any[]) {
    if (!allocsByInvoice.has(a.invoice_id)) allocsByInvoice.set(a.invoice_id, [])
    allocsByInvoice.get(a.invoice_id)!.push(a)
  }
  const markupEarned = (invoices ?? [])
    .filter((i: any) => ACTUAL_STATUSES.has(i.status))
    .reduce((sum: number, i: any) => sum + feeForInvoice({
      invoice: i,
      allocations: allocsByInvoice.get(i.id) ?? [],
      lines: lineRates,
      projectPct,
    }).markup, 0)

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

  // Revised, not original - otherwise the interior/exterior split adds up to a
  // different number than the Total Budget tile right above it, off by exactly
  // the approved change orders.
  const spaceTotals = { interior: 0, exterior: 0, unassigned: 0 }
  for (const it of items) {
    const key = it.space_type === 'interior' ? 'interior' : it.space_type === 'exterior' ? 'exterior' : 'unassigned'
    spaceTotals[key] += it.revised_budget
  }

  return NextResponse.json({
    items,
    totals,
    subcontracts: subOptions,
    materials: materials ?? [],
    materials_total,
    space_totals: spaceTotals,
    project_sqft: { interior: projectMeta?.interior_sqft ?? null, exterior: projectMeta?.exterior_sqft ?? null },
    contractor_fee_pct: Number(projectMeta?.contractor_fee_pct ?? 0),
    project_status: projectMeta?.status ?? null,
    billing_mode: projectMeta?.billing_mode ?? 'simple',
    sellout_amount: projectMeta?.sellout_amount ?? null,
    // How the job PAYS - decides whether the screen asks for a contract value
    // or for a markup rate, instead of showing both and hedging. Null until
    // answered; the budget screen asks once.
    contract_type: (projectMeta as any)?.contract_type ?? null,
    // Only still used to pre-select that picker. It was never enough on its own
    // - it separates spec from not-spec and nothing else.
    has_client: !!(projectMeta as any)?.client,
    // The cost-plus fee actually earned so far, worked out invoice by invoice.
    // Deliberately not rate x spend: per-invoice overrides and at-cost
    // pass-throughs make those two different numbers.
    markup_earned: markupEarned,
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
