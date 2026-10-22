// A paid bill can be moved back to unpaid from the screen.
//
// THE REPORT (first real QuickBooks pilot): "i only see delete here not void".
// The PATCH route has moved a paid bill back to approved - and voided its
// QuickBooks bill payment (voidBillPaymentInQbo) - since QuickBooks step 1,
// but no screen ever offered it, before or after the bill became a screen of
// its own. A bill marked paid by mistake could only be deleted.

import { ok, done, code } from './_helpers'

const detail = code('components/invoices/sub-bill-detail.tsx')
ok(/paid && \(\s*<button[^>]*onClick=\{p\.onUnpay\}/.test(detail), 'a PAID bill offers Mark unpaid on its screen')
ok(/aria-label="Mark unpaid"/.test(detail), '...labelled for a screen reader, and with words beside the icon')

const page = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/onUnpay=\{\(\) => unpayBill\(shownBill\)\}/.test(page), 'the page wires it')
const unpay = page.slice(page.indexOf('function unpayBill'), page.indexOf('function openEditInvoice'))
ok(/guardDelete\(\(\) => updateStatus\(invoice, 'approved'\)/.test(unpay) && /confirmLabel: 'Mark unpaid'/.test(unpay), '...behind a confirm that says it voids the QuickBooks payment')
const upd = page.slice(page.indexOf('async function updateStatus'), page.indexOf('function unpayBill'))
ok(/quickbooks\?\.voided === false/.test(upd) && /notify\(j\?\.error/.test(upd), 'a refused change or an unconfirmed QuickBooks void is SAID, not read as success')

const route = code('app/api/projects/[id]/invoices/[invoiceId]/route.ts')
ok(/voidBillPaymentInQbo\(db, params\.invoiceId\)/.test(route), 'the route still voids the bill payment when a bill leaves paid')
done()
