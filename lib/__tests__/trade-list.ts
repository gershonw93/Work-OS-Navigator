// ONE TRADE LIST, AND THE SAME PICKER ON BOTH DOORS.
//
// Asked in four words - "So subs aren't tagged by which trade?" - after the bid
// dropdown surfaced Electrical (13) beside Electric (1) and Elecric (1).
//
// They ARE tagged: `companies.trade`, one trade each. But the directory had TWO
// DOORS onto that one column. Adding a contact made you pick from a `<Select>`;
// EDITING one gave you a bare `<input placeholder="e.g. Flooring, Electrical">`.
// So the tidy path was the one nobody uses twice, and the live directory grew
// "Electric", "Elecric" and "MetroCore Electric Inc." - three electricians who
// do not show up when you pick Electrical to price out electrical work.
//
// AND THE TWO LISTS DISAGREED WITH EACH OTHER. The directory offered "Paint"
// while the scope templates are keyed on "Painting", so a sub filed from the
// directory could never match the template written for them; and the directory
// had no "Excavation" at all, which the templates do.

import { TRADES, tradeChoices, isKnownTrade } from '../trades'
import { TRADE_SCOPES } from '../trade-scopes'
import { foldTrade } from '../sub-trades'
import { ok, done, code } from './_helpers'

// ── the list derives, rather than being a third copy ────────────────────────
for (const s of TRADE_SCOPES) {
  ok(TRADES.some(t => foldTrade(t) === foldTrade(s.trade)),
    `a trade with a scope template is a trade you can file somebody under: ${s.trade}`)
}
ok(TRADES.includes('Excavation'),
  'THE GAP: Excavation is offered now - the templates had it, the directory did not')
ok(TRADES.includes('Painting') && !TRADES.some(t => foldTrade(t) === 'paint'),
  'THE CLASH: one spelling, and it is the one the scope template is keyed on')
ok(TRADES.includes('Structural Steel') && TRADES.includes('Elevators'),
  '...while the directory-only trades survive - they are real, they just have no template')

// Alphabetical, with the fallback last. A 30-item picker you scan has to be
// in a predictable order.
const body = TRADES.slice(0, -1)
ok(TRADES[TRADES.length - 1] === 'Other', '"Other" sorts last - it is a fallback, not a choice')
ok(body.every((t, i) => i === 0 || body[i - 1].localeCompare(t) <= 0),
  '...and everything above it is alphabetical')
ok(new Set(TRADES.map(foldTrade)).size === TRADES.length, 'no trade appears twice')

// ── an existing value is never silently replaced ────────────────────────────
ok(tradeChoices('Elecric')[0] === 'Elecric',
  'THE DATA IS SAFE: a sub already filed under a typo keeps it, first in the list')
ok(tradeChoices('Elecric').length === TRADES.length + 1, '...added to the list, not swapped into it')
ok(tradeChoices('Electrical').length === TRADES.length,
  'a value already on the list is not duplicated')
ok(tradeChoices('electrical').length === TRADES.length,
  '...whatever its case, so opening a card cannot re-case somebody')
ok(tradeChoices('').length === TRADES.length && tradeChoices(null).length === TRADES.length,
  'nothing stored means just the list')
ok(tradeChoices('  ').length === TRADES.length, '...and whitespace is nothing')

ok(isKnownTrade('Electrical') && !isKnownTrade('Elecric') && !isKnownTrade(null),
  'isKnownTrade answers which stored values the app would offer today')

// ── both doors ask the same question ────────────────────────────────────────
const dir = code('app/(dashboard)/directory/page.tsx')
ok(/from '@\/lib\/trades'/.test(dir), 'the directory reads the shared list')
ok(!/const TRADES = \[/.test(dir),
  'THE SECOND COPY IS GONE: no local list to drift from the templates again')

// The edit form is the door the typos came through.
// Matched on the placeholder ITSELF, not on a span between two anchors: the
// first version was `value={editTrade}[^>]*placeholder="e.g.`, and `[^>]*`
// cannot cross the `=>` inside the onChange between them. So it passed with
// the free-text box sitting right there - a check that could never fail.
ok(!dir.includes('placeholder="e.g. Flooring, Electrical"'),
  'THE FIX: editing a contact no longer offers a free-text trade box')
ok(!/<input[^>]*value=\{editTrade\}/.test(dir),
  '...and the trade is not an <input> on that form at all')
ok(/<Select value=\{editTrade\}/.test(dir), '...it is the same picker adding one uses')
ok(/tradeChoices\(editTrade\)/.test(dir), '...seeded with whatever that contact is already filed under')
ok(/<option value="">No trade set<\/option>/.test(dir),
  '...and clearing a trade is still possible, said plainly')

// Adding still picks from the list.
ok(/\{TRADES\.map\(t => <option key=\{t\} value=\{t\}>\{t\}<\/option>\)\}/.test(dir),
  'adding a contact still picks from the list')

done()
