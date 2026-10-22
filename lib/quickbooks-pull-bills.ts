import type { SupabaseClient } from '@supabase/supabase-js'
import { type ChangeEvent, type ExternalState, linkedAmounts, toCents, voidedInQbo } from '@/lib/qbo-pull'
import { updateSubBill } from '@/lib/writes/sub-bill'
import { type Outcome, flag, money } from '@/lib/quickbooks-pull-shared'

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks -> SyteNav for SUB BILLS (lib/quickbooks-pull.ts has the rules):
// a bill deleted or changed in QuickBooks is flagged, a bill paid in
// QuickBooks reads paid here, and a bill payment voided there is flagged.
// ─────────────────────────────────────────────────────────────────────────────

export async function applyBill(db: SupabaseClient, projects: string[], ev: ChangeEvent, obj: any, removed: boolean): Promise<Outcome> {
  const { data: bill } = await db.from('invoices')
    .select('id, invoice_number, amount, qbo_external_state').eq('qbo_id', ev.id).in('project_id', projects).maybeSingle()
  if (!bill) return { status: 'ignored', message: 'Not a SyteNav bill.' }
  const b = bill as any
  if (removed) {
    if (b.qbo_external_state) return { status: 'ignored', message: 'Already flagged.' }
    await flag(db, 'invoices', b.id, 'deleted', 'Deleted in QuickBooks. Delete it here too if it should not count.')
    return { status: 'applied', message: `Bill ${b.invoice_number} deleted in QuickBooks - flagged on the job`, logEntity: 'bill', logId: b.id, label: b.invoice_number }
  }
  if (obj && toCents(obj.TotalAmt) !== toCents(b.amount)) {
    await flag(db, 'invoices', b.id, 'changed', `${money(obj.TotalAmt)} in QuickBooks, ${money(b.amount)} here.`)
    return { status: 'applied', message: `Bill ${b.invoice_number} changed in QuickBooks to ${money(obj.TotalAmt)} - flagged on the job`, logEntity: 'bill', logId: b.id, label: b.invoice_number }
  }
  return { status: 'ignored', message: 'Matches SyteNav.' }
}

export async function applyBillPayment(db: SupabaseClient, projects: string[], ev: ChangeEvent, obj: any, removed: boolean): Promise<Outcome> {
  const { data: paidBy } = await db.from('invoices')
    .select('id, project_id, invoice_number, amount, status, qbo_external_state').eq('qbo_payment_id', ev.id).in('project_id', projects).maybeSingle()
  if (paidBy) {
    const b = paidBy as any
    if (removed || voidedInQbo(obj)) {
      if (b.status !== 'paid' || b.qbo_external_state) return { status: 'ignored', message: 'Nothing to flag.' }
      const state: ExternalState = removed ? 'deleted' : 'voided'
      await flag(db, 'invoices', b.id, state, `The payment was ${state} in QuickBooks, so the bill is open there. Mark it unpaid here too if the money has not gone.`)
      return { status: 'applied', message: `Bill ${b.invoice_number}: its payment was ${state} in QuickBooks - flagged on the job`, logEntity: 'bill_payment', logId: b.id, label: b.invoice_number }
    }
    return { status: 'ignored', message: "SyteNav's own bill payment." }
  }
  if (removed || !obj || voidedInQbo(obj)) return { status: 'ignored', message: 'Not a SyteNav bill payment.' }
  const links = linkedAmounts(obj, 'Bill')
  if (!links.length) return { status: 'ignored', message: 'Not applied to a SyteNav bill.' }
  const { data: bills } = await db.from('invoices')
    .select('id, project_id, invoice_number, amount, status, qbo_id, qbo_payment_id').in('qbo_id', links.map(l => l.qboId)).in('project_id', projects)
  const known = (bills ?? []) as any[]
  if (!known.length) return { status: 'ignored', message: 'Not applied to a SyteNav bill.' }

  const done: string[] = []
  const part: string[] = []
  for (const b of known) {
    const paidThere = links.find(l => l.qboId === String(b.qbo_id))!.amount
    if (b.status === 'paid' || b.qbo_payment_id) continue
    if (toCents(paidThere) < toCents(b.amount)) {
      await flag(db, 'invoices', b.id, 'part_paid', `${money(paidThere)} of ${money(b.amount)} paid in QuickBooks.`)
      part.push(b.invoice_number)
      continue
    }
    // THE PAYMENT ID GOES IN FIRST, while the bill is still approved: the
    // bill-payment push skips any bill that has one, so no moment exists in
    // which a backlog sync could send a second BillPayment for this money.
    const { data: claimed } = await db.from('invoices')
      .update({ qbo_payment_id: ev.id, qbo_payment_synced_at: new Date().toISOString() })
      .eq('id', b.id).is('qbo_payment_id', null).select('id').maybeSingle()
    if (!claimed) continue
    // Then the same paid move a person makes - the sub is told, the schedule
    // item settles, the activity is written. Nothing on this path pushes.
    // NO `via`: on updateSubBill that means "through Claude", which refuses
    // any status move. The result is checked - a refusal is not a payment.
    const moved = await updateSubBill(db, { userId: '', projectId: b.project_id, invoiceId: b.id, body: { status: 'paid' } })
    if (moved.status >= 400) {
      await db.from('invoices').update({ qbo_payment_id: null, qbo_payment_synced_at: null }).eq('id', b.id)
      part.push(`${b.invoice_number} (not marked paid: ${(moved.body as any)?.error ?? 'refused'})`)
      continue
    }
    if (obj.TxnDate) await db.from('invoices').update({ paid_at: new Date(`${obj.TxnDate}T12:00:00Z`).toISOString() }).eq('id', b.id)
    done.push(b.invoice_number)
  }
  if (!done.length && !part.length) return { status: 'ignored', message: 'Those bills already read paid.' }
  return {
    status: 'applied',
    message: [done.length && `Paid in QuickBooks: ${done.join(', ')} now reads paid`, part.length && `part paid in QuickBooks: ${part.join(', ')} (flagged)`].filter(Boolean).join('; '),
    logEntity: 'bill_payment', logId: known[0].id, label: [...done, ...part].join(', '),
  }
}

