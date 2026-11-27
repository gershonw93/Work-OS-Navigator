import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requirePermission, denied } from './api-guard'
import { isAssignedOnly, type Action } from './permissions'
import type { ActorPerms } from './server-permissions'
import { ownJobsRefusal } from './sub-account'
import { cents, dollars } from './invoice-settlement'
import { billSettlement, statusAfterPayments, type BillStatus } from './service-billing'

// ─────────────────────────────────────────────────────────────────────────────
// The server half of service call billing: who may touch which invoice.
//
// THE ROUTES ARE SERVICE-ROLE AND THE TABLES HAVE NO POLICIES (migration 172),
// so this file is the fence, the same shape as lib/service-calls-server.ts:
//   - `billingGate` asks `service-billing` (money, its own resource), resolves
//     the caller's company from the TOKEN, refuses a light account, and refuses
//     every assigned-only role whatever a saved role map says - crew work a
//     call, they do not see what it was billed at;
//   - an invoice, a payment or a price item is only ever looked for AMONG THE
//     CALLER'S COMPANY'S OWN (`loadInvoice`), and one that is somebody else's
//     answers in the words a missing one does.
// ─────────────────────────────────────────────────────────────────────────────

export type BillingGate = { actor: ActorPerms; companyId: string } | { denied: NextResponse }

export async function billingGate(db: SupabaseClient, request: Request, action: Action): Promise<BillingGate> {
  const gate = await requirePermission(db, request, 'service-billing', action)
  if (denied(gate)) return gate
  const companyId = gate.actor.companyId
  if (!companyId) return { denied: NextResponse.json({ error: 'No company found for your account.' }, { status: 400 }) }
  if (isAssignedOnly(gate.actor.role)) {
    return { denied: NextResponse.json({ error: 'Billing is the office\'s. Your role cannot see invoices.' }, { status: 403 }) }
  }
  const light = await ownJobsRefusal(db, companyId)
  if (light) return { denied: NextResponse.json({ error: light, account: 'light' }, { status: 403 }) }
  return { actor: gate.actor, companyId }
}

export const INVOICE_COLS =
  'id, company_id, call_id, customer_id, customer_name, customer_email, invoice_number, status, issue_date, due_date, ' +
  'notes, subtotal, tax_amount, total, token, sent_at, viewed_at, paid_at, qbo_id, qbo_synced_at, qbo_voided_at, created_at, updated_at'

export type InvoiceRow = {
  id: string; company_id: string; call_id: string | null; customer_id: string | null; customer_name: string
  customer_email: string | null; invoice_number: string; status: BillStatus; issue_date: string; due_date: string | null
  notes: string | null; subtotal: number | string; tax_amount: number | string | null; total: number | string
  token: string | null; sent_at: string | null; viewed_at: string | null; paid_at: string | null
  qbo_id: string | null; qbo_synced_at: string | null; qbo_voided_at: string | null; created_at: string; updated_at: string
}

const NOT_FOUND = () => NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

/** One invoice, only from the caller's own company. */
export async function loadInvoice(db: SupabaseClient, companyId: string, invoiceId: string): Promise<{ invoice: InvoiceRow } | { denied: NextResponse }> {
  const { data, error } = await db.from('service_call_invoices').select(INVOICE_COLS)
    .eq('id', invoiceId).eq('company_id', companyId).maybeSingle()
  if (error) {
    console.error('[service-billing] invoice read failed', { invoiceId, error: error.message })
    return { denied: NextResponse.json({ error: 'Could not load that invoice. Try again.' }, { status: 500 }) }
  }
  if (!data) return { denied: NOT_FOUND() }
  return { invoice: data as unknown as InvoiceRow }
}

/** The invoice's lines and payments - an error, never an empty pair, when the read fails. */
export async function invoiceParts(db: SupabaseClient, invoiceId: string) {
  const [lines, payments] = await Promise.all([
    db.from('service_call_invoice_lines').select('id, description, quantity, unit, unit_price, amount, sort_order')
      .eq('invoice_id', invoiceId).order('sort_order'),
    db.from('service_call_payments').select('id, amount, paid_date, method, reference, memo, qbo_id, created_at')
      .eq('invoice_id', invoiceId).order('paid_date'),
  ])
  if (lines.error || payments.error) {
    console.error('[service-billing] parts read failed', { invoiceId, error: (lines.error ?? payments.error)?.message })
    return null
  }
  return { lines: (lines.data ?? []) as any[], payments: (payments.data ?? []) as any[] }
}

/**
 * PAID IS WHAT THE MONEY SAYS. Recompute the status from the payments that
 * exist, after every payment written or removed - the ONE writer of `paid`.
 */
export async function syncBillStatus(db: SupabaseClient, inv: InvoiceRow): Promise<BillStatus> {
  const { data, error } = await db.from('service_call_payments').select('amount').eq('invoice_id', inv.id)
  if (error) {
    console.error('[service-billing] status recompute read failed', { invoice: inv.id, error: error.message })
    return inv.status
  }
  const next = statusAfterPayments(inv.status, billSettlement(inv, (data ?? []) as { amount: unknown }[]))
  if (next !== inv.status) {
    await db.from('service_call_invoices').update({
      status: next, paid_at: next === 'paid' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('id', inv.id).eq('company_id', inv.company_id)
  }
  return next
}

/** An unguessable link token: the path is the only thing guarding the page. */
export const newToken = () => randomBytes(24).toString('base64url')

/**
 * A QuickBooks Customer needs a `customers` row. A call may name its customer
 * only in words (`customer_name`), so sending makes sure there is a row - the
 * company's own, matched by exact name first so a regular customer is not
 * created twice - and remembers it on the invoice. Null when it cannot.
 */
export async function ensureBillingCustomer(
  db: SupabaseClient, companyId: string,
  who: { customer_id: string | null; customer_name: string; customer_email: string | null; phone?: string | null; address?: string | null },
): Promise<string | null> {
  if (who.customer_id) {
    const { data } = await db.from('customers').select('id, email').eq('id', who.customer_id).eq('gc_company_id', companyId).maybeSingle()
    if (data) {
      if (!(data as any).email && who.customer_email) await db.from('customers').update({ email: who.customer_email }).eq('id', who.customer_id)
      return who.customer_id
    }
  }
  const name = who.customer_name.trim()
  if (!name) return null
  const { data: same } = await db.from('customers').select('id').eq('gc_company_id', companyId).eq('name', name).limit(1)
  if (same?.length) return (same[0] as any).id
  const { data: made, error } = await db.from('customers').insert({
    gc_company_id: companyId, name, email: who.customer_email ?? null, phone: who.phone ?? null, billing_address: who.address ?? null,
  }).select('id').single()
  if (error) {
    console.error('[service-billing] customer create failed', { companyId, error: error.message })
    return null
  }
  return (made as any).id
}

/** Money as a stored numeric. */
export const asMoney = (v: unknown) => dollars(cents(v))
