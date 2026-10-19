import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { syncInvoiceStatus } from '@/lib/invoice-settlement-db'
import { voidClientPaymentInQbo } from '@/lib/quickbooks-push'

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
  const { data: grp } = await db.from('client_payment_groups')
    .select('id, amount, reference, paid_date, qbo_id').eq('id', params.groupId).eq('development_id', params.id).maybeSingle()
  if (!grp) return NextResponse.json({ error: 'That payment is not on this development.' }, { status: 404 })
  const { data: rows, error: rErr } = await db.from('client_payments')
    .select('id, project_id, qbo_id, qbo_txn_type, client_payment_allocations(client_invoice_id)').eq('payment_group_id', params.groupId)
  if (rErr) return NextResponse.json({ error: 'Could not read this payment. Try again.' }, { status: 503 })

  // QUICKBOOKS FIRST, THEN THE ROWS. This used to delete and then tell the
  // screen "it was already in QuickBooks - delete it there too": the one
  // record that knew the QuickBooks id was gone by the time anybody read that.
  // The cheque is ONE Payment over there, voided once through the group; a
  // share pushed on its own before the group existed is voided as itself.
  const label = (grp as any).reference || `Check of $${Number((grp as any).amount ?? 0).toLocaleString('en-US')}`
  const targets = [
    { id: grp.id, project_id: params.id, qbo_id: (grp as any).qbo_id, qbo_txn_type: 'payment', label },
    ...(rows ?? []).filter((r: any) => r.qbo_id && r.qbo_id !== (grp as any).qbo_id)
      .map((r: any) => ({ id: r.id, project_id: r.project_id, qbo_id: r.qbo_id, qbo_txn_type: r.qbo_txn_type, label })),
  ].filter(t => t.qbo_id)
  let notConnected = false
  for (const t of targets) {
    const qb = await voidClientPaymentInQbo(db, t)
    if (!qb.pushed && qb.reason === 'failed') {
      return NextResponse.json({
        error: `QuickBooks would not void this check, so it has not been deleted here either (${qb.detail ?? 'no reason given'}). Fix that in QuickBooks, or void it there by hand, then delete it again here.`,
      }, { status: 502 })
    }
    if (!qb.pushed && qb.reason === 'not_connected') notConnected = true
  }

  const { data, error } = await db.from('client_payment_groups').delete()
    .eq('id', params.groupId).eq('development_id', params.id).select('id')
  if (error) { console.error('[development-payments] delete', error.message); return NextResponse.json({ error: 'Could not delete the payment.' }, { status: 500 }) }
  if (!data?.length) return NextResponse.json({ error: 'That payment is not on this development.' }, { status: 404 })
  await syncInvoiceStatus(db, (rows ?? []).flatMap((r: any) => (r.client_payment_allocations ?? []).map((a: any) => a.client_invoice_id)))
  return NextResponse.json({
    ok: true,
    ...(targets.length ? { quickbooks: { voided: !notConnected, detail: notConnected ? 'QuickBooks is not connected, so the check is still there - void it by hand' : undefined } } : {}),
  })
}
