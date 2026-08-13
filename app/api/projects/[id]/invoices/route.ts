import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { destinationsBySubcontract, rollupBudgetLines } from '@/lib/invoice-budget'

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
      .select('billing_mode')
      .eq('id', params.id)
      .maybeSingle(),
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
  })
  const dests = destinationsBySubcontract(rolled)

  const invoices = (data ?? []).map((inv: any) => ({
    ...inv,
    budget_line: inv.subcontract_id ? dests.get(inv.subcontract_id) ?? null : null,
  }))

  return NextResponse.json({
    invoices,
    // Keyed by subcontract so the create form can show the destination the
    // moment a sub is picked, before anything is saved.
    destinations: Object.fromEntries(dests),
    // Decides whether "billing your client" points at Pay Apps or Payments.
    billing_mode: (projectRow as any)?.billing_mode ?? 'simple',
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
  await logActivity(db, params.id, (creator as any)?.full_name ?? 'GC', 'invoice_created', `Invoice ${invoice_number} created for ${company_name} - $${Number(amount).toLocaleString()}`)

  await db.from('notifications').insert({
    user_id: user.id,
    type: 'invoice_pending',
    message: `Invoice ${invoice_number} is pending your approval`,
    read: false,
  })

  return NextResponse.json({ invoice: data })
}
