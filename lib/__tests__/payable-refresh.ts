// Issuing an invoice makes it payable on the same screen, without a reload.
//
// THE REPORT (first real QuickBooks pilot): INV-0001 was issued with "Issue &
// get link", then Record payment refused with "One of those invoices is not on
// this job any more. Reload and try again." The Billing page keeps its own list
// of payable invoices (loadPayable), refreshed only on requestsKey; the invoice
// card's setStatus reloaded the card and never told the page. The form's check
// asked the stale list and found nothing.

import { ok, done, code } from './_helpers'

const card = code('components/projects/client-invoices.tsx')
const setStatus = card.slice(card.indexOf('async function setStatus'), card.indexOf('async function', card.indexOf('async function setStatus') + 10))
ok(/await load\(\)\s*onChanged\?\.\(\)/.test(setStatus), 'issuing (or voiding) an invoice tells the page, so its payable list refreshes')

const page = code('app/(dashboard)/projects/[id]/payments/page.tsx')
const settle = page.slice(page.indexOf('function settleInvoice'), page.indexOf('function closePaymentForm'))
ok(/loadPayable\(\)/.test(settle), 'opening Record payment re-reads what is payable')
ok(/onChanged=\{\(\) => \{ load\(\); setRequestsKey\(k => k \+ 1\) \}\}/.test(page), '...and onChanged bumps requestsKey, which is what reruns loadPayable')
done()
