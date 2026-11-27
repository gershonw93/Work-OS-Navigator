import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, INVOICE_COLS, invoiceParts } from '@/lib/service-billing-server'
import { callGate, loadCall } from '@/lib/service-calls-server'
import { billSettlement, nextInvoiceNumber, dueIn } from '@/lib/service-billing'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET - the call's live invoice (not a void one) with its lines, payments and
// where it stands; `invoice: null` when the call has not been billed.
export async function GET(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  // TWO FENCES: the call's own (permission, company, light account - every
  // call route asks it, and finds the call only through `loadCall`), and the
  // billing one (money: `service-billing`, never crew).
  const gate = await callGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const bill = await billingGate(db, request, 'view')
  if ('denied' in bill) return bill.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied

  const { data, error } = await db.from('service_call_invoices').select(INVOICE_COLS)
    .eq('company_id', bill.companyId).eq('call_id', params.callId).neq('status', 'void')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  // A refused read is an error, never "not billed yet" - that is a claim.
  if (error) {
    console.error('[service-billing] call invoice read failed', { call: params.callId, error: error.message })
    return NextResponse.json({ error: 'Could not load the invoice. Try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ invoice: null })
  const parts = await invoiceParts(db, (data as any).id)
  if (!parts) return NextResponse.json({ error: 'Could not load the invoice. Try again.' }, { status: 500 })
  return NextResponse.json({
    invoice: data, lines: parts.lines, payments: parts.payments,
    settlement: billSettlement(data as any, parts.payments),
  })
}

// POST - start the draft invoice for this call: the customer off the call, the
// next SVC- number, due in 14 days. ONE live invoice per call (a unique index):
// a second press returns the one that exists rather than billing twice.
export async function POST(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const bill = await billingGate(db, request, 'create')
  if ('denied' in bill) return bill.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call
  const body = await request.json().catch(() => ({}))
  // The READER's today, sent by the screen: the server's date is UTC, which is
  // tomorrow for an evening call on the east coast. Anything else is ignored.
  const today = typeof body.issue_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.issue_date)
    ? body.issue_date : new Date().toISOString().slice(0, 10)

  const existing = await db.from('service_call_invoices').select('id')
    .eq('company_id', bill.companyId).eq('call_id', call.id).neq('status', 'void').limit(1).maybeSingle()
  if ((existing.data as any)?.id) return NextResponse.json({ invoice_id: (existing.data as any).id, existed: true })

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: numbers, error: numErr } = await db.from('service_call_invoices').select('invoice_number').eq('company_id', bill.companyId)
    if (numErr) return NextResponse.json({ error: 'Could not number the invoice. Try again.' }, { status: 500 })
    const invoice_number = nextInvoiceNumber(((numbers ?? []) as any[]).map(n => n.invoice_number))
    const { data, error } = await db.from('service_call_invoices').insert({
      company_id: bill.companyId,
      call_id: call.id,
      customer_id: (call as any).customer_id ?? null,
      customer_name: call.customer_name,
      customer_email: call.contact_email ?? null,
      invoice_number,
      status: 'draft',
      issue_date: today,
      due_date: dueIn(today, 14),
      created_by: bill.actor.userId,
    }).select('id').single()
    if (!error) return NextResponse.json({ invoice_id: (data as any).id }, { status: 201 })
    // 23505 on the number: another invoice took it a moment ago - take the next.
    // On the one-per-call index: somebody else just started it - hand that back.
    if ((error as any).code === '23505') {
      const again = await db.from('service_call_invoices').select('id')
        .eq('company_id', bill.companyId).eq('call_id', call.id).neq('status', 'void').limit(1).maybeSingle()
      if ((again.data as any)?.id) return NextResponse.json({ invoice_id: (again.data as any).id, existed: true })
      continue
    }
    console.error('[service-billing] draft create failed', { call: call.id, error: error.message })
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ error: 'Could not number the invoice just now. Try again.' }, { status: 503 })
}
