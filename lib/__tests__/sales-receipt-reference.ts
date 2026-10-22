// A Sales Receipt's check number goes in Reference no., not Sales Receipt no.
//
// THE REPORT (first pilot on a real QuickBooks company): a $100 deposit with
// Reference TEST-DEP-1 arrived with "TEST-DEP-1" in Sales Receipt no. and
// Reference no. empty. A Sales Receipt has BOTH fields - DocNumber is the
// document's own number, PaymentRefNum is the payer's - and the push wrote the
// payer's into the document's. CLAUDE.md had it as "DocNumber on a Sales
// Receipt", which was true of the field we used and wrong about the column a
// bookkeeper reconciles against.

import { paymentPayload, ownReference, receiptDocNumber, billPayload, billDocNumber, billPaymentPayload } from '../quickbooks-push'
import { ok, done, code } from './_helpers'

const id = 'd25ad9bc-bfe0-4d92-8a99-108f0e54d6f5'
const withRef: any = paymentPayload({ id, amount: 100, reference: 'TEST-DEP-1' }, '70', '1', 'ZZ TEST Job 1')
ok(withRef.PaymentRefNum === 'TEST-DEP-1', 'the check number is the Reference no. (PaymentRefNum)')
ok(withRef.DocNumber === 'SN-d25ad9bc', 'Sales Receipt no. is our tracking number, not the check number')

const noRef: any = paymentPayload({ id, amount: 100 }, '70', '1', 'ZZ TEST Job 1')
ok(!('PaymentRefNum' in noRef), 'no reference typed: Reference no. is left empty, never filled with our id')
ok(noRef.DocNumber === 'SN-d25ad9bc', '...and the receipt still carries a number to search for')

ok(ownReference({ reference: '  1043 ' }) === '1043' && ownReference({ reference: '' }) === undefined, 'ownReference trims, and blank is nothing')
ok(receiptDocNumber({ id }, 'X') === 'SN-d25ad9bc' && receiptDocNumber({}, 'X') === 'X', 'receiptDocNumber prefers our id')

// Update formatting rewrites an existing receipt with the same split.
const push = code('lib/quickbooks-push.ts')
const refresh = push.slice(push.indexOf("const key = applied ? 'Payment' : 'SalesReceipt'"))
ok(/const own = ownReference\(p\)\s*if \(own\) obj\.PaymentRefNum = own/.test(refresh), 'Update formatting puts the check number in PaymentRefNum on a receipt too')
ok(!/else obj\.DocNumber = ident\.ref/.test(refresh), 'the old "check number into DocNumber" branch is gone')
// And a Bill's "Bill no." is the bill's own number. Same pilot: Bill 1312 read
// SN-6dd0f7bc for the bill SyteNav lists as INV-8F89-001.
const billId = '6dd0f7bc-1111-2222-3333-444444444444'
const bill: any = billPayload({ id: billId, invoice_number: 'INV-8F89-001', amount: 200, trade: 'Drywall' }, '73', '80', 'ZZ TEST Job 1')
ok(bill.DocNumber === 'INV-8F89-001', 'a Bill carries the bill\'s own number as Bill no.')
ok(billDocNumber({ id: billId, invoice_number: '  ' }) === 'SN-6dd0f7bc', 'a bill with no number falls back to our tracking id')
ok(billDocNumber({ invoice_number: 'X'.repeat(30) })!.length === 21, 'capped at QuickBooks\' 21 characters')
ok(/\.select\('id, project_id, invoice_number, amount, status/.test(push), 'the push actually READS invoice_number - a payload rule fed undefined falls back silently')
ok(/obj\.DocNumber = billDocNumber\(inv\)/.test(push), 'Update formatting rewrites an existing bill the same way')
// A bill payment is money already sent, never a check queued to print - or
// QuickBooks shows Ref no. "To print" and hides the number (same pilot).
const bp: any = billPaymentPayload({ id: billId, invoice_number: 'INV-8F89-001', amount: 200 }, '73', '1312', '141', 'ZZ TEST Job 1')
ok(bp.CheckPayment?.PrintStatus === 'NotSet', 'a bill payment says it is not waiting to be printed')
ok(bp.DocNumber === 'INV-8F89-001' && bp.CheckPayment.BankAccountRef.value === '141', '...and still carries its Ref no. and the chosen bank')
done()
