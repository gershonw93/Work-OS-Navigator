// QuickBooks step 1: a void or delete of a synced record reaches QuickBooks.
//
// THE REPORT: void or delete a synced client invoice, client payment, sub bill
// or bill payment in SyteNav and the QuickBooks entry stays live. Checked
// against the code before anything changed, it was four different stories:
//
//   * client invoice VOID - did reach QuickBooks (since #377), but the Sep 8
//     sandbox voids of INV-0002 and INV-0003 both came back 610 "made
//     inactive", naming nothing, and nobody had pressed Retry since.
//   * client payment DELETE - reached nothing. The row went, the Payment or
//     Sales Receipt stayed.
//   * sub bill DELETE - sent `bill?operation=void`, which QuickBooks does not
//     have (a Bill is deleted, never voided, through the API), and did it
//     AFTER the row was gone, so a refusal could never be retried.
//   * bill payment - voided with `billpayment?operation=void`, also not a
//     QuickBooks operation (Payment, SalesReceipt and BillPayment void by a
//     sparse update with `include=void`); and un-paying a bill did nothing.
//
// The pure half is asserted directly. The rest is driven end to end against a
// fake QuickBooks (global fetch) and a fake database, because the bug was in
// the order and the verb of the calls - which only a run can see.

import {
  voidOperation, isVoidedInQbo, voidReferences,
  voidBillInQbo, voidClientPaymentInQbo, voidBillPaymentInQbo,
} from '../quickbooks-push'
import { ok, done, code, read } from './_helpers'

// ── the verb per entity (pure) ───────────────────────────────────────────────
ok(voidOperation('invoice').path === 'invoice?operation=void', 'an Invoice is voided with operation=void')
for (const e of ['payment', 'salesreceipt', 'billpayment'] as const) {
  const op = voidOperation(e)
  ok(op.path === `${e}?operation=update&include=void`, `a ${e} is voided by an update with include=void`)
  ok((op.body({ Id: '1', SyncToken: '3' }) as any).sparse === true, `...as a SPARSE update, or QuickBooks blanks the ${e}`)
}
ok(voidOperation('bill').path === 'bill?operation=delete', 'a Bill is DELETED - the API has no void for it')
ok(!/operation=void/.test(voidOperation('billpayment').path), 'the old billpayment?operation=void is gone')

ok(isVoidedInQbo({ TotalAmt: 0, PrivateNote: 'Voided - was $500' }), 'a zeroed record noted Voided is already voided')
ok(!isVoidedInQbo({ TotalAmt: 0, PrivateNote: '' }), 'a $0 record is not, on its own, a voided one')
ok(!isVoidedInQbo({ TotalAmt: 500, PrivateNote: 'voided by mistake?' }), '...nor is a note without the zero')

const refs = voidReferences({
  CustomerRef: { value: '58' },
  Line: [
    { SalesItemLineDetail: { ItemRef: { value: '1' } } },
    { SalesItemLineDetail: { ItemRef: { value: '1' } } },
    { DetailType: 'SubTotalLineDetail' },
  ],
})
ok(refs.map(r => r.path).join(',') === 'customer/58,item/1',
  `a refused void probes the customer and each item once (${refs.map(r => r.path).join(',')})`)
ok(refs[0].inspect!({ Active: false }) !== null && /inactive/.test(refs[0].inspect!({ Active: false })!),
  '...and an inactive one is named as the reason, which is what the Sep 8 610s never said')
ok(refs[0].inspect!({ Active: true }) === null, '...and an active one is not blamed')

// ── a fake QuickBooks and a fake database ────────────────────────────────────
type Call = { method: string; path: string; body?: any }
let calls: Call[] = []
let qbo: Record<string, any> = {}
let refuse: ((c: Call) => any) | null = null

;(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const path = String(url).replace(/^.*\/v3\/company\/[^/]+\//, '').replace(/[?&]minorversion=\d+/, '')
  const call: Call = { method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body) : undefined }
  calls.push(call)
  const reply = (status: number, data: any) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) })
  const fault = refuse?.(call)
  if (fault) return reply(400, fault)
  if (call.method === 'GET') {
    const hit = qbo[path]
    return hit ? reply(200, hit) : reply(400, { Fault: { Error: [{ code: '610', Message: 'Object Not Found' }] } })
  }
  return reply(200, {})
}

let logs: any[] = []
let updates: { table: string; patch: any }[] = []
const rows: Record<string, any> = {}
function fakeDb(): any {
  return {
    from(table: string) {
      const q: any = {
        _patch: null,
        select() { return q }, eq() { return q }, in() { return q }, is() { return q }, or() { return q },
        insert(row: any) { if (table === 'quickbooks_sync_log') logs.push(row); return Promise.resolve({ error: null }) },
        update(patch: any) { updates.push({ table, patch }); q._patch = patch; return q },
        maybeSingle() { return Promise.resolve({ data: rows[table] ?? null, error: null }) },
        single() { return q.maybeSingle() },
        then(res: any) { return Promise.resolve({ data: null, error: null }).then(res) },
      }
      return q
    },
  }
}
const conn: any = { realm_id: 'R1', access_token: 't' }
const reset = () => { calls = []; logs = []; updates = []; refuse = null; qbo = {} }
rows.projects = { gc_company_id: 'GC1', customer_id: null, name: 'Maple St' }

async function main() {
  // ── deleting a PAID sub bill: payment voided, then the bill deleted ────────
  reset()
  qbo['billpayment/318'] = { BillPayment: { Id: '318', SyncToken: '0', TotalAmt: 500 } }
  qbo['bill/317'] = { Bill: { Id: '317', SyncToken: '2', TotalAmt: 500 } }
  const bill = await voidBillInQbo(fakeDb(), { id: 'B1', project_id: 'P1', invoice_number: '1032', qbo_id: '317', qbo_payment_id: '318' }, { conn })
  const posts = calls.filter(c => c.method === 'POST').map(c => c.path)
  ok(bill.pushed, 'a paid bill deleted here comes out of QuickBooks')
  ok(posts.join(' | ') === 'billpayment?operation=update&include=void | bill?operation=delete',
    `...the BillPayment voided first, then the Bill deleted (${posts.join(' | ')})`)
  ok(calls.find(c => c.path.startsWith('billpayment?'))?.body?.sparse === true, '...by a sparse update QuickBooks accepts')
  ok(logs.length === 2 && logs.every(l => l.action === 'void' && l.status === 'success' && l.record_label === '1032'),
    'both are in the sync log as voids, with the bill number - the row is about to be gone')
  ok(logs.map(l => l.qbo_id).join(',') === '318,317', '...each against its own QuickBooks id')

  // ── a refusal is reported, named, and stops before the next step ───────────
  reset()
  qbo['billpayment/318'] = { BillPayment: { Id: '318', SyncToken: '0', TotalAmt: 500, VendorRef: { value: '77' } } }
  qbo['bill/317'] = { Bill: { Id: '317', SyncToken: '2', TotalAmt: 500 } }
  qbo['vendor/77'] = { Vendor: { Id: '77', Active: false } }
  refuse = c => c.method === 'POST' && c.path.startsWith('billpayment?')
    ? { Fault: { Error: [{ code: '610', Message: 'Object Not Found', Detail: "Something you're trying to use has been made inactive." }] } }
    : null
  const refused = await voidBillInQbo(fakeDb(), { id: 'B1', project_id: 'P1', invoice_number: '1032', qbo_id: '317', qbo_payment_id: '318' }, { conn })
  ok(!refused.pushed && refused.reason === 'failed', 'a void QuickBooks refuses is a failure, not a success')
  ok(!refused.pushed && /vendor 77/.test(refused.detail ?? '') && /inactive/.test(refused.detail ?? ''),
    `...and says WHICH reference: "${!refused.pushed ? refused.detail : ''}"`)
  ok(!calls.some(c => c.method === 'POST' && c.path.startsWith('bill?')),
    '...and the Bill is not touched while its payment still stands')
  ok(logs.length === 1 && logs[0].status === 'error' && logs[0].action === 'void' && logs[0].qbo_id === '318',
    'the failure is in the log as a failed void of that QuickBooks record')

  // ── already voided by hand over there: recognised, not voided twice ────────
  reset()
  qbo['payment/316'] = { Payment: { Id: '316', SyncToken: '4', TotalAmt: 0, PrivateNote: 'Voided' } }
  const already = await voidClientPaymentInQbo(fakeDb(), { id: 'C1', project_id: 'P1', qbo_id: '316', qbo_txn_type: 'payment', label: 'Check 1043' }, { conn })
  ok(already.pushed && !calls.some(c => c.method === 'POST'), 'a payment already voided in QuickBooks is not voided twice')
  ok(/Already voided/.test(logs[0]?.message ?? ''), '...and the log says so')

  // ── a client payment goes to the entity it IS ──────────────────────────────
  reset()
  qbo['salesreceipt/290'] = { SalesReceipt: { Id: '290', SyncToken: '1', TotalAmt: 2500 } }
  const receipt = await voidClientPaymentInQbo(fakeDb(), { id: 'C2', project_id: 'P1', qbo_id: '290', qbo_txn_type: null }, { conn })
  ok(receipt.pushed && calls.some(c => c.method === 'POST' && c.path === 'salesreceipt?operation=update&include=void'),
    'a deposit pushed as a Sales Receipt is voided as one (legacy rows have no qbo_txn_type)')
  reset()
  qbo['payment/316'] = { Payment: { Id: '316', SyncToken: '1', TotalAmt: 2500 } }
  await voidClientPaymentInQbo(fakeDb(), { id: 'C3', project_id: 'P1', qbo_id: '316', qbo_txn_type: 'payment' }, { conn })
  ok(calls.some(c => c.method === 'POST' && c.path === 'payment?operation=update&include=void'), '...and a Payment as a Payment')

  // ── deleted in QuickBooks by hand: the outcome we wanted ──────────────────
  reset()
  const gone = await voidClientPaymentInQbo(fakeDb(), { id: 'C4', project_id: 'P1', qbo_id: '999', qbo_txn_type: 'payment' }, { conn })
  ok(gone.pushed && /gone/i.test(logs[0]?.message ?? ''), 'a record QuickBooks no longer has counts as done, and is logged as gone')

  // ── never in QuickBooks: nothing to do, nothing to log ─────────────────────
  reset()
  const never = await voidClientPaymentInQbo(fakeDb(), { id: 'C5', project_id: 'P1', qbo_id: null }, { conn })
  ok(!never.pushed && never.reason === 'skipped' && calls.length === 0 && logs.length === 0,
    'a payment that never reached QuickBooks does not call it')

  // ── un-paying a bill voids its BillPayment and clears the id ───────────────
  reset()
  rows.invoices = { id: 'B2', project_id: 'P1', invoice_number: '1040', qbo_payment_id: '320' }
  qbo['billpayment/320'] = { BillPayment: { Id: '320', SyncToken: '0', TotalAmt: 800 } }
  const unpaid = await voidBillPaymentInQbo(fakeDb(), 'B2', { conn })
  ok(unpaid.pushed && calls.some(c => c.path === 'billpayment?operation=update&include=void'), 'marking a paid bill unpaid voids its BillPayment')
  ok(updates.some(u => u.table === 'invoices' && u.patch.qbo_payment_id === null), '...and clears the id so the next Mark Paid pushes a fresh one')
  reset()
  rows.invoices = { id: 'B2', project_id: 'P1', invoice_number: '1040', qbo_payment_id: '320' }
  qbo['billpayment/320'] = { BillPayment: { Id: '320', SyncToken: '0', TotalAmt: 800 } }
  refuse = c => c.method === 'POST' ? { Fault: { Error: [{ code: '6000', Message: 'Business Validation Error' }] } } : null
  const kept = await voidBillPaymentInQbo(fakeDb(), 'B2', { conn })
  ok(!kept.pushed && !updates.some(u => u.patch.qbo_payment_id === null),
    '...but a refusal keeps the id, so Retry voids can finish it')
  delete rows.invoices

  // ── not connected: a normal state, but the miss is written down ────────────
  reset()
  const off = await voidClientPaymentInQbo(fakeDb(), { id: 'C6', project_id: 'P1', qbo_id: '316', qbo_txn_type: 'payment', label: 'Check 1043' },
    { conn: null as any, expenseAccountId: undefined })
  // `connectionFor` falls through to the database when ctx.conn is null; the
  // fake has no connection row, so this is the not-connected path.
  ok(!off.pushed && off.reason === 'not_connected', 'not connected is reported as such, never as a failure')
  ok(logs.length === 1 && logs[0].status === 'error' && /still live/.test(logs[0].message),
    '...and the log says the QuickBooks record is still live')

  // ── the doors: QuickBooks FIRST, then the row, and a refusal keeps it ──────
  const doors: [string, string, RegExp][] = [
    ['app/api/projects/[id]/invoices/[invoiceId]/route.ts', "from('invoices')\n    .delete()", /voidBillInQbo\(/],
    ['app/api/projects/[id]/payments/[paymentId]/route.ts', "from('client_payments').delete()", /voidClientPaymentInQbo\(/],
    ['app/api/projects/[id]/development-payments/[groupId]/route.ts', "from('client_payment_groups').delete()", /voidClientPaymentInQbo\(/],
  ]
  for (const [file, del, voidCall] of doors) {
    const src = code(file)
    const at = src.search(voidCall)
    const delAt = src.indexOf(del)
    ok(at > 0 && delAt > 0, `${file}: can see both the void and the delete`)
    ok(at < delAt, `${file}: voids in QuickBooks BEFORE deleting the row`)
    ok(/reason === 'failed'[\s\S]{0,80}status: 502|reason === 'failed'\)\s*\{[\s\S]{0,400}status: 502/.test(src),
      `${file}: a refused void refuses the delete, so pressing Delete again is the retry`)
  }

  const inv = code('app/api/projects/[id]/client-invoices/[billId]/route.ts')
  const delFn = inv.slice(inv.indexOf('export async function DELETE'))
  ok(/status !== 'draft' \|\| current\.qbo_id/.test(delFn) && delFn.indexOf("status !== 'draft'") < delFn.indexOf('.delete()'),
    'a sent client invoice cannot be deleted - it is voided, and the void reaches QuickBooks')
  ok(/retry_qbo_void === true/.test(inv) && /voidClientInvoiceInQbo\(db, params\.billId\)/.test(inv),
    'the row can retry a void QuickBooks never confirmed')

  const subBill = code('lib/writes/sub-bill.ts')
  ok(/voidPayment: invoice\.status === 'paid' && status !== undefined && status !== 'paid'/.test(subBill),
    'a paid bill moved off paid is flagged for its BillPayment to be voided')
  ok(!/quickbooks-push/.test(subBill), '...and lib/writes still never reaches QuickBooks itself')
  ok(/result\.qbo\.voidPayment[\s\S]{0,120}voidBillPaymentInQbo/.test(code('app/api/projects/[id]/invoices/[invoiceId]/route.ts')),
    'the route does the void')

  const sync = code('app/api/quickbooks/sync/route.ts')
  ok(/voidBillPaymentInQbo\(db, b\.id, ctx\)/.test(sync), 'Retry voids also finishes un-paid bills')
  ok(/neq\('status', 'paid'\)\.not\('qbo_payment_id', 'is', null\)/.test(code('app/api/quickbooks/status/route.ts')),
    '...and the card counts them, so it cannot say everything is in QuickBooks over one')

  // ── the log: every row says what was done ──────────────────────────────────
  const push = code('lib/quickbooks-push.ts')
  ok(!/action: 'create', status/.test(push), "logRow no longer hardcodes action 'create'")
  const voidSection = push.slice(push.indexOf('export function voidOperation'), push.indexOf('export async function updateBillInQbo'))
  // Each call's own argument list, by paren depth - the codebase writes no
  // semicolons, so a regex to the next ';' swallows several calls as one.
  const voidLogs: string[] = []
  for (let i = voidSection.indexOf('logRow('); i >= 0; i = voidSection.indexOf('logRow(', i + 1)) {
    let depth = 0, j = i + 'logRow'.length
    do { if (voidSection[j] === '(') depth++; else if (voidSection[j] === ')') depth--; j++ } while (depth > 0 && j < voidSection.length)
    voidLogs.push(voidSection.slice(i, j))
  }
  ok(voidLogs.length >= 8, `the void section logs (${voidLogs.length} calls)`)
  ok(voidLogs.every(l => /'void'|'update'/.test(l)), '...and every one of those rows says void (or update, for a detached payment)')
  ok(!/operation=void`/.test(push) && !/\?operation=void', \{/.test(push.replace("'invoice?operation=void'", '')),
    'no path sends operation=void to anything but an Invoice')
  ok(/record_label/.test(read('supabase/migrations/150_quickbooks_sync_log_events.sql')), 'migration 150 adds record_label')
  ok(/record_label/.test(code('app/api/quickbooks/status/route.ts')), '...and the card reads it')

  // ── item 3: the card names the four pushes and says one-way ────────────────
  const card = read('components/settings/quickbooks-card.tsx')
  ok(/QuickBooks Online, one-way push/.test(card), 'the card says "QuickBooks Online, one-way push"')
  for (const phrase of ['the invoices you send your client', 'the payments your client makes', 'the bills your subs send you', 'the payments you make on those bills']) {
    ok(card.includes(phrase), `...and names "${phrase}"`)
  }

  done()
}

main()
