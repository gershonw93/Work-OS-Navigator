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
    { data: project },
    { data: subcontracts },
    { data: invoices },
    { data: changeOrders },
    { data: budgetLines },
  ] = await Promise.all([
    db.from('projects').select('id, name').eq('id', params.id).single(),
    db
      .from('subcontracts')
      .select('*, companies(id, name)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db
      .from('invoices')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    // Change orders now come from the Change Orders tab (change_orders table),
    // not from RFIs — so approving one there flows straight into the numbers here.
    db
      .from('change_orders')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    // Budget is the single source of truth: the sum of the Budget tab's line items.
    db
      .from('budget_line_items')
      .select('budgeted_amount')
      .eq('project_id', params.id),
  ])

  // Fetch payment schedule items via subcontract ids
  const subcontractIds = (subcontracts ?? []).map((s: any) => s.id)
  let paymentScheduleItems: any[] = []
  if (subcontractIds.length > 0) {
    const { data: psi } = await db
      .from('payment_schedule_items')
      .select('*')
      .in('subcontract_id', subcontractIds)
      .order('due_date', { ascending: true })
    paymentScheduleItems = psi ?? []
  }

  // Aggregate subcontracts
  const total_contracted = (subcontracts ?? []).reduce(
    (sum: number, s: any) => sum + (s.contract_amount ?? 0),
    0,
  )

  // Aggregate invoices by status
  const invoiceList = invoices ?? []
  const total_paid = invoiceList
    .filter((inv: any) => inv.status === 'paid')
    .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0)
  const total_approved = invoiceList
    .filter((inv: any) => inv.status === 'approved')
    .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0)
  const total_pending = invoiceList
    .filter((inv: any) => inv.status === 'pending_approval')
    .reduce((sum: number, inv: any) => sum + (inv.amount ?? 0), 0)

  // Approved change orders: change_orders rows with status='approved'
  const approved_change_orders = (changeOrders ?? [])
    .filter((co: any) => co.status === 'approved')
    .reduce((sum: number, co: any) => sum + Number(co.amount ?? 0), 0)

  // Revised contract = original contracted value + approved change orders
  const revised_contract = total_contracted + approved_change_orders

  // Budget = sum of budget line items (single source of truth)
  const budget = (budgetLines ?? []).reduce((sum: number, b: any) => sum + Number(b.budgeted_amount ?? 0), 0)

  // Reshape subcontracts for response
  const subcontractsOut = (subcontracts ?? []).map((s: any) => ({
    ...s,
    company_name: s.companies?.name ?? s.company_name ?? null,
  }))

  return NextResponse.json({
    budget,
    total_contracted,
    revised_contract,
    total_paid,
    total_approved,
    total_pending,
    approved_change_orders,
    subcontracts: subcontractsOut,
    invoices: invoiceList,
    payment_schedule_items: paymentScheduleItems,
    change_orders: changeOrders ?? [],
  })
}
