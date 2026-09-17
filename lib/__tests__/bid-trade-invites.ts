// PICK A TRADE, GET YOUR SUBS, INVITE THEM ALL AT ONCE.
//
// THE REPORT: "New Request still shows the free-text Trade field with
// placeholder 'e.g. Electrical' - no saved-trade dropdown, no sub checkboxes,
// no bulk invite." And, when I hedged about keeping free text: "I'm creating a
// bid. I'm trying to price out electrical. So it's trade based. No?" - yes.
// The trade is the KEY. A box with an example in it groups nothing and cannot
// find you one electrician.
//
// THE LIST IS A UNION and both halves cost something if dropped:
//   - the 21 standard trades, because the trade also drives the scope template.
//     Offering only trades you already have subs for means a GC with no
//     electrician cannot pick Electrical and loses the built scope with it.
//   - every trade actually on a sub, because a trade the list does not offer is
//     a group of subs nobody can reach. The live directory has "Concrete /
//     Foundation", "Site Work" and "Low Voltage / Security" - none standard.
//
// AND THE COUNT IS IN THE OPTION, which is how the live data's "Electrical"
// (13), "Electric" (1) and "Elecric" (1) become visible instead of quietly
// stranding two electricians.

import { tradeOptions, subsInTrade, tradeOptionLabel, foldTrade, NO_TRADE } from '../sub-trades'
import { TRADE_SCOPES } from '../trade-scopes'
import { ok, done, code } from './_helpers'

// Shaped on the real directory, typos included.
const DIRECTORY = [
  ...Array.from({ length: 13 }, (_, i) => ({ id: `e${i}`, name: `Electric Co ${i}`, trade: 'Electrical' })),
  { id: 'x1', name: 'Volt Bros', trade: 'Electric' },
  { id: 'x2', name: 'Sparky', trade: 'Elecric' },
  { id: 'p1', name: 'Pipes R Us', trade: 'Plumbing' },
  { id: 'c1', name: 'Pour It', trade: 'Concrete / Foundation' },
  { id: 'n1', name: 'Unfiled Sub', trade: null },
  { id: 'n2', name: 'Also Unfiled', trade: '   ' },
]

const opts = tradeOptions(DIRECTORY)
const byName = (t: string) => opts.find(o => o.trade === t)

// ── the union ───────────────────────────────────────────────────────────────
ok(byName('Electrical')?.count === 13, 'THE POINT: Electrical holds the 13 electricians')
ok(byName('Plumbing')?.count === 1, '...and Plumbing its one')
ok(!!byName('Roofing') && byName('Roofing')!.count === 0,
  'a standard trade with NOBODY yet is still offered - it builds the scope template')
ok(byName('Roofing')?.hasScope === true, '...and says so')
ok(byName('Concrete / Foundation')?.count === 1,
  'a trade only your directory knows is offered too, or its subs are unreachable')
ok(byName('Concrete / Foundation')?.hasScope === false, '...and admits it has no template')
ok(opts.filter(o => o.hasScope).length === TRADE_SCOPES.length,
  'every standard trade appears exactly once')

// ── the typos are VISIBLE rather than merged ────────────────────────────────
// Merging them would be a guess about what somebody meant; showing the count
// beside each is what lets a human fix the directory.
ok(byName('Electric')?.count === 1 && byName('Elecric')?.count === 1,
  'THE TYPOS: "Electric" and "Elecric" are their own options, not silently folded into Electrical')
ok(tradeOptionLabel(byName('Elecric')!) === 'Elecric (1)',
  '...each printing its count, which is the only thing that makes the mistake visible')
ok(tradeOptionLabel(byName('Roofing')!) === 'Roofing',
  '...and a trade with nobody prints no "(0)", which would read as broken')

// ── case and whitespace are one trade, not several ──────────────────────────
const messy = tradeOptions([
  { trade: 'Electrical' }, { trade: 'electrical' }, { trade: '  Electrical  ' }, { trade: 'ELECTRICAL' },
])
ok(messy.find(o => o.trade === 'Electrical')?.count === 4,
  'case and spacing do not split a crew across four options')
ok(foldTrade('  Two   Words ') === 'two words', 'folding collapses inner whitespace as well')

// ── the untraded bucket ─────────────────────────────────────────────────────
ok(byName(NO_TRADE)?.count === 2,
  'subs with no trade get a bucket - otherwise they are unreachable from a trade picker')
ok(opts[opts.length - 1].trade === NO_TRADE, '...and it sorts LAST, not among the real trades')
ok(tradeOptionLabel(byName(NO_TRADE)!) === 'No trade set (2)', '...reading as what it is')
ok(tradeOptions([{ trade: 'Electrical' }]).every(o => o.trade !== NO_TRADE),
  '...and is absent entirely when nobody is unfiled')

// ── picking a trade returns its subs ────────────────────────────────────────
ok(subsInTrade(DIRECTORY, 'Electrical').length === 13, 'picking Electrical returns the 13')
ok(subsInTrade(DIRECTORY, 'electrical').length === 13, '...whatever the case of the stored value')
ok(subsInTrade(DIRECTORY, 'Electric').length === 1, '...and the typo returns only its own')
ok(subsInTrade(DIRECTORY, NO_TRADE).length === 2, 'the bucket returns the unfiled ones')
ok(subsInTrade(DIRECTORY, '').length === 0 && subsInTrade(DIRECTORY, null).length === 0,
  'no trade picked returns nobody, rather than everybody')
ok(subsInTrade(DIRECTORY, 'Roofing').length === 0, 'a trade you have nobody for returns nobody')

// ── the screen ──────────────────────────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')
ok(!/placeholder="e\.g\. Electrical" \/><\/div>\s*<\/div>/.test(page) && /<select\s+value=\{trade\}/.test(page),
  'THE FIX: the Trade field is a select, not a free-text box')
ok(/tradeOptions\(subs\)/.test(page), '...built from the directory')
ok(/-- Select a trade --/.test(page),
  '...starting EMPTY, because a picker that starts on a value is a claim nobody made')
ok(/subsInTrade\(subs, trade\)/.test(page), 'picking one lists that trade\'s subs')
ok(/Select all \$\{tradeSubs\.length\}/.test(page) && /Clear all/.test(page),
  '...with a select-all that names its direction and its count')
ok(/tradeSubs\.length > 0 && tradeSubs\.every\(/.test(page),
  '...and "all picked" asks the list, so an empty one is not "all selected"')

// The directory row has to CARRY the trade, which is what it was dropping.
ok(/trade: c\.trade/.test(page), 'the directory load keeps each sub\'s trade')

// One click: the invites ride along with the create.
ok(/bid-requests\/\$\{newId\}\/invites/.test(page), 'the invites go out with the request')
ok(/invitees: picked\.map/.test(page), '...as ONE call carrying the list, not one call each')
ok(/created\?\.request\?\.id/.test(page) && !/created\?\.id/.test(page),
  'THE KEY IS READ, NOT GUESSED: the route answers { request }, and a ?? chain of two guesses is the tell nobody checked')
// A failed invite must not read as a failed create - that gets the request made twice.
ok(/The request was created, but the invites did not go out/.test(page),
  'a failure to invite is reported as itself, never as "could not create"')
// The address decides whether an invite can be sent at all.
ok(/No email on file/.test(page), 'a sub with no address says so in the row, before you tick it')

done()
