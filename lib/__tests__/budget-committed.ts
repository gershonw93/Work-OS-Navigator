// Three reported money bugs, all the same shape: something silently incomplete,
// presented as complete.
//
// 1. Committed read $160,000 on a job with ONE $80,000 subcontract. The card
//    held two derivations at once - the headline from committedTotal (every
//    contract + committed typed on lines with no contract) and the note under it
//    summed per LINE. Rows added to $80,000, note said $55,000, headline said
//    $160,000. Three numbers, one question.
// 2. A scanned receipt with no budget line never reaches the budget, while the
//    page says receipts flow into project costs.
// 3. A quote recommendation read "this is the only quote submitted" with two
//    quotes on screen - the second arrived 59 seconds after the analysis ran.

import { budgetTotals, rollupBudgetLines } from '../invoice-budget'
import { committedTotal } from '../committed'
import { ok, done, code } from './_helpers'

// ── the reported job, exactly as it is on production ─────────────────────────
const lines = [{
  id: 'line-1', description: 'Foundation concrete - QA',
  budgeted_amount: 100_000, committed_amount: 80_000, actual_amount: 25_000,
  subcontract_id: null,
}]
const subs = [{ id: 'sub-1', contract_amount: 80_000 }]

const c = committedTotal({ subcontracts: subs, lines })
ok(c.total === 160_000, `the raw derivation gives $160,000 (got ${c.total})`)
ok(c.subcontractsWithNoBudgetLine === 80_000,
  '...of which $80,000 is a contract no budget line points at - the half that was invisible')

const rolled = rollupBudgetLines({ lines: lines as any, invoices: [], changeOrders: [], subs: subs as any, materials: [], allocations: [] })
const t = budgetTotals(rolled, subs)

ok(t.committed === 160_000, 'the card headline is the shared derivation')
ok(t.committed_unlinked === 80_000, '...and the screen can say how much of it is on no row')
ok(t.committed - t.committed_unlinked === 80_000, '...so "on lines" and "not linked" add up to the headline')

// THE BUG: the note under the headline was summed per line, so it disagreed
// with the headline it sat beneath.
ok(t.committed_not_billed >= t.committed_unlinked,
  'the "not yet billed" note includes the unlinked contract, like the headline does')
ok(t.committed_not_billed !== 55_000,
  'it is no longer the per-line-only $55,000 that contradicted the $160,000 above it')

// Linking the contract to the line removes the double count entirely - which is
// what the card now tells somebody to do.
const linked = [{ ...lines[0], subcontract_id: 'sub-1' }]
const cl = committedTotal({ subcontracts: subs, lines: linked })
ok(cl.total === 80_000, 'linking the subcontract to the line gives $80,000, counted once')
ok(cl.subcontractsWithNoBudgetLine === 0, '...and nothing is left off the rows')

// ── a receipt only reaches the budget when it has a line ─────────────────────
const withLine = rollupBudgetLines({
  lines: lines as any, invoices: [], changeOrders: [], subs: subs as any,
  materials: [{ budget_line_id: 'line-1', amount: 186.51 }] as any, allocations: [],
})
const noLine = rollupBudgetLines({
  lines: lines as any, invoices: [], changeOrders: [], subs: subs as any,
  materials: [{ budget_line_id: null, amount: 186.51 }] as any, allocations: [],
})
ok(withLine[0].materials_amount === 186.51, 'a receipt WITH a budget line lands in the budget')
ok(noLine[0].materials_amount === 0, 'a receipt with none does not - which is why the screen has to say so')

const view = code('components/materials/materials-view.tsx')
ok(/will not appear in the/.test(view), 'the form warns before saving an unlinked receipt')
ok(/Not in the budget/.test(view), '...and an existing one is findable in the list')

// ── a stale recommendation says so ───────────────────────────────────────────
const block = code('components/quotes/comparison-block.tsx')
ok(/per_quote \?\? \[\]\)\.map\(p => p\.quote_id\)/.test(block),
  'staleness is worked out from the quotes the analysis actually saw')
ok(/Recommendation is out of date/.test(block), '...and the screen says so rather than presenting it as current')
ok(!/analyzed_at/.test(block), '...without needing a timestamp column that could disagree with it')

// ── THE RETEST. Numbers as they appear on QA Ground-Up 2026 ─────────────────
//
// The tester was right and sharper than the first fix: "the $160,000 may be
// right and Left to spend is the liar - it only counts the linked $80k." It
// did. `projected_cost` was summed per LINE while `committed` counted contracts
// too, so the card contradicted itself and the unlinked contract was on no row.
const withReceipt = budgetTotals(
  rollupBudgetLines({ lines: lines as any, invoices: [], changeOrders: [], subs: subs as any, materials: [], allocations: [] }),
  subs,
  [{ amount: 186.51 }],
)

ok(withReceipt.committed === 160_000, 'Committed is $160,000')
ok(withReceipt.projected_cost === 160_000 + 186.51,
  `...and the exposure agrees with it (got ${withReceipt.projected_cost})`)
ok(Math.round(withReceipt.remaining) === -60_187,
  `Left to spend is NEGATIVE, not $20,000 (got ${Math.round(withReceipt.remaining)})`)
ok(withReceipt.remaining < 0, '...which is the honest answer for $160k committed against a $100k budget')

// The receipt reaches the budget now, whether or not anybody filed it.
ok(withReceipt.materials_unassigned === 186.51, 'the unfiled receipt is named')
ok(withReceipt.actual === 25_000 + 186.51,
  `...and is inside Actual Spent (got ${withReceipt.actual})`)
ok(withReceipt.materials === 186.51, '...and inside the materials split, so the tile still closes')

// Filing everything collapses it to the truth: one $80,000 commitment.
const filedLines = [{ ...lines[0], subcontract_id: 'sub-1' }]
const filed = budgetTotals(
  rollupBudgetLines({
    lines: filedLines as any, invoices: [], changeOrders: [], subs: subs as any,
    materials: [{ budget_line_id: 'line-1', amount: 186.51 }] as any, allocations: [],
  }),
  subs,
  [],
)
ok(filed.committed === 80_000, 'after filing, Committed is $80,000 - counted once')
ok(filed.committed_unlinked === 0, '...nothing is left off the rows')
ok(filed.materials_unassigned === 0, '...and no receipt is unfiled')
// NOT `25_000 + 186.51`: once a line carries a subcontract, rollupBudgetLines
// derives its actual from bills against that contract rather than from a typed
// actual_amount, so the fixture's hand-typed 25,000 is correctly replaced. The
// point being asserted is that the receipt did not vanish when it was filed.
ok(filed.materials === 186.51, '...while the receipt still counts, now against its line')
ok(filed.actual >= 186.51, '...and is inside Actual Spent rather than dropped')

// ── the screen shows it, and can file it ─────────────────────────────────────
const route = code('app/api/projects/[id]/budget/route.ts')
ok(/unlinked_subcontracts/.test(route), 'the route sends the contracts that are on no line')
ok(/unassigned_receipts/.test(route), '...and the receipts that are on no line')
const budgetPage = code('app/(dashboard)/projects/[id]/budget/page.tsx')
ok(/Not on a budget line/.test(budgetPage), 'the screen shows them as their own rows')
ok(/fileAgainstLine\('sub'/.test(budgetPage) && /fileAgainstLine\('receipt'/.test(budgetPage),
  '...each with a way to file it against a line')

// ── the stale recommendation is not on screen ───────────────────────────────
ok(/showStale && \(/.test(block), 'the stale recommendation text is behind a toggle')
ok(/Show the old recommendation/.test(block), '...which says what it is')
ok(!/stale \? 'text-muted-fg' : 'text-ink-soft'/.test(block),
  '...rather than being printed greyed-out under a warning, which still leaves it on screen')

// ── who gets told is findable ────────────────────────────────────────────────
const settings = code('app/(dashboard)/settings/page.tsx')
ok(/id: 'who-gets-told'/.test(settings), 'Who gets told is its own settings tab')
ok(/'who-gets-told':\s*\{ resource: 'settings_company', action: 'edit' \}/.test(settings),
  '...gated on company settings, as before')
// Proximity in the file is not nesting - the two blocks sit next to each other,
// so a "within N characters" check matched even after the move. Look at the
// notifications block itself instead.
const notifBlock = settings.split("activeTab === 'notifications'")[1]?.split("activeTab === 'who-gets-told'")[0] ?? ''
ok(notifBlock.length > 0, 'the notifications tab block was found')
ok(!/NotificationRouting/.test(notifBlock),
  '...and no longer holds the routing panel under eighteen rows of personal switches')

done()
