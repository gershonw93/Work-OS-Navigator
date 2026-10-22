import type { SupabaseClient } from '@supabase/supabase-js'
import { type Connection, getValidConnection, qboFetch, QBO_ENV, QBO_OBJECT_NOT_FOUND } from '@/lib/quickbooks'
import {
  type ChangeEvent, type ExternalState, cdcEvents, linkedAmounts, pushedBySyteNav, toCents, voidedInQbo,
} from '@/lib/qbo-pull'
import { allocationProblem } from '@/lib/invoice-settlement'
import { invoiceTotalCents } from '@/lib/invoice-settlement'
import { issuedInvoices, syncInvoiceStatus } from '@/lib/invoice-settlement-db'
import { logActivity } from '@/lib/log-activity'
import { type Outcome, flag, money } from '@/lib/quickbooks-pull-shared'
import { applyBill, applyBillPayment } from '@/lib/quickbooks-pull-bills'

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks -> SyteNav, phase 1: storing and applying what changed.
//
// THE RULES (CLAUDE.md, QuickBooks):
//   * OFF BY DEFAULT, per company (`companies.qbo_pull_enabled`). A company
//     that has not turned it on gets nothing back, and turning it on starts
//     from "now" - history is never imported.
//   * EVERY CHANGE IS WRITTEN BEFORE IT IS ACTED ON (`quickbooks_inbound_events`,
//     unique per realm + entity + id + operation + Intuit's timestamp), so a
//     retried webhook, or the webhook and the daily read seeing the same
//     change, is a no-op - the same shape as the push's claim.
//   * NO ECHO. Every push SyteNav makes fires a webhook back. A change to a
//     record SyteNav holds that matches what SyteNav has is ignored, and a
//     payment carrying SyteNav's SN- tracking id is SyteNav's own.
//   * MONEY COMES IN WITH ITS QUICKBOOKS ID ALREADY SET, so the push skips it.
//     Without that, an imported payment is pushed straight back - the
//     double-count this whole integration is built around preventing.
//   * A VOID, DELETE OR CHANGE MADE IN QUICKBOOKS FLAGS THE SYTENAV ROW. It
//     never deletes or rewrites it: money silently vanishing from the job is
//     worse than money that is out of date. Deleting the row in SyteNav
//     afterwards works - the void path treats "already gone" as done.
//   * Anything created ONLY in QuickBooks is ignored (phase 2): QuickBooks does
//     not know which job it belongs to.
//   * Never throws. An event that cannot be applied is marked `error` with the
//     reason and written to the sync log, where Settings shows it.
// ─────────────────────────────────────────────────────────────────────────────


/** Write change events for the company that holds each realm. Only companies with pull switched on. */
export async function recordEvents(db: SupabaseClient, events: ChangeEvent[], source: 'webhook' | 'cdc'): Promise<number> {
  if (!events.length) return 0
  const realms = Array.from(new Set(events.map(e => e.realmId)))
  const { data: conns, error } = await db.from('quickbooks_connections')
    .select('company_id, realm_id').in('realm_id', realms).eq('environment', QBO_ENV)
  if (error) { console.error('[quickbooks-pull] connections', error.message); return 0 }
  const companyByRealm = new Map((conns ?? []).map((c: any) => [String(c.realm_id), String(c.company_id)]))
  const companies = Array.from(new Set(companyByRealm.values()))
  if (!companies.length) return 0
  const { data: cos } = await db.from('companies').select('id, qbo_pull_enabled').in('id', companies)
  const enabled = new Set((cos ?? []).filter((c: any) => c.qbo_pull_enabled).map((c: any) => String(c.id)))

  const rows = events
    .filter(e => enabled.has(companyByRealm.get(e.realmId) ?? ''))
    .map(e => ({
      company_id: companyByRealm.get(e.realmId)!, realm_id: e.realmId, environment: QBO_ENV,
      entity: e.entity, qbo_id: e.id, operation: e.operation, last_updated: e.lastUpdated, source,
    }))
  if (!rows.length) return 0
  const { error: insErr } = await db.from('quickbooks_inbound_events')
    .upsert(rows, { onConflict: 'realm_id,environment,entity,qbo_id,operation,last_updated', ignoreDuplicates: true })
  if (insErr) { console.error('[quickbooks-pull] record', insErr.message); return 0 }
  return rows.length
}

/**
 * Apply waiting events, oldest first, until the budget runs out. Each is
 * claimed by ONE conditional update (pending -> processing), so two runs at
 * once never apply the same change twice.
 */
export async function processPending(
  db: SupabaseClient, opts: { companyId?: string; budgetMs?: number; limit?: number } = {},
): Promise<{ applied: number; ignored: number; errors: number }> {
  const started = Date.now()
  const budget = opts.budgetMs ?? 20_000
  const tally = { applied: 0, ignored: 0, errors: 0 }
  let q = db.from('quickbooks_inbound_events').select('*').eq('status', 'pending')
    .order('received_at', { ascending: true }).limit(opts.limit ?? 50)
  if (opts.companyId) q = q.eq('company_id', opts.companyId)
  const { data: events, error } = await q
  if (error) { console.error('[quickbooks-pull] pending', error.message); return tally }

  const conns = new Map<string, Connection | null>()
  for (const ev of (events ?? []) as any[]) {
    if (Date.now() - started > budget) break
    const { data: claimed } = await db.from('quickbooks_inbound_events')
      .update({ status: 'processing' }).eq('id', ev.id).eq('status', 'pending').select('id').maybeSingle()
    if (!claimed) continue

    let outcome: Outcome
    try {
      if (!conns.has(ev.company_id)) conns.set(ev.company_id, await getValidConnection(db, ev.company_id))
      const conn = conns.get(ev.company_id)
      outcome = conn
        ? await applyChange(db, conn, ev.company_id, { realmId: ev.realm_id, entity: ev.entity, id: ev.qbo_id, operation: ev.operation, lastUpdated: ev.last_updated })
        : { status: 'error', message: 'QuickBooks is not connected, so the change could not be read.' }
    } catch (err: any) {
      outcome = { status: 'error', message: err?.message ?? 'unknown error' }
    }
    await db.from('quickbooks_inbound_events')
      .update({ status: outcome.status, message: outcome.message, processed_at: new Date().toISOString() }).eq('id', ev.id)
    tally[outcome.status === 'applied' ? 'applied' : outcome.status === 'ignored' ? 'ignored' : 'errors']++
    // What came back is written where Settings shows the push: an applied
    // change or a failure, never the echoes (those would bury the log).
    if (outcome.status !== 'ignored') {
      await pullLog(db, ev.company_id, outcome.logEntity ?? ev.entity.toLowerCase(), outcome.logId ?? null,
        outcome.status === 'applied' ? 'success' : 'error', ev.qbo_id, outcome.message, outcome.label ?? null)
    }
  }
  return tally
}

/** The daily (and "Check QuickBooks now") read: everything changed since the cursor. */
export async function runCdc(db: SupabaseClient, companyId: string): Promise<{ ok: boolean; recorded: number; message?: string }> {
  const { data: co } = await db.from('companies').select('qbo_pull_enabled, qbo_pull_since').eq('id', companyId).maybeSingle()
  if (!(co as any)?.qbo_pull_enabled) return { ok: false, recorded: 0, message: 'Bringing changes back is switched off.' }
  const conn = await getValidConnection(db, companyId)
  if (!conn) return { ok: false, recorded: 0, message: 'QuickBooks is not connected.' }
  const now = new Date()
  // Intuit keeps 30 days of changes. Older than that and the read would be
  // refused, so it starts at the edge of what QuickBooks still has.
  const floor = new Date(now.getTime() - 29 * 86_400_000)
  const since = (co as any)?.qbo_pull_since ? new Date((co as any).qbo_pull_since) : now
  const from = since < floor ? floor : since
  let res: any
  try {
    res = await qboFetch(conn, `cdc?entities=Payment,Invoice,Bill,BillPayment&changedSince=${encodeURIComponent(from.toISOString())}`)
  } catch (err: any) {
    return { ok: false, recorded: 0, message: `QuickBooks would not list its changes: ${err?.message ?? 'unknown'}` }
  }
  const recorded = await recordEvents(db, cdcEvents(conn.realm_id, res), 'cdc')
  // The cursor moves only after the changes are safely written.
  await db.from('companies').update({ qbo_pull_since: now.toISOString() }).eq('id', companyId)
  return { ok: true, recorded }
}

// ── applying one change ───────────────────────────────────────────────────────

async function fetchObj(conn: Connection, entity: string, id: string): Promise<any | null> {
  try {
    const res = await qboFetch(conn, `${entity.toLowerCase()}/${id}`)
    return res?.[entity] ?? null
  } catch (err: any) {
    if (err?.code === QBO_OBJECT_NOT_FOUND) return null
    throw err
  }
}

async function companyProjectIds(db: SupabaseClient, companyId: string): Promise<string[]> {
  const { data, error } = await db.from('projects').select('id')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
  if (error) throw new Error(`Could not read the company's jobs: ${error.message}`)
  return (data ?? []).map((p: any) => p.id)
}

export async function applyChange(db: SupabaseClient, conn: Connection, companyId: string, ev: ChangeEvent): Promise<Outcome> {
  const projects = await companyProjectIds(db, companyId)
  if (!projects.length) return { status: 'ignored', message: 'This account has no jobs.' }
  const gone = ev.operation === 'Delete'
  const obj = gone ? null : await fetchObj(conn, ev.entity, ev.id)
  const removed = gone || (!obj && ev.operation !== 'Create')
  switch (ev.entity) {
    case 'Payment': return applyPayment(db, projects, ev, obj, removed)
    case 'Invoice': return applyInvoice(db, projects, ev, obj, removed)
    case 'Bill': return applyBill(db, projects, ev, obj, removed)
    case 'BillPayment': return applyBillPayment(db, projects, ev, obj, removed)
  }
}

async function applyPayment(db: SupabaseClient, projects: string[], ev: ChangeEvent, obj: any, removed: boolean): Promise<Outcome> {
  const { data: mine } = await db.from('client_payments')
    .select('id, amount, reference, qbo_external_state').eq('qbo_id', ev.id).in('project_id', projects).maybeSingle()

  if (mine) {
    const label = (mine as any).reference ?? null
    if (removed || voidedInQbo(obj)) {
      if ((mine as any).qbo_external_state) return { status: 'ignored', message: 'Already flagged.' }
      const state: ExternalState = removed ? 'deleted' : 'voided'
      await flag(db, 'client_payments', (mine as any).id, state, `${state === 'deleted' ? 'Deleted' : 'Voided'} in QuickBooks. Delete it here too if it should not count.`)
      return { status: 'applied', message: `Payment ${state} in QuickBooks - flagged on the job`, logEntity: 'payment', logId: (mine as any).id, label }
    }
    if (toCents(obj?.TotalAmt) !== toCents((mine as any).amount)) {
      await flag(db, 'client_payments', (mine as any).id, 'changed', `${money(obj?.TotalAmt)} in QuickBooks, ${money((mine as any).amount)} here.`)
      return { status: 'applied', message: `Payment amount changed in QuickBooks to ${money(obj?.TotalAmt)} - flagged on the job`, logEntity: 'payment', logId: (mine as any).id, label }
    }
    return { status: 'ignored', message: 'Matches SyteNav.' }
  }

  // Not a payment SyteNav holds.
  if (removed || !obj || voidedInQbo(obj)) return { status: 'ignored', message: 'Not a SyteNav payment.' }
  if (pushedBySyteNav(obj)) return { status: 'ignored', message: "SyteNav's own payment." }
  const links = linkedAmounts(obj, 'Invoice')
  if (!links.length) return { status: 'ignored', message: 'Not applied to a SyteNav invoice.' }
  const { data: invs } = await db.from('client_invoices')
    .select('id, project_id, invoice_number, qbo_id').in('qbo_id', links.map(l => l.qboId)).in('project_id', projects)
  const known = (invs ?? []) as any[]
  if (!known.length) return { status: 'ignored', message: 'Not applied to a SyteNav invoice.' }
  const jobs = Array.from(new Set(known.map(i => i.project_id)))
  if (jobs.length > 1) {
    return { status: 'error', message: `A QuickBooks payment of ${money(obj.TotalAmt)} spans invoices on ${jobs.length} jobs. Record it in SyteNav by hand, one payment per job.` }
  }
  const projectId = jobs[0]
  const allocations = known.map(i => ({ client_invoice_id: i.id, amount: links.find(l => l.qboId === String(i.qbo_id))!.amount }))
  const numbers = known.map(i => i.invoice_number).join(', ')

  // The same check a person recording it would face. It is also what catches
  // a payment somebody ALREADY recorded in SyteNav by hand: the invoice reads
  // paid, so this one would pay it twice - refused and named, never imported.
  const open = await issuedInvoices(db, projectId)
  if (!open) return { status: 'error', message: "Could not read the job's invoices. It will be retried." }
  const problem = allocationProblem(obj.TotalAmt, allocations, open, { onAccount: true })
  if (problem) return { status: 'error', message: `QuickBooks payment ${money(obj.TotalAmt)} on ${numbers} not brought in: ${problem} Check for the same payment recorded twice.` }

  const applied = allocations.reduce((s, a) => s + toCents(a.amount), 0)
  const { data: row, error } = await db.from('client_payments').insert({
    project_id: projectId,
    paid_date: obj.TxnDate ?? null,
    amount: Number(obj.TotalAmt),
    method: obj.PaymentMethodRef?.name ?? null,
    reference: obj.PaymentRefNum ?? null,
    memo: 'Recorded in QuickBooks',
    // Money left after the invoices is the client's credit, as QuickBooks holds it.
    on_account: toCents(obj.TotalAmt) > applied,
    // THE ID GOES IN WITH THE ROW. Every push skips a payment that has one.
    qbo_id: ev.id, qbo_txn_type: 'payment', qbo_synced_at: new Date().toISOString(), qb_entered: true,
    origin: 'quickbooks',
  }).select('id').single()
  if (error || !row) return { status: 'error', message: `Could not save the payment: ${error?.message ?? 'unknown'}` }
  const { error: aErr } = await db.from('client_payment_allocations')
    .insert(allocations.map(a => ({ payment_id: (row as any).id, client_invoice_id: a.client_invoice_id, amount: a.amount })))
  if (aErr) {
    // A payment without its split would read as a deposit. Take it back out.
    await db.from('client_payments').delete().eq('id', (row as any).id)
    return { status: 'error', message: `Could not record which invoices it pays: ${aErr.message}` }
  }
  await syncInvoiceStatus(db, allocations.map(a => a.client_invoice_id))
  await logActivity(db, projectId, 'QuickBooks', 'client_payment_received',
    `Client payment recorded in QuickBooks - ${money(obj.TotalAmt)} on ${numbers}`, { payment_id: (row as any).id, amount: Number(obj.TotalAmt) })
  return { status: 'applied', message: `Payment of ${money(obj.TotalAmt)} recorded in QuickBooks - added to the job and applied to ${numbers}`, logEntity: 'payment', logId: (row as any).id, label: obj.PaymentRefNum ?? null }
}

async function applyInvoice(db: SupabaseClient, projects: string[], ev: ChangeEvent, obj: any, removed: boolean): Promise<Outcome> {
  const { data: inv } = await db.from('client_invoices')
    .select('id, invoice_number, status, qbo_voided_at, qbo_external_state, client_invoice_lines(amount)')
    .eq('qbo_id', ev.id).in('project_id', projects).maybeSingle()
  if (!inv) return { status: 'ignored', message: 'Not a SyteNav invoice.' }
  const i = inv as any
  // SyteNav voided it itself - this is the echo.
  if (i.qbo_voided_at || i.status === 'void') return { status: 'ignored', message: 'Voided by SyteNav.' }
  if (removed || voidedInQbo(obj) || ev.operation === 'Void') {
    if (i.qbo_external_state) return { status: 'ignored', message: 'Already flagged.' }
    const state: ExternalState = removed ? 'deleted' : 'voided'
    await flag(db, 'client_invoices', i.id, state, `${state === 'deleted' ? 'Deleted' : 'Voided'} in QuickBooks. Void it here too so the client and the books agree.`)
    return { status: 'applied', message: `Invoice ${i.invoice_number} ${state} in QuickBooks - flagged on the job`, logEntity: 'client_invoice', logId: i.id, label: i.invoice_number }
  }
  const ours = invoiceTotalCents(i.client_invoice_lines)
  if (obj && toCents(obj.TotalAmt) !== ours) {
    await flag(db, 'client_invoices', i.id, 'changed', `${money(obj.TotalAmt)} in QuickBooks, ${money(ours / 100)} here.`)
    return { status: 'applied', message: `Invoice ${i.invoice_number} changed in QuickBooks to ${money(obj.TotalAmt)} - flagged on the job`, logEntity: 'client_invoice', logId: i.id, label: i.invoice_number }
  }
  return { status: 'ignored', message: 'Matches SyteNav.' }
}

async function pullLog(
  db: SupabaseClient, companyId: string, entity_type: string, entity_id: string | null,
  status: string, qbo_id: string, message: string, label: string | null,
) {
  try {
    await db.from('quickbooks_sync_log').insert({
      company_id: companyId, entity_type, entity_id, action: 'update', status, qbo_id, message,
      record_label: label, direction: 'pull',
    })
  } catch { /* the log must never take the pull down with it */ }
}
