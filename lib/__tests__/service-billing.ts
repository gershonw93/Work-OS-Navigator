// BILLING A SERVICE CALL'S CUSTOMER, PUSHED TO QUICKBOOKS.
//
// The owner: "We also need to be able to bill a customer. Full build out and
// qb integrated." Decided with them: email a link and record payments by hand,
// QuickBooks adds any sales tax, a company keeps a price list (migration 172).
//
// The money rules are pure (lib/service-billing.ts) and tested case by case,
// including the cases where two plausible rules disagree; the QuickBooks shape
// is pure too; and every route is pinned to the fence and the order of acts
// that cost something if broken (QuickBooks before the email, QuickBooks before
// a delete, paid derived from money, crew refused).

import { ok, done, code } from './_helpers'
import {
  cleanLine, subtotalCents, invoiceProblem, amountDueCents, billSettlement, statusAfterPayments, paymentProblem,
  nextInvoiceNumber, priceItemProblem, dueIn, editable,
} from '../service-billing'
import { serviceInvoicePayload, invoiceTotals } from '../quickbooks-push'
import { RESOURCES, ROLE_DEFAULTS, INHERITS_FROM } from '../permissions'
import { retryFor } from '../qbo-log-retry'
import { UNTRACKED_PREFIXES } from '../analytics'

function main() {
  // ── a line ──
  const l = cleanLine({ description: '  Labor  ', quantity: '1.5', unit: 'hour', unit_price: '85' })
  ok(l.description === 'Labor' && l.quantity === 1.5 && l.unit === 'hour' && l.amount === 127.5, 'a line is trimmed and priced: 1.5 h x $85 = $127.50')
  ok(cleanLine({ description: 'x', quantity: 3, unit_price: 0.1 }).amount === 0.3, 'cents, not floating point: 3 x $0.10 is $0.30, not 0.30000000000000004')
  ok(cleanLine({ description: 'x', quantity: 1, unit: 'gallon', unit_price: 1 }).unit === 'each', 'an unknown unit falls back to each')
  ok(subtotalCents([{ amount: 127.5 }, { amount: 95 }]) === 22250, 'the subtotal adds lines in cents')

  // ── what a sendable invoice needs ──
  const good = { customer_name: 'Mrs Smith', lines: [{ description: 'Service call fee', quantity: 1, unit_price: 95 }] }
  ok(invoiceProblem(good) === null, 'a customer and one priced line is an invoice')
  ok(/customer/i.test(invoiceProblem({ ...good, customer_name: ' ' }) ?? ''), 'no customer is refused')
  ok(/at least one line/.test(invoiceProblem({ ...good, lines: [] }) ?? ''), 'no lines is refused')
  ok(/Line 1 needs a description/.test(invoiceProblem({ ...good, lines: [{ description: '', quantity: 1, unit_price: 5 }] }) ?? ''), 'a line with no words is refused, by number')
  ok(/quantity above zero/.test(invoiceProblem({ ...good, lines: [{ description: 'x', quantity: 0, unit_price: 5 }] }) ?? ''), 'a zero quantity is refused')
  ok(/negative/.test(invoiceProblem({ ...good, lines: [{ description: 'x', quantity: 1, unit_price: -5 }] }) ?? ''), 'a negative price is refused')
  ok(invoiceProblem({ ...good, lines: [{ description: 'Warranty visit', quantity: 1, unit_price: 0 }, { description: 'Part', quantity: 1, unit_price: 12 }] }) === null, 'a $0 line is fine (a warranty visit) when the invoice comes to something')
  ok(/comes to nothing/.test(invoiceProblem({ ...good, lines: [{ description: 'Warranty visit', quantity: 1, unit_price: 0 }] }) ?? ''), 'an invoice that comes to $0 is refused')
  ok(/before the invoice date/.test(invoiceProblem({ ...good, issue_date: '2026-12-10', due_date: '2026-12-01' }) ?? ''), 'a due date before the invoice date is refused')

  // ── what the customer is asked for: QuickBooks' total when it added tax ──
  ok(amountDueCents({ subtotal: 100, total: 107.25, tax_amount: 7.25 }) === 10725, 'with tax added in QuickBooks, the amount due is QuickBooks\' total')
  ok(amountDueCents({ subtotal: 100, total: 0 }) === 10000, 'with no total read back, it is the lines')
  // the two rules disagree here, which is the only case that can tell them apart
  const taxed = { subtotal: 100, total: 107.25, tax_amount: 7.25 }
  ok(billSettlement(taxed, [{ amount: 100 }]).state === 'partly_paid', 'paying the PRE-TAX lines on a taxed invoice is NOT paid - $7.25 is still owed')
  ok(billSettlement(taxed, [{ amount: 100 }]).balance === 7.25, '...and the balance says exactly that')
  ok(billSettlement(taxed, [{ amount: 100 }, { amount: 7.25 }]).state === 'paid', 'the tax paid too is paid in full')

  // ── paid is what the money says ──
  ok(statusAfterPayments('sent', billSettlement(good as any, [])) === 'sent', 'sent with nothing paid stays sent')
  ok(statusAfterPayments('sent', billSettlement({ subtotal: 95, total: 95 }, [{ amount: 95 }])) === 'paid', 'money covering it makes it paid')
  ok(statusAfterPayments('paid', billSettlement({ subtotal: 95, total: 95 }, [])) === 'sent', 'a paid invoice whose payment was removed goes back to sent')
  ok(statusAfterPayments('draft', billSettlement({ subtotal: 95, total: 95 }, [{ amount: 95 }])) === 'draft', 'money never moves a draft')
  ok(statusAfterPayments('void', billSettlement({ subtotal: 95, total: 95 }, [])) === 'void', 'or a void')

  // ── what a payment may be ──
  const sent = { status: 'sent' as const, subtotal: 200, total: 200 }
  ok(paymentProblem(sent, [], { amount: 50, paid_date: '2026-11-27' }) === null, 'part of what is owed is a payment')
  ok(/Send the invoice/.test(paymentProblem({ ...sent, status: 'draft' }, [], { amount: 50, paid_date: '2026-11-27' }) ?? ''), 'not on a draft - nobody has been asked for it yet')
  ok(/void/.test(paymentProblem({ ...sent, status: 'void' }, [], { amount: 50, paid_date: '2026-11-27' }) ?? ''), 'not on a void')
  ok(/more than is owed \(\$150\.00\)/.test(paymentProblem(sent, [{ amount: 50 }], { amount: 151, paid_date: '2026-11-27' }) ?? ''), 'more than is LEFT is refused, naming what is left - no credit on account here')
  ok(paymentProblem(sent, [{ amount: 50 }], { amount: 150, paid_date: '2026-11-27' }) === null, 'exactly what is left is fine')
  ok(/already paid/.test(paymentProblem(sent, [{ amount: 200 }], { amount: 1, paid_date: '2026-11-27' }) ?? ''), 'nothing more on one paid in full')
  ok(/above zero/.test(paymentProblem(sent, [], { amount: 0, paid_date: '2026-11-27' }) ?? ''), 'a zero payment is refused')
  ok(/date/.test(paymentProblem(sent, [], { amount: 5, paid_date: null }) ?? ''), 'a payment needs its date')

  // ── numbers, price list, small things ──
  ok(nextInvoiceNumber([]) === 'SVC-1001', 'the first service invoice is SVC-1001')
  ok(nextInvoiceNumber(['SVC-1001', 'SVC-1009', 'INV-0042', 'SVC-1003']) === 'SVC-1010', 'the next is one past the highest SVC- number, ignoring other prefixes')
  ok(priceItemProblem({ name: 'Fee', unit_price: 95 }) === null && /name/.test(priceItemProblem({ name: ' ', unit_price: 1 }) ?? '') && /negative/.test(priceItemProblem({ name: 'x', unit_price: -1 }) ?? ''), 'a price item needs a name and a price that is not negative')
  ok(dueIn('2026-11-27', 14) === '2026-12-11', 'due in 14 days crosses the month')
  ok(editable('draft') && !editable('sent') && !editable('paid'), 'only a draft is edited line by line')

  // ── the QuickBooks shape ──
  const payload = serviceInvoicePayload(
    { invoice_number: 'SVC-1001', issue_date: '2026-11-27', due_date: '2026-12-11', notes: null },
    [{ description: 'Labor', quantity: 1.5, unit_price: 85, amount: 127.5 }], 'C9', 'I3', 'Service call')
  const line = payload.Line[0]
  ok(payload.CustomerRef.value === 'C9' && payload.DocNumber === 'SVC-1001', 'billed to the customer, under the SVC- number')
  ok(line.Amount === 127.5 && line.SalesItemLineDetail.Qty === 1.5 && line.SalesItemLineDetail.UnitPrice === 85 && line.SalesItemLineDetail.ItemRef.value === 'I3', 'each line carries amount, quantity, unit price and the company\'s chosen item')
  ok(invoiceTotals({ TotalAmt: 107.25, TxnTaxDetail: { TotalTax: 7.25 } }).total === 107.25 && invoiceTotals({ TotalAmt: 107.25, TxnTaxDetail: { TotalTax: 7.25 } }).tax === 7.25, 'the total and tax QuickBooks came to are read back')
  ok(invoiceTotals({ TotalAmt: 100 }).tax === null, 'no tax detail is "nobody said", never zero')

  const push = code('lib/quickbooks-push.ts')
  const inv = push.slice(push.indexOf('export async function pushServiceCallInvoice'), push.indexOf('export async function pushServiceCallPayment'))
  ok(/claimForPush\(db, 'service_call_invoices'/.test(inv) && /findDuplicate\(conn, \{ entity: 'Invoice'/.test(inv) && /ensureCustomerId\(/.test(inv) && /accountFor\(db, conn, 'invoice_item'/.test(inv), 'the invoice push uses the job invoice\'s claim, duplicate check, customer and item helpers')
  ok(/\['sent', 'paid'\]\.includes/.test(inv), 'a draft is never pushed')
  ok(/update\.total = totals\.total; update\.tax_amount = totals\.tax/.test(inv), 'the push stores what QuickBooks came to')
  const pay = push.slice(push.indexOf('export async function pushServiceCallPayment'), push.indexOf('export async function voidServiceCallRecordInQbo'))
  ok(/if \(!inv\.qbo_id \|\| !inv\.customer_id\)[\s\S]{0,120}Waiting/.test(pay) && !/pushClientPayment|SalesReceipt/.test(pay), 'a payment whose invoice is not in QuickBooks books NOTHING - never a Sales Receipt (the double-count)')
  ok(/appliedPaymentPayload\(/.test(pay) && /QBO_OBJECT_NOT_FOUND/.test(pay), 'a payment is APPLIED to the invoice, with the method dropped on a 610')

  // ── the routes ──
  const send = code('app/api/service-invoices/[invoiceId]/send/route.ts')
  ok(send.indexOf('pushServiceCallInvoice(') < send.indexOf('serviceInvoiceEmail('), 'Send pushes to QuickBooks BEFORE it builds the email - the letter asks for the books\' total')
  ok(/\.eq\('status', 'draft'\)\.select\(INVOICE_COLS\)/.test(send), 'Send claims the draft on its status, so a double press sends once')
  ok(/replyTo: me\?\.user\?\.email/.test(send), 'the customer\'s reply goes to whoever sent it, not to SyteNav')
  ok(/status: 'invoiced'/.test(send) && /\.eq\('status', 'done'\)/.test(send), 'sending moves the call from Done to Invoiced, only from Done')
  const delPay = code('app/api/service-invoices/[invoiceId]/payments/[paymentId]/route.ts')
  ok(delPay.indexOf('voidServiceCallRecordInQbo(') < delPay.indexOf(".from('service_call_payments').delete()"), 'removing a payment voids it in QuickBooks FIRST')
  ok(/status: 502/.test(delPay), '...and keeps the row when QuickBooks refuses')
  const voidR = code('app/api/service-invoices/[invoiceId]/void/route.ts')
  ok(/has payments recorded/.test(voidR), 'an invoice with payments cannot be voided until they are removed')
  ok(voidR.indexOf('voidServiceCallRecordInQbo(') < voidR.indexOf("status: 'void'"), 'voiding goes to QuickBooks first')
  const payR = code('app/api/service-invoices/[invoiceId]/payments/route.ts')
  ok(payR.indexOf('paymentProblem(') < payR.indexOf(".from('service_call_payments').insert"), 'a payment is checked before it is written')
  ok(/syncBillStatus\(db, inv\)/.test(payR) && /syncBillStatus\(db, found\.invoice\)/.test(delPay), 'paid is recomputed from the money after every payment written or removed')
  const patch = code('app/api/service-invoices/[invoiceId]/route.ts')
  ok(/if \(!editable\(inv\.status\)\)/.test(patch), 'a sent invoice is not edited line by line')
  ok(!/body\.status|body\.total|body\.qbo_id|body\.invoice_number/.test(patch), 'a body can never set the status, the total, the number or the QuickBooks id')

  // every billing route is behind the billing gate
  for (const f of [
    'app/api/service-calls/[callId]/invoice/route.ts', 'app/api/service-invoices/route.ts', 'app/api/service-invoices/[invoiceId]/route.ts',
    'app/api/service-invoices/[invoiceId]/send/route.ts', 'app/api/service-invoices/[invoiceId]/payments/route.ts',
    'app/api/service-invoices/[invoiceId]/payments/[paymentId]/route.ts', 'app/api/service-invoices/[invoiceId]/void/route.ts',
    'app/api/service-prices/route.ts', 'app/api/service-prices/[itemId]/route.ts',
  ]) {
    const src = code(f)
    const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length
    const gates = (src.match(/await billingGate\(db, request, '/g) ?? []).length
    ok(handlers > 0 && gates === handlers, `${f}: every handler asks billingGate (${gates}/${handlers})`)
  }
  const server = code('lib/service-billing-server.ts')
  ok(/requirePermission\(db, request, 'service-billing'/.test(server) && /isAssignedOnly\(gate\.actor\.role\)/.test(server) && /ownJobsRefusal/.test(server), 'the gate asks service-billing, refuses crew whatever a saved map says, and refuses a light account')
  ok(/\.eq\('id', invoiceId\)\.eq\('company_id', companyId\)/.test(server), 'an invoice is only ever found among the caller\'s company\'s own')

  // ── the public page ──
  const pub = code('app/service-invoice/[token]/page.tsx')
  ok(/inv\.status === 'draft'\) return <Gone/.test(pub), 'the customer\'s link never shows a draft')
  ok(/robots: \{ index: false/.test(pub), 'it is never indexed')
  ok(UNTRACKED_PREFIXES.includes('/service-invoice'), 'and never measured - the path is the secret')

  // ── the permission ──
  ok(RESOURCES.some(r => r.key === 'service-billing'), 'billing is its own permission - money crew do not see')
  for (const role of Object.keys(ROLE_DEFAULTS)) {
    if (role === 'admin') continue
    ok('service-billing' in (ROLE_DEFAULTS as any)[role], `${role} names service-billing explicitly`)
  }
  ok(!(ROLE_DEFAULTS as any).worker['service-billing'].view && !(ROLE_DEFAULTS as any).field_supervisor['service-billing'].view, 'crew roles cannot see billing by default')
  ok(INHERITS_FROM['service-billing'] === 'payments', 'a role map saved before it existed takes it from client billing')

  // ── the sync log's Retry reaches these records ──
  ok((retryFor({ entity_type: 'service_call_invoice', entity_id: 'a', action: 'create', status: 'error', message: '', created_at: '' }) as any)?.entity === 'client-invoices', 'a failed call invoice retries through the invoices sync')
  ok((retryFor({ entity_type: 'service_call_payment', entity_id: 'a', action: 'create', status: 'error', message: '', created_at: '' }) as any)?.entity === 'payments', 'a failed call payment retries through the payments sync')
  const sync = code('app/api/quickbooks/sync/route.ts')
  for (const k of ['payments', 'invoices', 'voids']) {
    const at = sync.indexOf(`await serviceRows('${k}'`)
    ok(at > 0, `the backlog sync pushes service call ${k}`)
  }
  const rawSync = code('app/api/quickbooks/sync/route.ts')
  for (const k of ['payments', 'client-invoices', 'voids']) {
    const branch = rawSync.slice(rawSync.indexOf(`entity === '${k}'`), rawSync.indexOf('} else if', rawSync.indexOf(`entity === '${k}'`) + 10))
    ok(branch.includes('await serviceRows(') && !/if \(!projectIds\.length\) return/.test(branch), `the ${k} sync runs call records first and has no job-only early exit (a sub with no jobs still syncs)`)
  }

  done()
}

main()
