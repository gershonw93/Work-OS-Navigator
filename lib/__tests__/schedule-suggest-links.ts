/**
 * THE ROOT CAUSE UNDER EVERY SCHEDULE FEATURE: NOBODY LINKS ANYTHING.
 *
 * 121 schedule lines across 26 jobs, FIVE links between them, and all 121
 * trades null. The cascade, the review screen, the shift email and the delay
 * action are all correct and all idle - which is indistinguishable, from the
 * outside, from a feature that never deployed.
 *
 * WHAT THIS PINS, each of which is a way the change comes undone:
 *   - `trade` survives the POST route, which had been dropping it since
 *     placeholders shipped (and is why all 121 were null)
 *   - the trade is read from ONE place, because it lives on the subcontract
 *     for a line that has one and on the line itself for a placeholder
 *   - the order table is DECLARED and is not `HARD_COST_CATEGORIES`, which
 *     puts drywall above the rough-ins
 *   - every one of the suggester's four refusals, tested at the case where
 *     the refusal is the only thing standing between it and a wrong answer
 *   - a suggestion never carries a percent gate
 *   - nothing here writes: the module has no fetch, the chip stages
 */
import { ok, done, code, read } from './_helpers'
import { tradePhase, TRADE_PHASES, UNPLACED, isPlacedTrade } from '../trade-order'
import { suggestLinks, suggestionFor, type SuggestableLine } from '../schedule-suggest-links'
import { lineTrade } from '../schedule-events'

// ── 1. The dropped trade ─────────────────────────────────────────────────────
console.log('\nThe trade reaches the database')

{
  const route = code('app/api/projects/[id]/schedule/route.ts')
  ok(/const \{[^}]*\btrade\b[^}]*\} = await request\.json\(\)/.test(route),
    'the POST route destructures `trade` off the body')
  ok(/\btrade:\s*String\(trade/.test(route),
    '...and puts it on the row it inserts')
  // The 42703 retry strips the columns an un-migrated database lacks. A new
  // column left out of it turns a missing-column error into a failed insert.
  ok(/delete row\.label;\s*delete row\.color;\s*delete row\.trade/.test(route),
    '...and the missing-column retry strips it with the others')

  const picker = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/body: JSON\.stringify\(\{ label: trade, trade,/.test(picker),
    'the placeholder creator still sends it - it always did; the route was the bug')
}

// ── 2. One home for "what trade is this line" ────────────────────────────────
console.log('\nThe trade is read from one place')

{
  ok(lineTrade({ trade: 'Framing', subcontracts: null }) === 'Framing',
    'a placeholder carries its own trade')
  ok(lineTrade({ trade: null, subcontracts: { scope: 's', trade: 'Electrical', companies: null } }) === 'Electrical',
    'a line with a subcontract takes the trade from the subcontract')
  ok(lineTrade({ trade: '  ', subcontracts: { scope: 's', trade: 'HVAC', companies: null } }) === 'HVAC',
    'a blank own-trade is not an answer')
  ok(lineTrade({ trade: null, subcontracts: null }) === null,
    'a milestone has no trade, and that is a null rather than a guess')

  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(!/\(i as any\)\.trade \|\|/.test(page),
    'the picker no longer names lines from the column alone')
  ok(/lineTrade\(i\) \|\| getLabel\(i\)/.test(page),
    '...it asks the one reader, so a sub line stops showing its scope paragraph')

  // The other half of "one home": a line that HAS a subcontract must not be
  // offered a second place to write the trade.
  ok(/item\.subcontract_id \? \{\} : \{ trade:/.test(page),
    'and only a line with no subcontract sends a trade of its own')
}

// ── 3. The order table is declared, and is not the budget dropdown ───────────
console.log('\nThe build order is declared')

{
  const rough = tradePhase('Electrical')
  const drywall = tradePhase('Drywall')
  ok(!!rough && !!drywall && rough!.order < drywall!.order,
    'the rough-ins come BEFORE drywall - the exact pair HARD_COST_CATEGORIES gets wrong')

  const order = read('lib/trade-order.ts')
  ok(!/HARD_COST_CATEGORIES/.test(code('lib/trade-order.ts')),
    'and the table does not import the budget dropdown ordering')
  ok(/HARD_COST_CATEGORIES/.test(order),
    '...while the comment still explains why, so nobody re-derives it from there')

  ok(tradePhase('Plumbing')!.key === tradePhase('HVAC')!.key,
    'the rough-ins are ONE phase - ranking them would invent a sequence')
  ok(tradePhase('Foundation')!.order < tradePhase('Framing')!.order,
    'foundation before framing')
  ok(tradePhase('Framing')!.order < tradePhase('Roofing')!.order,
    'framing before the roof')
  ok(tradePhase('Insulation')!.order < tradePhase('Drywall')!.order,
    'insulation before drywall')
  ok(tradePhase('Drywall')!.order < tradePhase('Flooring')!.order,
    'drywall before flooring')

  // THE MATCH IS EXACT. "Elecric" is a real spelling in this directory.
  ok(tradePhase('Elecric') === null, 'a typo matches nothing - never the nearest trade')
  ok(tradePhase('Elec') === null, 'nor does an abbreviation')
  ok(tradePhase('Electrical rough-in') === null, 'nor a longer string that contains a trade')
  ok(tradePhase('') === null && tradePhase(null) === null, 'and nor does nothing at all')

  ok(tradePhase('  eLeCtRiCaL ') !== null,
    'but case and stray whitespace are not a different trade - foldTrade, same as everywhere')

  for (const trade of UNPLACED) {
    ok(!isPlacedTrade(trade), `${trade} is deliberately unplaced, so it proposes nothing`)
  }

  const orders = TRADE_PHASES.map(p => p.order)
  ok(new Set(orders).size === orders.length, 'no two phases share an order')
  ok(orders.every((n, i) => i === 0 || n > orders[i - 1]), 'and the table reads in order')
}

// ── 4. The four refusals ─────────────────────────────────────────────────────
console.log('\nThe suggester refuses rather than reaching')

const line = (o: Partial<SuggestableLine> & { id: string }): SuggestableLine => ({
  name: o.trade ?? o.id, trade: null, start_date: '2026-03-02', end_date: '2026-03-06',
  kind: 'work', ...o,
})

{
  // The shape that SHOULD suggest, so every refusal below is one change away
  // from it - a fixture that only exercises the refusing case cannot tell you
  // whether the rule fires or whether nothing ever fires.
  const framing = line({ id: 'f', trade: 'Framing', start_date: '2026-03-02', end_date: '2026-03-06' })
  const drywall = line({ id: 'd', trade: 'Drywall', start_date: '2026-03-09', end_date: '2026-03-13' })

  const base = suggestLinks({ lines: [framing, drywall], deps: [] })
  ok(base.length === 1 && base[0].task_id === 'd' && base[0].predecessor_task_id === 'f',
    'drywall is offered framing')
  ok(/framing/i.test(base[0].because) && /drywall/i.test(base[0].because),
    '...with a sentence naming both, so the chip can be judged rather than clicked')

  // 1. No phase, no suggestion.
  ok(suggestLinks({ lines: [framing, { ...drywall, trade: 'PL&SP' }], deps: [] }).length === 0,
    'an unplaced trade is offered nothing')
  ok(suggestLinks({ lines: [framing, { ...drywall, trade: null }], deps: [] }).length === 0,
    'and neither is a milestone with no trade at all')
  ok(suggestLinks({ lines: [{ ...framing, trade: 'Substantial Completion' }, drywall], deps: [] }).length === 0,
    'an unplaced PREDECESSOR is refused too, not only an unplaced follower')

  // 2. The dates must already agree - the load-bearing one.
  ok(suggestLinks({
    lines: [{ ...framing, start_date: '2026-03-09', end_date: '2026-03-20' }, drywall], deps: [],
  }).length === 0, 'framing that finishes AFTER drywall starts is not suggested')
  ok(suggestLinks({
    lines: [{ ...framing, end_date: '2026-03-09' }, drywall], deps: [],
  }).length === 1, 'finishing ON the day it starts is fine - the boundary is inclusive')
  ok(suggestLinks({
    lines: [{ ...framing, end_date: '2026-03-10' }, drywall], deps: [],
  }).length === 0, 'one day past it is not')

  // 3. Never a loop.
  ok(suggestLinks({
    lines: [framing, drywall],
    deps: [{ task_id: 'f', predecessor_task_id: 'd' }],
  }).length === 0, 'a link that would close a loop is never offered')

  // 4. One per line, and only for a line with nothing linked.
  ok(suggestLinks({
    lines: [framing, drywall],
    deps: [{ task_id: 'd', predecessor_task_id: 'other' }],
  }).length === 0, 'a line somebody has already linked is left alone')

  const sitework = line({ id: 's', trade: 'Site Work', start_date: '2026-02-02', end_date: '2026-02-06' })
  const three = suggestLinks({ lines: [sitework, framing, drywall], deps: [] })
  ok(three.filter(s => s.task_id === 'd').length === 1, 'never two suggestions for one line')
  ok(three.find(s => s.task_id === 'd')!.predecessor_task_id === 'f',
    '...and the one offered is the NEAREST phase below, not the earliest')
  ok(three.find(s => s.task_id === 'f')!.predecessor_task_id === 's',
    'while framing gets its own, from site work')

  // Among two lines in the same phase, the one that finishes LAST is the one
  // actually holding this up.
  const framingB = line({ id: 'f2', trade: 'Framing', start_date: '2026-03-02', end_date: '2026-03-08' })
  const pair = suggestLinks({ lines: [framing, framingB, drywall], deps: [] })
  ok(pair.find(s => s.task_id === 'd')!.predecessor_task_id === 'f2',
    'of two framing lines, the later finisher is the one offered')

  // Deliveries, both directions.
  const delivery = line({ id: 'v', trade: 'Materials', kind: 'delivery', end_date: '2026-03-06' })
  const withDelivery = suggestLinks({ lines: [delivery, drywall], deps: [] })
  ok(withDelivery.length === 0, 'a delivery is never suggested as a predecessor')
  ok(suggestLinks({
    lines: [framing, { ...delivery, start_date: '2026-03-09' }], deps: [],
  }).every(s => s.task_id !== 'v'), 'and a delivery is never given a suggestion either')

  ok(suggestionFor('d', { lines: [framing, drywall], deps: [] })?.predecessor_task_id === 'f',
    'suggestionFor answers for one line - what a dialog actually asks')
  ok(suggestionFor('nobody', { lines: [framing, drywall], deps: [] }) === null,
    '...and null for a line it has nothing to say about')

  // Two suggestions accepted together must not close a loop neither closes
  // alone - so each proposal counts as known for the ones after it.
  const a = line({ id: 'a', trade: 'Framing', start_date: '2026-03-02', end_date: '2026-03-06' })
  const b = line({ id: 'b', trade: 'Drywall', start_date: '2026-03-02', end_date: '2026-03-06' })
  const both = suggestLinks({ lines: [a, b], deps: [] })
  ok(both.length <= 1, 'two lines cannot both be offered each other')
}

// ── 5. A suggestion is an offer, and carries no gate ─────────────────────────
console.log('\nIt offers; it never writes, and never gates')

{
  const mod = code('lib/schedule-suggest-links.ts')
  ok(!/fetch\(|supabase|createClient/.test(mod),
    'the suggester touches no route and no database - it is arithmetic')
  ok(/findCycle/.test(mod) && !/function findCycle/.test(mod),
    'and it REUSES findCycle rather than writing a second cycle check')

  const picker = code('components/schedule/dependency-picker.tsx')
  ok(/onStage\(\{[^}]*min_predecessor_progress: null/.test(picker),
    'the chip stages with NO percent gate - a gate is a human statement')
  ok(/onStage\(\{[^}]*lag_days: 0/.test(picker), '...and no extra days')
  ok(/suggestion && \(/.test(picker), 'and nothing renders when there is no suggestion')
  // The chip must STAGE, exactly as typing it would. If it ever calls a route
  // directly, the dialog is back to the "why is it a 2 step" bug and Cancel
  // stops meaning cancel.
  const chipBlock = picker.slice(picker.indexOf('nothingLinked && suggestion'))
  ok(!/fetch\(/.test(chipBlock.slice(0, 1400)),
    'the chip writes nothing on its own - Save Changes still commits')

  ok(/nothingLinked && suggestion/.test(picker),
    'and it is only offered on a line with nothing linked')
}

// ── 6. The trade finally has a control, and a delivery has no percent ────────
console.log('\nThe fields that had no box')

{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/id="etrade"/.test(page),
    'a placeholder line can be given a trade - the PATCH route has whitelisted it all along')
  ok(/editBody\(editItem\)/.test(page),
    'and both save paths send ONE body, so a new field cannot reach only one door')
  ok((page.match(/body: JSON\.stringify\(editBody\(editItem\)\)/g) ?? []).length === 2,
    '...both of them')
  ok(/!isDelivery\(editItem\) && \(\s*<ProgressField/.test(page),
    'a delivery is not offered a percent - it lands or it does not')
}

done()
