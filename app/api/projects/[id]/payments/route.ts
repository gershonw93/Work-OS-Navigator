import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { projectEscrow } from '@/lib/escrow'
import { logActivity } from '@/lib/log-activity'
import { pushPaymentForProject } from '@/lib/quickbooks-push'
import { requirePermission, denied } from '@/lib/api-guard'
import { allocationProblem, type AllocationInput } from '@/lib/invoice-settlement'
import { issuedInvoices, syncInvoiceStatus } from '@/lib/invoice-settlement-db'

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
    // With the invoices each one paid, so the ledger can say "INV-0003, INV-0004"
    // rather than leaving the split to be reconstructed from memos.
    db.from('client_payments')
      .select('*, client_payment_allocations(client_invoice_id, amount, client_invoices(invoice_number))')
      .eq('project_id', params.id).order('paid_date', { ascending: true }),
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

  // WHICH INVOICES THIS PAYS, AND HOW MUCH OF IT WENT TO EACH. A list, because
  // one cheque can pay several. `client_invoice_id` alone is the shape an old
  // cached page still sends; it means "all of it, to this one".
  const allocations: AllocationInput[] = Array.isArray(body.allocations)
    ? body.allocations
      .filter((a: any) => a && typeof a.client_invoice_id === 'string')
      .map((a: any) => ({ client_invoice_id: a.client_invoice_id, amount: a.amount }))
    : body.client_invoice_id ? [{ client_invoice_id: String(body.client_invoice_id), amount: body.amount }] : []

  // The same question the form asks, asked again here: a second tab, a double
  // press or an old page does not run the form.
  if (allocations.length) {
    const invoices = await issuedInvoices(db, params.id)
    // A balance we could not read is not a balance of zero - refuse rather
    // than let a payment past a check that never ran.
    if (!invoices) return NextResponse.json({ error: 'Could not read this job\'s invoices. Try again in a moment.' }, { status: 503 })
    const problem = allocationProblem(body.amount, allocations, invoices, { onAccount: !!body.on_account })
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
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
    // "Keep what is not on an invoice as credit for this client." The credit is
    // derived from this flag and the allocations, never stored as a figure.
    on_account: !!body.on_account,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (allocations.length) {
    const { error: allocError } = await db.from('client_payment_allocations').insert(
      allocations.map(a => ({ payment_id: data.id, client_invoice_id: a.client_invoice_id, amount: Number(a.amount) })),
    )
    // A payment saved without its split would book as a deposit - a Sales
    // Receipt for money that pays an invoice, which is the double-count. Take
    // the payment back out rather than leave half a record.
    if (allocError) {
      console.error('[payments] could not record which invoices the payment settles', allocError.message)
      await db.from('client_payments').delete().eq('id', data.id)
      return NextResponse.json({ error: 'Could not record which invoices this payment pays. Nothing was saved - try again.' }, { status: 500 })
    }
    // Paid when the money covers it, partly paid until then - never because
    // somebody pressed a button.
    await syncInvoiceStatus(db, allocations.map(a => a.client_invoice_id))
  }

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
