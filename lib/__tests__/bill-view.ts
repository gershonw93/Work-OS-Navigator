// A sub's bill and an invoice to the client each became a screen of their own
// (the mockups: header with who and how much, a track of steps, one primary
// action, cards for the paperwork, the client's price and the budget). What
// those screens SAY is derived in lib/bill-view.ts; this pins it, and pins that
// both lists actually open them.

import { ok, done, code } from './_helpers'
import { clientInvoiceSteps, dueCountdown, markupMode, subBillDocs, subBillSteps } from '../bill-view'

// ── the countdown beside a due date ─────────────────────────────────────────
// Local noon on Thu 22 Oct 2026, so no timezone can tip it into another day.
const NOW = new Date(2026, 9, 22, 12, 0, 0)
ok(dueCountdown('2026-10-29', NOW)?.text === 'in 7 days', 'a week out reads "in 7 days" (the mockup)')
ok(dueCountdown('2026-10-29', NOW)?.tone === 'plain', '...and is not coloured - "soon" on every row means nothing')
ok(dueCountdown('2026-10-22', NOW)?.text === 'due today', 'due today is still on time today')
ok(dueCountdown('2026-10-23', NOW)?.text === 'due tomorrow', 'tomorrow says tomorrow')
ok(dueCountdown('2026-10-19', NOW)?.text === '3 days overdue' && dueCountdown('2026-10-19', NOW)?.tone === 'late',
  'A DATE THAT HAS PASSED IS OVERDUE, NOT SILENCE - and red')
ok(dueCountdown('2026-10-21', NOW)?.text === '1 day overdue', '...singular for one day')
ok(dueCountdown(null, NOW) === null && dueCountdown('', NOW) === null, 'no due date, no countdown')
ok(dueCountdown('2026-10-29T00:00:00+00:00', NOW)?.text === 'in 7 days', 'a timestamp is read by its date')

// ── the steps a sub's bill moves through ────────────────────────────────────
const base = { created_at: '2026-10-22T14:00:00Z', approved_at: null, approved_by_name: null, sent_at: null }
const pending = subBillSteps({ ...base, status: 'pending_approval' })
ok(pending.map(s => s.label).join(',') === 'Received,Approved,Queued,Paid', 'Received, Approved, Queued, Paid')
ok(pending[0].done && !pending[1].done && pending[1].note === 'Waiting on you', 'a pending bill waits on you')
const approved = subBillSteps({ ...base, status: 'approved', approved_at: '2026-10-22T15:00:00Z', approved_by_name: 'Pat Doe' })
ok(approved[1].done && /Pat Doe/.test(approved[1].note), 'approved carries who approved it')
ok(!approved[2].done && approved[2].note === 'Optional', 'queueing is OPTIONAL, and says so')
const paidDirect = subBillSteps({ ...base, status: 'paid', approved_at: '2026-10-22T15:00:00Z' })
ok(paidDirect[3].done && paidDirect[2].note === 'Skipped',
  'paid straight from Approved reads Skipped, not "Not yet" - a normal bill is not unfinished')
const queued = subBillSteps({ ...base, status: 'sent', approved_at: '2026-10-22T15:00:00Z', sent_at: '2026-10-23T09:00:00Z' })
ok(queued[2].done && !queued[3].done, 'queued lights the third step only')

// ── the three pieces of paper ───────────────────────────────────────────────
const none = subBillDocs({ status: 'approved', document_url: null, lien_waiver_url: null, lien_waiver_type: null })
ok(none.onFile === 0 && none.rows.length === 3, 'nothing on file: 0 of 3')
ok(none.rows[1].warn && !none.rows[2].warn, 'before paying, it is the CONDITIONAL that is owed')
const uncond = subBillDocs({ status: 'paid', document_url: 'u', lien_waiver_url: 'w', lien_waiver_type: 'unconditional' })
ok(uncond.onFile === 3, 'THE ONE SLOT: an unconditional on file covers the conditional - 3 of 3, not 2')
ok(uncond.rows[1].covered && !uncond.rows[1].url, '...the conditional row says covered rather than missing')
const cond = subBillDocs({ status: 'approved', document_url: null, lien_waiver_url: 'w', lien_waiver_type: 'conditional' })
ok(cond.rows[1].url === 'w' && cond.rows[2].url === null && cond.onFile === 1, 'a conditional is the conditional, and only that')
const paidNoWaiver = subBillDocs({ status: 'paid', document_url: 'u', lien_waiver_url: 'w', lien_waiver_type: 'conditional' })
ok(paidNoWaiver.rows[2].warn && /owed now/.test(paidNoWaiver.rows[2].hint), 'paid without an unconditional: that one is owed now')
const legacy = subBillDocs({ status: 'paid', document_url: null, lien_waiver_url: 'w', lien_waiver_type: null })
ok(legacy.rows[2].url === 'w', 'an untyped waiver is read as unconditional, as the old screen did')

// ── markup ──────────────────────────────────────────────────────────────────
ok(markupMode({ markup_excluded: true, markup_pct: 10 }) === 'cost', 'excluded wins: at cost')
ok(markupMode({ markup_pct: null }) === 'project', 'null FOLLOWS the project rate')
ok(markupMode({ markup_pct: 0 }) === 'custom', '...and 0 is a rate of its own, not "follow the project" - empty is not zero')
ok(markupMode({ markup_pct: '15.000' }) === 'custom', 'a numeric arrives as a string and is still custom')

// ── an invoice to the client ────────────────────────────────────────────────
const m = (n: number) => `$${n}`
const draft = clientInvoiceSteps({ status: 'draft', issue_date: '2026-10-20', viewed_at: null, last_viewed_at: null, view_count: 0, settlement: null }, m)
ok(draft.map(s => s.label).join(',') === 'Drafted,Issued,Opened,Paid' && !draft[1].done, 'Drafted, Issued, Opened, Paid')
const part = clientInvoiceSteps({
  status: 'sent', issue_date: '2026-10-20', sent_at: '2026-10-20T10:00:00Z',
  viewed_at: '2026-10-21T10:00:00Z', last_viewed_at: '2026-10-22T10:00:00Z', view_count: 3,
  settlement: { state: 'partly_paid', paid: 5000, total: 10000 },
}, m)
ok(part[2].done && /3 times/.test(part[2].note), 'opened says when and how often')
ok(!part[3].done && part[3].note === '$5000 of $10000', 'PAID IS A SUM: part paid lights nothing and says how much came in')
const settled = clientInvoiceSteps({ status: 'sent', issue_date: '2026-10-20', viewed_at: null, last_viewed_at: null, view_count: 0, settlement: { state: 'paid', paid: 10, total: 10 } }, m)
ok(settled[3].done, '...and covered is paid, whatever the stored status still says')

// ── both lists open the screens ─────────────────────────────────────────────
const bills = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/<BillRow key=\{i\.id\} invoice=\{i\} onOpen=\{\(\) => openBill\(i\.id\)\} \/>/.test(bills), 'a bill row opens the bill')
ok(/<SubBillDetail/.test(bills) && /useOpenRecord\(\)/.test(bills), '...as its own screen, held in the URL')
ok(!/^[ \t]+function (InvoiceCard|BillRow)\(/m.test(bills), 'the row is declared at module level, not inside the page')
ok(/if \(res\.ok && openId === invoice\.id\) closeBill\(\)/.test(bills), 'deleting the open bill goes back to the list')

const detail = code('components/invoices/sub-bill-detail.tsx')
ok(/<PhoneActionBar>/.test(detail), 'the phone pins the primary action to the bottom')
ok(/Optional - logs that it went to bookkeeping\. Nothing is sent to the sub\./.test(detail),
  'Queue for payment still says, in the open, that nothing is sent to the sub')
ok(/aria-label="View or print"/.test(detail) && /aria-label="Edit bill"/.test(detail) && /aria-label="Delete bill"/.test(detail),
  'the icon-only controls carry a name')
const parts = code('components/bills/detail-parts.tsx')
ok(/sticky bottom-0[^"]*lg:hidden/.test(parts), 'the pinned bar is phone only')

const client = code('components/projects/client-invoices.tsx')
ok(/onOpen\(b\.id\)/.test(client) && /<ClientInvoiceDetail/.test(client), 'a client invoice opens as its own screen too')
ok(/onRecordPayment=\{onSettle \? \(\) => onSettle\(/.test(client),
  "...and Record payment there opens the page's one payment box, never a status flip")
// "i wanna select the whole line not just the invoice number"
ok(/aria-label=\{`Open invoice \$\{b\.invoice_number\}`\}\s*className="absolute inset-0/.test(client),
  'THE WHOLE ROW opens the invoice - a button stretched under it, not just the number')
ok(/pointer-events-none flex min-w-0 flex-1/.test(client) && /relative z-10 ml-auto flex shrink-0 items-center gap-2/.test(client),
  '...the text lets the tap through, and the row\'s own buttons sit above it and keep their clicks')
ok(!/<section className="[^"]*overflow-hidden/.test(client),
  '...and the card does not clip with overflow-hidden, or the last row\'s ... menu is cut off')
const payments = code('app/(dashboard)/projects/[id]/payments/page.tsx')
ok(/openId=\{isAia \? null : openInvoice\}/.test(payments), 'Billing the client holds the open invoice in the URL')
ok(/\{paymentDialog\}/.test(payments) && (payments.match(/\{paymentDialog\}/g) ?? []).length === 2,
  '...and the payment box is reachable from the invoice screen as well as the page')

// "search cant find a invoice number?" - INV-0001 was a client invoice, a
// table search had never queried.
const search = code('app/api/search/route.ts')
ok(/only\('client-invoices', async \(\) => \{[\s\S]{0,200}from\('client_invoices'\)[\s\S]{0,200}invoice_number\.ilike/.test(search),
  'search finds invoices TO the client by number')
ok(/payments\?open=\$\{i\.id\}/.test(search) && /invoices\?open=\$\{i\.id\}/.test(search),
  '...and both kinds of invoice open the record itself, not the top of a list')
ok(/useSearchParams\(\)\.get\(param\)/.test(code('lib/use-open-record.ts')),
  'the open record follows the URL, so a search result on the same page opens it')
done()
