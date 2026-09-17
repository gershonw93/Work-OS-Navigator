// COMBINING SEVERAL SUBS' BILLS INTO ONE CLIENT INVOICE - AND FINDING IT.
//
// THE REPORT: "the feature exists but I couldn't find it - so it's a discovery
// fix, not a clicks fix."
//
// It was all built: the route takes a LIST of sources and the picker has had
// checkboxes over every billable cost the whole time. What it had was a button
// reading "Bill the client" - a verb describing the outcome rather than the
// thing you get to do - and nothing anywhere saying you could tick more than
// one. A FEATURE IS ONLY AS DISCOVERABLE AS ITS LABEL: the same failure as a
// control that leads somewhere other than the thing it names, one step earlier,
// because this one named nothing at all.
//
// AND THE LABEL IS A PROMISE. "from approved costs" is checked here against
// what the picker actually offers - copy is a spec, and this one would be a lie
// if a pending bill could appear in that list.

import { ok, done, code, read } from './_helpers'

const ui = code('components/projects/client-invoices.tsx')
const route = code('app/api/projects/[id]/client-invoices/route.ts')

// ── the label names the job ─────────────────────────────────────────────────
ok(ui.includes('Create client invoice from approved costs'),
  'THE FIX: the button says what pressing it does')
ok(!ui.includes('Bill the client'),
  '...and the old outcome-shaped label is gone, not merely moved')
ok(ui.includes('Select one or several approved bills and costs.'),
  'AND THE FIRST MOVE IS ON SCREEN: one line saying you may pick more than one')

// The line has to be next to the control it is about, or it is decoration.
const linePos = ui.indexOf('Select one or several approved bills and costs.')
const btnPos = ui.indexOf('Create client invoice from approved costs')
ok(linePos > 0 && btnPos > linePos && btnPos - linePos < 400,
  '...immediately above the button, not somewhere else on the card')

// ── the label is true ───────────────────────────────────────────────────────
// "approved costs": the picker's list is built on the route, and a bill that
// has not been approved must never reach it.
ok(/ACTUAL_STATUSES\.has\(String\(i\.status\)\)/.test(route),
  'THE PROMISE: the billable list offers only invoices in an approved status')
ok(/!billedInvoiceIds\.has\(i\.id\)/.test(route),
  '...and never one already on another client invoice')
// The route re-checks on the way in, because the ids come from a browser.
ok(/badStatus/.test(route) && /has not been approved yet/.test(route),
  '...and the create route refuses an unapproved id whatever the picker showed')

// ── select all ──────────────────────────────────────────────────────────────
ok(/Select all \$\{billable\.length\}/.test(ui),
  'SELECT ALL says how many it will take, so its effect is predictable')
ok(/Clear all/.test(ui),
  '...and reads "Clear all" once they are all on, rather than offering a no-op')
ok(/\{picked\.size\} of \{billable\.length\} selected/.test(ui),
  '...with the count beside it, which is what makes either label readable')

// `picked.size === billable.length` is TRUE when both are zero, so an empty
// list would offer to clear a selection nobody made.
ok(/billable\.length > 0 && billable\.every\(b => picked\.has\(key\(b\)\)\)/.test(ui),
  'THE OFF-BY-EMPTY: with nothing billable it is not "all selected"')

// Asked of the list on screen, so the offer and what is in front of you cannot
// disagree - the same rule the contact picker's `alreadyListed` follows.
ok(/new Set\(billable\.map\(key\)\)/.test(ui),
  'select all takes exactly the rows being shown')

// ── a dead button explains nothing ──────────────────────────────────────────
ok(!/disabled=\{billable\.length === 0\}/.test(ui),
  'THE GREYED-OUT BUTTON IS GONE: nothing to bill is a sentence, not a dead control')
ok(/billable\.length === 0 && !building &&\s*\(/.test(ui),
  '...and that sentence no longer waits for there to be no invoices either')
ok(/Nothing to bill yet/.test(ui), '...and it says what to do about it')

// ── the phone ───────────────────────────────────────────────────────────────
ok(/min-h-11/.test(ui), 'the select-all control is a real touch target')
ok(/whitespace-nowrap/.test(ui), '...and its label does not wrap')

done()
