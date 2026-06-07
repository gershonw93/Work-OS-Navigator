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
  ] = await Promise.all([
    db.from('projects').select('id, name, budget').eq('id', params.id).single(),
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
    db
      .from('rfis')
      .select('*')
      .eq('project_id', params.id)
      .eq('is_change_order', true)
      .order('created_at', { ascending: false }),
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

  // Approved change orders: rfis with is_change_order=true and status='answered'
  const answeredChangeOrders = (changeOrders ?? []).filter((rfi: any) => rfi.status === 'answered')
  const approved_change_orders = answeredChangeOrders.reduce(
    (sum: number, rfi: any) => sum + (rfi.change_order_amount ?? 0),
    0,
  )

  // Reshape subcontracts for response
  const subcontractsOut = (subcontracts ?? []).map((s: any) => ({
    ...s,
    company_name: s.companies?.name ?? s.company_name ?? null,
  }))

  return NextResponse.json({
    budget: (project as any)?.budget ?? null,
    total_contracted,
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
