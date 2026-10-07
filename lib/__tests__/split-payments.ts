// ─────────────────────────────────────────────────────────────────────────────
// Partial payments and one payment split across several client invoices.
//
// THE REPORT. "Mark paid" set an invoice to `paid` whatever amount was typed,
// so $5,000 against a $10,000 invoice read "Paid" here while QuickBooks - which
// applies the payment's real amount - still showed $5,000 owed; and once it
// read Paid, the button to record the second $5,000 was gone. Separately, one
// cheque covering two invoices could not be recorded at all.
//
// What this pins:
//   1. The arithmetic (lib/invoice-settlement.ts), in cents, on the cases
//      where the old rule and the new one DISAGREE.
//   2. `paid` is written by the sums and nothing else - the invoice route
//      refuses it from a body, and no screen sends it.
//   3. client_payment_allocations is the one home; client_invoice_id is read
//      by nothing.
//   4. QuickBooks gets ONE Payment with a Line per invoice, and books nothing
//      while any invoice in the split is not over there yet.
// ─────────────────────────────────────────────────────────────────────────────

import { ok, done, code, read, walk } from './_helpers'
import {
  allocationProblem, cents, invoiceTotalCents, settlementLabel, settlementOf, spreadPayment, type OpenInvoice,
} from '../invoice-settlement'
import { appliedPaymentPayload } from '../quickbooks-push'

console.log('\nsplit-payments')

// ── 1. the arithmetic ────────────────────────────────────────────────────────
ok(cents('80.10') === 8010 && cents(0.1 + 0.2) === 30, 'money is compared in cents, numeric strings included')
ok(invoiceTotalCents([{ amount: '5000.00' }, { amount: 5000 }]) === 1_000_000, 'an invoice total is the sum of its lines')

// THE CASE THE OLD RULE GOT WRONG: half paid is not paid.
const half = settlementOf(1_000_000, 500_000)
ok(half.state === 'partly_paid' && half.balance === 5000, '$5,000 against $10,000 is partly paid with $5,000 left - not "Paid"')
ok(settlementLabel(half) === '$5,000 of $10,000 paid · $5,000 left', `...and says so in words (${settlementLabel(half)})`)
ok(settlementOf(1_000_000, 1_000_000).state === 'paid', 'covered in full is paid')
ok(settlementOf(1_000_000, 0).state === 'unpaid' && settlementLabel(settlementOf(1_000_000, 0)) === null, 'nothing received is unpaid, with no label')
ok(settlementOf(1_000_000, 1_200_000).balance === 0, 'an over-applied invoice owes nothing, not a minus')

const A: OpenInvoice = { id: 'a', invoice_number: 'INV-0003', status: 'sent', balanceCents: 1_000_000 }
const B: OpenInvoice = { id: 'b', invoice_number: 'INV-0004', status: 'sent', balanceCents: 300_000 }
ok(allocationProblem(13000, [{ client_invoice_id: 'a', amount: 10000 }, { client_invoice_id: 'b', amount: 3000 }], [A, B]) === null,
  'one $13,000 cheque can pay a $10,000 and a $3,000 invoice')
ok(allocationProblem(5000, [{ client_invoice_id: 'a', amount: 5000 }], [A, B]) === null, 'a part payment on one invoice is fine')
ok(allocationProblem(5000, [], [A, B]) === null, 'no invoices ticked is a deposit, and allowed')
ok(/less than the payment/.test(allocationProblem(13000, [{ client_invoice_id: 'a', amount: 10000 }], [A, B]) ?? ''),
  'a split that leaves money unplaced is refused and says how much')
ok(/more than invoice INV-0004 still owes/.test(allocationProblem(4000, [{ client_invoice_id: 'b', amount: 4000 }], [A, B]) ?? ''),
  'paying an invoice past what it owes is refused, naming the invoice')
ok(/already paid in full/.test(allocationProblem(100, [{ client_invoice_id: 'p', amount: 100 }], [{ ...A, id: 'p', status: 'paid', balanceCents: 0 }]) ?? ''),
  '...and a paid one says it is paid')
ok(/void/.test(allocationProblem(100, [{ client_invoice_id: 'v', amount: 100 }], [{ ...A, id: 'v', status: 'void' }]) ?? ''), 'a void invoice cannot be paid')
ok(/twice/.test(allocationProblem(200, [{ client_invoice_id: 'a', amount: 100 }, { client_invoice_id: 'a', amount: 100 }], [A]) ?? ''),
  'the same invoice twice in one split is refused')
ok(allocationProblem(0.3, [{ client_invoice_id: 'a', amount: 0.1 }, { client_invoice_id: 'b', amount: 0.2 }], [A, B]) === null,
  '0.1 + 0.2 is 0.3 here - cents, not floats')

const spread = spreadPayment(1_100_000, [A, B])
ok(spread.a === 1_000_000 && spread.b === 100_000, 'a cheque is spread oldest first and never past what an invoice owes')

// ── 2. "paid" is the sums' word, not a button's ──────────────────────────────
const invoiceRoute = code('app/api/projects/[id]/client-invoices/[billId]/route.ts')
ok(/body\.status === 'paid'[\s\S]{0,200}status: 400/.test(invoiceRoute), 'the invoice route refuses status "paid" from a request')
ok(!/patch\.paid_at/.test(invoiceRoute), '...and no longer stamps paid_at itself')
ok(/current\.status !== 'draft' && current\.status !== 'sent'/.test(invoiceRoute), 'and "sent" cannot undo a paid or void invoice')
const settleDb = code('lib/invoice-settlement-db.ts')
ok(/status: 'paid'/.test(settleDb) && /status: 'sent', paid_at: null/.test(settleDb), 'syncInvoiceStatus moves an invoice both ways')
ok(/r\.status !== 'sent' && r\.status !== 'paid'/.test(settleDb), '...and never touches a draft or a void')

const writers = [...walk('app'), ...walk('components'), ...walk('lib')]
  .filter(f => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__') && f !== 'lib/invoice-settlement-db.ts' && f !== 'lib/seed-demo.ts')
  .filter(f => /client-invoices|client_invoices/.test(read(f)) && /status:\s*'paid'/.test(code(f)))
  .filter(f => !/payment-requests/.test(code(f)) || /client-invoices\/\$\{/.test(code(f)))
ok(writers.length === 0, `nothing else sets a client invoice to paid${writers.length ? ` - ${writers.join(', ')}` : ''}`)

const paymentsRoute = code('app/api/projects/[id]/payments/route.ts')
const paymentRoute = code('app/api/projects/[id]/payments/[paymentId]/route.ts')
ok(/allocationProblem\(/.test(paymentsRoute) && /allocationProblem\(/.test(code('app/(dashboard)/projects/[id]/payments/page.tsx')),
  'the payment route and the form ask the same question of a split')
ok(/syncInvoiceStatus\(/.test(paymentsRoute) && (paymentRoute.match(/syncInvoiceStatus\(/g) ?? []).length >= 2,
  'recording, editing AND deleting a payment re-derive the invoice status')
ok(paymentRoute.indexOf("from('client_payment_allocations')") < paymentRoute.indexOf("from('client_payments').delete()"),
  'the delete reads the split BEFORE it cascades away, so the invoices go back to owing')
ok(/split across \$\{/.test(paymentRoute) && /status: 409/.test(paymentRoute), 'the amount of a split payment is not guessed at - it is refused, with why')
ok(/await db\.from\('client_payments'\)\.delete\(\)\.eq\('id', data\.id\)/.test(paymentsRoute),
  'a payment whose split failed to save is taken back out, not left to book as a deposit')
ok(/status: 503/.test(paymentsRoute), 'an unreadable balance refuses the payment rather than skipping the check')

// ── 3. one home for the link ─────────────────────────────────────────────────
const readers = [...walk('app'), ...walk('components'), ...walk('lib')]
  .filter(f => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'))
  .filter(f => /client_payments[\s\S]{0,400}client_invoice_id|client_invoice_id[\s\S]{0,200}client_payments/.test(code(f)))
  .filter(f => !/client_payment_allocations/.test(code(f)))
ok(readers.length === 0, `nothing reads client_payments.client_invoice_id any more${readers.length ? ` - ${readers.join(', ')}` : ''}`)
const mig = read('supabase/migrations/128_client_payment_allocations.sql')
ok(/INSERT INTO client_payment_allocations[\s\S]*FROM client_payments[\s\S]*client_invoice_id IS NOT NULL/.test(mig),
  'migration 128 carries every existing link across, so no paid invoice goes back to owing')
ok(/UNIQUE \(payment_id, client_invoice_id\)/.test(mig) && /CHECK \(amount > 0\)/.test(mig), '...one share per invoice per payment, never zero')
ok(/ON DELETE CASCADE[\s\S]*ON DELETE CASCADE/.test(mig), '...and both foreign keys say what a delete does')

const listRoute = code('app/api/projects/[id]/client-invoices/route.ts')
ok(/client_payment_allocations/.test(listRoute) && /settlementOf\(/.test(listRoute), 'the invoice list counts each payment\'s SHARE, not its whole amount')
ok(/settlementsFor\(/.test(code('app/portal/[token]/page.tsx')) && /b\.balance/.test(code('app/portal/[token]/page.tsx')),
  'the client portal shows what is still owed, not the whole invoice again')
ok(/settlementsFor\(/.test(code('app/api/bill/[token]/route.ts')), '...and so does the client\'s invoice page')

// ── 4. QuickBooks ────────────────────────────────────────────────────────────
const two = appliedPaymentPayload({ amount: 13000, paid_date: '2026-10-07', reference: '4471' }, 'C1',
  [{ qboId: '101', amount: 10000 }, { qboId: '102', amount: 3000 }], 'Smith Kitchen') as any
ok(two.TotalAmt === 13000 && two.Line.length === 2, 'one cheque is ONE QuickBooks Payment with a line per invoice')
ok(two.Line[0].LinkedTxn[0].TxnId === '101' && two.Line[1].Amount === 3000, '...each line applying its own share to its own invoice')
ok(two.PaymentRefNum === '4471', '...and the cheque number once, on the payment')

const qbo = code('lib/quickbooks-push.ts')
ok(/from\('client_payment_allocations'\)[\s\S]{0,300}eq\('payment_id', p\.id\)/.test(qbo), 'the push reads the split, not the old single link')
ok(/if \(!inv\.qbo_id\) return \{ kind: 'wait'/.test(qbo), 'any invoice in the split not in QuickBooks yet books NOTHING - not half the cheque')
ok(/if \(error\) return \{ kind: 'wait'/.test(qbo) && /if \(allocError\) return \{ pushed: false, reason: 'skipped'/.test(qbo),
  'an unread split is never booked as a Sales Receipt - that is the double count')

// ── 5. the screens ───────────────────────────────────────────────────────────
const list = code('components/projects/client-invoices.tsx')
ok(!/Mark paid/.test(list) && /Record payment/.test(list), 'the button records a payment; it no longer claims a state')
ok(/Record another payment/.test(list) && /amount: owed/.test(list), 'it stays on a partly paid invoice and opens on the balance')
ok(!/setStatus\(b, 'paid'\)/.test(list), '...and there is no fallback that sets paid by hand')
ok(/'partly paid'/.test(list), 'partly paid is shown as its own state')
const page = code('app/(dashboard)/projects/[id]/payments/page.tsx')
ok(/<PaymentAllocations/.test(page) && /allocations,/.test(page), 'the payment form can split a payment across invoices')
ok(!/client-invoices\/\$\{settling\.id\}/.test(page), 'the form no longer PATCHes the invoice to paid after saving')
ok(/if \(!res\.ok\) \{\s*notify/.test(page.slice(page.indexOf('async function saveEdit'))), 'a refused edit says why instead of closing as if it saved')

done()
