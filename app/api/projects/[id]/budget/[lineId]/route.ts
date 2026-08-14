import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'

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

  const [{ data: allocations }, { data: subInvoices }, { data: changeOrders }, { data: materials }, { data: sub }] =
    await Promise.all([
      db.from('invoice_allocations')
        .select('id, amount, note, invoices(id, invoice_number, company_name, description, amount, status, created_at)')
        .eq('budget_line_item_id', params.lineId),
      // Only when linked - otherwise this would pull the whole job.
      line.subcontract_id
        ? db.from('invoices')
          .select('id, invoice_number, company_name, description, amount, status, created_at')
          .eq('subcontract_id', line.subcontract_id)
          .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      db.from('change_orders')
        .select('id, co_number, title, amount, status, created_at, budget_line_item_id, subcontract_id')
        .eq('project_id', params.id),
      db.from('material_purchases')
        .select('id, store_name, category, amount, purchase_date, receipt_url')
        .eq('budget_line_id', params.lineId)
        .order('purchase_date', { ascending: false, nullsFirst: false }),
      line.subcontract_id
        ? db.from('subcontracts').select('id, trade, contract_amount, status, companies(name)')
          .eq('id', line.subcontract_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

  // A bill that has been split is accounted for by its splits. Listing it again
  // under its contract would double it on screen exactly the way the rollup
  // refuses to double it in the maths.
  const subIds = (subInvoices ?? []).map((i: any) => i.id)
  const { data: splitsOnThose } = subIds.length
    ? await db.from('invoice_allocations').select('invoice_id').in('invoice_id', subIds)
    : { data: [] as any[] }
  const anySplit = new Set((splitsOnThose ?? []).map((a: any) => a.invoice_id))

  const viaContract = (subInvoices ?? [])
    .filter((i: any) => !anySplit.has(i.id))
    .map((i: any) => ({
      id: i.id, invoice_number: i.invoice_number, company_name: i.company_name,
      description: i.description, amount: Number(i.amount ?? 0), invoice_total: Number(i.amount ?? 0),
      status: i.status, created_at: i.created_at, note: null,
      via: 'contract', counts: ACTUAL_STATUSES.has(i.status),
    }))

  const viaSplit = (allocations ?? [])
    .filter((a: any) => a.invoices)
    .map((a: any) => ({
      id: a.invoices.id, invoice_number: a.invoices.invoice_number,
      company_name: a.invoices.company_name, description: a.invoices.description,
      /** The SLICE landing here, not the invoice total. */
      amount: Number(a.amount ?? 0), invoice_total: Number(a.invoices.amount ?? 0),
      status: a.invoices.status, created_at: a.invoices.created_at, note: a.note ?? null,
      via: 'split', counts: ACTUAL_STATUSES.has(a.invoices.status),
    }))

  // Same rule the rollup uses: a change order names a line, or names a
  // subcontract and is followed through to whichever line that contract sits on.
  const cos = (changeOrders ?? []).filter((co: any) =>
    co.budget_line_item_id === params.lineId
    || (!co.budget_line_item_id && line.subcontract_id && co.subcontract_id === line.subcontract_id))

  return NextResponse.json({
    line,
    subcontract: sub ?? null,
    invoices: [...viaSplit, ...viaContract]
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))),
    change_orders: cos.map((c: any) => ({ ...c, amount: Number(c.amount ?? 0) })),
    materials: (materials ?? []).map((m: any) => ({ ...m, amount: Number(m.amount ?? 0) })),
  })
}

export async function PATCH(request: Request, { params }: { params: { id: string; lineId: string } }) {
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
  for (const key of ['budgeted_amount', 'committed_amount', 'actual_amount', 'sort_order']) {
    if (key in body) updates[key] = Number(body[key]) || 0
  }
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
