import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { projectEscrow, awaitingApproval } from '@/lib/escrow'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'
import { toAmount } from '@/lib/schedule-dependencies'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'financials', 'view')
  if (denied(viewGate)) return viewGate.denied

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
    { data: materials },
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
    // not from RFIs - so approving one there flows straight into the numbers here.
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
    // Material purchases (receipts) assigned to this job.
    db
      .from('material_purchases')
      .select('id, store_name, amount, category, purchase_date, receipt_url, client_paid')
      .eq('project_id', params.id)
      .order('purchase_date', { ascending: false, nullsFirst: false }),
  ])

  // Fetch payment schedule items via subcontract ids
  const subcontractIds = (subcontracts ?? []).map((s: any) => s.id)
  let paymentScheduleItems: any[] = []
  if (subcontractIds.length > 0) {
    // `order_index` is the column that exists. This ordered by `due_date`,
    // which `payment_schedule_items` has never had - PostgREST refuses the
    // whole query for an unknown column, so `psi` came back null and EVERY
    // caller of this route got an empty payment schedule with 211 rows in the
    // table. `data: null` reads as "there aren't any", which is the same trap
    // as a `.select()` naming a column that is not there.
    const { data: psi, error: psiError } = await db
      .from('payment_schedule_items')
      .select('*')
      .in('subcontract_id', subcontractIds)
      .order('order_index', { ascending: true })
    if (psiError) console.error('[financials] payment schedule:', psiError.message)
    paymentScheduleItems = psi ?? []
  }

  // Aggregate subcontracts
  const total_contracted = (subcontracts ?? []).reduce(
    (sum: number, s: any) => sum + (toAmount(s.contract_amount) ?? 0),
    0,
  )

  // Aggregate invoices by status.
  //
  // THROUGH toAmount: PostgREST sends `numeric` QUOTED, so `sum + inv.amount`
  // was string concatenation - "0" + "9000.00" read right for one bill and
  // became "09000.005000.00", or NaN, the moment there were two.
  //
  // `approved` here means ACCEPTED AND NOT YET PAID - 'approved' and 'sent'
  // alike (lib/invoice-budget ACTUAL_STATUSES minus paid). It counted
  // 'approved' alone, so a job's sent bills ($459,860 of them across the
  // product) were missing from this screen's Outstanding while Master Money
  // counted them. Outstanding itself comes from lib/escrow.ts, the derivation
  // every other screen reads, and the approval queue is its own number.
  const invoiceList = invoices ?? []
  const sumOf = (rows: any[]) => rows.reduce((sum: number, inv: any) => sum + (toAmount(inv.amount) ?? 0), 0)
  const total_paid = sumOf(invoiceList.filter((inv: any) => inv.status === 'paid'))
  const total_approved = sumOf(invoiceList.filter((inv: any) => ACTUAL_STATUSES.has(String(inv.status)) && inv.status !== 'paid'))
  const total_pending = awaitingApproval(invoiceList)
  const total_outstanding = projectEscrow({
    feePct: 0, payments: [], invoices: invoiceList, budgetLines: [], allocations: [],
  }).outstandingToVendors

  // Approved change orders: change_orders rows with status='approved'
  const approvedCOs = (changeOrders ?? []).filter((co: any) => co.status === 'approved')
  const approved_change_orders = approvedCOs.reduce((sum: number, co: any) => sum + Number(co.amount ?? 0), 0)

  // COs folded into a subcontract (applied_to_contract) are already inside
  // total_contracted - only the rest sit "on top" of the contracted total.
  const change_orders_on_top = approvedCOs
    .filter((co: any) => !co.applied_to_contract)
    .reduce((sum: number, co: any) => sum + Number(co.amount ?? 0), 0)

  // Revised contract = contracted value (incl. folded COs) + standalone COs
  const revised_contract = total_contracted + change_orders_on_top

  // Budget = sum of budget line items (single source of truth)
  const budget = (budgetLines ?? []).reduce((sum: number, b: any) => sum + Number(b.budgeted_amount ?? 0), 0)

  // Materials purchased for this job
  const materials_total = (materials ?? []).reduce((sum: number, m: any) => sum + Number(m.amount ?? 0), 0)

  // Reshape subcontracts for response
  const subcontractsOut = (subcontracts ?? []).map((s: any) => ({
    ...s,
    company_name: s.companies?.name ?? s.company_name ?? null,
  }))

  return NextResponse.json({
    budget,
    total_contracted,
    revised_contract,
    change_orders_on_top,
    total_paid,
    total_approved,
    total_pending,
    total_outstanding,
    approved_change_orders,
    materials_total,
    materials: materials ?? [],
    subcontracts: subcontractsOut,
    invoices: invoiceList,
    payment_schedule_items: paymentScheduleItems,
    change_orders: changeOrders ?? [],
  })
}
