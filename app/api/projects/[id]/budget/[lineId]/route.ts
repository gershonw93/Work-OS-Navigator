import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { ACTUAL_STATUSES, lineExposure, rollupBudgetLines } from '@/lib/invoice-budget'
import { requirePermission, denied } from '@/lib/api-guard'
import { budgetAmount } from '@/lib/validate'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Everything tied to one budget line.
 *
 * The sheet could tell you a line had $86,340 against it and nothing at all
 * about WHAT that was. Answering "why is this line at that number" meant
 * opening three other tabs and matching things up by the sub's name.
 *
 * Invoices reach a line two ways and both are gathered here: an explicit split
 * (an allocation), or the line's linked subcontract. They stay labelled apart,
 * because they answer different questions - "I put part of this bill here"
 * versus "this is that sub's line".
 */
export async function GET(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: line } = await db
    .from('budget_line_items').select('*')
    .eq('id', params.lineId).eq('project_id', params.id).maybeSingle()
  if (!line) return NextResponse.json({ error: 'Budget line not found' }, { status: 404 })

  // The SAME rollup the budget sheet runs, then this line picked out of it.
  //
  // This panel first hand-rolled its own arithmetic and immediately disagreed
  // with the row that opened it: it computed "Left" as budget - billed -
  // receipts, which ignores the signed contract and is the exact mistake
  // lineExposure() exists to prevent. Two screens deriving the same money two
  // ways is what lib/invoice-budget.ts is for. Derive once.
  const [
    { data: allLines }, { data: allInvoices }, { data: allMaterials },
    { data: allSubs }, { data: changeOrders }, { data: allocations },
  ] = await Promise.all([
    db.from('budget_line_items').select('*').eq('project_id', params.id),
    db.from('invoices')
      .select('id, subcontract_id, invoice_number, company_name, description, amount, status, created_at')
      .eq('project_id', params.id),
    db.from('material_purchases')
      .select('id, budget_line_id, amount, store_name, category, purchase_date, receipt_url')
      .eq('project_id', params.id),
    db.from('subcontracts').select('id, trade, contract_amount, status, companies(name)').eq('project_id', params.id),
    // NO co_number - that column does not exist, and selecting it returned
    // null for the WHOLE query, so every change order silently vanished and
    // this panel reported a budget $8,000 short of the row above it.
    db.from('change_orders')
      .select('id, title, amount, status, created_at, budget_line_item_id, subcontract_id')
      .eq('project_id', params.id),
    db.from('invoice_allocations')
      .select('id, invoice_id, budget_line_item_id, amount, note, invoices!inner(project_id)')
      .eq('invoices.project_id', params.id),
  ])

  const rolled = rollupBudgetLines({
    lines: (allLines ?? []) as any,
    invoices: (allInvoices ?? []) as any,
    materials: (allMaterials ?? []) as any,
    subs: (allSubs ?? []) as any,
    changeOrders: (changeOrders ?? []) as any,
    allocations: (allocations ?? []) as any,
  })
  const rolledLine = rolled.find(l => l.id === params.lineId)
  if (!rolledLine) return NextResponse.json({ error: 'Budget line not found' }, { status: 404 })

  const sub = line.subcontract_id
    ? (allSubs ?? []).find((x: any) => x.id === line.subcontract_id) ?? null
    : null
  const materials = (allMaterials ?? []).filter((m: any) => m.budget_line_id === params.lineId)
  const mine = (allocations ?? []).filter((a: any) => a.budget_line_item_id === params.lineId)
  const invById = new Map((allInvoices ?? []).map((i: any) => [i.id, i]))

  // A bill that has been split is accounted for by its splits. Listing it again
  // under its contract would double it on screen exactly the way the rollup
  // refuses to double it in the maths.
  const anySplit = new Set((allocations ?? []).map((a: any) => a.invoice_id))

  const viaContract = (allInvoices ?? [])
    .filter((i: any) => line.subcontract_id && i.subcontract_id === line.subcontract_id && !anySplit.has(i.id))
    .map((i: any) => ({
      id: i.id, invoice_number: i.invoice_number, company_name: i.company_name,
      description: i.description, amount: Number(i.amount ?? 0), invoice_total: Number(i.amount ?? 0),
      status: i.status, created_at: i.created_at, note: null,
      via: 'contract', counts: ACTUAL_STATUSES.has(i.status),
    }))

  const viaSplit = mine
    .map((a: any) => {
      const i: any = invById.get(a.invoice_id)
      if (!i) return null
      return {
        id: i.id, invoice_number: i.invoice_number, company_name: i.company_name,
        description: i.description,
        /** The SLICE landing here, not the invoice total. */
        amount: Number(a.amount ?? 0), invoice_total: Number(i.amount ?? 0),
        status: i.status, created_at: i.created_at, note: a.note ?? null,
        via: 'split', counts: ACTUAL_STATUSES.has(i.status),
      }
    })
    .filter((x): x is NonNullable<typeof x> => x != null)

  // Same rule the rollup uses: a change order names a line, or names a
  // subcontract and is followed through to whichever line that contract sits on.
  const firstLineForSub = new Map<string, string>()
  for (const l of (allLines ?? []) as any[]) {
    if (l.subcontract_id && !firstLineForSub.has(l.subcontract_id)) firstLineForSub.set(l.subcontract_id, l.id)
  }
  const cos = (changeOrders ?? []).filter((co: any) => {
    const target = co.budget_line_item_id
      ?? (co.subcontract_id ? firstLineForSub.get(co.subcontract_id) ?? null : null)
    return target === params.lineId
  })

  return NextResponse.json({
    line,
    // Straight off the rollup, so this panel and the row that opened it cannot
    // print different numbers for the same line.
    rollup: {
      revised_budget: rolledLine.revised_budget,
      original_budget: Number(rolledLine.budgeted_amount ?? 0),
      change_orders_amount: rolledLine.change_orders_amount,
      committed_amount: rolledLine.committed_amount,
      actual_amount: rolledLine.actual_amount,
      materials_amount: rolledLine.materials_amount,
      exposure: lineExposure(rolledLine),
      variance: rolledLine.revised_budget - lineExposure(rolledLine),
    },
    subcontract: sub ?? null,
    invoices: [...viaSplit, ...viaContract]
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))),
    change_orders: cos.map((c: any) => ({ ...c, amount: Number(c.amount ?? 0) })),
    materials: (materials ?? []).map((m: any) => ({ ...m, amount: Number(m.amount ?? 0) })),
  })
}

export async function PATCH(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const gate = await requirePermission(admin(), request, 'budget', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
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
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
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
    .eq('id', params.lineId)
    .eq('project_id', params.id)
    .select()
    .single()

  // Pre-migration fallback: space_type / cost_type / markup may not exist yet.
  if (error && (error as any).code === '42703') {
    const { space_type: _s, cost_type: _c, markup_pct: _mp, markup_excluded: _me, ...core } = updates
    const retry = await db
      .from('budget_line_items')
      .update(core)
      .eq('id', params.lineId)
      .eq('project_id', params.id)
      .select()
      .single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ item: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const gate = await requirePermission(admin(), request, 'budget', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: line } = await db.from('budget_line_items').select('description').eq('id', params.lineId).single()

  const { error } = await db
    .from('budget_line_items')
    .delete()
    .eq('id', params.lineId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'budget_line_removed',
    `Budget line removed: ${line?.description || 'line item'}`, { line_id: params.lineId }, user.id)

  return NextResponse.json({ ok: true })
}
