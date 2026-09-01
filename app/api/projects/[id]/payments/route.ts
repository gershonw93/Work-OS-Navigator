import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { feeForInvoice } from '@/lib/allocations'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'
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

// "A real cost", same definition the Budget tab and the Invoices tab use. This
// was a second hand-written copy of the same three statuses; the Budget tab now
// reports the fee earned too, so the two drifting apart would have them printing
// different fees for the same work.
const VENDOR_BILLED = ACTUAL_STATUSES

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

  const feePct = Number(project?.contractor_fee_pct ?? 0)
  const received = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const inv = invoices ?? []
  const vendorBilled = inv.filter(i => VENDOR_BILLED.has(i.status)).reduce((s, i) => s + Number(i.amount || 0), 0)

  // Payment-source split. Prefer the explicit split; for legacy 'paid' invoices
  // with no split entered, treat the full amount as an escrow disbursement.
  let escrowPaid = 0, clientPaidDirect = 0
  for (const i of inv) {
    const cp = Number(i.client_paid || 0), ep = Number(i.escrow_paid || 0)
    if (cp || ep) { escrowPaid += ep; clientPaidDirect += cp }
    else if (i.status === 'paid') { escrowPaid += Number(i.amount || 0) }
  }
  const vendorPaid = escrowPaid + clientPaidDirect

  // Fee earned, item by item rather than one multiplication over the total.
  // An invoice can be excluded from markup (a permit, a pass-through) or carry
  // a rate of its own, and a flat multiply silently ignored both.
  //
  // Split-aware since 077: one bill divided across a line at 15% and a line at
  // cost earns the right fee for each part. Same helper the Budget tab uses, so
  // the two screens cannot report different fees for the same work.
  const allocsByInvoice = new Map<string, any[]>()
  for (const a of (allocations ?? []) as any[]) {
    if (!allocsByInvoice.has(a.invoice_id)) allocsByInvoice.set(a.invoice_id, [])
    allocsByInvoice.get(a.invoice_id)!.push(a)
  }
  const feeEarned = inv
    .filter(i => VENDOR_BILLED.has(i.status))
    .reduce((sum, i: any) => sum + feeForInvoice({
      invoice: i,
      allocations: allocsByInvoice.get(i.id) ?? [],
      lines: (budgetLines ?? []) as any,
      projectPct: feePct * 100,
    }).markup, 0)

  // Escrow holds client cash minus escrow disbursements minus the fee taken
  // (client-direct payments don't touch escrow).
  const escrowBalance = received - escrowPaid - feeEarned
  const availableAfterFee = received - feeEarned
  const outstandingToVendors = Math.max(vendorBilled - vendorPaid, 0)

  // Forward projections: budget × (1 + fee) is the projected job cost.
  const budgetTotal = (budgetLines ?? []).reduce((s, b) => s + Number(b.budgeted_amount || 0), 0)
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
