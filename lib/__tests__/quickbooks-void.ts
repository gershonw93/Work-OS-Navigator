// A badge that reported a wish.
//
// THE REPORT was "voiding an invoice shows 'Voided in QB' but never tells
// QuickBooks". The premise turned out to be wrong - `voidClientInvoiceInQbo`
// issues a real `POST invoice?operation=void`. The bug underneath is narrower
// and worse: the result was DISCARDED, and the chip was computed from
//
//     status === 'void' && qbo_id != null
//
// where `qbo_id` is stamped when the invoice is CREATED over there. So a void
// that failed still printed green over a receivable still open in QuickBooks -
// and because it looked done, nobody went and fixed it by hand.
//
// lib/invoice-qb-state.ts exists BECAUSE of this exact mistake one pair of
// facts over. Its own header: "The tick was true and the row was a lie."

import { invoiceQbChip } from '../invoice-qb-state'
import { ok, done, code } from './_helpers'

const chip = (inv: any, connected = true) => invoiceQbChip(inv, connected)

// ── the reported case ────────────────────────────────────────────────────────
const failed = chip({ status: 'void', qbo_id: '42', qbo_voided_at: null })
ok(failed.show && failed.tone === 'warn',
  'a void QuickBooks never confirmed is a WARNING, not a green tick')
ok(failed.show && /not sent/i.test(failed.label), `...and says so: "${failed.show && failed.label}"`)
ok(failed.show && /still open/i.test(failed.title),
  '...and the tooltip says the receivable is still open over there')
ok(!(failed.show && failed.label === 'Voided in QB'),
  'the old green label is gone from the unconfirmed case')

const confirmed = chip({ status: 'void', qbo_id: '42', qbo_voided_at: '2026-09-08T10:00:00Z' })
ok(confirmed.show && confirmed.tone === 'ok' && confirmed.label === 'Voided in QB',
  'a void QuickBooks DID confirm still reads "Voided in QB"')

// An invoice that never reached QuickBooks has nothing over there to void, so
// saying anything about QuickBooks would be noise.
const neverThere = chip({ status: 'void', qbo_id: null, qbo_voided_at: null })
ok(!neverThere.show, 'an invoice that never reached QuickBooks says nothing about QuickBooks')

// A company with no connection is told nothing, as before.
ok(!chip({ status: 'void', qbo_id: '42', qbo_voided_at: null }, false).show,
  'no connection, no chip')

// ── the branches that already worked must keep working ───────────────────────
ok(!chip({ status: 'draft', qbo_id: null }).show, 'a draft is not a receivable')
const notThere = chip({ status: 'sent', qbo_id: null })
ok(notThere.show && notThere.tone === 'warn' && /Not in QuickBooks/.test(notThere.label),
  'a sent invoice with no qbo_id still warns')
const sent = chip({ status: 'sent', qbo_id: '42' })
ok(sent.show && sent.tone === 'ok', 'a sent invoice that reached QuickBooks still ticks')
const paidBoth = chip({ status: 'paid', qbo_id: '42', settlement: { recorded: true, in_qbo: true } })
ok(paidBoth.show && /paid/.test(paidBoth.label), 'paid here and settled there still reads paid')
const paidHere = chip({ status: 'paid', qbo_id: '42', settlement: { recorded: true, in_qbo: false } })
ok(paidHere.show && paidHere.tone === 'warn',
  'paid here but not settled there is still the warning this file was written for')
// Missing field, not false: a caller that has not been updated must not flip a
// confirmed void into a warning by omission... and must not do the reverse
// either. Absent reads as "not confirmed", which is the safe direction.
const legacy = chip({ status: 'void', qbo_id: '42' })
ok(legacy.show && legacy.tone === 'warn',
  'an unknown void state reads as unconfirmed - the safe direction to be wrong in')

// ── the push actually does both halves ───────────────────────────────────────
const push = code('lib/quickbooks-push.ts')
const voidFn = push.slice(push.indexOf('export async function voidClientInvoiceInQbo'))
  .split('\nexport ')[0]

ok(/LinkedTxn/.test(voidFn),
  'the void looks for payments linked to the invoice')
ok(/TxnType === 'Payment'/.test(voidFn), '...specifically Payments')
ok(/voidQboRecord\(conn, 'payment'/.test(voidFn),
  'and voids them FIRST - QuickBooks refuses to void an invoice a payment is linked to')
ok(voidFn.indexOf("voidQboRecord(conn, 'payment'") < voidFn.indexOf("'invoice?operation=void'"),
  '...before the invoice, not after, which is the whole point')
ok(/markVoided\(/.test(voidFn), 'success is recorded, so the chip has a fact to read')
ok(/TotalAmt\) === 0/.test(voidFn),
  'an invoice already voided over there is recognised rather than voided twice')
ok(/QBO_OBJECT_NOT_FOUND/.test(voidFn),
  'an invoice QuickBooks no longer has counts as voided, not as a failure')

const marker = push.slice(push.indexOf('async function markVoided'))
  .split('\nexport ')[0]
ok(/qbo_voided_at/.test(marker), 'markVoided stamps the new column')
ok(/42703/.test(marker), '...and a database without migration 097 can still void')

// ── the route stops throwing the answer away ─────────────────────────────────
const route = code('app/api/projects/[id]/client-invoices/[billId]/route.ts')
ok(/const res = await voidClientInvoiceInQbo/.test(route),
  'the route keeps the PushResult instead of discarding it')
ok(/quickbooks/.test(route), '...and returns what happened')
ok(!/^\s*await voidClientInvoiceInQbo\(db, params\.billId\)\s*$/m.test(route),
  'the fire-and-forget call is gone')

const client = code('components/projects/client-invoices.tsx')
ok(/quickbooks\.voided === false/.test(client), 'the screen reads it')
ok(/still an open receivable/.test(client), '...and says what it means in money terms')

// ── a failed void is recoverable ─────────────────────────────────────────────
// It never was: the sync route had no void entity, and its client-invoice
// branch filters status in ('sent','paid'), so a voided invoice was excluded by
// definition. Voiding is one-way in the UI, so nothing could re-trigger it.
const sync = code('app/api/quickbooks/sync/route.ts')
ok(/entity === 'voids'/.test(sync), 'the sync route can retry voids')
ok(/is\('qbo_voided_at', null\)/.test(sync), '...picking exactly the unconfirmed ones')
ok(/voidClientInvoiceInQbo\(db, b\.id, ctx\)/.test(sync), '...through the same push function')

const status = code('app/api/quickbooks/status/route.ts')
ok(/unsentVoids/.test(status), 'the backlog counts them')
ok(/eq\('status', 'void'\)/.test(status), '...by status')

const card = code('components/settings/quickbooks-card.tsx')
ok(/sync\('voids'\)/.test(card), 'Settings offers the retry')
ok(/unsentVoids/.test(card), '...and stops claiming everything is in QuickBooks when it is not')

// ── the stale copy names what actually syncs ─────────────────────────────────
ok(!/client payments \(as sales receipts\)\. Bills and payments auto-create/.test(card),
  'the old sentence is gone')
ok(/the invoices you send your client/.test(card), 'client invoices are named')
ok(/the payments settling them/.test(card), 'bill payments are named')
ok(/applied against the invoice it settles/.test(card),
  'payments are described as applied, which is what they have been since #323')
ok(/Voids and amount corrections follow through/.test(card),
  '...and it no longer says "one way" about a system that pushes voids and edits')

done()
