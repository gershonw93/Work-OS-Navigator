import { SupabaseClient } from '@supabase/supabase-js'
import {
  Connection, getValidConnection, qboFetch, qboQuery,
  paymentMethodId,
  probeReferences, describeProbe, QBO_OBJECT_NOT_FOUND, type ReferenceRef,
} from '@/lib/quickbooks'
import { accountFor, depositField, type Choices } from '@/lib/qbo-accounts'

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
  /** The bank account bill payments come out of, resolved once per run. */
  bankAccountId?: string
  /** The company's chosen accounts (lib/qbo-accounts.ts), read once per run. */
  choices?: Choices
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

/**
 * A short leash for work that runs AFTER a push has already failed.
 *
 * The 8s budget above wraps the push itself; anything in the failure handler
 * sits outside it. Working out which reference QuickBooks rejected is worth a
 * few seconds and not one second more - it is a better error message, and a
 * better error message must never be what makes Record Payment hang.
 */
const DIAGNOSIS_BUDGET_MS = 3000
function briefly(p: Promise<string>, fallback: string): Promise<string> {
  return Promise.race([
    p.catch(() => fallback),
    new Promise<string>(resolve => setTimeout(() => resolve(fallback), DIAGNOSIS_BUDGET_MS)),
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

/**
 * One place decides how a memo reads, so push and refresh cannot drift.
 *
 * `note` is the escape hatch for something QuickBooks would not take as a
 * field. When it refuses a PaymentMethodRef there is nowhere structured left
 * to put "they paid by ACH", and losing it entirely is worse than writing it
 * in prose - the memo is the one field QuickBooks always accepts.
 */
export function composeMemo(
  projectName?: string | null,
  memo?: string | null,
  note?: string | null,
): string | undefined {
  return [projectName, memo].filter(Boolean).join(' - ')
    .concat(note ? (projectName || memo ? ` (${note})` : `(${note})`) : '') || undefined
}

/** The prose form of a payment method, for when the reference will not go. */
export function methodNote(method?: string | null): string | null {
  const m = String(method ?? '').trim()
  return m ? `paid by ${m}` : null
}

/** QBO caps a transaction reference at 21 characters, and truncates silently. */
const QBO_REF_MAX = 21

/**
 * The two fields that identify a payment in QuickBooks: Reference no. and memo.
 *
 * THE BUG THIS EXISTS FOR. SyteNav asked for "Memo / check #" in one box, so a
 * check number arrived as the MEMO and QuickBooks' Reference no. got
 * SN-25b82dff - our tracking id. Reference no. is the column a bookkeeper
 * matches against a bank statement; putting our id there and their check
 * number somewhere else is backwards.
 *
 * So: the payer's reference wins the reference field, exactly as a client
 * invoice sends the user's own INV-0002 rather than an SN- ref. When they gave
 * one, the SN- token moves into the memo so a record is still traceable; when
 * they did not, SN- takes the reference field so a record is never unmatchable.
 * Never both places - that is just noise in two columns.
 *
 * One composer for every payment path (Sales Receipt, applied Payment, and the
 * refresh that rewrites records already over there), because the refresh
 * hardcoding its own answer is precisely how it would overwrite a check number
 * with SN- the next time somebody pressed Update formatting.
 */
export function paymentIdentity(
  p: { id?: string; reference?: string | null; memo?: string | null },
  projectName?: string | null,
  note?: string | null,
): { ref: string | undefined; memo: string | undefined } {
  const own = String(p.reference ?? '').trim().slice(0, QBO_REF_MAX)
  const sn = p.id ? snRef(p.id) : undefined
  return own
    ? { ref: own, memo: composeMemo(projectName, [p.memo, sn].filter(Boolean).join(' · '), note) }
    : { ref: sn, memo: composeMemo(projectName, p.memo, note) }
}

export function composeBillDescription(trade?: string | null, projectName?: string | null): string {
  return [trade ?? 'Subcontractor work', projectName].filter(Boolean).join(' - ')
}

/** The payer's own reference (check number), or nothing - never our tracking id. */
export function ownReference(p: { reference?: string | null }): string | undefined {
  const own = String(p.reference ?? '').trim().slice(0, QBO_REF_MAX)
  return own || undefined
}

/** A Sales Receipt's own number: our tracking id, falling back to the composed ref. */
export function receiptDocNumber(p: { id?: string }, ref?: string): string | undefined {
  return p.id ? snRef(p.id) : ref
}

export function paymentPayload(
  p: { id?: string; amount: unknown; paid_date?: string | null; memo?: string | null; reference?: string | null },
  customerQboId: string,
  itemId: string,
  projectName?: string | null,
  methodQboId?: string | null,
  note?: string | null,
) {
  const id = paymentIdentity(p, projectName, note)
  return {
    CustomerRef: { value: customerQboId },
    TxnDate: ymd(p.paid_date),
    // How the money arrived - the column a bookkeeper reconciles a bank
    // statement against. Omitted entirely when unknown rather than guessed.
    ...(methodQboId ? { PaymentMethodRef: { value: methodQboId } } : {}),
    // A Sales Receipt has BOTH fields, and they are different columns: "Sales
    // Receipt no." (DocNumber) is the document's own number and "Reference
    // no." (PaymentRefNum) is the payer's - the check number. The first pilot
    // on a real company showed TEST-DEP-1 sitting in Sales Receipt no. with
    // Reference no. empty. So the payer's number goes to PaymentRefNum, and
    // DocNumber carries our tracking number, which is also what the duplicate
    // check searches on (unique per payment, unlike a check number).
    ...(receiptDocNumber(p, id.ref) ? { DocNumber: receiptDocNumber(p, id.ref) } : {}),
    ...(ownReference(p) ? { PaymentRefNum: ownReference(p) } : {}),
    // The memo answers "which job?" before it says anything else - the
    // customer name is already on the record, the project is what was missing.
    PrivateNote: id.memo,
    Line: [{
      DetailType: 'SalesItemLineDetail',
      Amount: Number(p.amount),
      SalesItemLineDetail: { ItemRef: { value: itemId } },
    }],
  }
}

/**
 * A Bill's "Bill no.": the bill's own number, the one on the sub's paperwork
 * and on the SyteNav screen. The first real pilot showed SN-6dd0f7bc there for
 * a bill SyteNav lists as INV-8F89-001 - a number nobody holding the paper can
 * search for. Our tracking id is only the fallback for a bill with no number.
 * It is also what the duplicate check matches, alongside vendor and amount.
 */
export function billDocNumber(inv: { id?: string; invoice_number?: string | null }): string | undefined {
  const own = String(inv.invoice_number ?? '').trim().slice(0, 21)
  return own || (inv.id ? snRef(inv.id) : undefined)
}

export function billPayload(
  inv: { id?: string; invoice_number?: string | null; amount: unknown; paid_at?: string | null; created_at?: string | null; trade?: string | null },
  vendorQboId: string,
  expenseAccountId: string,
  projectName?: string | null,
) {
  return {
    VendorRef: { value: vendorQboId },
    // The date money moved if it has, else the date the bill was raised.
    TxnDate: ymd(inv.paid_at) ?? ymd(inv.created_at),
    ...(billDocNumber(inv) ? { DocNumber: billDocNumber(inv) } : {}),
    Line: [{
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: Number(inv.amount),
      Description: composeBillDescription(inv.trade, projectName),
      AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
    }],
  }
}

/**
 * Money going OUT to a sub, applied against the Bill it settles.
 *
 * The exact mirror of appliedPaymentPayload on the receivable side. A Bill
 * says "owed"; a BillPayment linked to it says "paid". Without the second
 * record the payable sits open in QuickBooks forever, and A/P overstates by
 * every bill you have actually settled.
 *
 * QBO will not take a BillPayment without a PayType and an account to pay
 * from - there is nothing sensible for it to infer. SyteNav does not record
 * HOW a sub was paid, so Check is the honest default for construction, and
 * the bank account can be changed inside QuickBooks like every other default
 * this integration picks.
 */
export function billPaymentPayload(
  inv: { id?: string; invoice_number?: string | null; amount: unknown; paid_at?: string | null },
  vendorQboId: string,
  billQboId: string,
  bankAccountId: string,
  projectName?: string | null,
) {
  const amount = Number(inv.amount)
  return {
    VendorRef: { value: vendorQboId },
    TxnDate: ymd(inv.paid_at) ?? ymd(new Date().toISOString()),
    TotalAmt: amount,
    PayType: 'Check',
    // PrintStatus NotSet: the money has already gone. Left unsaid, QuickBooks
    // treats a Check-type payment as one waiting to be printed - the first real
    // pilot showed Ref no. "To print" with Print later ticked, the reference
    // hidden, and the payment sitting in the print-checks queue.
    CheckPayment: { BankAccountRef: { value: bankAccountId }, PrintStatus: 'NotSet' },
    // The sub's own invoice number, not an SN- ref - same reasoning as a
    // client invoice. They have a number; it is the one being reconciled.
    ...(inv.invoice_number ? { DocNumber: String(inv.invoice_number).slice(0, 21) } : {}),
    PrivateNote: composeMemo(projectName, inv.invoice_number ? `Bill ${inv.invoice_number}` : null),
    Line: [{
      Amount: amount,
      LinkedTxn: [{ TxnId: billQboId, TxnType: 'Bill' }],
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
 * A payment APPLIED against one or more invoices, rather than a standalone sale.
 *
 * This is the half that stops double-counting: once the sale exists in
 * QuickBooks as an Invoice, the money arriving must reduce that receivable,
 * not book a second sale.
 *
 * ONE CHEQUE, ONE PAYMENT, A LINE PER INVOICE. A client who pays two invoices
 * with one cheque made one deposit, and the bank statement shows one figure.
 * Two QuickBooks payments would be two records to match against it. So the
 * split rides as Lines on ONE Payment - which is exactly how QuickBooks itself
 * records it when you tick two invoices on Receive Payment - each Line applying
 * its share. TotalAmt is the cheque; the Lines add up to it, because
 * `allocationProblem` refuses a split that does not - UNLESS the payment is
 * held on account, when the Lines may add up to less (even to nothing) and
 * QuickBooks keeps the difference as the customer's unapplied credit, exactly
 * as Receive Payment does when you leave an amount unapplied.
 */
export function appliedPaymentPayload(
  p: { id?: string; amount: unknown; paid_date?: string | null; memo?: string | null; reference?: string | null },
  customerQboId: string,
  invoices: { qboId: string; amount: number }[],
  projectName?: string | null,
  methodQboId?: string | null,
  /** Set on the retry: the method goes in the memo because the ref would not go. */
  note?: string | null,
) {
  const ident = paymentIdentity(p, projectName, note)
  return {
    CustomerRef: { value: customerQboId },
    TxnDate: ymd(p.paid_date),
    TotalAmt: Number(p.amount),
    ...(methodQboId ? { PaymentMethodRef: { value: methodQboId } } : {}),
    // A Payment carries its reference in PaymentRefNum; DocNumber is the
    // Invoice/Sales Receipt field and means nothing on this entity, so the
    // SN- reference was being written into a field QuickBooks does not read.
    ...(ident.ref ? { PaymentRefNum: ident.ref } : {}),
    PrivateNote: ident.memo,
    Line: invoices.map(inv => ({
      Amount: Number(inv.amount),
      LinkedTxn: [{ TxnId: inv.qboId, TxnType: 'Invoice' }],
    })),
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * What a sync-log row says happened. It used to be hardcoded 'create', so a
 * void, a correction and a first push all read the same in the log - and a
 * failed void looked like a failed create of a record that was already there.
 */
export type SyncAction = 'create' | 'update' | 'void'

/**
 * One row of `quickbooks_sync_log`: the record, what was done, the QuickBooks
 * id, success or error, and the message. Every push, void and failure lands
 * here, which is what Settings > QuickBooks > Recent sync activity reads.
 *
 * `label` is the record's own name ("INV-0004", "Bill 1032"). A void on DELETE
 * runs after nothing is left to look the id up in, so without the label the
 * log could only ever say "bill" about a bill that no longer exists.
 */
async function logRow(
  db: SupabaseClient, companyId: string,
  entity_type: string, entity_id: string, status: string, qbo_id?: string, message?: string,
  action: SyncAction = 'create', label?: string | null,
) {
  try {
    const row: Record<string, unknown> = { company_id: companyId, entity_type, entity_id, action, status, qbo_id, message }
    if (label) row.record_label = label
    const { error } = await db.from('quickbooks_sync_log').insert(row)
    // A database without migration 150 must still log the event itself.
    if (error?.code === '42703' && label) {
      delete row.record_label
      await db.from('quickbooks_sync_log').insert(row)
    }
  } catch { /* the log must never take the push down with it */ }
}

/**
 * A sub's vendor id IN THIS FILE. `companies.qbo_vendor_id` sat on the sub's
 * own row, which every GC they work for shares - so the id one GC's push
 * created in their QuickBooks was handed to the next GC's QuickBooks, where it
 * names some other vendor or nothing. Keyed on the file (migration 151).
 */
export async function linkedVendorId(db: SupabaseClient, conn: Pick<Connection, 'realm_id' | 'environment'>, vendorCompanyId: string): Promise<string | null> {
  const { data } = await db.from('quickbooks_vendor_links').select('qbo_vendor_id')
    .eq('realm_id', conn.realm_id).eq('environment', conn.environment ?? 'sandbox')
    .eq('vendor_company_id', vendorCompanyId).maybeSingle()
  return (data as any)?.qbo_vendor_id ?? null
}

export async function linkVendor(db: SupabaseClient, conn: Pick<Connection, 'realm_id' | 'environment'>, vendorCompanyId: string, qboVendorId: string | null): Promise<void> {
  const key = { realm_id: conn.realm_id, environment: conn.environment ?? 'sandbox', vendor_company_id: vendorCompanyId }
  if (qboVendorId) {
    await db.from('quickbooks_vendor_links').upsert({ ...key, qbo_vendor_id: qboVendorId, synced_at: new Date().toISOString() },
      { onConflict: 'realm_id,environment,vendor_company_id' })
  } else {
    await db.from('quickbooks_vendor_links').delete()
      .eq('realm_id', key.realm_id).eq('environment', key.environment).eq('vendor_company_id', vendorCompanyId)
  }
}

/** QBO quotes a string literal with single quotes; one inside a name is escaped. */
export function qboLiteral(v: string): string {
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/**
 * The vendor or customer QuickBooks already holds under this exact name, if
 * any. A real file already has most of a GC's subs and clients - the
 * bookkeeper put them there - and QuickBooks refuses a second record with the
 * same display name (6240), so creating blindly fails on the first push to a
 * production company. Adopting the existing one is also what the bookkeeper
 * wants: one vendor, not "ABC Plumbing" and "ABC Plumbing (1)".
 */
export async function existingNamedId(conn: Connection, entity: 'Vendor' | 'Customer', name: string): Promise<string | null> {
  const n = String(name ?? '').trim()
  if (!n) return null
  try {
    const q = await qboQuery(conn, `select Id from ${entity} where DisplayName = ${qboLiteral(n)} and Active = true`)
    return q?.[entity]?.[0]?.Id ?? null
  } catch {
    return null
  }
}

/** Create (or adopt) the sub as a Vendor in the connected file. Shared by the push and the Sync subs button. */
export async function createOrAdoptVendor(
  db: SupabaseClient, conn: Connection,
  co: { id: string; name: string; contact_email?: string | null; phone?: string | null; address?: string | null },
): Promise<{ qboId: string; adopted: boolean }> {
  const existing = await existingNamedId(conn, 'Vendor', co.name)
  if (existing) {
    await linkVendor(db, conn, co.id, existing)
    return { qboId: existing, adopted: true }
  }
  const payload: any = { DisplayName: co.name }
  if (co.contact_email) payload.PrimaryEmailAddr = { Address: co.contact_email }
  if (co.phone) payload.PrimaryPhone = { FreeFormNumber: co.phone }
  if (co.address) payload.BillAddr = { Line1: co.address }
  const res = await qboFetch(conn, 'vendor', { method: 'POST', body: JSON.stringify(payload) })
  const qboId = res?.Vendor?.Id
  await linkVendor(db, conn, co.id, qboId)
  return { qboId, adopted: false }
}

async function ensureVendorId(db: SupabaseClient, conn: Connection, companyId: string, gcCompanyId: string): Promise<string> {
  const linked = await linkedVendorId(db, conn, companyId)
  if (linked) return linked
  const { data: co } = await db.from('companies')
    .select('id, name, contact_email, phone, address').eq('id', companyId).single()
  if (!co) throw new Error('Vendor company not found')
  const { qboId, adopted } = await createOrAdoptVendor(db, conn, co as any)
  await logRow(db, gcCompanyId, 'vendor', co.id, 'success', qboId,
    adopted ? 'Matched to the vendor of the same name already in QuickBooks' : 'Auto-created for a bill', 'create', (co as any).name)
  return qboId
}

async function ensureCustomerId(db: SupabaseClient, conn: Connection, customerId: string, gcCompanyId: string): Promise<string> {
  const { data: c } = await db.from('customers')
    .select('id, name, contact_name, email, phone, billing_address, qbo_id').eq('id', customerId).single()
  if (!c) throw new Error('Customer not found')
  if (c.qbo_id) return c.qbo_id
  // A real file already has most of a GC's clients - adopt rather than refuse
  // on 6240 (duplicate name) or, worse, make "Smith (1)".
  const existing = await existingNamedId(conn, 'Customer', c.name)
  let qboId = existing
  if (!qboId) {
    const payload: any = { DisplayName: c.name }
    if (c.email) payload.PrimaryEmailAddr = { Address: c.email }
    if (c.phone) payload.PrimaryPhone = { FreeFormNumber: c.phone }
    if (c.billing_address) payload.BillAddr = { Line1: c.billing_address }
    const res = await qboFetch(conn, 'customer', { method: 'POST', body: JSON.stringify(payload) })
    qboId = res?.Customer?.Id
  }
  await db.from('customers').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
  await logRow(db, gcCompanyId, 'customer', c.id, 'success', qboId ?? undefined,
    existing ? 'Matched to the customer of the same name already in QuickBooks' : 'Auto-created for a payment', 'create', c.name)
  return qboId!
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

async function claimForPush(
  db: SupabaseClient, table: string, id: string,
  // A row can hold TWO QuickBooks records: a sub bill is a Bill and, once
  // paid, a BillPayment. They need separate ids and separate claims, or the
  // guard that stops a double-press cannot say which of the two it is holding.
  idCol = 'qbo_id', claimCol = 'qbo_claimed_at',
): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS).toISOString()
  const { data } = await db
    .from(table)
    .update({ [claimCol]: new Date().toISOString() })
    .eq('id', id)
    .is(idCol, null)
    .or(`${claimCol}.is.null,${claimCol}.lt.${staleBefore}`)
    .select('id')
  return Array.isArray(data) ? data.length > 0 : !!data
}

/** Hand the claim back so a failed push can be retried immediately. */
async function releaseClaim(
  db: SupabaseClient, table: string, id: string, claimCol = 'qbo_claimed_at',
): Promise<void> {
  try {
    await db.from(table).update({ [claimCol]: null }).eq('id', id)
  } catch { /* a stuck claim expires on its own; never fail the caller for this */ }
}

// ── The duplicate check: document number + party + amount ──────────────────
//
// Run before EVERY create. The claim (above) stops two SyteNav requests racing
// each other; this covers what the claim cannot see - a push that created the
// record over there and died before writing qbo_id back (the retry would make
// a second one), and a record the bookkeeper already keyed in by hand.
//
// ALL THREE MUST MATCH. The invoice check this replaces adopted on the number
// alone, which was harmless against a sandbox and wrong against real books: a
// GC's QuickBooks already has its own INV-0004 for some other client, and
// adopting it would apply this client's money to that stranger's receivable.
// A record that only shares the number is not a duplicate - it is pushed, and
// the log says the number is used twice. A voided record never matches.

export type DupEntity = 'Invoice' | 'Bill' | 'BillPayment' | 'SalesReceipt' | 'Payment'

export interface DupProbe {
  entity: DupEntity
  /** DocNumber (PaymentRefNum on a Payment). */
  doc: string | null | undefined
  partyId: string
  amount: number
  /** TxnDate, YYYY-MM-DD - how a Payment is looked up, since its reference is not queryable. */
  txnDate?: string | null
}

const PARTY_REF: Record<DupEntity, 'CustomerRef' | 'VendorRef'> = {
  Invoice: 'CustomerRef', SalesReceipt: 'CustomerRef', Payment: 'CustomerRef', Bill: 'VendorRef', BillPayment: 'VendorRef',
}
const cents = (n: unknown) => Math.round(Number(n ?? NaN) * 100)
const docOf = (entity: DupEntity, row: any) => String((entity === 'Payment' ? row?.PaymentRefNum : row?.DocNumber) ?? '').trim().toLowerCase()

/**
 * Pure: which of these rows is the SAME document - or, failing that, whether
 * one merely shares its number. Exported for the pin.
 */
export function matchDuplicate(rows: any[], p: DupProbe): { id: string | null; numberClash: boolean } {
  const doc = String(p.doc ?? '').trim().toLowerCase()
  if (!doc) return { id: null, numberClash: false }
  const live = (rows ?? []).filter(r => r?.Id && !isVoidedInQbo(r) && docOf(p.entity, r) === doc)
  const same = live.find(r => String(r?.[PARTY_REF[p.entity]]?.value ?? '') === String(p.partyId) && cents(r?.TotalAmt) === cents(p.amount))
  return { id: same ? String(same.Id) : null, numberClash: !same && live.length > 0 }
}

/** The query that finds the candidates. Pure, so the shape is pinned. */
export function duplicateQuery(p: DupProbe): string | null {
  if (!String(p.doc ?? '').trim()) return null
  if (p.entity === 'Payment') {
    if (!p.txnDate) return null
    return `select * from Payment where CustomerRef = ${qboLiteral(p.partyId)} and TxnDate = ${qboLiteral(p.txnDate)}`
  }
  if (p.entity === 'BillPayment') {
    if (!p.txnDate) return null
    return `select * from BillPayment where VendorRef = ${qboLiteral(p.partyId)} and TxnDate = ${qboLiteral(p.txnDate)}`
  }
  return `select * from ${p.entity} where DocNumber = ${qboLiteral(String(p.doc).trim())}`
}

/**
 * Ask QuickBooks. A check that could not run does NOT stop the push - the
 * money is the work - but it is never silent either: `note` goes into the log
 * line, so "pushed, unchecked" reads differently from "pushed, checked".
 */
export async function findDuplicate(conn: Connection, p: DupProbe): Promise<{ id: string | null; note: string | null }> {
  const sql = duplicateQuery(p)
  if (!sql) return { id: null, note: 'duplicate check skipped - no number or date to look it up by' }
  try {
    const q = await qboQuery(conn, sql)
    const m = matchDuplicate(q?.[p.entity] ?? [], p)
    if (m.id) return { id: m.id, note: `matched ${p.entity} ${m.id} already in QuickBooks (same number, ${PARTY_REF[p.entity] === 'VendorRef' ? 'vendor' : 'customer'} and amount) - linked, not created again` }
    return { id: null, note: m.numberClash ? `QuickBooks already has another ${p.entity} numbered ${p.doc} for a different ${PARTY_REF[p.entity] === 'VendorRef' ? 'vendor' : 'customer'} or amount - this one was added beside it` : null }
  } catch (err: any) {
    return { id: null, note: `duplicate check could not run (${err?.message ?? 'unknown'})` }
  }
}

const withNote = (base: string | undefined, note: string | null) =>
  [base, note].filter(Boolean).join(' - ') || undefined

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
      .select('id, project_id, amount, paid_date, memo, reference, method, qb_entered, qbo_id, on_account')
      .eq('id', paymentId).maybeSingle()
    if (!p) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    if (p.qbo_id) return { pushed: false, reason: 'already' }
    if (handEntered(p)) return HAND_ENTERED
    // Belt and braces. The backlog sync used to call this function directly
    // for every unsynced payment, which would have booked a second sale for
    // money settling an invoice already over there. The split lives in
    // client_payment_allocations; `client_invoice_id` is the old single link
    // and nothing reads it any more.
    const { count: allocated, error: allocError } = await db.from('client_payment_allocations')
      .select('id', { count: 'exact', head: true }).eq('payment_id', paymentId)
    // Unread is not "settles nothing": a Sales Receipt for money that pays an
    // invoice is the double-count, so a failed read books nothing this time.
    if (allocError) return { pushed: false, reason: 'skipped', detail: 'Could not read which invoices this payment settles' }
    // Money held ON ACCOUNT is the client's credit, not a sale: it is a
    // Payment with an unapplied remainder, never a Sales Receipt.
    if ((allocated ?? 0) > 0 || (p as any).on_account) return pushPaymentForProject(db, paymentId, ctx)

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
      // The item the company chose on Settings > QuickBooks, or the first
      // Service item when nobody has (lib/qbo-accounts.ts).
      if (!ctx?.itemId) {
        if (!ctx) ctx = { conn }
        ctx.itemId = (await accountFor(db, conn, 'invoice_item', ctx))!
      }
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const payload = {
        ...paymentPayload(p, customerQboId, ctx!.itemId!, projectName, await methodIdFor(conn, (p as any).method, ctx)),
        // Where the money lands, if the company chose; QuickBooks' own default otherwise.
        ...depositField(await accountFor(db, conn, 'payment_deposit', ctx)),
      } as any
      const dup = await findDuplicate(conn, { entity: 'SalesReceipt', doc: payload.DocNumber, partyId: customerQboId, amount: Number(p.amount) })
      const res = dup.id ? { SalesReceipt: { Id: dup.id } } : await qboFetch(conn, 'salesreceipt', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const qboId = res?.SalesReceipt?.Id
      // qb_entered too: the hand-tick means "it is in QuickBooks", and now it is.
      await db.from('client_payments').update({
        qbo_id: qboId, qbo_synced_at: new Date().toISOString(), qb_entered: true,
        // Label which model wrote it, so nobody has to infer it later.
        qbo_txn_type: 'sales_receipt',
      }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', qboId, withNote(undefined, dup.note))
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
      .select('id, project_id, invoice_number, amount, status, created_at, paid_at, qbo_id, subcontracts(company_id, trade)')
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
      // The account the company chose for sub bills, or the first COGS /
      // Expense account when nobody has.
      if (!ctx?.expenseAccountId) {
        if (!ctx) ctx = { conn }
        ctx.expenseAccountId = (await accountFor(db, conn, 'bill_expense', ctx))!
      }
      const vendorQboId = await ensureVendorId(db, conn, vendorCompanyId, companyId)
      const payload = billPayload({ ...inv, trade: (inv.subcontracts as any)?.trade }, vendorQboId, ctx!.expenseAccountId!, projectName) as any
      const dup = await findDuplicate(conn, { entity: 'Bill', doc: payload.DocNumber, partyId: vendorQboId, amount: Number(inv.amount) })
      const res = dup.id ? { Bill: { Id: dup.id } } : await qboFetch(conn, 'bill', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const qboId = res?.Bill?.Id
      await db.from('invoices').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'success', qboId, withNote(undefined, dup.note))
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

/**
 * A PAID sub bill -> QBO BillPayment, applied against the Bill it settles.
 *
 * THE GAP THIS CLOSES. Approving a sub's bill created the Bill - money owed.
 * Marking it paid recorded nothing over there, so the payable stayed open in
 * QuickBooks after the cash had gone out and A/P overstated by every bill you
 * had settled. Exactly the mirror of the receivable bug fixed in #323: there,
 * an invoice reached QuickBooks and the payment settling it did not.
 *
 * Two records on one row, so two ids and two claims. Never throws.
 */
export async function pushBillPayment(db: SupabaseClient, invoiceId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv, error } = await db.from('invoices')
      .select('id, project_id, invoice_number, amount, status, paid_at, qbo_id, qbo_payment_id, subcontracts(company_id)')
      .eq('id', invoiceId).maybeSingle()

    // Migration 089 adds qbo_payment_id. Until it lands, do NOTHING: there is
    // nowhere to record that the payment happened, so every run would push the
    // same money again and QuickBooks would fill up with duplicate payments.
    // Silence is the only safe answer to a missing column here.
    if (error?.code === '42703') {
      return { pushed: false, reason: 'skipped', detail: 'Bill payments are not set up on this database yet' }
    }
    if (!inv) return { pushed: false, reason: 'skipped', detail: 'Bill not found' }
    if (inv.qbo_payment_id) return { pushed: false, reason: 'already' }
    if (String(inv.status) !== 'paid') {
      return { pushed: false, reason: 'skipped', detail: `Status ${inv.status} is not paid` }
    }
    // No Bill over there means nothing to settle. A BillPayment linked to
    // nothing would be money leaving with no payable behind it.
    if (!inv.qbo_id) {
      return { pushed: false, reason: 'skipped', detail: 'The bill itself has not reached QuickBooks yet' }
    }
    if (!Number(inv.amount)) return { pushed: false, reason: 'skipped', detail: 'Bill has no amount' }

    const { companyId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const vendorCompanyId = (inv.subcontracts as any)?.company_id
    if (!vendorCompanyId) return { pushed: false, reason: 'skipped', detail: 'Bill has no subcontractor' }

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    if (!await claimForPush(db, 'invoices', inv.id, 'qbo_payment_id', 'qbo_payment_claimed_at')) {
      return { pushed: false, reason: 'already' }
    }

    return await budgeted((async (): Promise<PushResult> => {
      // The bank account the company chose to pay bills from, or the first
      // Bank account when nobody has - which, in a real company with payroll
      // and operating accounts, is whichever QuickBooks happens to list first.
      if (!ctx?.bankAccountId) {
        if (!ctx) ctx = { conn }
        ctx.bankAccountId = (await accountFor(db, conn, 'bill_payment_bank', ctx))!
      }
      const vendorQboId = await ensureVendorId(db, conn, vendorCompanyId, companyId)
      const payload = billPaymentPayload(inv as any, vendorQboId, inv.qbo_id!, ctx!.bankAccountId!, projectName) as any
      const dup = await findDuplicate(conn, { entity: 'BillPayment', doc: payload.DocNumber, partyId: vendorQboId, amount: Number(payload.TotalAmt), txnDate: payload.TxnDate })
      const res = dup.id ? { BillPayment: { Id: dup.id } } : await qboFetch(conn, 'billpayment', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const qboId = res?.BillPayment?.Id
      await db.from('invoices').update({
        qbo_payment_id: qboId, qbo_payment_synced_at: new Date().toISOString(),
      }).eq('id', inv.id)
      await logRow(db, companyId, 'bill_payment', inv.id, 'success', qboId, withNote(`Settled bill ${inv.qbo_id}`, dup.note))
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'invoices', inv.id, 'qbo_payment_claimed_at')
      const detail = err?.code === QBO_OBJECT_NOT_FOUND
        ? `${err.message} - ${await briefly(
          diagnoseBillPaymentRefs(db, conn, vendorCompanyId, inv.qbo_id!, ctx?.bankAccountId),
          'could not reach QuickBooks to work out which reference it rejected',
        )}`
        : err?.message
      await logRow(db, companyId, 'bill_payment', inv.id, 'error', undefined, detail)
      return { pushed: false, reason: 'failed' as const, detail }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/** Same idea as diagnosePaymentRefs, for the money-out side. Never throws. */
async function diagnoseBillPaymentRefs(
  db: SupabaseClient,
  conn: Connection,
  vendorCompanyId: string,
  billQboId: string,
  bankAccountId?: string,
): Promise<string> {
  try {
    const vendorId = await linkedVendorId(db, conn, vendorCompanyId)
    const refs: ReferenceRef[] = []
    if (vendorId) {
      refs.push({
        label: `vendor ${vendorId}`,
        path: `vendor/${vendorId}`,
        inspect: (o: any) => o?.Active === false ? 'the vendor is inactive in QuickBooks' : null,
      })
    }
    refs.push({
      label: `bill ${billQboId}`,
      path: `bill/${billQboId}`,
      inspect: (o: any) => Number(o?.Balance ?? 0) === 0
        ? 'the bill has a zero balance in QuickBooks - already paid or voided there'
        : null,
    })
    // The bank account is the company's choice now (lib/qbo-accounts.ts), and
    // a chosen account made inactive since is a 610 like any other.
    if (bankAccountId) refs.push({ label: `bank account ${bankAccountId}`, path: `account/${bankAccountId}`,
      inspect: (o: any) => o?.Active === false ? 'the bank account chosen for bill payments is inactive in QuickBooks' : null })
    const probes = await probeReferences(conn, refs)
    // A vendor id QuickBooks does not have fails identically forever. Clear it
    // so the next push re-creates - MISSING only, never merely inactive.
    if (vendorId && probes.find(x => x.label === `vendor ${vendorId}`)?.missing) {
      await linkVendor(db, conn, vendorCompanyId, null)
    }
    return describeProbe(probes)
  } catch (err: any) {
    return `could not work out which reference QuickBooks rejected (${err?.message ?? 'unknown'})`
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
      .select('id, project_id, memo, reference, method, qbo_id, qbo_txn_type').eq('id', paymentId).maybeSingle()
    if (!p?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet' }

    const { companyId, projectName } = await projectCompany(db, p.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    // A payment row is one of two DIFFERENT QuickBooks entities, and this
    // assumed every one was a Sales Receipt. Since money started applying
    // against invoices, some are Payments - so Update formatting fetched
    // salesreceipt/294, got nothing, and reported the record as gone.
    // qbo_txn_type says which; legacy rows predate it and are all receipts.
    const applied = (p as any).qbo_txn_type === 'payment'
    const entity = applied ? 'payment' : 'salesreceipt'
    const key = applied ? 'Payment' : 'SalesReceipt'

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `${entity}/${p.qbo_id}`)
      const obj = cur?.[key]
      if (!obj?.Id) throw new Error('Record no longer exists in QuickBooks')
      // Same composer the push uses. Hardcoding snRef here is how a check
      // number the user typed would be overwritten with our tracking id the
      // next time somebody pressed Update formatting.
      const ident = paymentIdentity(p, projectName)
      obj.PrivateNote = ident.memo ?? ''
      // A Payment's reference field is PaymentRefNum; DocNumber belongs to the
      // Sales Receipt. Writing the wrong one silently does nothing.
      // A Sales Receipt carries both: the payer's number in PaymentRefNum,
      // ours in DocNumber (see paymentPayload).
      if (applied) {
        if (ident.ref) obj.PaymentRefNum = ident.ref
      } else {
        const own = ownReference(p)
        if (own) obj.PaymentRefNum = own
        const doc = receiptDocNumber(p, ident.ref)
        if (doc) obj.DocNumber = doc
      }
      // Backfill how the money arrived onto records pushed before methods
      // were carried at all. Only set it - never blank an existing one, which
      // could be something a bookkeeper chose inside QuickBooks.
      const mid = await methodIdFor(conn, (p as any).method, ctx)
      if (mid) obj.PaymentMethodRef = { value: mid }
      await qboFetch(conn, entity, { method: 'POST', body: JSON.stringify(obj) })
      await db.from('client_payments').update({ qbo_synced_at: new Date().toISOString() }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', p.qbo_id, 'Formatting refreshed', 'update')
      return { pushed: true, qboId: p.qbo_id }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, `Refresh: ${err?.message}`, 'update')
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
      .select('id, project_id, invoice_number, qbo_id, subcontracts(trade)').eq('id', invoiceId).maybeSingle()
    if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet' }

    const { companyId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `bill/${inv.qbo_id}`)
      const obj = cur?.Bill
      if (!obj?.Id) throw new Error('Record no longer exists in QuickBooks')
      obj.DocNumber = billDocNumber(inv)
      // Only retitle the expense line this push wrote; anything a bookkeeper
      // added by hand in QBO is not ours to rename.
      const line = (obj.Line ?? []).find((l: any) => l.DetailType === 'AccountBasedExpenseLineDetail')
      if (line) line.Description = composeBillDescription((inv.subcontracts as any)?.trade, projectName)
      await qboFetch(conn, 'bill', { method: 'POST', body: JSON.stringify(obj) })
      await db.from('invoices').update({ qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'success', inv.qbo_id, 'Formatting refreshed', 'update')
      return { pushed: true, qboId: inv.qbo_id }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'bill', inv.id, 'error', undefined, `Refresh: ${err?.message}`, 'update')
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
      // The item the company chose on Settings > QuickBooks, or the first
      // Service item when nobody has (lib/qbo-accounts.ts).
      if (!ctx?.itemId) {
        if (!ctx) ctx = { conn }
        ctx.itemId = (await accountFor(db, conn, 'invoice_item', ctx))!
      }
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const payload = clientInvoicePayload(inv, lines, customerQboId, ctx!.itemId!, projectName) as any
      // Already over there - same number, same customer, same total? Adopt it
      // (a push that created and died before writing qbo_id back). The number
      // alone is NOT enough: see findDuplicate.
      const total = (payload.Line ?? []).reduce((sum: number, l: any) => sum + Number(l?.Amount ?? 0), 0)
      const dup = await findDuplicate(conn, { entity: 'Invoice', doc: payload.DocNumber, partyId: customerQboId, amount: total })
      const res = dup.id ? { Invoice: { Id: dup.id } } : await qboFetch(conn, 'invoice', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const qboId = res?.Invoice?.Id
      await db.from('client_invoices').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'client_invoice', inv.id, 'success', qboId, withNote(undefined, dup.note), 'create', inv.invoice_number)
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
 * Which receivables a payment settles, if any.
 *
 * THE BUG THIS EXISTS FOR. This used to be a guess: "the oldest invoice still
 * sent". Issue three invoices on one day and every one of them has the same
 * issue_date, so "oldest" is whichever row Postgres felt like returning first
 * - the $37,224 recorded against INV-0004 was on its way to settling INV-0002.
 * But nobody was guessing at the keyboard: they recorded the payment AGAINST
 * an invoice, or several. That split is stored in client_payment_allocations,
 * so the books settle the invoices the human pointed at, by the amounts they
 * gave.
 *
 * The third outcome is the one that stops a double-count. A payment applied to
 * an invoice that has NOT reached QuickBooks yet must book nothing at all -
 * not even its share of the invoices that HAVE: falling back to a Sales
 * Receipt would record the sale, and then the invoice would arrive and record
 * it again; booking half the cheque leaves the other half with nowhere to go.
 */
interface SettlementLink { id: string; label: string; qboId: string; amount: number }
type Settlement =
  | { kind: 'invoices'; links: SettlementLink[] }
  | { kind: 'standalone' }
  | { kind: 'wait'; detail: string }

async function settlementTarget(
  db: SupabaseClient,
  p: { id: string; project_id: string; amount: unknown; on_account?: boolean | null },
): Promise<Settlement> {
  const { data: shares, error } = await db.from('client_payment_allocations')
    .select('client_invoice_id, amount, client_invoices(id, invoice_number, qbo_id)')
    .eq('payment_id', p.id)
  // Not 'standalone': a read that failed is not a payment that settles nothing,
  // and booking it as a Sales Receipt is the double-count.
  if (error) return { kind: 'wait', detail: 'The invoices this payment settles could not be read' }

  if ((shares ?? []).length) {
    const links: SettlementLink[] = []
    for (const s of (shares ?? []) as any[]) {
      const inv = s.client_invoices
      if (!inv) return { kind: 'wait', detail: 'An invoice this payment settles could not be read' }
      const label = inv.invoice_number ?? String(inv.id).slice(0, 8)
      if (!inv.qbo_id) return { kind: 'wait', detail: `Invoice ${label} is not in QuickBooks yet` }
      links.push({ id: inv.id, label, qboId: inv.qbo_id, amount: Number(s.amount) })
    }
    return { kind: 'invoices', links }
  }

  // HELD ON ACCOUNT and applied to nothing yet: a Payment with no lines, the
  // whole amount sitting as the customer's credit in QuickBooks. NOT the
  // oldest-open guess below - the person recording it said "keep this as
  // credit", which is the opposite of "apply it to whatever is oldest".
  if (p.on_account) return { kind: 'invoices', links: [] }

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
  return {
    kind: 'invoices',
    links: [{ id: hit.id, label: hit.invoice_number ?? hit.id.slice(0, 8), qboId: hit.qbo_id, amount: Number(p.amount) }],
  }
}

/**
 * Ask QuickBooks about every reference we just sent it, and say which one it
 * cannot use.
 *
 * Three payments failed with the identical sentence - "Object Not Found:
 * Something you're trying to use has been made inactive. Check the fields with
 * accounts, customers, items, vendors or employees" - which lists five kinds of
 * field and names none of them. The information needed to answer that was on
 * our side the whole time: we know exactly which ids we sent.
 *
 * Never throws and never blocks the happy path: it only runs after a 610.
 */
async function diagnosePaymentRefs(
  db: SupabaseClient,
  conn: Connection,
  customerId: string,
  targets: { label: string; qboId: string }[],
  method: string | null | undefined,
  ctx?: PushContext,
): Promise<string> {
  try {
    const { data: c } = await db.from('customers').select('qbo_id').eq('id', customerId).maybeSingle()
    const methodQboId = await methodIdFor(conn, method, ctx).catch(() => null)

    const refs: ReferenceRef[] = []
    if (c?.qbo_id) {
      refs.push({
        label: `customer ${c.qbo_id}`,
        path: `customer/${c.qbo_id}`,
        inspect: (o: any) => o?.Active === false ? 'the customer is inactive in QuickBooks' : null,
      })
    }
    for (const target of targets) refs.push({
      label: `invoice ${target.qboId} (${target.label})`,
      path: `invoice/${target.qboId}`,
      inspect: (o: any) => {
        // A payment cannot settle an invoice that owes nothing. Voided
        // invoices read as a zero balance, which is why this is worth saying
        // out loud rather than inferring from the amount.
        if (Number(o?.Balance ?? 0) === 0) return 'the invoice has a zero balance in QuickBooks - voided, or already settled there'
        return null
      },
    })
    if (methodQboId) {
      refs.push({ label: `payment method ${methodQboId} (${method})`, path: `paymentmethod/${methodQboId}`,
        inspect: (o: any) => o?.Active === false ? 'the payment method is inactive in QuickBooks' : null })
    }
    const depositId = ctx?.choices?.payment_deposit?.id
    if (depositId) refs.push({ label: `deposit account ${depositId}`, path: `account/${depositId}`,
      inspect: (o: any) => o?.Active === false ? 'the account chosen for client payment deposits is inactive in QuickBooks' : null })

    const probes = await probeReferences(conn, refs)

    // A cached id pointing at a record QuickBooks does not have fails exactly
    // the same way forever, on every retry, with no way out. Forget it, and the
    // next push creates the customer properly.
    //
    // MISSING only, never merely inactive: re-creating an inactive customer
    // would leave two of them with the same name, which is a worse mess than
    // the one being fixed.
    if (c?.qbo_id && probes.find(x => x.label === `customer ${c.qbo_id}`)?.missing) {
      await db.from('customers').update({ qbo_id: null, qbo_synced_at: null }).eq('id', customerId)
    }

    return describeProbe(probes)
  } catch (err: any) {
    return `could not work out which reference QuickBooks rejected (${err?.message ?? 'unknown'})`
  }
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
  // A SHARE OF A CHEQUE SPLIT ACROSS HOUSES goes across with its cheque, not on
  // its own - so the backlog sync, which walks payments one by one, does the
  // right thing without knowing groups exist.
  const { data: g } = await db.from('client_payments').select('payment_group_id').eq('id', paymentId).maybeSingle()
  if ((g as any)?.payment_group_id) return pushPaymentGroup(db, (g as any).payment_group_id, ctx)
  return pushPaymentRow(db, paymentId, ctx)
}

async function pushPaymentRow(db: SupabaseClient, paymentId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: p } = await db.from('client_payments')
      .select('id, project_id, amount, paid_date, memo, reference, method, qb_entered, qbo_id, on_account')
      .eq('id', paymentId).maybeSingle()
    if (!p) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    if (p.qbo_id) return { pushed: false, reason: 'already' }
    if (handEntered(p)) return HAND_ENTERED

    const settles = await settlementTarget(db, p)
    if (settles.kind === 'wait') return { pushed: false, reason: 'skipped', detail: settles.detail }
    if (settles.kind === 'standalone') return pushClientPayment(db, paymentId, ctx)
    const targets = settles.links
    const applied = targets.map(t => (targets.length > 1 ? `${t.label} ($${t.amount.toLocaleString('en-US')})` : t.label)).join(', ')

    const { companyId, customerId, projectName } = await projectCompany(db, p.project_id)
    if (!companyId || !customerId) return pushClientPayment(db, paymentId, ctx)

    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    if (!await claimForPush(db, 'client_payments', p.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      const customerQboId = await ensureCustomerId(db, conn, customerId, companyId)
      const methodQboId = await methodIdFor(conn, (p as any).method, ctx)

      if (!ctx) ctx = { conn }
      const deposit = depositField(await accountFor(db, conn, 'payment_deposit', ctx))
      const post = (mid: string | null, note: string | null) => qboFetch(conn, 'payment', {
        method: 'POST',
        body: JSON.stringify({ ...appliedPaymentPayload(p, customerQboId, targets, projectName, mid, note), ...deposit }),
      })

      const probe = appliedPaymentPayload(p, customerQboId, targets, projectName, methodQboId, null) as any
      const dup = await findDuplicate(conn, { entity: 'Payment', doc: probe.PaymentRefNum, partyId: customerQboId, amount: Number(p.amount), txnDate: probe.TxnDate })
      let res: any
      let droppedMethod = false
      try {
        res = dup.id ? { Payment: { Id: dup.id } } : await post(methodQboId, null)
      } catch (err: any) {
        // THE MONEY MATTERS MORE THAN THE COLUMN. QuickBooks answers a bad
        // reference with 610 and will not say which one, so drop the only
        // OPTIONAL reference we send and try once more - the method moves into
        // the memo, where nothing can refuse it. If this succeeds we have both
        // settled the invoice and proved what QuickBooks was rejecting.
        //
        // Only worth doing if we actually sent a method; otherwise there is
        // nothing to drop and the retry is a wasted call.
        if (err?.code !== QBO_OBJECT_NOT_FOUND || !methodQboId) throw err
        res = await post(null, methodNote((p as any).method))
        droppedMethod = true
      }

      const qboId = res?.Payment?.Id
      await db.from('client_payments').update({
        qbo_id: qboId, qbo_synced_at: new Date().toISOString(), qb_entered: true, qbo_txn_type: 'payment',
      }).eq('id', p.id)
      const how = droppedMethod
        ? `${targets.length ? `Applied to invoice${targets.length > 1 ? 's' : ''} ${applied}` : 'Held as credit on account'}. QuickBooks refused payment method "${(p as any).method}" (id ${methodQboId}), so it is written in the memo instead - the method needs fixing in QuickBooks.`
        : targets.length ? `Applied to invoice${targets.length > 1 ? 's' : ''} ${applied}` : 'Held as credit on account'
      await logRow(db, companyId, 'payment', p.id, 'success', qboId, withNote(how, dup.note))
      return { pushed: true, qboId }
    })()).catch(async (err: any) => {
      await releaseClaim(db, 'client_payments', p.id)
      // Still 610 with the method already dropped, or 610 with no method at
      // all: the bad reference is one we cannot do without. Ask QuickBooks
      // about each one by name rather than logging a sentence that names none
      // of them, which is how three identical failures taught us nothing.
      const detail = err?.code === QBO_OBJECT_NOT_FOUND
        ? `${err.message} - ${await briefly(
          diagnosePaymentRefs(db, conn, customerId, targets, (p as any).method, ctx),
          'could not reach QuickBooks to work out which reference it rejected',
        )}`
        : err?.message
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, detail)
      return { pushed: false, reason: 'failed' as const, detail }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * One cheque split across a development's houses, into QuickBooks.
 *
 * ONE PAYMENT WHEN IT CAN BE: the bank shows one deposit, so the bookkeeper
 * wants one record to match it - a Payment with a Line per invoice, across
 * every house the cheque paid. That is possible when every share pays invoices
 * (a Payment Line needs an invoice), all of them already in QuickBooks, all
 * billed to the same QuickBooks customer. Its id goes on the cheque AND on
 * every share, so each house reads as synced and nothing pushes a share twice.
 *
 * Otherwise each share goes across on its own, the way a single payment does
 * - an invoice payment, or a Sales Receipt for a lump sum - carrying the
 * cheque's reference so the records can be found together. Invoices not in
 * QuickBooks yet is WAITING, not otherwise: the backlog sync comes back for it,
 * and splitting now would make the one-record answer impossible later.
 */
export async function pushPaymentGroup(db: SupabaseClient, groupId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: grp } = await db.from('client_payment_groups')
      .select('id, development_id, amount, paid_date, memo, reference, method, qbo_id').eq('id', groupId).maybeSingle()
    if (!grp) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    if ((grp as any).qbo_id) return { pushed: false, reason: 'already' }

    const { data: rows, error } = await db.from('client_payments')
      .select('id, project_id, amount, qbo_id, qb_entered, client_payment_allocations(amount, client_invoices(id, invoice_number, qbo_id))')
      .eq('payment_group_id', groupId)
    if (error || !rows?.length) return { pushed: false, reason: 'skipped', detail: 'The shares of this payment could not be read' }

    const shares = rows as any[]
    const allInvoices = shares.every(r => (r.client_payment_allocations ?? []).length > 0)
    const nonePushed = shares.every(r => !r.qbo_id && !r.qb_entered)
    const companies = await Promise.all(Array.from(new Set(shares.map(r => r.project_id))).map(id => projectCompany(db, id)))
    const companyId = companies[0]?.companyId ?? null
    const customerId = companies[0]?.customerId ?? null
    const oneCustomer = !!companyId && !!customerId && companies.every(c => c.companyId === companyId && c.customerId === customerId)

    if (allInvoices && nonePushed && oneCustomer) {
      const links: { label: string; qboId: string; amount: number }[] = []
      for (const r of shares) for (const a of r.client_payment_allocations ?? []) {
        const inv = a.client_invoices
        const label = inv?.invoice_number ?? String(inv?.id ?? '').slice(0, 8)
        if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: `Invoice ${label} is not in QuickBooks yet` }
        links.push({ label, qboId: inv.qbo_id, amount: Number(a.amount) })
      }
      const conn = await connectionFor(db, companyId!, ctx)
      if (!conn) return { pushed: false, reason: 'not_connected' }
      if (!await claimForPush(db, 'client_payment_groups', groupId)) return { pushed: false, reason: 'already' }
      const { data: dev } = await db.from('projects').select('name').eq('id', (grp as any).development_id).maybeSingle()

      return await budgeted((async (): Promise<PushResult> => {
        const customerQboId = await ensureCustomerId(db, conn, customerId!, companyId!)
        const methodQboId = await methodIdFor(conn, (grp as any).method, ctx)
        if (!ctx) ctx = { conn }
        const deposit = depositField(await accountFor(db, conn, 'payment_deposit', ctx))
        const post = (mid: string | null, note: string | null) => qboFetch(conn, 'payment', {
          method: 'POST',
          body: JSON.stringify({ ...appliedPaymentPayload(grp as any, customerQboId, links, (dev as any)?.name ?? null, mid, note), ...deposit }),
        })
        const probe = appliedPaymentPayload(grp as any, customerQboId, links, (dev as any)?.name ?? null, methodQboId, null) as any
        const dup = await findDuplicate(conn, { entity: 'Payment', doc: probe.PaymentRefNum, partyId: customerQboId, amount: Number((grp as any).amount), txnDate: probe.TxnDate })
        let res: any
        try { res = dup.id ? { Payment: { Id: dup.id } } : await post(methodQboId, null) } catch (err: any) {
          // Same retry as a single payment: drop the one optional reference.
          if (err?.code !== QBO_OBJECT_NOT_FOUND || !methodQboId) throw err
          res = await post(null, methodNote((grp as any).method))
        }
        const qboId = res?.Payment?.Id
        const now = new Date().toISOString()
        await db.from('client_payment_groups').update({ qbo_id: qboId, qbo_synced_at: now }).eq('id', groupId)
        await db.from('client_payments').update({ qbo_id: qboId, qbo_synced_at: now, qb_entered: true, qbo_txn_type: 'payment' })
          .eq('payment_group_id', groupId)
        await logRow(db, companyId!, 'payment', groupId, 'success', qboId,
          withNote(`One payment across ${new Set(shares.map(r => r.project_id)).size} houses: ${links.map(l => l.label).join(', ')}`, dup.note))
        return { pushed: true, qboId }
      })()).catch(async (err: any) => {
        await releaseClaim(db, 'client_payment_groups', groupId)
        await logRow(db, companyId!, 'payment', groupId, 'error', undefined, err?.message)
        return { pushed: false, reason: 'failed' as const, detail: err?.message }
      })
    }

    // Each share on its own, carrying the cheque's reference.
    let pushed: string | null = null, failed: string | null = null, notConnected = false
    for (const r of shares) {
      if (r.qbo_id) continue
      const res = await pushPaymentRow(db, r.id, ctx)
      if (res.pushed) pushed = res.qboId
      else if (res.reason === 'failed') failed = res.detail ?? 'failed'
      else if (res.reason === 'not_connected') notConnected = true
    }
    if (failed) return { pushed: false, reason: 'failed', detail: failed }
    if (notConnected && !pushed) return { pushed: false, reason: 'not_connected' }
    return pushed ? { pushed: true, qboId: pushed } : { pushed: false, reason: 'already' }
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * Rewrite the invoice lines of a Payment already in QuickBooks so they match
 * the allocations here. Never throws.
 *
 * CREDIT APPLIED LATER CHANGES A PAYMENT THAT IS ALREADY OVER THERE. A payment
 * held on account went across with some or all of it unapplied; applying that
 * credit to an invoice afterwards must apply the SAME QuickBooks payment to
 * it - a second Payment would be money the client paid once, received twice.
 * So the record is fetched (for its SyncToken), its Line list replaced with the
 * allocations as they now stand, and posted back.
 *
 * If an invoice in the new split has not reached QuickBooks yet, nothing is
 * written and `qbo_reapply_needed` stays set for the backlog sync - half an
 * application is the same mistake as half a cheque.
 */
export async function reapplyPaymentInQbo(db: SupabaseClient, paymentId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: p } = await db.from('client_payments')
      .select('id, project_id, qbo_id, qbo_txn_type').eq('id', paymentId).maybeSingle()
    if (!p) return { pushed: false, reason: 'skipped', detail: 'Payment not found' }
    // Not over there yet: the first push will carry every allocation.
    if (!p.qbo_id) {
      await db.from('client_payments').update({ qbo_reapply_needed: false }).eq('id', p.id)
      return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet - the first push carries the whole split' }
    }
    if ((p as any).qbo_txn_type !== 'payment') {
      return { pushed: false, reason: 'failed', detail: 'This payment is a Sales Receipt in QuickBooks, which cannot hold credit - apply it there by hand' }
    }

    const { data: shares, error } = await db.from('client_payment_allocations')
      .select('amount, client_invoices(id, invoice_number, qbo_id)').eq('payment_id', p.id)
    if (error) return { pushed: false, reason: 'skipped', detail: 'Could not read which invoices this payment settles' }
    const lines: { qboId: string; amount: number }[] = []
    for (const s of (shares ?? []) as any[]) {
      const inv = s.client_invoices
      if (!inv?.qbo_id) {
        await db.from('client_payments').update({ qbo_reapply_needed: true }).eq('id', p.id)
        return { pushed: false, reason: 'skipped', detail: `Invoice ${inv?.invoice_number ?? ''} is not in QuickBooks yet`.trim() }
      }
      lines.push({ qboId: inv.qbo_id, amount: Number(s.amount) })
    }

    const { companyId } = await projectCompany(db, p.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) {
      await db.from('client_payments').update({ qbo_reapply_needed: true }).eq('id', p.id)
      return { pushed: false, reason: 'not_connected' }
    }

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `payment/${p.qbo_id}`)
      const obj = cur?.Payment
      if (!obj?.Id) throw new Error('Payment no longer exists in QuickBooks')
      obj.Line = lines.map(l => ({ Amount: l.amount, LinkedTxn: [{ TxnId: l.qboId, TxnType: 'Invoice' }] }))
      await qboFetch(conn, 'payment', { method: 'POST', body: JSON.stringify(obj) })
      await db.from('client_payments').update({ qbo_reapply_needed: false, qbo_synced_at: new Date().toISOString() }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'success', p.qbo_id, `Credit applied - now on ${lines.length} invoice${lines.length === 1 ? '' : 's'}`, 'update')
      return { pushed: true, qboId: p.qbo_id }
    })()).catch(async (err: any) => {
      await db.from('client_payments').update({ qbo_reapply_needed: true }).eq('id', p.id)
      await logRow(db, companyId, 'payment', p.id, 'error', undefined, `Applying credit: ${err?.message}`, 'update')
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
        await logRow(db, c.gc_company_id!, 'customer', c.id, 'success', c.qbo_id!, 'Details updated', 'update')
        return { pushed: true, qboId: c.qbo_id! }
      })()).catch(async (err: any) => {
        await logRow(db, c.gc_company_id!, 'customer', c.id, 'error', undefined, err?.message)
        return { pushed: false, reason: 'failed' as const, detail: err?.message }
      })
    }

    if (!await claimForPush(db, 'customers', c.id)) return { pushed: false, reason: 'already' }

    return await budgeted((async (): Promise<PushResult> => {
      // Same name already over there: link to it and leave the bookkeeper's
      // record as they keep it, rather than overwrite it with ours.
      const existing = await existingNamedId(conn, 'Customer', c.name)
      const qboId = existing ?? (await qboFetch(conn, 'customer', {
        method: 'POST', body: JSON.stringify(customerPayload(c)),
      }))?.Customer?.Id
      await db.from('customers').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
      await logRow(db, c.gc_company_id!, 'customer', c.id, 'success', qboId,
        existing ? 'Matched to the customer of the same name already in QuickBooks' : undefined, 'create', c.name)
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

// ── Voids: undoing a record that already reached QuickBooks ─────────────────
//
// THE RULE: a void or delete here of any of the four records that push - a
// client invoice, a client payment, a sub bill, a bill payment - voids the
// matching record in QuickBooks and logs the result. Before this, only two of
// the four did anything, and both called an operation QuickBooks does not have
// for the record they were sent to:
//
//   * a Payment, Sales Receipt or BillPayment is voided by a SPARSE UPDATE
//     with `?operation=update&include=void`. `?operation=void` is the
//     Invoice's verb only, so every payment void was refused.
//   * a Bill cannot be voided through the API at all - only deleted, with
//     `?operation=delete`. That is also what "delete the bill" means here.
//
// `voidOperation` is the one answer to which verb goes to which entity, and
// it is pure so it can be pinned without a network.

export type QboVoidEntity = 'invoice' | 'payment' | 'salesreceipt' | 'billpayment' | 'bill'

export function voidOperation(entity: QboVoidEntity): { path: string; body: (obj: { Id: string; SyncToken: string }) => Record<string, unknown> } {
  switch (entity) {
    case 'invoice':
      return { path: 'invoice?operation=void', body: o => ({ Id: o.Id, SyncToken: o.SyncToken }) }
    case 'bill':
      return { path: 'bill?operation=delete', body: o => ({ Id: o.Id, SyncToken: o.SyncToken }) }
    default:
      return { path: `${entity}?operation=update&include=void`, body: o => ({ Id: o.Id, SyncToken: o.SyncToken, sparse: true }) }
  }
}

/** The key a QuickBooks response carries the record under. */
const QBO_KEY: Record<QboVoidEntity, string> = {
  invoice: 'Invoice', payment: 'Payment', salesreceipt: 'SalesReceipt', billpayment: 'BillPayment', bill: 'Bill',
}

/**
 * Already voided over there. QuickBooks zeroes a voided record and prefixes
 * its private note, so this is what an idempotent retry - or a void somebody
 * did by hand in QuickBooks - looks like.
 */
export function isVoidedInQbo(obj: any): boolean {
  return Number(obj?.TotalAmt ?? NaN) === 0 && /voided/i.test(String(obj?.PrivateNote ?? ''))
}

/**
 * The references a QuickBooks record carries, so a 610 on a void can be
 * pinned to one of them.
 *
 * THE SEPTEMBER SANDBOX TESTS. INV-0002 and INV-0003 were voided on Sep 8 and
 * QuickBooks answered both with code 610, "Something you're trying to use has
 * been made inactive" - a sentence that names nothing. QuickBooks validates a
 * record's references on a void as well as on a create, so an inactive
 * customer or item blocks the void. Probing each one turns that into "the
 * customer 58 is inactive in QuickBooks", which is a thing a person can fix.
 */
export function voidReferences(obj: any): ReferenceRef[] {
  const refs: ReferenceRef[] = []
  const seen = new Set<string>()
  const add = (kind: string, entity: string, id: unknown) => {
    const v = String(id ?? '').trim()
    const path = `${entity}/${v}`
    if (!v || seen.has(path)) return
    seen.add(path)
    refs.push({
      label: `${kind} ${v}`,
      path,
      inspect: (o: any) => o?.Active === false ? `the ${kind} is inactive in QuickBooks - make it active again there, then retry` : null,
    })
  }
  add('customer', 'customer', obj?.CustomerRef?.value)
  add('vendor', 'vendor', obj?.VendorRef?.value)
  add('account', 'account', obj?.DepositToAccountRef?.value)
  add('account', 'account', obj?.ARAccountRef?.value)
  add('account', 'account', obj?.APAccountRef?.value)
  add('account', 'account', obj?.CheckPayment?.BankAccountRef?.value)
  add('payment method', 'paymentmethod', obj?.PaymentMethodRef?.value)
  for (const l of obj?.Line ?? []) {
    add('item', 'item', l?.SalesItemLineDetail?.ItemRef?.value)
    add('account', 'account', l?.AccountBasedExpenseLineDetail?.AccountRef?.value)
  }
  return refs
}

type VoidOutcome = 'voided' | 'already' | 'gone'

/**
 * Fetch for the SyncToken QBO demands, then void (or, for a Bill, delete).
 *
 * A record QuickBooks no longer has, or one already voided there, is not a
 * failure - somebody did it by hand, which is the outcome we wanted. A refusal
 * carries the record it was refused for, so the caller can probe its
 * references and say which one QuickBooks objected to.
 */
async function voidQboRecord(conn: Connection, entity: QboVoidEntity, qboId: string): Promise<VoidOutcome> {
  let obj: any
  try {
    obj = (await qboFetch(conn, `${entity}/${qboId}`))?.[QBO_KEY[entity]]
  } catch (err: any) {
    if (err?.code === QBO_OBJECT_NOT_FOUND) return 'gone'
    throw err
  }
  if (!obj?.Id) return 'gone'
  if (entity !== 'bill' && isVoidedInQbo(obj)) return 'already'
  const op = voidOperation(entity)
  try {
    await qboFetch(conn, op.path, { method: 'POST', body: JSON.stringify(op.body(obj)) })
  } catch (err: any) {
    if (err && typeof err === 'object') err.qboRecord = obj
    throw err
  }
  return 'voided'
}

/** The log line for a refused void: QuickBooks' sentence, plus which reference it meant. */
async function voidFailure(conn: Connection, err: any): Promise<string> {
  const message = err?.message ?? 'unknown'
  if (err?.code !== QBO_OBJECT_NOT_FOUND || !err?.qboRecord) return message
  const refs = voidReferences(err.qboRecord)
  if (!refs.length) return message
  const why = await briefly(
    probeReferences(conn, refs).then(describeProbe),
    'could not reach QuickBooks to work out which reference it rejected',
  )
  return `${message} - ${why}`
}

const VOID_WORD: Record<VoidOutcome, string> = {
  voided: 'Voided in QuickBooks',
  already: 'Already voided in QuickBooks',
  gone: 'Already gone from QuickBooks',
}

/**
 * Record that QuickBooks confirmed the void.
 *
 * `qbo_synced_at` alone could never say this - it is stamped by the create AND
 * the void, so it means "we touched this", and the chip read it as "voided over
 * there". A void that failed still printed green.
 */
async function markVoided(db: SupabaseClient, id: string) {
  const now = new Date().toISOString()
  const { error } = await db.from('client_invoices')
    .update({ qbo_voided_at: now, qbo_synced_at: now }).eq('id', id)
  // A database without migration 097 must still be able to void.
  if (error?.code === '42703') {
    await db.from('client_invoices').update({ qbo_synced_at: now }).eq('id', id)
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
      .select('id, project_id, invoice_number, qbo_id').eq('id', billId).maybeSingle()
    if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks' }
    const label = (inv as any).invoice_number ?? null

    const { companyId } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) {
      await logRow(db, companyId, 'client_invoice', inv.id, 'error', inv.qbo_id,
        'Voided here while QuickBooks was not connected - the invoice is still open there', 'void', label)
      return { pushed: false, reason: 'not_connected' }
    }

    return await budgeted((async (): Promise<PushResult> => {
      let obj: any
      try {
        obj = (await qboFetch(conn, `invoice/${inv.qbo_id}`))?.Invoice
      } catch (err: any) {
        // Somebody deleted it by hand over there. That is the outcome we
        // wanted, so record it rather than retrying forever.
        if (err?.code === QBO_OBJECT_NOT_FOUND) obj = null
        else throw err
      }
      if (!obj?.Id || isVoidedInQbo(obj)) {
        await markVoided(db, inv.id)
        await logRow(db, companyId, 'client_invoice', inv.id, 'success', inv.qbo_id!,
          VOID_WORD[obj?.Id ? 'already' : 'gone'], 'void', label)
        return { pushed: true, qboId: inv.qbo_id! }
      }

      // THE PAYMENT COMES OFF FIRST. QuickBooks refuses to void an Invoice
      // while a Payment is linked to it, so voiding a PAID invoice - the case
      // where money is actually involved - failed every time.
      //
      // DETACHED, NOT VOIDED. The money is still recorded here - voiding the
      // invoice does not un-receive the cheque - so voiding the Payment would
      // tell QuickBooks the money never came. And one Payment can settle
      // several invoices (one cheque, a Line per invoice): voiding it would
      // take the OTHER invoices' money with it. So only this invoice's Lines
      // come off, and what is left stays as credit on the customer's account,
      // the same shape an on-account payment already has there.
      const linkedPayments: string[] = (obj.LinkedTxn ?? [])
        .filter((t: any) => t?.TxnType === 'Payment' && t?.TxnId)
        .map((t: any) => String(t.TxnId))
      for (const paymentId of linkedPayments) {
        const pay = (await qboFetch(conn, `payment/${paymentId}`))?.Payment
        if (!pay?.Id) continue
        pay.Line = (pay.Line ?? []).filter((l: any) =>
          !(l?.LinkedTxn ?? []).some((t: any) => t?.TxnType === 'Invoice' && String(t?.TxnId) === String(inv.qbo_id)))
        await qboFetch(conn, 'payment', { method: 'POST', body: JSON.stringify(pay) })
        await logRow(db, companyId, 'payment', inv.id, 'success', paymentId,
          `Taken off ${label ?? 'the invoice'} so it could be voided - the money stays as credit in QuickBooks`, 'update', label)
      }

      const outcome = await voidQboRecord(conn, 'invoice', inv.qbo_id!)
      await markVoided(db, inv.id)
      await logRow(db, companyId, 'client_invoice', inv.id, 'success', inv.qbo_id!,
        linkedPayments.length ? `${VOID_WORD[outcome]} - ${linkedPayments.length} payment(s) left as credit` : VOID_WORD[outcome],
        'void', label)
      return { pushed: true, qboId: inv.qbo_id! }
    })()).catch(async (err: any) => {
      const detail = await voidFailure(conn, err)
      await logRow(db, companyId, 'client_invoice', inv.id, 'error', inv.qbo_id!, `Void: ${detail}`, 'void', label)
      return { pushed: false, reason: 'failed' as const, detail }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * Void QuickBooks records whose SyteNav row is about to be deleted.
 *
 * The caller passes what it read off the row, and DELETES ONLY ON SUCCESS.
 * The order is the point: a row deleted first leaves nothing for a retry to
 * read the QuickBooks id off, so a void that failed after the delete was a
 * live record over there for ever, with only a log line to say so. Voiding
 * first means a refusal keeps the row, and pressing Delete again IS the retry.
 *
 * Steps run in order and stop at the first refusal - a Bill cannot go while
 * the BillPayment against it still stands.
 */
interface VoidStep { entity: QboVoidEntity; qboId: string; logAs: string }

async function voidForDelete(
  db: SupabaseClient, projectId: string, recordId: string, label: string | null,
  steps: VoidStep[], ctx?: PushContext,
): Promise<PushResult> {
  try {
    const todo = steps.filter(s => s.qboId)
    if (!todo.length) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks' }
    const { companyId } = await projectCompany(db, projectId)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) {
      // Not connected is a normal state, so the delete goes ahead - but the
      // record is still live over there, and the log is where that is said.
      for (const s of todo) {
        await logRow(db, companyId, s.logAs, recordId, 'error', s.qboId,
          'Deleted here while QuickBooks was not connected - still live there, void it by hand', 'void', label)
      }
      return { pushed: false, reason: 'not_connected' }
    }
    let current: VoidStep | null = null
    return await budgeted((async (): Promise<PushResult> => {
      for (const s of todo) {
        current = s
        const outcome = await voidQboRecord(conn, s.entity, s.qboId)
        const word = s.entity === 'bill' && outcome === 'voided' ? 'Deleted in QuickBooks' : VOID_WORD[outcome]
        await logRow(db, companyId, s.logAs, recordId, 'success', s.qboId, `${word} (deleted here)`, 'void', label)
      }
      return { pushed: true, qboId: todo[todo.length - 1].qboId }
    })()).catch(async (err: any) => {
      const detail = await voidFailure(conn, err)
      const s = (current ?? todo[0]) as VoidStep
      await logRow(db, companyId, s.logAs, recordId, 'error', s.qboId, `Void: ${detail}`, 'void', label)
      return { pushed: false, reason: 'failed' as const, detail }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * The two QuickBooks records a sub bill can hold, read defensively.
 *
 * `qbo_payment_id` arrived in migration 089. A database without it must still
 * be able to DELETE a bill, so a missing column reads as "no payment" rather
 * than taking the whole select down with it - which is exactly what the
 * `data: null` trap looks like from the caller's side.
 */
export interface BillQboRefs {
  qbo_id: string | null
  qbo_payment_id: string | null
}

export async function billQboRefs(db: SupabaseClient, invoiceId: string): Promise<BillQboRefs> {
  try {
    const { data, error } = await db.from('invoices')
      .select('qbo_id, qbo_payment_id').eq('id', invoiceId).maybeSingle()
    if (!error) return { qbo_id: (data as any)?.qbo_id ?? null, qbo_payment_id: (data as any)?.qbo_payment_id ?? null }
    if (error.code !== '42703') return { qbo_id: null, qbo_payment_id: null }
    const { data: base } = await db.from('invoices').select('qbo_id').eq('id', invoiceId).maybeSingle()
    return { qbo_id: (base as any)?.qbo_id ?? null, qbo_payment_id: null }
  } catch {
    return { qbo_id: null, qbo_payment_id: null }
  }
}

/**
 * Deleting a sub bill takes it out of QuickBooks - the payment first, then
 * the bill.
 *
 * ORDER MATTERS. QuickBooks refuses to remove a Bill while a BillPayment still
 * references it, so the payment is voided first. The Bill itself is DELETED,
 * because a Bill has no void in the QuickBooks API - the old call to
 * `bill?operation=void` was refused every time it ran.
 *
 * Runs BEFORE the row is deleted (see `voidForDelete`). Never throws.
 */
export async function voidBillInQbo(
  db: SupabaseClient,
  bill: { id: string; project_id: string; invoice_number?: string | null } & Partial<BillQboRefs>,
  ctx?: PushContext,
): Promise<PushResult> {
  return voidForDelete(db, bill.project_id, bill.id, bill.invoice_number ?? null, [
    { entity: 'billpayment', qboId: bill.qbo_payment_id ?? '', logAs: 'bill_payment' },
    { entity: 'bill', qboId: bill.qbo_id ?? '', logAs: 'bill' },
  ], ctx)
}

/**
 * Deleting a client payment voids it in QuickBooks.
 *
 * THE GAP THIS CLOSES. Deleting a synced payment removed the row here and
 * touched nothing there, so QuickBooks kept the money - income counted for a
 * payment that, as far as SyteNav knows, never arrived, and the invoice it
 * settled still read paid over there while it read owing here.
 *
 * A payment row is one of TWO QuickBooks entities (`qbo_txn_type`), and the
 * void goes to the one it is. A share of a split cheque carries the cheque's
 * Payment id, so a development's group is voided once, through the group.
 */
export async function voidClientPaymentInQbo(
  db: SupabaseClient,
  payment: { id: string; project_id: string; qbo_id?: string | null; qbo_txn_type?: string | null; label?: string | null },
  ctx?: PushContext,
): Promise<PushResult> {
  const entity: QboVoidEntity = payment.qbo_txn_type === 'payment' ? 'payment' : 'salesreceipt'
  return voidForDelete(db, payment.project_id, payment.id, payment.label ?? null, [
    { entity, qboId: payment.qbo_id ?? '', logAs: 'payment' },
  ], ctx)
}

/**
 * A paid sub bill moved back to unpaid voids the BillPayment against it.
 *
 * `pushBillPayment` creates one when a bill is marked paid; nothing undid it,
 * so a payment marked in error stayed in QuickBooks as money out, and the
 * bill read settled there while it read owing here. Voided first, and the id
 * cleared only on success, so the next Mark Paid pushes a fresh one - and a
 * failure leaves the id in place for the retry rather than orphaning it.
 */
export async function voidBillPaymentInQbo(db: SupabaseClient, invoiceId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('invoices')
      .select('id, project_id, invoice_number, qbo_payment_id').eq('id', invoiceId).maybeSingle()
    if (!inv?.qbo_payment_id) return { pushed: false, reason: 'skipped', detail: 'Payment not in QuickBooks' }
    const { companyId } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    const label = (inv as any).invoice_number ?? null
    if (!conn) {
      await logRow(db, companyId, 'bill_payment', inv.id, 'error', inv.qbo_payment_id,
        'Marked unpaid while QuickBooks was not connected - the payment is still there', 'void', label)
      return { pushed: false, reason: 'not_connected' }
    }
    return await budgeted((async (): Promise<PushResult> => {
      const outcome = await voidQboRecord(conn, 'billpayment', inv.qbo_payment_id!)
      await db.from('invoices').update({ qbo_payment_id: null, qbo_payment_synced_at: null }).eq('id', inv.id)
      await logRow(db, companyId, 'bill_payment', inv.id, 'success', inv.qbo_payment_id!, `${VOID_WORD[outcome]} (marked unpaid here)`, 'void', label)
      return { pushed: true, qboId: inv.qbo_payment_id! }
    })()).catch(async (err: any) => {
      const detail = await voidFailure(conn, err)
      await logRow(db, companyId, 'bill_payment', inv.id, 'error', inv.qbo_payment_id!, `Void: ${detail}`, 'void', label)
      return { pushed: false, reason: 'failed' as const, detail }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}

/**
 * Correcting a bill's amount corrects it in QuickBooks too.
 *
 * THE GAP THIS CLOSES. `pushBill` opens with "already got a qbo_id? nothing to
 * do", which is right for a second push and wrong for an edit: approve a
 * $5,000 bill, correct it to $4,000, and QuickBooks went on saying $5,000
 * forever, silently. Two systems disagreeing about what you owe, neither
 * saying so.
 *
 * Fetch-modify-post on the EXISTING Bill, the same shape refreshBillInQbo
 * uses. Never creates a second record.
 *
 * IT REFUSES IN TWO CASES, deliberately:
 *   * the bill is already paid - moving the amount under a payment leaves it
 *     over- or under-applied and QuickBooks holding a stray credit
 *   * the expense line is not the single one we wrote - somebody restructured
 *     the bill in QuickBooks, and their split is not ours to overwrite
 * Both say what to do instead. Refusing and explaining beats quietly making a
 * mess, which is the rule the whole accrual model follows.
 */
export async function updateBillInQbo(db: SupabaseClient, invoiceId: string, ctx?: PushContext): Promise<PushResult> {
  try {
    const { data: inv } = await db.from('invoices')
      .select('id, project_id, amount, qbo_id, subcontracts(trade)').eq('id', invoiceId).maybeSingle()
    if (!inv?.qbo_id) return { pushed: false, reason: 'skipped', detail: 'Not in QuickBooks yet' }
    if (!Number(inv.amount)) return { pushed: false, reason: 'skipped', detail: 'Bill has no amount' }

    // Cheap refusal first, before a single network call.
    const { qbo_payment_id } = await billQboRefs(db, inv.id)
    if (qbo_payment_id) {
      return {
        pushed: false, reason: 'skipped',
        detail: 'This bill has been paid in QuickBooks. Void the payment there first, then edit.',
      }
    }

    const { companyId, projectName } = await projectCompany(db, inv.project_id)
    if (!companyId) return { pushed: false, reason: 'skipped', detail: 'Project has no company' }
    const conn = await connectionFor(db, companyId, ctx)
    if (!conn) return { pushed: false, reason: 'not_connected' }

    const amount = Number(inv.amount)

    return await budgeted((async (): Promise<PushResult> => {
      const cur = await qboFetch(conn, `bill/${inv.qbo_id}`)
      const obj = cur?.Bill
      if (!obj?.Id) throw new Error('Record no longer exists in QuickBooks')

      // Paid over there without SyteNav knowing - a bookkeeper settled it by
      // hand. Same refusal, same reason: the payment is applied to an amount.
      if (obj.Balance != null && Number(obj.Balance) !== Number(obj.TotalAmt)) {
        return {
          pushed: false, reason: 'skipped',
          detail: 'This bill has been paid in QuickBooks. Void the payment there first, then edit.',
        }
      }

      const lines = (obj.Line ?? []).filter((l: any) => l.DetailType === 'AccountBasedExpenseLineDetail')
      if (lines.length !== 1) {
        return {
          pushed: false, reason: 'skipped',
          detail: 'This bill has been split into several lines in QuickBooks. Change the amount there instead.',
        }
      }

      lines[0].Amount = amount
      lines[0].Description = composeBillDescription((inv.subcontracts as any)?.trade, projectName)
      obj.TotalAmt = amount
      await qboFetch(conn, 'bill', { method: 'POST', body: JSON.stringify(obj) })
      await db.from('invoices').update({ qbo_synced_at: new Date().toISOString() }).eq('id', inv.id)
      await logRow(db, companyId, 'bill', inv.id, 'success', inv.qbo_id!, `Amount updated to ${amount}`, 'update')
      return { pushed: true, qboId: inv.qbo_id! }
    })()).catch(async (err: any) => {
      await logRow(db, companyId, 'bill', inv.id, 'error', undefined, `Update: ${err?.message}`, 'update')
      return { pushed: false, reason: 'failed' as const, detail: err?.message }
    })
  } catch (err: any) {
    return { pushed: false, reason: 'failed', detail: err?.message ?? 'unknown' }
  }
}
