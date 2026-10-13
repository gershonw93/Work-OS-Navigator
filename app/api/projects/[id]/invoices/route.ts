import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { destinationsBySubcontract, rollupBudgetLines } from '@/lib/invoice-budget'
import { requirePermission, denied } from '@/lib/api-guard'
import { createSubBill } from '@/lib/writes/sub-bill'
import { getActor } from '@/lib/server-permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'invoices', 'view')
  if (denied(viewGate)) return viewGate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data, error },
    { data: lines },
    { data: materials },
    { data: subs },
    { data: changeOrders },
    { data: projectRow },
    { data: clientBills },
    { data: allocations },
    { data: scheduleItems },
  ] = await Promise.all([
    db
      .from('invoices')
      .select('*, subcontracts(trade, contract_amount)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db
      .from('budget_line_items')
      .select('id, subcontract_id, cost_code, category, description, budgeted_amount, committed_amount, actual_amount')
      .eq('project_id', params.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    db
      .from('material_purchases')
      .select('budget_line_id, amount')
      .eq('project_id', params.id),
    // The subs on this job, for the create form's picker as well as the
    // budget rollup. This list used to be fetched from `/financials`, which is
    // gated on a resource a Project Manager is deliberately denied - so the
    // picker on a page they are allowed to use was empty, with the scan's
    // "Matched to QA Concrete Sub." printed above it.
    db
      .from('subcontracts')
      .select('id, trade, contract_amount, company_id, companies(id, name)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db
      .from('change_orders')
      .select('amount, status, budget_line_item_id, subcontract_id')
      .eq('project_id', params.id),
    db
      .from('projects')
      .select('billing_mode, contractor_fee_pct, contract_type')
      .eq('id', params.id)
      .maybeSingle(),
    // Which of these have already been passed on to the client. Without it the
    // "bill the client for this" action would offer to bill the same cost
    // twice - the unique index would refuse it, but only after the click.
    db
      .from('client_invoices')
      .select('client_invoice_lines(source_invoice_id)')
      .eq('project_id', params.id),
    db
      .from('invoice_allocations')
      .select('id, invoice_id, budget_line_item_id, amount, note, invoices!inner(project_id)')
      .eq('invoices.project_id', params.id),
    // The agreed payment schedule, so a bill can be filed against the milestone
    // it settles. Reached through the subcontract in ONE trip rather than a
    // second round after the sub ids come back - same shape as the allocations
    // above. `order_index` is the column that exists: `/financials` ordered
    // these by `due_date`, which does not exist on this table, so PostgREST
    // refused the whole query and every caller got an empty schedule.
    db
      .from('payment_schedule_items')
      .select('id, subcontract_id, label, amount, percentage, status, order_index, subcontracts!inner(project_id)')
      .eq('subcontracts.project_id', params.id)
      .order('order_index', { ascending: true }),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Where each invoice's money actually lands. Without this the Invoices tab
  // could only say who was billing, and you had to open the Budget tab and work
  // backwards from the sub's name to find out which line moved.
  const rolled = rollupBudgetLines({
    lines: (lines ?? []) as any,
    invoices: (data ?? []) as any,
    materials: (materials ?? []) as any,
    subs: (subs ?? []) as any,
    changeOrders: (changeOrders ?? []) as any,
    allocations: (allocations ?? []) as any,
  })
  const dests = destinationsBySubcontract(rolled)

  const clientBilled = new Set<string>()
  for (const b of (clientBills ?? []) as any[]) {
    for (const l of (b.client_invoice_lines ?? [])) {
      if (l.source_invoice_id) clientBilled.add(l.source_invoice_id)
    }
  }

  const allocsByInvoice = new Map<string, any[]>()
  for (const a of (allocations ?? []) as any[]) {
    if (!allocsByInvoice.has(a.invoice_id)) allocsByInvoice.set(a.invoice_id, [])
    allocsByInvoice.get(a.invoice_id)!.push({
      id: a.id, budget_line_item_id: a.budget_line_item_id,
      amount: Number(a.amount ?? 0), note: a.note ?? null,
    })
  }

  const invoices = (data ?? []).map((inv: any) => ({
    ...inv,
    // The contract route, still what most invoices use. An invoice WITH
    // allocations ignores this - its splits are the whole story.
    budget_line: inv.subcontract_id ? dests.get(inv.subcontract_id) ?? null : null,
    allocations: allocsByInvoice.get(inv.id) ?? [],
    client_billed: clientBilled.has(inv.id),
  }))

  return NextResponse.json({
    invoices,
    // THE SUBCONTRACTOR PICKER'S OPTIONS, from the route the page's own gate
    // covers. `invoices: view` is the permission to be on this screen at all;
    // sourcing half of it from `financials: view` meant a role holding one and
    // not the other got a form it could not complete and no reason why.
    subcontracts: (subs ?? []).map((s: any) => ({
      id: s.id,
      trade: s.trade,
      contract_amount: s.contract_amount,
      company_id: s.companies?.id ?? s.company_id ?? null,
      companies: s.companies ? { id: s.companies.id, name: s.companies.name } : null,
    })),
    payment_schedule_items: (scheduleItems ?? []).map((p: any) => ({
      id: p.id, subcontract_id: p.subcontract_id, label: p.label,
      amount: p.amount, percentage: p.percentage, status: p.status,
    })),
    // Keyed by subcontract so the create form can show the destination the
    // moment a sub is picked, before anything is saved.
    destinations: Object.fromEntries(dests),
    // Every line on the job, so a bill can be split across any of them - not
    // only the one its contract happens to sit on.
    budget_lines: rolled.map((l: any) => ({
      id: l.id,
      cost_code: l.cost_code ?? null,
      category: String(l.category ?? 'General'),
      description: String(l.description ?? ''),
      revised_budget: l.revised_budget,
      billed_amount: l.actual_amount,
      markup_pct: l.markup_pct ?? null,
      markup_excluded: !!l.markup_excluded,
    })),
    // Decides whether "billing your client" points at Pay Apps or Payments.
    billing_mode: (projectRow as any)?.billing_mode ?? 'simple',
    // Stored as a fraction; the markup helpers work in percent.
    markup_pct: Number((projectRow as any)?.contractor_fee_pct ?? 0) * 100,
    // Cost-plus jobs get the per-invoice markup controls whatever the default
    // rate is. They used to appear only once a project rate was set, so on a
    // job billed line-by-line there was no way to mark up the FIRST invoice.
    contract_type: (projectRow as any)?.contract_type ?? null,
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    subcontract_id, payment_schedule_item_id, amount,
    description, due_date, client_paid, escrow_paid, document_url, document_name,
    line_items, subtotal, tax, retainage, quote_check,
  } = body
  let { company_id, company_name } = body

  // TWO WAYS IN, and the narrow one is checked against the record, not a role.
  //
  // The office enters bills with `invoices: edit`. A SUB submits their own
  // from My Jobs, on the vendor role, which holds `invoices: N` - so this route
  // refused every invited sub's bill with a 403, while the invite email told
  // them they could "send in your bills". Widening the role would hand them the
  // GC's whole Invoices screen; instead a sub may bill against a subcontract
  // THEIR company holds on THIS job, and nothing else. And the company on the
  // bill then comes off that subcontract, never the body - otherwise a sub
  // could submit a bill in another company's name.
  const gate = await requirePermission(db, request, 'invoices', 'edit')
  if (denied(gate)) {
    const actor = await getActor(db, token)
    const { data: sc } = subcontract_id && actor?.companyId
      ? await db.from('subcontracts')
          .select('id, company_id, companies ( name )')
          .eq('id', subcontract_id).eq('project_id', params.id).eq('company_id', actor.companyId)
          .maybeSingle()
      : { data: null }
    if (!sc) return gate.denied
    company_id = sc.company_id
    company_name = (sc as any).companies?.name ?? company_name ?? null
  }

  // Everything after the gate is `createSubBill`, which Claude's MCP server calls too.
  const result = await createSubBill(db, {
    userId: user.id, projectId: params.id, company_id, company_name,
    fields: {
      subcontract_id, payment_schedule_item_id, amount, description, due_date, client_paid, escrow_paid,
      document_url, document_name, line_items, subtotal, tax, retainage, quote_check,
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}
