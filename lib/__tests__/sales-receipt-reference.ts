// A Sales Receipt's check number goes in Reference no., not Sales Receipt no.
//
// THE REPORT (first pilot on a real QuickBooks company): a $100 deposit with
// Reference TEST-DEP-1 arrived with "TEST-DEP-1" in Sales Receipt no. and
// Reference no. empty. A Sales Receipt has BOTH fields - DocNumber is the
// document's own number, PaymentRefNum is the payer's - and the push wrote the
// payer's into the document's. CLAUDE.md had it as "DocNumber on a Sales
// Receipt", which was true of the field we used and wrong about the column a
// bookkeeper reconciles against.

import { paymentPayload, ownReference, receiptDocNumber } from '../quickbooks-push'
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
done()
