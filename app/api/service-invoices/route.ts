import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, INVOICE_COLS } from '@/lib/service-billing-server'
import { billSettlement } from '@/lib/service-billing'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET - this company's service call invoices, newest first, each with what has
// been paid and what is left: "who owes me" in one read. A failed read is an
// error, never an empty list.
export async function GET(request: Request) {
  const db = admin()
  const gate = await billingGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const { data, error } = await db.from('service_call_invoices')
    .select(`${INVOICE_COLS}, service_calls(call_number), service_call_payments(amount)`)
    .eq('company_id', gate.companyId).order('issue_date', { ascending: false }).limit(500)
  if (error) {
    console.error('[service-invoices] list failed', { company: gate.companyId, error: error.message })
    return NextResponse.json({ error: 'Could not load the invoices. Try again.' }, { status: 500 })
  }
  const invoices = ((data ?? []) as any[]).map(({ service_call_payments, service_calls, ...inv }) => ({
    ...inv,
    call_number: service_calls?.call_number ?? null,
    settlement: billSettlement(inv, service_call_payments ?? []),
  }))
  return NextResponse.json({ invoices })
}
