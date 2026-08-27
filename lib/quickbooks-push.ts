import { SupabaseClient } from '@supabase/supabase-js'
import {
  Connection, getValidConnection, qboFetch, qboQuery,
  defaultExpenseAccountId, defaultServiceItemId, paymentMethodId,
} from '@/lib/quickbooks'

// ─────────────────────────────────────────────────────────────────────────────
// Pushing ONE record into QuickBooks - the unit both sync paths share.
//
// This logic used to live only inside the manual Settings sync button, which
// is why the books drifted: the last press was six weeks before this file
// existed, and seventeen payments sat unsynced while the "QB" chip on screen
// was a hand-ticked checkbox with no connection to reality.
//
// Now the same pusher runs in two places:
//   * automatically, right after a payment is recorded or a bill approved
//   * from the Settings sync button, for backlog and catch-up
// One code path, so the button and the auto-push cannot drift apart.
//
// SAME CONTRACT AS sendEmail: NEVER THROWS. Recording a payment must not fail
// because Intuit had a bad minute - the payment is the work, QuickBooks is a
// side effect. Not being connected is a normal state, not an error.
// ─────────────────────────────────────────────────────────────────────────────

export type PushResult =
  | { pushed: true; qboId: string }
  | { pushed: false; reason: 'not_connected' | 'already' | 'skipped' | 'failed'; detail?: string }

/**
 * Shared per-run cache, so a backlog sync of fifty rows does not ask QBO fifty
 * times which expense account to use. The auto-push path just passes nothing.
 */
export interface PushContext {
  conn?: Connection | null
  expenseAccountId?: string
  itemId?: string
  /** Method name -> QBO PaymentMethod id, so a 50-row sync resolves each once. */
  methodIds?: Record<string, string | null>
}

/** Resolve a payment method id once per run. */
async function methodIdFor(conn: Connection, method: string | null | undefined, ctx?: PushContext): Promise<string | null> {
  const key = String(method ?? '').trim().toLowerCase()
  if (!key) return null
  if (ctx?.methodIds && key in ctx.methodIds) return ctx.methodIds[key]
  const id = await paymentMethodId(conn, method)
  if (ctx) { ctx.methodIds = ctx.methodIds ?? {}; ctx.methodIds[key] = id }
  return id
}

const ymd = (d?: string | null): string | undefined =>
  d ? new Date(d).toISOString().slice(0, 10) : undefined

/**
 * Wait this long for QuickBooks, then give up and log it. The underlying
 * request is not cancelled - qboFetch has no abort plumbing - but the SAVE
 * stops waiting, which is the thing that matters: a slow Intuit API may cost
 * a missed sync (caught by the next backlog run), never a hung Record Payment.
 */
const QBO_BUDGET_MS = 8000
function budgeted<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`QuickBooks took longer than ${QBO_BUDGET_MS / 1000}s - will sync on the next run`)), QBO_BUDGET_MS)),
  ])
}

// ── Pure payload builders, split out so they can be tested without a network ─

/**
 * The reference that makes a QuickBooks record matchable back to SyteNav.
 *
 * The first pushes carried only customer + date + amount + memo, and the
 * question came back within a day: "it's the customer name but for WHICH
 * project? is there an invoice number?" A record a bookkeeper cannot trace
 * is a record they re-enter, which defeats the whole sync.
 *
 * DocNumber is capped at 21 characters by QBO; "SN-" plus eight hex chars of
 * the SyteNav id fits with room to spare and is unique enough to search for.
 * If the company has custom transaction numbers switched off, QBO may ignore
 * it - the project name in the memo still carries the answer.
 */
export function snRef(id: string): string {
  return `SN-${id.slice(0, 8)}`
}

/** One place decides how a memo reads, so push and refresh cannot drift. */
export function composeMemo(projectName?: string | null, memo?: string | null): string | undefined {
  return [projectName, memo].filter(Boolean).join(' - ') || undefined
}

export function composeBillDescription(trade?: string | null, projectName?: string | null): string {
  return [trade ?? 'Subcontractor work', projectName].filter(Boolean).join(' - ')
}

export function paymentPayload(
  p: { id?: string; amount: unknown; paid_date?: string | null; memo?: string | null },
  customerQboId: string,
  itemId: string,
  projectName?: string | null,
  methodQboId?: string | null,
) {
  return {
    CustomerRef: { value: customerQboId },
    TxnDate: ymd(p.paid_date),
    // How the money arrived - the column a bookkeeper reconciles a bank
    // statement against. Omitted entirely when unknown rather than guessed.
    ...(methodQboId ? { PaymentMethodRef: { value: methodQboId } } : {}),
    ...(p.id ? { DocNumber: snRef(p.id) } : {}),
    // The memo answers "which job?" before it says anything else - the
    // customer name is already on the record, the project is what was missing.
    PrivateNote: composeMemo(projectName, p.memo),
    Line: [{
      DetailType: 'SalesItemLineDetail',
      Amount: Number(p.amount),
      SalesItemLineDetail: { ItemRef: { value: itemId } },
    }],
  }
}

export function billPayload(
  inv: { id?: string; amount: unknown; paid_at?: string | null; created_at?: string | null; trade?: string | null },
  vendorQboId: string,
  expenseAccountId: string,
  projectName?: string | null,
) {
  return {
    VendorRef: { value: vendorQboId },
    // The date money moved if it has, else the date the bill was raised.
    TxnDate: ymd(inv.paid_at) ?? ymd(inv.created_at),
    ...(inv.id ? { DocNumber: snRef(inv.id) } : {}),
    Line: [{
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: Number(inv.amount),
      Description: composeBillDescription(inv.trade, projectName),
      AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
    }],
  }
}

/**
 * A client invoice as a QuickBooks Invoice - a receivable.
 *
 * DocNumber is the user's OWN invoice number here, not an snRef. Payments had
 * nothing to reference so snRef was invented for them; an invoice already
 * carries the number the client is looking at, and QuickBooks should show that
 * same number back.
 */
export function clientInvoicePayload(
  inv: { invoice_number?: string | null; issue_date?: string | null; due_date?: string | null; notes?: string | null },
  lines: { description?: string | null; amount?: unknown }[],
  customerQboId: string,
  itemId: string,
  projectName?: string | null,
) {
  return {
    CustomerRef: { value: customerQboId },
    TxnDate: ymd(inv.issue_date),
    ...(inv.due_date ? { DueDate: ymd(inv.due_date) } : {}),
    ...(inv.invoice_number ? { DocNumber: String(inv.invoice_number).slice(0, 21) } : {}),
    PrivateNote: composeMemo(projectName, inv.notes),
    Line: lines.map(l => ({
      DetailType: 'SalesItemLineDetail',
      Amount: Number(l.amount ?? 0),
      Description: l.description ?? undefined,
      SalesItemLineDetail: { ItemRef: { value: itemId } },
    })),
  }
}

/**
 * A payment APPLIED against an invoice, rather than a standalone sale.
 *
 * This is the half that stops double-counting: once the sale exists in
 * QuickBooks as an Invoice, the money arriving must reduce that receivable,
 * not book a second sale.
 */
export function appliedPaymentPayload(
  p: { id?: string; amount: unknown; paid_date?: string | null; memo?: string | null },
  customerQboId: string,
  invoiceQboId: string,
  projectName?: string | null,
  methodQboId?: string | null,
) {
  return {
    CustomerRef: { value: customerQboId },
    TxnDate: ymd(p.paid_date),
    TotalAmt: Number(p.amount),
    ...(methodQboId ? { PaymentMethodRef: { value: methodQboId } } : {}),
    // A Payment carries its reference in PaymentRefNum; DocNumber is the
    // Invoice/Sales Receipt field and means nothing on this entity, so the
    // SN- reference was being written into a field QuickBooks does not read.
    ...(p.id ? { PaymentRefNum: snRef(p.id) } : {}),
    PrivateNote: composeMemo(projectName, p.memo),
    Line: [{
      Amount: Number(p.amount),
      LinkedTxn: [{ TxnId: invoiceQboId, TxnType: 'Invoice' }],
    }],
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

async function logRow(
  db: SupabaseClient, companyId: string,
  entity_type: string, entity_id: string, status: string, qbo_id?: string, message?: string,
) {
  try {
    await db.from('quickbooks_sync_log').insert({
      company_id: companyId, entity_type, entity_id, action: 'create', status, qbo_id, message,
    })
  } catch { /* the log must never take the push down with it */ }
}

async function ensureVendorId(db: SupabaseClient, conn: Connection, companyId: string, gcCompanyId: string): Promise<string> {
  const { data: co } = await db.from('companies')
    .select('id, name, contact_email, phone, address, qbo_vendor_id').eq('id', companyId).single()
  if (!co) throw new Error('Vendor company not found')
  if (co.qbo_vendor_id) return co.qbo_vendor_id
  const payload: any = { DisplayName: co.name }
  if (co.contact_email) payload.PrimaryEmailAddr = { Address: co.contact_email }
  if (co.phone) payload.PrimaryPhone = { FreeFormNumber: co.phone }
  if (co.address) payload.BillAddr = { Line1: co.address }
  const res = await qboFetch(conn, 'vendor', { method: 'POST', body: JSON.stringify(payload) })
  const qboId = res?.Vendor?.Id
  await db.from('companies').update({ qbo_vendor_id: qboId, qbo_vendor_synced_at: new Date().toISOString() }).eq('id', co.id)
  await logRow(db, gcCompanyId, 'vendor', co.id, 'success', qboId, 'Auto-created for a bill')
  return qboId
}

async function ensureCustomerId(db: SupabaseClient, conn: Connection, customerId: string, gcCompanyId: string): Promise<string> {
  const { data: c } = await db.from('customers')
    .select('id, name, contact_name, email, phone, billing_address, qbo_id').eq('id', customerId).single()
  if (!c) throw new Error('Customer not found')
  if (c.qbo_id) return c.qbo_id
  const payload: any = { DisplayName: c.name }
  if (c.email) payload.PrimaryEmailAddr = { Address: c.email }
  if (c.phone) payload.PrimaryPhone = { FreeFormNumber: c.phone }
  if (c.billing_address) payload.BillAddr = { Line1: c.billing_address }
  const res = await qboFetch(conn, 'customer', { method: 'POST', body: JSON.stringify(payload) })
  const qboId = res?.Customer?.Id
  await db.from('customers').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
  await logRow(db, gcCompanyId, 'customer', c.id, 'success', qboId, 'Auto-created for a payment')
  return qboId
}

/** The GC company whose QuickBooks file a project's money belongs in. */
async function projectCompany(db: SupabaseClient, projectId: string): Promise<{ companyId: string | null; customerId: string | null; projectName: string | null }> {
  const { data: p } = await db.from('projects')
    .select('gc_company_id, created_by_company_id, customer_id, name').eq('id', projectId).maybeSingle()
  return {
    companyId: (p as any)?.gc_company_id ?? (p as any)?.created_by_company_id ?? null,
    customerId: (p as any)?.customer_id ?? null,
    projectName: (p as any)?.name ?? null,
  }
}

async function connectionFor(db: SupabaseClient, companyId: string, ctx?: PushContext): Promise<Connection | null> {
  if (ctx?.conn) return ctx.conn
  const conn = await getValidConnection(db, companyId)
  if (ctx) ctx.conn = conn
  return conn
}

/**
 * Claim a record for pushing, atomically. Returns false if somebody already has it.
 *
 * THE BUG THIS EXISTS FOR. The old guard was a read - "no qbo_id? push" - and
 * two requests arriving together both read null before either wrote. A single
 * double-pressed Issue button produced QuickBooks invoices 291 and 292 100ms
 * apart; the row kept 292 and 291 became an orphan receivable nobody could
 * settle. A check and an act in two statements is a race however carefully the
 * check is written.
 *
 * One conditional UPDATE instead. Postgres serialises it, so exactly one
 * caller comes back with a row and everybody else comes back empty.
 *
 * Stale claims expire: a push killed mid-flight (deploy, timeout, crash) must
 * not lock a record out of QuickBooks forever, so a claim older than the
 * window is up for grabs again.
 */
/**
 * "Already in QuickBooks - don't sync": the user typed this payment into
 * QuickBooks themselves.
 *
 * The flag existed long before the integration did, as a bookkeeping tick, and
 * auto-push turned it into a liability: it was WRITTEN on a successful push
 * and never READ, so ticking it stopped nothing. Push anyway and QuickBooks
 * ends up with two records for one payment - revenue counted twice, found by
 * an accountant rather than by anyone here.
 *
 * Checked only when `qbo_id` is absent. A payment WE pushed carries both, and
 * must report `already` rather than `skipped`: one means "we did it", the
 * other means "you did it", and the sync summary shows them differently.
 */
function handEntered(p: { qbo_id?: unknown; qb_entered?: unknown }): boolean {
  return !p.qbo_id && p.qb_entered === true
}

const HAND_ENTERED: PushResult = {
  pushed: false,
  reason: 'skipped',
  detail: 'Marked as already entered in QuickBooks by hand',
}

const CLAIM_STALE_MS = 2 * 60 * 1000

async function claimForPush(db: SupabaseClient, table: string, id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data } = await db
    .from(table)
    .update({ qbo_claimed_at: new Date().toISOString() })
    .eq('id', id)
    .is('qbo_id', null)
    .or(`qbo_claimed_at.is.null,qbo_claimed_at.lt.${staleBefore}`)
    .select('id')
  return Array.isArray(data) ? data.length > 0 : !!data
}

/** Hand the claim back so a failed push can be retried immediately. */
async function releaseClaim(db: SupabaseClient, table: string, id: string): Promise<void> {
  try {
    await db.from(table).update({ qbo_claimed_at: null }).eq('id', id)
  } catch { /* a stuck claim expires on its own; never fail the caller for this */ }
}

/**
 * An Invoice QuickBooks already holds under this number, if any.
 *
 * The claim closes the window inside one deploy; this covers the rest - a
 * push that created in QBO and then died before writing qbo_id back would
 * otherwise create a second one on the retry. Adopting beats duplicating.
 */
async function existingInvoiceIdByDocNumber(conn: Connection, docNumber?: string | null): Promise<string | null> {
  const n = String(docNumber ?? '').trim()
  if (!n) return null
  try {
    const q = await qboQuery(conn, `select Id from Invoice where DocNumber = '${n.replace(/'/g, "\\'")}'`)
    return q?.Invoice?.[0]?.Id ?? null
  } catch {
    return null
  }
}

// ── The pushers ──────────────────────────────────────────────────────────────

/**
 * Client payment -> QBO Sales Receipt. Never throws.
 *
 * ONLY for money that settles nothing - a deposit taken before any invoice
 * exists. If the payment names an invoice, a Sales Receipt is the wrong record
 * by definition: a receipt means sold AND paid, and the sale is already in
 * QuickBooks as that invoice. Route it through pushPaymentForProject instead.
 */
export async function pushClientPayment(db: SupabaseClient, paymentId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: p } = await db.from('client_payments')
      .select('id, project_id, amount, paid_date, memo, method, qb_entered, qbo_id, client_invoice_id')
      .eq('id', paymentId).maybeSingle()
    if (!p) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    if (p.qbo_id) return { pushed: false, reason: 'already' }
    if (handEntered(p)) return HAND_ENTERED
    // Belt and braces. The backlog sync used to call this function directly
    // for every unsynced payment, which would have booked a second sale for
    // money settling an invoice already over there.
    if (p.client_invoice_id) return pushPaymentForProject(db, paymentId, ctx)

    const { companyId, customerId, projectName } = await projectCompany(db, p.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    if (!customerId) {
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, 'Project has no customer to bill to')
      return { pushed: false, reason: 'failed', detail: 'Project has no customer to bill to' }
    }

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    // Atomic - see claimForPush. Losing the claim means somebody else is
    // already pushing this exact record.
    if (!await claimForPush(db, 'client_payments', p.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      if (!ctx?.itemId) {
        const itemId = await defaultServiceItemId(conn)
        if (ctx) ctx.itemId = itemId; else ctx = { conn, itemId }
      }
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const res = await qboFetch(conn, 'salesreceipt', {
        method: 'POST',
        body: JSON.stringify(paymentPayload(p, customerQboId, ctx!.itemId!, projectName, await methodIdFor(conn, (p as any).method, ctx))),
      })
      const qboId = res?.SalesReceipt?.Id
      // qb_entered too: the hand-tick means "it is in QuickBooks", and now it is.
      await db.from('client_payments').update({
        qbo_id: qboId, qbo_synced_at: new Date().toISOString(), qb_entered: true,
        // Label which model wrote it, so nobody has to infer it later.
        qbo_txn_type: 'sales_receipt',
      }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', qboId)
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'client_payments', p.id)
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, err?.message)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/** Approved/paid sub invoice -> QBO Bill. Never throws. */
export async function pushBill(db: SupabaseClient, invoiceId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('invoices')
      .select('id, project_id, amount, status, created_at, paid_at, qbo_id, subcontracts(company_id, trade)')
      .eq('id', invoiceId).maybeSingle()
    if (!inv) return { pushed: false, reason: 'skipped', detail: 'Invoice not found' }
    if (inv.qbo_id) return { pushed: false, reason: 'already' }
    if (!['approved', 'paid'].includes(String(inv.status))) {
      return { pushed: false, reason: 'skipped', detail: `Status ${inv.status} does not belong in QuickBooks` }
    }

    const { companyId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const vendorCompanyId = (inv.subcontracts as any)?.company_id
    if (!vendorCompanyId) {
      await logRow(db, companyId, 'bill', inv.id, 'error', undefined, 'Invoice has no subcontractor')
      return { pushed: false, reason: 'failed', detail: 'Invoice has no subcontractor' }
    }

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    if (!await claimForPush(db, 'invoices', inv.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      if (!ctx?.expenseAccountId) {
        const expenseAccountId = await defaultExpenseAccountId(conn)
        if (ctx) ctx.expenseAccountId = expenseAccountId; else ctx = { conn, expenseAccountId }
      }
      const vendorQboId = await ensureVendorId(db, conn, vendorCompanyId, companyId)
      const res = await qboFetch(conn, 'bill', {
        method: 'POST',
        body: JSON.stringify(billPayload({ ...inv, trade: (inv.subcontracts as any)?.trade }, vendorQboId, ctx!.expenseAccountId!, projectName)),
      })
      const qboId = res?.Bill?.Id
      await db.from('invoices').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'success', qboId)
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'invoices', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'error', undefined, err?.message)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

// ── Refreshing formatting on records already in QuickBooks ───────────────────
//
// Records pushed before the project name and SN reference existed sit in QBO
// as bare "customer + amount + Draw 8" rows - unmatchable. This rewrites those
// two fields on the EXISTING record, never creating a second one: fetch the
// record (which yields the SyncToken QBO demands on any update), set the
// fields, post it back. Amounts, dates and links are untouched.

/** Rewrite memo + reference on an already-synced payment. Never throws. */
export async function refreshPaymentInQbo(db: SupabaseClient, paymentId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: p } = await db.from('client_payments')
      .select('id, project_id, memo, method, qbo_id').eq('id', paymentId).maybeSingle()
    if (!p?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet' }

    const { companyId, projectName } = await projectCompany(db, p.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `salesreceipt/${p.qbo_id}`)
      const obj = cur?.SalesReceipt
      if (!obj?.Id) throw new Error('Record no longer exists in QuickBooks')
      obj.PrivateNote = composeMemo(projectName, p.memo) ?? ''
      obj.DocNumber = snRef(p.id)
      // Backfill how the money arrived onto records pushed before methods
      // were carried at all. Only set it - never blank an existing one, which
      // could be something a bookkeeper chose inside QuickBooks.
      const mid = await methodIdFor(conn, (p as any).method, ctx)
      if (mid) obj.PaymentMethodRef = { value: mid }
      await qboFetch(conn, 'salesreceipt', { method: 'POST', body: JSON.stringify(obj) })
      await db.from('client_payments').update({ qbo_synced_at: new Date().toISOString() }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', p.qbo_id, 'Formatting refreshed')
      return { pushed: true, qboId: p.qbo_id }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, `Refresh: ${err?.message}`)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/** Rewrite reference + line description on an already-synced bill. Never throws. */
export async function refreshBillInQbo(db: SupabaseClient, invoiceId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('invoices')
      .select('id, project_id, qbo_id, subcontracts(trade)').eq('id', invoiceId).maybeSingle()
    if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet' }

    const { companyId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `bill/${inv.qbo_id}`)
      const obj = cur?.Bill
      if (!obj?.Id) throw new Error('Record no longer exists in QuickBooks')
      obj.DocNumber = snRef(inv.id)
      // Only retitle the expense line this push wrote; anything a bookkeeper
      // added by hand in QBO is not ours to rename.
      const line = (obj.Line ?? []).find((l: any) => l.DetailType === 'AccountBasedExpenseLineDetail')
      if (line) line.Description = composeBillDescription((inv.subcontracts as any)?.trade, projectName)
      await qboFetch(conn, 'bill', { method: 'POST', body: JSON.stringify(obj) })
      await db.from('invoices').update({ qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'success', inv.qbo_id, 'Formatting refreshed')
      return { pushed: true, qboId: inv.qbo_id }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'bill', inv.id, 'error', undefined, `Refresh: ${err?.message}`)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

// ── Receivables ──────────────────────────────────────────────────────────────

/** A SENT client invoice -> QBO Invoice (money owed to you). Never throws. */
export async function pushClientInvoice(db: SupabaseClient, billId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('client_invoices')
      .select('id, project_id, invoice_number, status, issue_date, due_date, notes, qbo_id, client_invoice_lines(description, amount, sort_order)')
      .eq('id', billId).maybeSingle()
    if (!inv) return { pushed: false, reason: 'skipped', detail: 'Invoice not found' }
    if (inv.qbo_id) return { pushed: false, reason: 'already' }
    // A draft is not a receivable - nobody has been asked for this money yet.
    if (!['sent', 'paid'].includes(String(inv.status))) {
      return { pushed: false, reason: 'skipped', detail: `Status ${inv.status} is not a receivable` }
    }
    const lines = ((inv as any).client_invoice_lines ?? [])
      .slice()
      .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    if (!lines.length) return { pushed: false, reason: 'skipped', detail: 'Invoice has no lines' }

    const { companyId, customerId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    if (!customerId) {
      await logRow(db, companyId, 'client_invoice', inv.id, 'error', undefined, 'Project has no customer to bill to')
      return { pushed: false, reason: 'failed', detail: 'Project has no customer to bill to' }
    }

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    if (!await claimForPush(db, 'client_invoices', inv.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      // Already over there under this number? Adopt it. A push that created in
      // QuickBooks and then died before writing qbo_id back would otherwise
      // create a second invoice on the retry.
      const existing = await existingInvoiceIdByDocNumber(conn, inv.invoice_number)
      if (existing) {
        await db.from('client_invoices').update({ qbo_id: existing, qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
        await logRow(db, companyId, 'client_invoice', inv.id, 'success', existing, 'Adopted the invoice already in QuickBooks')
        return { pushed: true, qboId: existing }
      }

      if (!ctx?.itemId) {
        const itemId = await defaultServiceItemId(conn)
        if (ctx) ctx.itemId = itemId; else ctx = { conn, itemId }
      }
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const res = await qboFetch(conn, 'invoice', {
        method: 'POST',
        body: JSON.stringify(clientInvoicePayload(inv, lines, customerQboId, ctx!.itemId!, projectName)),
      })
      const qboId = res?.Invoice?.Id
      await db.from('client_invoices').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'client_invoice', inv.id, 'success', qboId)
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'client_invoices', inv.id)
      await logRow(db, companyId, 'client_invoice', inv.id, 'error', undefined, err?.message)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * Which receivable a payment settles, if any.
 *
 * THE BUG THIS EXISTS FOR. This used to be a guess: "the oldest invoice still
 * sent". Issue three invoices on one day and every one of them has the same
 * issue_date, so "oldest" is whichever row Postgres felt like returning first
 * - the $37,224 recorded against INV-0004 was on its way to settling INV-0002.
 * But nobody was guessing at the keyboard: they pressed Mark paid ON an
 * invoice. That link is now stored on the payment, so the books settle the
 * invoice the human pointed at.
 *
 * The third outcome is the one that stops a double-count. A payment linked to
 * an invoice that has NOT reached QuickBooks yet must book nothing at all:
 * falling back to a Sales Receipt would record the sale, and then the invoice
 * would arrive and record it again.
 */
type Settlement =
  | { kind: 'invoice'; id: string; label: string; qboId: string }
  | { kind: 'standalone' }
  | { kind: 'wait'; detail: string }

async function settlementTarget(
  db: SupabaseClient,
  p: { project_id: string; client_invoice_id?: string | null },
): Promise<Settlement> {
  if (p.client_invoice_id) {
    const { data } = await db.from('client_invoices')
      .select('id, invoice_number, qbo_id')
      .eq('id', p.client_invoice_id).maybeSingle()
    // Not 'standalone': pushClientPayment bounces a linked payment back here,
    // so answering "standalone" for a link we cannot resolve is an infinite
    // ping-pong. The FK is ON DELETE SET NULL, so this is a race, not a state.
    if (!data) return { kind: 'wait', detail: 'The invoice this payment settles could not be read' }
    if (!data.qbo_id) {
      return { kind: 'wait', detail: `Invoice ${data.invoice_number ?? data.id.slice(0, 8)} is not in QuickBooks yet` }
    }
    return { kind: 'invoice', id: data.id, label: data.invoice_number ?? data.id.slice(0, 8), qboId: data.qbo_id }
  }

  // Money that arrived on its own account - a deposit, a cheque against
  // nothing in particular. Oldest first, because that is how anybody applies
  // one: against what has been owed longest. created_at breaks the tie so
  // "oldest" is at least the same answer twice.
  const { data: open } = await db.from('client_invoices')
    .select('id, invoice_number, qbo_id, issue_date, created_at')
    .eq('project_id', p.project_id)
    .eq('status', 'sent')
    .not('qbo_id', 'is', null)
    .order('issue_date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(1)
  const hit = (open ?? [])[0]
  if (!hit?.qbo_id) return { kind: 'standalone' }
  return { kind: 'invoice', id: hit.id, label: hit.invoice_number ?? hit.id.slice(0, 8), qboId: hit.qbo_id }
}

/**
 * Money in, booked the right way for what it settles.
 *
 * If there is an unpaid invoice in QuickBooks for this project, the payment is
 * applied against it (reducing the receivable). If there is not - a deposit
 * taken before any invoice exists is the common case - it falls back to a
 * Sales Receipt, which is the honest record for money that settles nothing.
 *
 * Never both for the same money: that is the double-counting this whole model
 * change exists to avoid.
 */
export async function pushPaymentForProject(db: SupabaseClient, paymentId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: p } = await db.from('client_payments')
      .select('id, project_id, amount, paid_date, memo, method, qb_entered, qbo_id, client_invoice_id')
      .eq('id', paymentId).maybeSingle()
    if (!p) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    if (p.qbo_id) return { pushed: false, reason: 'already' }
    if (handEntered(p)) return HAND_ENTERED

    const settles = await settlementTarget(db, p)
    if (settles.kind === 'wait') return { pushed: false, reason: 'skipped', detail: settles.detail }
    if (settles.kind === 'standalone') return pushClientPayment(db, paymentId, ctx)
    const target = settles

    const { companyId, customerId, projectName } = await projectCompany(db, p.project_id)
    if (!companyId || !customerId) return pushClientPayment(db, paymentId, ctx)

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    if (!await claimForPush(db, 'client_payments', p.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const res = await qboFetch(conn, 'payment', {
        method: 'POST',
        body: JSON.stringify(appliedPaymentPayload(p, customerQboId, target.qboId, projectName, await methodIdFor(conn, (p as any).method, ctx))),
      })
      const qboId = res?.Payment?.Id
      await db.from('client_payments').update({
        qbo_id: qboId, qbo_synced_at: new Date().toISOString(), qb_entered: true, qbo_txn_type: 'payment',
      }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', qboId, `Applied to invoice ${target.label}`)
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'client_payments', p.id)
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, err?.message)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

// ── Customers ────────────────────────────────────────────────────────────────

/** The QBO Customer fields we own, from a SyteNav customer row. */
export function customerPayload(c: {
  name?: string | null; email?: string | null; phone?: string | null; billing_address?: string | null
}) {
  const payload: Record<string, unknown> = { DisplayName: c.name }
  if (c.email) payload.PrimaryEmailAddr = { Address: c.email }
  if (c.phone) payload.PrimaryPhone = { FreeFormNumber: c.phone }
  if (c.billing_address) payload.BillAddr = { Line1: c.billing_address }
  return payload
}

/**
 * Put a customer in QuickBooks, or update the one that is already there.
 *
 * Customers used to reach QuickBooks only as a SIDE EFFECT - created the first
 * time a payment or invoice needed something to attach to - or when somebody
 * remembered the Sync customers button. So the QuickBooks customer list lagged
 * the Directory, and an address corrected in SyteNav never reached the books.
 *
 * Nothing here is allowed to fail adding a customer: same never-throw,
 * time-capped contract as every other push.
 */
export async function pushCustomer(db: SupabaseClient, customerId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: c } = await db.from('customers')
      .select('id, gc_company_id, name, email, phone, billing_address, qbo_id')
      .eq('id', customerId).maybeSingle()
    if (!c) return { pushed: false, reason: 'skipped', detail: 'Customer not found' }
    if (!c.gc_company_id) return { pushed: false, reason: 'skipped', detail: 'Customer has no company' }

    const conn = await connectionFor(db, c.gc_company_id, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    // Already over there: update in place rather than create a second one.
    if (c.qbo_id) {
      return await budgeted((async (): Promise<PushResult> => {
        const cur = await qboFetch(conn, `customer/${c.qbo_id}`)
        const obj = cur?.Customer
        if (!obj?.Id) throw new Error('Customer no longer exists in QuickBooks')
        Object.assign(obj, customerPayload(c))
        await qboFetch(conn, 'customer', { method: 'POST', body: JSON.stringify(obj) })
        await db.from('customers').update({ qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
        await logRow(db, c.gc_company_id!, 'customer', c.id, 'success', c.qbo_id!, 'Details updated')
        return { pushed: true, qboId: c.qbo_id! }
      })()).catch(async (err: any) => {
        await logRow(db, c.gc_company_id!, 'customer', c.id, 'error', undefined, err?.message)
        return { pushed: false, reason: 'failed' as const, detail: err?.message }
      })
    }

    if (!await claimForPush(db, 'customers', c.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      const res = await qboFetch(conn, 'customer', {
        method: 'POST', body: JSON.stringify(customerPayload(c)),
      })
      const qboId = res?.Customer?.Id
      await db.from('customers').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
      await logRow(db, c.gc_company_id!, 'customer', c.id, 'success', qboId)
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'customers', c.id)
      await logRow(db, c.gc_company_id!, 'customer', c.id, 'error', undefined, err?.message)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * Void the QuickBooks Invoice behind a voided client invoice.
 *
 * Voided, not deleted: an accountant expects a voided document to stay in the
 * books with its number and a zero value, not to vanish. QuickBooks agrees -
 * `?operation=void` zeroes the lines and stamps it VOIDED, leaving the audit
 * trail intact.
 *
 * Without this, voiding here would leave the invoice OPEN over there, and
 * receivables would keep counting money nobody is being asked for.
 */
export async function voidClientInvoiceInQbo(db: SupabaseClient, billId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('client_invoices')
      .select('id, project_id, qbo_id').eq('id', billId).maybeSingle()
    if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks' }

    const { companyId } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `invoice/${inv.qbo_id}`)
      const obj = cur?.Invoice
      if (!obj?.Id) throw new Error('Invoice no longer exists in QuickBooks')
      await qboFetch(conn, 'invoice?operation=void', {
        method: 'POST',
        body: JSON.stringify({ Id: obj.Id, SyncToken: obj.SyncToken }),
      })
      await db.from('client_invoices').update({ qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'client_invoice', inv.id, 'success', inv.qbo_id!, 'Voided in QuickBooks')
      return { pushed: true, qboId: inv.qbo_id! }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'client_invoice', inv.id, 'error', undefined, `Void: ${err?.message}`)
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}
