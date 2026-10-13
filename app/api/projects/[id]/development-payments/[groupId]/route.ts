import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { syncInvoiceStatus } from '@/lib/invoice-settlement-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Delete a split cheque - every house's share with it. One share alone cannot
 * be deleted from a house (its payment route refuses): the cheque is one
 * amount, and taking a share away leaves it adding up to something the bank
 * never saw.
 */
export async function DELETE(request: Request, { params }: { params: { id: string; groupId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'payments', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  // Read the invoices it paid BEFORE the delete cascades the splits away, so
  // they go back to owing what they owe.
  const { data: rows, error: rErr } = await db.from('client_payments')
    .select('id, client_payment_allocations(client_invoice_id)').eq('payment_group_id', params.groupId)
  if (rErr) return NextResponse.json({ error: 'Could not read this payment. Try again.' }, { status: 503 })
  const { data, error } = await db.from('client_payment_groups').delete()
    .eq('id', params.groupId).eq('development_id', params.id).select('id, qbo_id')
  if (error) { console.error('[development-payments] delete', error.message); return NextResponse.json({ error: 'Could not delete the payment.' }, { status: 500 }) }
  if (!data?.length) return NextResponse.json({ error: 'That payment is not on this development.' }, { status: 404 })
  await syncInvoiceStatus(db, (rows ?? []).flatMap((r: any) => (r.client_payment_allocations ?? []).map((a: any) => a.client_invoice_id)))
  return NextResponse.json({ ok: true, was_in_quickbooks: !!(data[0] as any).qbo_id })
}
