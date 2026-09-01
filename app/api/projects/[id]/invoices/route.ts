import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { usersWhoCan } from '@/lib/server-permissions'
import { destinationsBySubcontract, rollupBudgetLines } from '@/lib/invoice-budget'
import { notify } from '@/lib/notify'
import { requirePermission, denied } from '@/lib/api-guard'

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
    { data: lines },
    { data: materials },
    { data: subs },
    { data: changeOrders },
    { data: projectRow },
    { data: clientBills },
    { data: allocations },
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
    db
      .from('subcontracts')
      .select('id, trade, contract_amount, companies(name)')
      .eq('project_id', params.id),
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
  const gate = await requirePermission(admin(), request, 'invoices', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    subcontract_id, payment_schedule_item_id, company_id, company_name, amount,
    description, due_date, client_paid, escrow_paid, document_url, document_name,
    line_items, subtotal, tax, retainage, quote_check,
  } = await request.json()

  // Count existing invoices for this project to generate invoice number
  const { count } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const invoice_number = `INV-${params.id.slice(0, 4).toUpperCase()}-${String((count ?? 0) + 1).padStart(3, '0')}`

  let { data, error } = await db
    .from('invoices')
    .insert({
      project_id: params.id,
      subcontract_id: subcontract_id || null,
      payment_schedule_item_id: payment_schedule_item_id || null,
      company_id: company_id || null,
      company_name: company_name || null,
      amount,
      description: description || null,
      due_date: due_date || null,
      client_paid: Number(client_paid) || 0,
      escrow_paid: Number(escrow_paid) || 0,
      invoice_number,
      status: 'pending_approval',
      // A scanned invoice arrives with its document already stored - attach it
      // here rather than making the user upload the same file a second time.
      ...(document_url ? { document_url, document_name: document_name || null } : {}),
      // The breakdown, kept. Every invoice should be able to say what it is
      // charging for without reopening the PDF.
      line_items: Array.isArray(line_items) ? line_items : [],
      subtotal: subtotal ?? null,
      tax: tax ?? null,
      retainage: retainage ?? null,
      quote_check: quote_check ?? null,
    })
    .select()
    .single()

  // Pre-migration fallback: the breakdown columns may not exist yet.
  if (error && (error as any).code === '42703') {
    const retry = await db.from('invoices').insert({
      project_id: params.id,
      subcontract_id: subcontract_id || null,
      payment_schedule_item_id: payment_schedule_item_id || null,
      company_id: company_id || null,
      company_name: company_name || null,
      amount,
      description: description || null,
      due_date: due_date || null,
      client_paid: Number(client_paid) || 0,
      escrow_paid: Number(escrow_paid) || 0,
      invoice_number,
      status: 'pending_approval',
      ...(document_url ? { document_url, document_name: document_name || null } : {}),
    }).select().single()
    data = retry.data as any
    error = retry.error as any
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: creator } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const creatorName = (creator as any)?.full_name ?? 'GC'
  await logActivity(db, params.id, creatorName, 'invoice_created', `Invoice ${invoice_number} created for ${company_name} - $${Number(amount).toLocaleString()}`)

  // A bill needs approving, so tell the people who can approve it.
  //
  // This used to notify `[user.id]` - whoever had just created the invoice. A
  // subcontractor submitting their own bill from /my-jobs was therefore told
  // to approve it themselves, and the GC was told nothing at all: the bill sat
  // pending until somebody happened to open the tab.
  //
  // Not "everyone at the GC" either. A labourer has invoices: N and cannot
  // open the page this links to, and a notification you cannot act on is how
  // people learn to ignore notifications.
  const { data: project } = await db.from('projects')
    .select('gc_company_id, created_by_company_id, name').eq('id', params.id).maybeSingle()
  const owner = (project as any)?.gc_company_id ?? (project as any)?.created_by_company_id ?? null
  const approvers = (await usersWhoCan(db, owner, 'invoices', 'edit'))
    // No point telling somebody about the thing they are looking at.
    .filter(id => id !== user.id)

  if (approvers.length) {
    await notify({
      db, userIds: approvers, type: 'invoice_pending', title: 'Bill waiting for approval',
      // Who and how much, because that is what decides whether you open it now.
      message: `${company_name || creatorName} submitted ${invoice_number} for $${Number(amount || 0).toLocaleString()}${(project as any)?.name ? ` on ${(project as any).name}` : ''}`,
      link: `/projects/${params.id}/invoices`,
    })
  }

  return NextResponse.json({ invoice: data })
}
