import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { allocationProblem } from '@/lib/invoice-settlement'
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

export async function PATCH(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const gate = await requirePermission(admin(), request, 'payments', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const k of ['paid_date', 'amount', 'method', 'memo', 'reference', 'retainer', 'qb_entered']) {
    if (body[k] !== undefined) updates[k] = k === 'amount' ? Number(body[k]) || 0 : body[k]
  }
  const db = admin()
  const { data: shares, error: sharesError } = await db.from('client_payment_allocations')
    .select('id, client_invoice_id, amount').eq('payment_id', params.paymentId)
  if (sharesError) return NextResponse.json({ error: 'Could not read which invoices this payment pays. Try again.' }, { status: 503 })

  // CHANGING THE AMOUNT OF A PAYMENT THAT PAYS AN INVOICE CHANGES WHAT THE
  // INVOICE HAS BEEN PAID. One invoice: its share follows the new amount,
  // checked against what that invoice still owes without this payment. Several:
  // there is no right answer to "which one gets the extra $200", so it is asked
  // rather than guessed - record the payment again with the split you mean.
  if (updates.amount !== undefined && (shares ?? []).length) {
    if ((shares ?? []).length > 1) {
      return NextResponse.json({
        error: `This payment is split across ${(shares ?? []).length} invoices, so its amount cannot be changed here. Delete it and record it again with the split you mean.`,
      }, { status: 409 })
    }
    const invoices = await issuedInvoices(db, params.id, params.paymentId)
    if (!invoices) return NextResponse.json({ error: 'Could not read this job\'s invoices. Try again in a moment.' }, { status: 503 })
    const only = shares![0]
    const problem = allocationProblem(updates.amount, [{ client_invoice_id: only.client_invoice_id, amount: updates.amount }], invoices)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  const { error } = await db.from('client_payments').update(updates).eq('id', params.paymentId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (updates.amount !== undefined && (shares ?? []).length === 1) {
    await db.from('client_payment_allocations').update({ amount: updates.amount }).eq('id', shares![0].id)
    await syncInvoiceStatus(db, [shares![0].client_invoice_id])
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const gate = await requirePermission(admin(), request, 'payments', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  // Read BEFORE the delete: the split cascades away with the payment, and the
  // invoices it paid have to go back to owing what they owe. Without this an
  // invoice reads "Paid" over a payment that no longer exists.
  const { data: shares } = await db.from('client_payment_allocations')
    .select('client_invoice_id').eq('payment_id', params.paymentId)
  const { error } = await db.from('client_payments').delete().eq('id', params.paymentId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await syncInvoiceStatus(db, (shares ?? []).map((s: any) => s.client_invoice_id))
  return NextResponse.json({ ok: true })
}
