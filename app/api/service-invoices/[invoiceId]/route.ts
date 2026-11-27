import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { billingGate, loadInvoice, invoiceParts, asMoney } from '@/lib/service-billing-server'
import { billSettlement, cleanLine, editable, invoiceProblem, subtotalCents, type LineInput } from '@/lib/service-billing'
import { dollars } from '@/lib/invoice-settlement'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET - one invoice with its lines, payments and where it stands.
export async function GET(request: Request, { params }: { params: { invoiceId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied
  const parts = await invoiceParts(db, found.invoice.id)
  if (!parts) return NextResponse.json({ error: 'Could not load the invoice. Try again.' }, { status: 500 })
  return NextResponse.json({
    invoice: found.invoice, lines: parts.lines, payments: parts.payments,
    settlement: billSettlement(found.invoice, parts.payments),
  })
}

// PATCH - edit a DRAFT: who it is to, the dates, the notes and the lines. A
// sent invoice is in the customer's inbox and the books, so it is not edited
// line by line - it is voided and issued again (the screen says so).
export async function PATCH(request: Request, { params }: { params: { invoiceId: string } }) {
  const db = admin()
  const gate = await billingGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadInvoice(db, gate.companyId, params.invoiceId)
  if ('denied' in found) return found.denied
  const inv = found.invoice
  if (!editable(inv.status)) {
    return NextResponse.json({ error: 'A sent invoice cannot be changed. Void it and send a new one.' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))
  // A whitelist: a status, a number, a total or a QuickBooks id never arrives
  // in a body. The totals are worked out here from the lines.
  const next = {
    customer_name: body.customer_name !== undefined ? String(body.customer_name ?? '').trim() : inv.customer_name,
    customer_email: body.customer_email !== undefined ? (String(body.customer_email ?? '').trim() || null) : inv.customer_email,
    issue_date: body.issue_date !== undefined ? (body.issue_date || inv.issue_date) : inv.issue_date,
    due_date: body.due_date !== undefined ? (body.due_date || null) : inv.due_date,
    notes: body.notes !== undefined ? (String(body.notes ?? '').trim() || null) : inv.notes,
  }
  const rawLines: LineInput[] | null = Array.isArray(body.lines) ? body.lines : null
  if (rawLines) {
    const problem = invoiceProblem({ ...next, lines: rawLines })
    // A draft may be saved half-done - except for what would corrupt it: a
    // negative price or a line with no words cannot be fixed by sending later.
    if (problem && /negative|description/.test(problem)) return NextResponse.json({ error: problem }, { status: 400 })
  }
  if (next.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.customer_email)) {
    return NextResponse.json({ error: 'That email address does not look right.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { ...next, updated_at: new Date().toISOString() }
  if (rawLines) {
    const lines = rawLines.map(cleanLine).filter(l => l.description)
    const sub = dollars(subtotalCents(lines))
    update.subtotal = sub
    update.total = sub
    update.tax_amount = null
    // Replace the lines: delete then insert, on a draft nobody else has been sent.
    const del = await db.from('service_call_invoice_lines').delete().eq('invoice_id', inv.id)
    if (del.error) return NextResponse.json({ error: 'Could not save the lines. Try again.' }, { status: 500 })
    if (lines.length) {
      const ins = await db.from('service_call_invoice_lines').insert(lines.map((l, i) => ({
        invoice_id: inv.id, description: l.description, quantity: l.quantity, unit: l.unit,
        unit_price: asMoney(l.unit_price), amount: asMoney(l.amount), sort_order: i,
      })))
      if (ins.error) {
        console.error('[service-billing] lines insert failed', { invoice: inv.id, error: ins.error.message })
        return NextResponse.json({ error: 'Could not save the lines. Try again.' }, { status: 500 })
      }
    }
  }
  const { error } = await db.from('service_call_invoices').update(update).eq('id', inv.id).eq('company_id', gate.companyId)
  if (error) {
    console.error('[service-billing] draft update failed', { invoice: inv.id, error: error.message })
    return NextResponse.json({ error: 'Could not save the invoice. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
