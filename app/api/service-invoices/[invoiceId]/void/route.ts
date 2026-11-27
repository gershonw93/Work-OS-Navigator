import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, loadInvoice } from '@/lib/service-billing-server'
import { voidServiceCallRecordInQbo } from '@/lib/quickbooks-push'
import { logEvent, actorName } from '@/lib/service-calls-server'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST - take an invoice back.
//
//   - A DRAFT was never sent to anybody: it is deleted (its lines go with it).
//   - A SENT invoice is VOIDED, never deleted - it was in a customer's inbox and
//     may be in the books. QuickBooks goes first; if it refuses, nothing changes
//     here (502). Not connected lets it through and logs the id left live.
//   - An invoice with PAYMENTS is refused: remove the payments first, so money
//     never ends up applied to an invoice that no longer asks for it.
//
// The call goes back from Invoiced to Done, so it can be billed again.
export async function POST(request: Request, { params }: { params: { invoiceId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'delete')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied
  const inv = found.invoice
  if (inv.status === 'void') return NextResponse.json({ ok: true, note: 'It was already void.' })

  const { count, error: countErr } = await db.from('service_call_payments')
    .select('id', { count: 'exact', head: true }).eq('invoice_id', inv.id)
  if (countErr) return NextResponse.json({ error: 'Could not check the payments on it. Try again.' }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'This invoice has payments recorded. Remove them first, then void it.' }, { status: 409 })
  }

  if (inv.status === 'draft') {
    const del = await db.from('service_call_invoices').delete().eq('id', inv.id).eq('company_id', gate.companyId).eq('status', 'draft')
    if (del.error) return NextResponse.json({ error: 'Could not delete the draft. Try again.' }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: true, note: 'Draft deleted.' })
  }

  let note = ''
  if (inv.qbo_id) {
    const r = await voidServiceCallRecordInQbo(db, 'invoice', inv.id)
    if (!r.pushed && r.reason === 'failed') {
      return NextResponse.json({
        error: `QuickBooks would not void it${r.detail ? `: ${r.detail}` : ''}. Nothing was changed here.`,
      }, { status: 502 })
    }
    note = r.pushed ? 'Voided in QuickBooks too.' : 'QuickBooks is not connected - it is still open there until it reconnects and syncs.'
  }
  const { error } = await db.from('service_call_invoices').update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', inv.id).eq('company_id', gate.companyId)
  if (error) return NextResponse.json({ error: 'Could not void the invoice. Try again.' }, { status: 500 })

  if (inv.call_id) {
    const { error: moveErr, data: moved } = await db.from('service_calls').update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', inv.call_id).eq('company_id', gate.companyId).eq('status', 'invoiced').select('id')
    if (!moveErr && moved?.length) {
      await logEvent(db, inv.call_id, {
        kind: 'status', status: 'done', note: `Invoice ${inv.invoice_number} voided`,
        actorId: gate.actor.userId, actorName: await actorName(db, gate.actor.userId),
      })
    }
  }
  return NextResponse.json({ ok: true, note: ['Invoice voided.', note].filter(Boolean).join(' ') })
}
