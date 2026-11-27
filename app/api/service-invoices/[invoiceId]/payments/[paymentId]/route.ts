import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, loadInvoice, syncBillStatus } from '@/lib/service-billing-server'
import { voidServiceCallRecordInQbo } from '@/lib/quickbooks-push'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// DELETE - remove a payment recorded in error.
//
// QUICKBOOKS GOES FIRST (CLAUDE.md, a void or delete of a synced record): the
// Payment over there is voided BEFORE the row goes, and if QuickBooks refuses,
// the row is KEPT (502) - deleted first, it would take the only copy of the
// QuickBooks id with it and leave money booked that nobody here can see. Not
// connected still lets it through, and the void logs the id left live. Then
// the invoice's status is recomputed from the money that is left.
export async function DELETE(request: Request, { params }: { params: { invoiceId: string; paymentId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'delete')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied

  const { data: pay, error } = await db.from('service_call_payments').select('id, qbo_id')
    .eq('id', params.paymentId).eq('invoice_id', found.invoice.id).eq('company_id', gate.companyId).maybeSingle()
  if (error) return NextResponse.json({ error: 'Could not load that payment. Try again.' }, { status: 500 })
  if (!pay) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

  let note = ''
  if ((pay as any).qbo_id) {
    const r = await voidServiceCallRecordInQbo(db, 'payment', pay.id)
    if (!r.pushed && r.reason === 'failed') {
      return NextResponse.json({
        error: `QuickBooks would not void this payment${r.detail ? `: ${r.detail}` : ''}. It was kept here so the two stay in step.`,
      }, { status: 502 })
    }
    note = r.pushed ? 'Voided in QuickBooks too.' : 'QuickBooks is not connected - void it there by hand.'
  }
  const del = await db.from('service_call_payments').delete().eq('id', pay.id).eq('company_id', gate.companyId)
  if (del.error) {
    console.error('[service-billing] payment delete failed', { payment: pay.id, error: del.error.message })
    return NextResponse.json({ error: 'Could not remove the payment. Try again.' }, { status: 500 })
  }
  const status = await syncBillStatus(db, found.invoice)
  return NextResponse.json({ ok: true, status, note: ['Payment removed.', note].filter(Boolean).join(' ') })
}
