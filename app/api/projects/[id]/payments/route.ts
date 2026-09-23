import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { projectEscrow } from '@/lib/escrow'
import { logActivity } from '@/lib/log-activity'
import { pushPaymentForProject } from '@/lib/quickbooks-push'
import { requirePermission, denied } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

// Client payments ledger + escrow summary for a project.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'payments', 'view')
  if (denied(viewGate)) return viewGate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const [{ data: project }, { data: payments }, { data: invoices }, { data: budgetLines }, { data: allocations }] = await Promise.all([
    db.from('projects').select('contractor_fee_pct').eq('id', params.id).single(),
    db.from('client_payments').select('*').eq('project_id', params.id).order('paid_date', { ascending: true }),
    db.from('invoices').select('id, amount, status, client_paid, escrow_paid, markup_pct, markup_excluded').eq('project_id', params.id),
    db.from('budget_line_items').select('id, budgeted_amount, markup_pct, markup_excluded').eq('project_id', params.id),
    db.from('invoice_allocations')
      .select('invoice_id, budget_line_item_id, amount, invoices!inner(project_id)')
      .eq('invoices.project_id', params.id),
  ])

  // Everything escrow is made of comes from ONE derivation, shared with Master
  // Money (lib/escrow.ts): client payments, the escrow/client-direct split, and
  // the fee earned BILL BY BILL - at-cost bills, a bill's own rate, and a bill
  // split across budget lines at different rates. This route used to hold that
  // arithmetic itself while Master Money multiplied instead, so one job printed
  // two escrow figures.
  const feePct = Number(project?.contractor_fee_pct ?? 0)
  const {
    received, vendorBilled, vendorPaid, escrowPaid, clientPaidDirect,
    feeEarned, escrowBalance, outstandingToVendors, budgetTotal,
  } = projectEscrow({
    feePct: project?.contractor_fee_pct,
    payments: payments ?? [],
    invoices: (invoices ?? []) as any,
    budgetLines: (budgetLines ?? []) as any,
    allocations: (allocations ?? []) as any,
  })
  const availableAfterFee = received - feeEarned

  // Forward projections: budget × (1 + fee) is the projected job cost.
  const projectedCost = budgetTotal * (1 + feePct)
  const projectedGoingForward = Math.max(projectedCost - vendorBilled, 0)

  return NextResponse.json({
    fee_pct: feePct,
    payments: payments ?? [],
    summary: {
      received, feeEarned, availableAfterFee, vendorBilled, vendorPaid, escrowPaid, clientPaidDirect,
      outstandingToVendors, escrowBalance,
      projectedCost, invoicedAlready: vendorBilled, projectedGoingForward,
    },
  })
}

// Create a client payment, or update the project fee % ({ fee_pct }).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'payments', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const body = await request.json()

  if (body.fee_pct !== undefined && body.amount === undefined) {
    const pct = Math.max(0, Math.min(Number(body.fee_pct) || 0, 1))
    const { error } = await db.from('projects').update({ contractor_fee_pct: pct }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, fee_pct: pct })
  }

  const { data, error } = await db.from('client_payments').insert({
    project_id: params.id,
    paid_date: body.paid_date || null,
    amount: Number(body.amount) || 0,
    method: body.method || null,
    memo: body.memo || null,
    // The payer's own reference - a check number, a wire confirmation. It is
    // what QuickBooks shows as Reference no., which is the column a bookkeeper
    // matches against a bank statement.
    reference: body.reference || null,
    retainer: !!body.retainer,
    qb_entered: !!body.qb_entered,
    // The invoice this money settles, when it settles one. QuickBooks applies
    // the payment against exactly this receivable instead of guessing.
    client_invoice_id: body.client_invoice_id || null,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'client_payment_received',
    `Client payment received - $${Number(body.amount || 0).toLocaleString()}`,
    { payment_id: data.id, amount: body.amount }, user.id)

  // Straight into QuickBooks, if a connection is live. Never throws, capped at
  // 8s, and "not connected" is a normal state - the payment is the work,
  // QuickBooks is a side effect. A miss lands in the sync log and is picked up
  // by the Settings backlog sync. This replaced remembering to press a button
  // in Settings, which nobody had pressed in six weeks.
  // Applied against an open QuickBooks invoice if there is one, else a
  // standalone Sales Receipt. Never both - see lib/quickbooks-push.ts.
  const qb = await pushPaymentForProject(db, data.id)

  return NextResponse.json({ payment: qb.pushed ? { ...data, qbo_id: qb.qboId, qb_entered: true } : data })
}
