// QuickBooks two-way, phase 1: what changes in QuickBooks comes back.
//
// THE ASK: "build phase 1" of two-way sync - a payment the bookkeeper records
// in QuickBooks against a SyteNav invoice reaches the job, a sub's bill paid
// there reads paid, and a void / delete / amount change made there to a record
// SyteNav sent is FLAGGED, never mirrored. Off by default, per company.
//
// The two failures that would cost real money, each driven end to end against
// a fake QuickBooks and a fake database:
//   * THE ECHO LOOP - every push SyteNav makes fires a webhook back. If that
//     came in as a new payment, every cheque would be counted twice.
//   * THE DOUBLE-COUNT - a payment somebody ALSO recorded in SyteNav by hand
//     must be refused, not added on top.

import { createHmac } from 'crypto'
import {
  parseWebhook, signatureValid, pushedBySyteNav, voidedInQbo, linkedAmounts, cdcEvents, externalLabel,
} from '../qbo-pull'
import { applyChange } from '../quickbooks-pull'
import { ok, done, code, read } from './_helpers'

// ── pure: both webhook formats ───────────────────────────────────────────────
const legacy = parseWebhook({ eventNotifications: [{ realmId: '123', dataChangeEvent: { entities: [
  { name: 'Payment', id: '55', operation: 'Create', lastUpdated: '2026-10-22T10:00:00Z' },
  { name: 'Customer', id: '9', operation: 'Update', lastUpdated: 'x' },
  { name: 'Invoice', id: '56', operation: 'Void', lastUpdated: 'y' },
] } }] })
ok(legacy.length === 2 && legacy[0].entity === 'Payment' && legacy[0].operation === 'Create' && legacy[0].realmId === '123', 'the original webhook format is read, and an entity phase 1 ignores (Customer) is dropped')
ok(legacy[1].operation === 'Void', '...a Void is a Void')
const cloud = parseWebhook([{ type: 'qbo.billpayment.created.v1', intuitentityid: '77', intuitaccountid: '123', time: 't1' }, { type: 'qbo.vendor.updated.v1', intuitentityid: '1', intuitaccountid: '123' }])
ok(cloud.length === 1 && cloud[0].entity === 'BillPayment' && cloud[0].id === '77' && cloud[0].operation === 'Create', 'the CloudEvents format is read too')
ok(parseWebhook({ nonsense: true }).length === 0 && parseWebhook(null).length === 0, 'a shape we do not know yields nothing, never a guess')

// ── pure: the signature ──────────────────────────────────────────────────────
const body = '{"eventNotifications":[]}'
const sig = createHmac('sha256', 'verifier-xyz').update(body).digest('base64')
ok(signatureValid(body, sig, 'verifier-xyz'), 'a body signed with the verifier token passes')
ok(!signatureValid(body + ' ', sig, 'verifier-xyz'), 'a body changed by one byte fails')
ok(!signatureValid(body, sig, ''), 'no verifier token configured: nothing passes')
ok(!signatureValid(body, null, 'verifier-xyz'), 'no signature header: refused')

// ── pure: the rest ───────────────────────────────────────────────────────────
ok(pushedBySyteNav({ PaymentRefNum: 'SN-1a2b3c4d' }) && pushedBySyteNav({ PaymentRefNum: '1043', PrivateNote: 'Job 1 - memo · SN-1a2b3c4d' }), "SyteNav's own payments are recognised by their SN- tracking id")
ok(!pushedBySyteNav({ PaymentRefNum: '1043', PrivateNote: 'Received at the office' }), '...and a bookkeeper\'s are not')
ok(voidedInQbo({ TotalAmt: 0, PrivateNote: 'Voided' }) && !voidedInQbo({ TotalAmt: 0, PrivateNote: '' }), 'a voided transaction is zero AND says Voided')
ok(JSON.stringify(linkedAmounts({ Line: [{ Amount: 80, LinkedTxn: [{ TxnId: '1313', TxnType: 'Invoice' }] }, { Amount: 20, LinkedTxn: [{ TxnId: '9', TxnType: 'CreditMemo' }] }] }, 'Invoice')) === '[{"qboId":"1313","amount":80}]', 'linkedAmounts reads which invoices a payment applies to, and how much')
const cdc = cdcEvents('123', { CDCResponse: [{ QueryResponse: [{ Payment: [{ Id: '5', MetaData: { LastUpdatedTime: 'a' } }, { Id: '6', status: 'Deleted' }] }, { Bill: [{ Id: '7' }] }] }] })
ok(cdc.length === 3 && cdc[1].operation === 'Delete' && cdc[2].entity === 'Bill', 'Change Data Capture flattens to the same events, deletes included')
ok(externalLabel('voided') === 'Voided in QuickBooks' && externalLabel(null) === null, 'each flag has its words')

// ── end to end: a fake QuickBooks and a fake database ────────────────────────
type Row = Record<string, any>
let tables: Record<string, Row[]> = {}
let seq = 0
function fakeDb(): any {
  return { from(t: string) {
    const filters: ((r: Row) => boolean)[] = []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let patch: Row | null = null
    let ins: Row[] = []
    const rows = () => (tables[t] ??= [])
    const run = (mode: 'many' | 'maybe' | 'single') => {
      let data: any
      if (op === 'insert') {
        const made = ins.map(r => ({ id: r.id ?? `id-${++seq}`, ...r }))
        rows().push(...made); data = made
      } else {
        const hit = rows().filter(r => filters.every(f => f(r)))
        if (op === 'update') hit.forEach(r => Object.assign(r, patch))
        if (op === 'delete') tables[t] = rows().filter(r => !hit.includes(r))
        data = hit
      }
      if (mode === 'many') return Promise.resolve({ data, error: null })
      return Promise.resolve({ data: data[0] ?? null, error: mode === 'single' && !data[0] ? { message: 'none' } : null })
    }
    const q: any = {
      select() { return q }, order() { return q }, limit() { return q }, or() { return q },
      eq(c: string, v: any) { filters.push(r => String(r[c]) === String(v)); return q },
      neq(c: string, v: any) { filters.push(r => r[c] !== v); return q },
      in(c: string, vs: any[]) { filters.push(r => vs.map(String).includes(String(r[c]))); return q },
      is(c: string, v: any) { filters.push(r => (r[c] ?? null) === v); return q },
      insert(v: Row | Row[]) { op = 'insert'; ins = Array.isArray(v) ? v : [v]; return q },
      update(p: Row) { op = 'update'; patch = p; return q },
      delete() { op = 'delete'; return q },
      maybeSingle() { return run('maybe') }, single() { return run('single') },
      then(res: any, rej: any) { return run('many').then(res, rej) },
    }
    return q
  } }
}
let qbo: Record<string, any> = {}
;(globalThis as any).fetch = async (url: string) => {
  const path = String(url).replace(/^.*\/v3\/company\/[^/]+\//, '').replace(/[?&]minorversion=\d+/, '')
  const hit = qbo[path]
  return hit
    ? { ok: true, status: 200, text: async () => JSON.stringify(hit) }
    : { ok: false, status: 400, text: async () => JSON.stringify({ Fault: { Error: [{ code: '610', Message: 'Object Not Found' }] } }) }
}
const conn: any = { company_id: 'C1', realm_id: 'R1', access_token: 't', environment: 'production' }
const ev = (entity: any, id: string, operation: any = 'Update') => ({ realmId: 'R1', entity, id, operation, lastUpdated: 'x' })

function reset() {
  seq = 0; qbo = {}
  tables = {
    projects: [{ id: 'P1', gc_company_id: 'C1' }, { id: 'P2', gc_company_id: 'C1' }],
    client_invoices: [
      { id: 'I1', project_id: 'P1', invoice_number: 'INV-0001', status: 'sent', qbo_id: '1313', client_invoice_lines: [{ amount: 200 }] },
      { id: 'I2', project_id: 'P2', invoice_number: 'INV-0002', status: 'sent', qbo_id: '1318', client_invoice_lines: [{ amount: 50 }] },
    ],
    client_payments: [{ id: 'CP1', project_id: 'P1', amount: '80.00', reference: '1256', qbo_id: '1314' }],
    client_payment_allocations: [{ id: 'A1', payment_id: 'CP1', client_invoice_id: 'I1', amount: 80 }],
    invoices: [{ id: 'B1', project_id: 'P1', invoice_number: 'INV-8F89-001', amount: '200.00', status: 'paid', qbo_id: '1312', qbo_payment_id: '1316' }],
    project_activity: [], quickbooks_sync_log: [],
  }
}
const pay = (id: string) => (tables.client_payments ?? []).find(p => p.id === id)

async function main() {
  const origErr = console.error
  console.error = () => {}
  try {
    const db = fakeDb()

    // THE ECHO: SyteNav's own payment comes back as an update - same amount.
    reset()
    qbo['payment/1314'] = { Payment: { Id: '1314', TotalAmt: 80, PrivateNote: 'Job 1 · SN-aaaaaaaa' } }
    let r = await applyChange(db, conn, 'C1', ev('Payment', '1314'))
    ok(r.status === 'ignored' && tables.client_payments.length === 1 && !pay('CP1')?.qbo_external_state, "SyteNav's own payment echoing back changes nothing")

    // ...and a brand-new id that carries SyteNav's tracking id is ours too (the race where the id is not stored yet).
    qbo['payment/2000'] = { Payment: { Id: '2000', TotalAmt: 50, PaymentRefNum: 'SN-bbbbbbbb', Line: [{ Amount: 50, LinkedTxn: [{ TxnId: '1318', TxnType: 'Invoice' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '2000', 'Create'))
    ok(r.status === 'ignored' && tables.client_payments.length === 1, '...and so is a new one carrying an SN- id - never imported as a second payment')

    // A BOOKKEEPER'S PAYMENT against a SyteNav invoice comes in.
    reset()
    qbo['payment/3000'] = { Payment: { Id: '3000', TotalAmt: 120, TxnDate: '2026-10-23', PaymentRefNum: '8541', Line: [{ Amount: 120, LinkedTxn: [{ TxnId: '1313', TxnType: 'Invoice' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '3000', 'Create'))
    const added = tables.client_payments.find(p => p.qbo_id === '3000')
    ok(r.status === 'applied' && !!added, 'a payment received in QuickBooks against a SyteNav invoice is added to the job')
    ok(added?.qb_entered === true && added?.origin === 'quickbooks' && added?.qbo_txn_type === 'payment', '...WITH its QuickBooks id set, so the push never sends it back')
    ok(added?.reference === '8541' && added?.paid_date === '2026-10-23' && added?.project_id === 'P1', '...with the bookkeeper\'s reference and date, on the invoice\'s job')
    ok(tables.client_payment_allocations.some(a => a.payment_id === added?.id && a.client_invoice_id === 'I1' && a.amount === 120), '...applied to the invoice QuickBooks applied it to')
    ok(tables.client_invoices.find(i => i.id === 'I1')?.status === 'paid', '...and the invoice reads paid once the money covers it ($80 + $120 = $200)')
    ok(tables.project_activity.length === 1, '...and the job\'s activity says it was recorded in QuickBooks')

    // THE DOUBLE-COUNT: the same money already recorded in SyteNav by hand.
    reset()
    tables.client_payment_allocations[0].amount = 200
    tables.client_payments[0].amount = '200.00'
    qbo['payment/3001'] = { Payment: { Id: '3001', TotalAmt: 200, Line: [{ Amount: 200, LinkedTxn: [{ TxnId: '1313', TxnType: 'Invoice' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '3001', 'Create'))
    ok(r.status === 'error' && tables.client_payments.length === 1, 'a payment that would pay an already-paid invoice is REFUSED and named - never added on top')

    // One QuickBooks payment across two jobs: refused with the reason, not split by guesswork.
    reset()
    qbo['payment/3002'] = { Payment: { Id: '3002', TotalAmt: 170, Line: [
      { Amount: 120, LinkedTxn: [{ TxnId: '1313', TxnType: 'Invoice' }] }, { Amount: 50, LinkedTxn: [{ TxnId: '1318', TxnType: 'Invoice' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '3002', 'Create'))
    ok(r.status === 'error' && /2 jobs/.test(r.message) && tables.client_payments.length === 1, 'a payment spanning two jobs is refused with the reason')

    // Not linked to anything SyteNav knows (phase 2): left in QuickBooks.
    reset()
    qbo['payment/3003'] = { Payment: { Id: '3003', TotalAmt: 10, Line: [{ Amount: 10, LinkedTxn: [{ TxnId: '999', TxnType: 'Invoice' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '3003', 'Create'))
    ok(r.status === 'ignored' && tables.client_payments.length === 1, 'a payment on an invoice created only in QuickBooks stays there')

    // VOIDS AND DELETES FLAG, NEVER DELETE.
    reset()
    qbo['payment/1314'] = { Payment: { Id: '1314', TotalAmt: 0, PrivateNote: 'Voided' } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '1314', 'Void'))
    ok(r.status === 'applied' && pay('CP1')?.qbo_external_state === 'voided' && tables.client_payments.length === 1, 'a payment voided in QuickBooks is FLAGGED on the job, never deleted')
    r = await applyChange(db, conn, 'C1', ev('Payment', '1314', 'Void'))
    ok(r.status === 'ignored', '...once - a second notice of the same void is not a second flag')
    reset()
    r = await applyChange(db, conn, 'C1', ev('Payment', '1314', 'Delete'))
    ok(pay('CP1')?.qbo_external_state === 'deleted', 'a payment deleted in QuickBooks is flagged "deleted"')
    reset()
    qbo['payment/1314'] = { Payment: { Id: '1314', TotalAmt: 95 } }
    r = await applyChange(db, conn, 'C1', ev('Payment', '1314'))
    ok(pay('CP1')?.qbo_external_state === 'changed' && /\$95\.00 in QuickBooks, \$80\.00 here/.test(pay('CP1')?.qbo_external_note ?? ''), 'an amount changed in QuickBooks is flagged with both figures - never rewritten')

    // Invoices.
    reset()
    tables.client_invoices[0].qbo_voided_at = '2026-10-22'
    tables.client_invoices[0].status = 'void'
    qbo['invoice/1313'] = { Invoice: { Id: '1313', TotalAmt: 0, PrivateNote: 'Voided' } }
    r = await applyChange(db, conn, 'C1', ev('Invoice', '1313', 'Void'))
    ok(r.status === 'ignored' && !tables.client_invoices[0].qbo_external_state, 'an invoice SyteNav voided itself is the echo - ignored')
    reset()
    qbo['invoice/1313'] = { Invoice: { Id: '1313', TotalAmt: 0, PrivateNote: 'Voided' } }
    r = await applyChange(db, conn, 'C1', ev('Invoice', '1313', 'Void'))
    ok(tables.client_invoices[0].qbo_external_state === 'voided' && tables.client_invoices[0].status === 'sent', 'an invoice voided only in QuickBooks is flagged, and stays sent here')
    reset()
    qbo['invoice/1313'] = { Invoice: { Id: '1313', TotalAmt: 250 } }
    r = await applyChange(db, conn, 'C1', ev('Invoice', '1313'))
    ok(tables.client_invoices[0].qbo_external_state === 'changed', 'an invoice total changed in QuickBooks is flagged')
    reset()
    qbo['invoice/1313'] = { Invoice: { Id: '1313', TotalAmt: 200 } }
    r = await applyChange(db, conn, 'C1', ev('Invoice', '1313'))
    ok(r.status === 'ignored', '...and one that still matches is left alone')

    // Bills.
    reset()
    qbo['billpayment/1316'] = { BillPayment: { Id: '1316', TotalAmt: 200 } }
    r = await applyChange(db, conn, 'C1', ev('BillPayment', '1316'))
    ok(r.status === 'ignored', "SyteNav's own bill payment echoing back changes nothing")
    reset()
    r = await applyChange(db, conn, 'C1', ev('BillPayment', '1316', 'Delete'))
    ok(tables.invoices[0].qbo_external_state === 'deleted' && tables.invoices[0].status === 'paid', 'a bill payment deleted in QuickBooks flags the bill - it is not moved back to unpaid for you')
    reset()
    tables.invoices[0].status = 'approved'; tables.invoices[0].qbo_payment_id = null
    qbo['billpayment/4000'] = { BillPayment: { Id: '4000', TotalAmt: 50, Line: [{ Amount: 50, LinkedTxn: [{ TxnId: '1312', TxnType: 'Bill' }] }] } }
    r = await applyChange(db, conn, 'C1', ev('BillPayment', '4000', 'Create'))
    ok(tables.invoices[0].qbo_external_state === 'part_paid' && tables.invoices[0].status === 'approved', 'a bill PART paid in QuickBooks is flagged, not marked paid')
    reset()
    r = await applyChange(db, conn, 'C1', ev('Bill', '1312', 'Delete'))
    ok(tables.invoices[0].qbo_external_state === 'deleted', 'a bill deleted in QuickBooks is flagged')
  } finally { console.error = origErr }

  // ── wiring ─────────────────────────────────────────────────────────────────
  const pull = code('lib/quickbooks-pull.ts')
  const bills = code('lib/quickbooks-pull-bills.ts')
  ok(/qbo_id: ev\.id, qbo_txn_type: 'payment'/.test(pull) && /qb_entered: true/.test(pull), 'an imported payment is born with its QuickBooks id - the push skips it')
  ok(/qbo_pull_enabled/.test(pull) && /enabled\.has\(/.test(pull), 'only companies that switched it on have changes recorded')
  ok(/\.eq\('status', 'pending'\)\.select\('id'\)\.maybeSingle\(\)/.test(pull), 'an event is claimed by ONE conditional update before it is applied')
  ok(!/\.delete\(\)/.test(pull.replace(/client_payments'\)\.delete\(\)\.eq\('id', \(row as any\)\.id\)/, '')) && !/\.delete\(\)/.test(bills), 'nothing on the pull path deletes a record (the only delete undoes its own half-written insert)')
  const claimAt = bills.indexOf("update({ qbo_payment_id: ev.id")
  const moveAt = bills.indexOf('updateSubBill(db')
  ok(claimAt > 0 && claimAt < moveAt, 'a bill paid in QuickBooks takes its payment id BEFORE it is marked paid - no window for a second BillPayment')
  ok(!/via:/.test(bills.slice(moveAt, moveAt + 200)), '...and is NOT marked through the "via Claude" path, which refuses status moves')

  const hook = code('app/api/quickbooks/webhook/route.ts')
  ok(hook.indexOf('signatureValid(') > 0 && hook.indexOf('signatureValid(') < hook.indexOf('JSON.parse('), 'the webhook checks the signature before it reads the body')
  ok(/if \(!verifier\) return NextResponse\.json\([^)]*\{ status: 503 \}/.test(hook), '...and refuses everything when no verifier token is configured')
  const route = code('app/api/quickbooks/pull/route.ts')
  ok(/qbo_pull_enabled: true, qbo_pull_since: new Date\(\)\.toISOString\(\)/.test(route), 'turning it on starts from now - history is never imported')
  ok((route.match(/mayManageCompanySetting\(x\.g\.actor\)\)/g) ?? []).length >= 2, 'only an admin switches it or runs a check')
  const flags = code('app/api/quickbooks/flags/route.ts')
  ok(/TABLES\.has\(body\.table\)/.test(flags) && /gc_company_id\.eq\.\$\{companyId\}/.test(flags), 'dismissing a flag checks the table AND that the row is one of this company\'s jobs')
  ok(/"path": "\/api\/cron\/quickbooks-pull"/.test(read('vercel.json')) && !/quickbooks-pull",\s*"schedule": "\*\//.test(read('vercel.json')), 'the daily check is scheduled - once a day, as the plan allows')
  done()
}
main()
