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
  allocationProblem, cents, creditLeftCents, drawCredit, invoiceTotalCents, settlementLabel, settlementOf, spreadPayment, type OpenInvoice,
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

// ── 6. credit on account ─────────────────────────────────────────────────────
// An overpayment is the client's money. Held ON ACCOUNT - a decision made when
// it is recorded - whatever is not applied stays as credit, applied to a later
// invoice with no new payment. The credit is DERIVED (amount minus applied),
// never stored, so it cannot disagree with the allocations it comes from.
ok(allocationProblem(13000, [{ client_invoice_id: 'a', amount: 10000 }], [A, B], { onAccount: true }) === null,
  'held on account, a $13,000 cheque can pay a $10,000 invoice and keep $3,000 as credit')
ok(allocationProblem(5000, [], [A, B], { onAccount: true }) === null, '...and a client can pay ahead with no invoice at all')
ok(/less than the payment[\s\S]*credit/.test(allocationProblem(13000, [{ client_invoice_id: 'a', amount: 10000 }], [A, B]) ?? ''),
  'WITHOUT the box, money left over is still refused - and the refusal names credit as a way out')
ok(/more than the payment/.test(allocationProblem(9000, [{ client_invoice_id: 'a', amount: 10000 }], [A], { onAccount: true }) ?? ''),
  'credit never lets the invoices take MORE than the payment')
ok(/still owes/.test(allocationProblem(20000, [{ client_invoice_id: 'b', amount: 4000 }], [A, B], { onAccount: true }) ?? ''),
  '...nor more than an invoice owes')

ok(creditLeftCents({ amount: '13000.00', appliedCents: 1_000_000 }) === 300_000, 'credit left is amount minus what is applied')
ok(creditLeftCents({ amount: 100, appliedCents: 20_000 }) === 0, '...and never negative')
const drawn = drawCredit([
  { id: 'new', amount: 500, paid_date: '2026-10-01', appliedCents: 0 },
  { id: 'old', amount: 300, paid_date: '2026-09-01', appliedCents: 10_000 },
], 40_000)
ok(drawn.shares[0].payment_id === 'old' && drawn.shares[0].cents === 20_000 && drawn.shares[1].cents === 20_000 && drawn.shortCents === 0,
  'credit is drawn oldest first, only what each payment has left')
ok(drawCredit([{ id: 'x', amount: 100, appliedCents: 0 }], 50_000).shortCents === 40_000, '...and says how much it could not cover')

const unapplied = appliedPaymentPayload({ amount: 5000 }, 'C1', []) as any
ok(unapplied.TotalAmt === 5000 && Array.isArray(unapplied.Line) && unapplied.Line.length === 0,
  'held on account with nothing applied, QuickBooks gets a Payment with no lines - unapplied credit, not a Sales Receipt')
ok(/if \(p\.on_account\) return \{ kind: 'invoices', links: \[\] \}/.test(qbo),
  '...and never the oldest-open guess: "keep it as credit" is the opposite of "apply it to whatever is oldest"')
ok(/\|\| \(p as any\)\.on_account\) return pushPaymentForProject/.test(qbo), 'the Sales Receipt pusher hands an on-account payment back')

const reapply = qbo.slice(qbo.indexOf('export async function reapplyPaymentInQbo'), qbo.indexOf('// ── Customers'))
ok(/qboFetch\(conn, `payment\/\$\{p\.qbo_id\}`\)/.test(reapply) && /obj\.Line = lines/.test(reapply),
  'applying credit later rewrites the SAME QuickBooks payment\'s lines')
ok(!/appliedPaymentPayload\(/.test(reapply) && !/salesreceipt/.test(reapply), '...and never books a second record for money received once')
ok(/qbo_reapply_needed: true/.test(reapply) && /is not in QuickBooks yet/.test(reapply),
  'an invoice not over there yet leaves it flagged for the backlog, applying nothing - half an application is half a cheque')
ok(/qbo_reapply_needed/.test(code('app/api/quickbooks/sync/route.ts')) && /reapplyPaymentInQbo\(/.test(code('app/api/quickbooks/sync/route.ts')),
  'the backlog sync finishes a reapply that could not run at the time')

const apply = code('app/api/projects/[id]/client-invoices/[billId]/apply-credit/route.ts')
ok(/requirePermission\(admin\(\), request, 'payments', 'edit'\)/.test(apply), 'applying credit needs payments: edit')
ok(!/from\('client_payments'\)\.insert/.test(apply), 'applying credit records NO new money - Funds Received does not move')
ok(/drawCredit\(/.test(apply) && /syncInvoiceStatus\(/.test(apply) && /reapplyPaymentInQbo\(/.test(apply),
  '...it draws credit, re-derives the invoice status, and updates QuickBooks')
ok(/status: 503/.test(apply), 'an unread balance or credit refuses rather than applying against numbers nobody saw')
ok(/asked > inv\.balanceCents/.test(apply), '...and cannot put more on an invoice than it owes')

ok(/on_account: !!body\.on_account/.test(paymentsRoute) && /onAccount: !!body\.on_account/.test(paymentsRoute),
  'the route records the decision and checks the split with it')
ok(/cannot be less than that/.test(paymentRoute), 'an on-account payment cannot be edited below what it has already applied')
ok(/Keep anything not on an invoice as credit for this client/.test(code('components/projects/payment-allocations.tsx')),
  'the payment form asks the question in words')
ok(/Apply \$\{money\(Math\.min\(credit, owed\)\)\} credit/.test(list) && /credit on account\./.test(list),
  'the invoice list says how much credit there is and offers to apply it')
ok(/creditAvailableCents\(/.test(code('app/portal/[token]/page.tsx')), 'the client sees their credit on the portal')
ok(/credit === null \? null/.test(code('app/api/projects/[id]/client-invoices/route.ts')),
  'an unread credit is sent as unknown, never as $0')

done()
