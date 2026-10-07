import type { SupabaseClient } from '@supabase/supabase-js'
import { cents, invoiceTotalCents, settlementOf, type OpenInvoice, type Settlement } from '@/lib/invoice-settlement'

// ─────────────────────────────────────────────────────────────────────────────
// The database half of lib/invoice-settlement.ts: read what has been applied to
// each invoice, and write the status that follows from it.
//
// `syncInvoiceStatus` is the ONLY writer of `client_invoices.status = 'paid'`.
// The invoice PATCH route refuses `paid` from a request body, because a status
// a client can claim is the bug this replaced: "paid" because somebody pressed
// a button, whatever the money said.
// ─────────────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string
  invoice_number: string
  status: string
  paid_at: string | null
  client_invoice_lines: { amount: unknown }[] | null
}

async function appliedByInvoice(
  db: SupabaseClient, invoiceIds: string[], excludePaymentId?: string,
): Promise<Map<string, number> | null> {
  const applied = new Map<string, number>()
  if (!invoiceIds.length) return applied
  const { data, error } = await db.from('client_payment_allocations')
    .select('client_invoice_id, payment_id, amount')
    .in('client_invoice_id', invoiceIds)
  // A read that failed is not a read that found nothing - an invoice with
  // $9,000 against it must not be offered as owing the full $10,000.
  if (error) {
    console.error('[invoice-settlement] could not read allocations', error.message)
    return null
  }
  for (const a of (data ?? []) as { client_invoice_id: string; payment_id: string; amount: unknown }[]) {
    if (excludePaymentId && a.payment_id === excludePaymentId) continue
    applied.set(a.client_invoice_id, (applied.get(a.client_invoice_id) ?? 0) + cents(a.amount))
  }
  return applied
}

/**
 * Every issued invoice on a job, with what it still owes - the list a payment
 * can be split across. `excludePaymentId` leaves one payment's own share out,
 * so editing a payment measures against the balance as it was before it.
 * Null when the read failed.
 */
export async function issuedInvoices(
  db: SupabaseClient, projectId: string, excludePaymentId?: string,
): Promise<OpenInvoice[] | null> {
  const { data, error } = await db.from('client_invoices')
    .select('id, invoice_number, status, paid_at, client_invoice_lines(amount)')
    .eq('project_id', projectId)
    .in('status', ['sent', 'paid'])
  if (error) {
    console.error('[invoice-settlement] could not read invoices', error.message)
    return null
  }
  const rows = (data ?? []) as InvoiceRow[]
  const applied = await appliedByInvoice(db, rows.map(r => r.id), excludePaymentId)
  if (!applied) return null
  return rows.map(r => ({
    id: r.id,
    invoice_number: r.invoice_number,
    status: r.status,
    balanceCents: Math.max(invoiceTotalCents(r.client_invoice_lines) - (applied.get(r.id) ?? 0), 0),
  }))
}

/** Where each of these invoices stands. Missing from the map when it could not be read. */
export async function settlementsFor(
  db: SupabaseClient, invoices: { id: string; client_invoice_lines?: { amount: unknown }[] | null }[],
): Promise<Map<string, Settlement>> {
  const out = new Map<string, Settlement>()
  const applied = await appliedByInvoice(db, invoices.map(i => i.id))
  if (!applied) return out
  for (const inv of invoices) {
    out.set(inv.id, settlementOf(invoiceTotalCents(inv.client_invoice_lines), applied.get(inv.id) ?? 0))
  }
  return out
}

/**
 * Write the status the money says. Called after every payment is recorded,
 * edited or deleted, for each invoice it touched.
 *
 * Draft and void are never touched: a draft cannot be paid, and a void is a
 * decision about the document, not about the money. Between sent and paid
 * the numbers decide, in both directions - deleting a payment that covered an
 * invoice puts it back to sent, or it would read "Paid" over nothing.
 *
 * Never throws. A failure is logged and the next payment on that invoice
 * writes the right answer.
 */
export async function syncInvoiceStatus(db: SupabaseClient, invoiceIds: string[]): Promise<void> {
  const ids = invoiceIds.filter((v, i, a) => !!v && a.indexOf(v) === i)
  if (!ids.length) return
  try {
    const { data, error } = await db.from('client_invoices')
      .select('id, invoice_number, status, paid_at, client_invoice_lines(amount)')
      .in('id', ids)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as InvoiceRow[]
    const applied = await appliedByInvoice(db, ids)
    if (!applied) return
    for (const r of rows) {
      if (r.status !== 'sent' && r.status !== 'paid') continue
      const s = settlementOf(invoiceTotalCents(r.client_invoice_lines), applied.get(r.id) ?? 0)
      const paid = s.state === 'paid'
      if (paid && r.status !== 'paid') {
        await db.from('client_invoices')
          .update({ status: 'paid', paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq('id', r.id)
      } else if (!paid && r.status === 'paid') {
        await db.from('client_invoices')
          .update({ status: 'sent', paid_at: null, updated_at: new Date().toISOString() })
          .eq('id', r.id)
      }
    }
  } catch (err: any) {
    console.error('[invoice-settlement] could not update invoice status', err?.message ?? err)
  }
}
