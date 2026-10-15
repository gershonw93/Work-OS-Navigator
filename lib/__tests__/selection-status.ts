// "can we lock down this dropdown of not started"
//
// The selection status was a free select. A row with option cards under it and
// a portal link the client had opened read "Not started", and nothing stopped
// anybody picking "Ordered" for something nobody ordered. Every stage is now a
// fact something else writes, so the pill reads those facts. Installed follows
// the schedule line reaching 100% ("make installed automatic when the schedule
// line finishes"); "Mark installed" is left only where no line leads from it.

import { selectionStage } from '../selections'
import { finishedBudgetLines } from '../selection-installed'
import { ok, done, code } from './_helpers'

const opt = [{ id: 'o1' }]

// The derivation.
ok(selectionStage({ status: 'pending', selection_options: opt }, true) === 'waiting',
  'options on a shared portal read Waiting on client, not Not started')
ok(selectionStage({ status: 'pending', selection_options: opt }, false) === 'pending',
  '...but not when the client has no link to see them on - Waiting claims the ball is theirs')
ok(selectionStage({ status: 'pending', selection_options: [] }, true) === 'pending',
  'no options is still Not started')
ok(selectionStage({ status: 'pending', selection_options: null }, true) === 'pending',
  '...including when the join came back empty')
ok(selectionStage({ status: 'waiting', selection_options: [] }, false) === 'waiting',
  'a Waiting already stored is not demoted')
for (const s of ['chosen', 'ordered', 'installed'] as const) {
  ok(selectionStage({ status: s, selection_options: opt }, true) === s,
    `an accepted status (${s}) is taken as stored - the code that accepts it writes it`)
}

// Installed follows the schedule line.
ok(selectionStage({ status: 'ordered', line_finished: true }, true) === 'installed',
  'an ordered selection whose schedule line reads 100% shows Installed')
ok(selectionStage({ status: 'chosen', line_finished: true }, false) === 'installed',
  '...so does a chosen one (bought outside Order it)')
ok(selectionStage({ status: 'pending', selection_options: opt, line_finished: true }, true) === 'waiting',
  '...but never one still being chased - a finished line with nothing chosen is a missing decision')
ok(selectionStage({ status: 'ordered', line_finished: false }, true) === 'ordered',
  'an unfinished line leaves it Ordered')

const D = { start_date: '2026-10-01', end_date: '2026-10-05' }
const bl = (id: string, sub: string | null, pct: number | string | null = null, amt: number | string = 1000) =>
  ({ id, subcontract_id: sub, progress_pct: pct, budgeted_amount: amt })
// NUMERIC comes back as a string - the fixture says so, or the test passes for a shape the DB never sends.
ok(finishedBudgetLines([bl('b1', 's1')], [{ id: 'x', subcontract_id: 's1', progress_pct: '100.00', ...D }]).has('b1'),
  'a schedule line typed at "100.00" (a numeric, as PostgREST sends it) finishes the budget line')
ok(!finishedBudgetLines([bl('b1', 's1')], [{ id: 'x', subcontract_id: 's1', progress_pct: '80.00', ...D }]).has('b1'),
  '80% is not finished')
ok(!finishedBudgetLines([bl('b1', 's1')], [{ id: 'x', subcontract_id: 's1', progress_pct: null, end_date: '2020-01-01', start_date: '2020-01-01' }]).has('b1'),
  'an END DATE in the past is not finished - nobody said the work was done')
ok(finishedBudgetLines([bl('b1', 's1', '100.00')], [{ id: 'x', subcontract_id: 's1', progress_pct: null, ...D }]).has('b1'),
  'with nothing typed on the schedule line, the sub\'s budget progress rolled up to 100% finishes it')
ok(!finishedBudgetLines([bl('b1', 's1')], [
  { id: 'x', subcontract_id: 's1', progress_pct: '100.00', ...D },
  { id: 'y', subcontract_id: 's1', progress_pct: '50.00', ...D },
]).has('b1'), 'two visits for one sub: both have to be done')
ok(!finishedBudgetLines([bl('b1', null, '100.00')], []).has('b1'),
  'a budget line with no sub has no schedule line, so it never claims Installed - Mark installed is the fallback')
ok(!finishedBudgetLines([bl('b1', 's1', '100.00')], []).has('b1'),
  '...nor does a sub with nothing on the schedule')

const routes = code('app/api/projects/[id]/selections/route.ts') + code('app/api/portal/[token]/selections/route.ts')
ok((routes.match(/withLineFinished\(/g) ?? []).length === 3,
  'the board GET, the portal GET and the portal POST all read the same schedule answer')
ok(/budget_line_item_id: _b/.test(code('app/api/portal/[token]/selections/route.ts')),
  'the portal reads the budget line to find the schedule, and does not hand our ids to the client')
const db = code('lib/selection-installed-db.ts')
ok(/return none/.test(db) && /console\.error/.test(db),
  'a failed schedule read claims nothing installed, and logs it')

// The control.
const page = code('app/(dashboard)/projects/[id]/selections/page.tsx')
const pill = page.slice(page.indexOf('function StatusPill('), page.indexOf('function BudgetDot('))
ok(pill.length > 0 && !/<select/.test(pill) && !/onChange/.test(pill),
  'the status pill is read-only - no select, no onChange')
ok((page.match(/<StatusPill status=\{selectionStage\(sel, !!portalToken\)\} \/>/g) ?? []).length === 2,
  'both the desktop and the phone row show the DERIVED stage')
ok(/changeStatus\(sel, 'installed'\)/.test(page) && /sel\.status === 'ordered' && !sel\.line_finished/.test(page),
  'Mark installed is the fallback, offered only where the schedule has not already said so')
ok(/Not installed yet/.test(page), '...and it can be taken back')
ok(/else if \(!name && sel\.status === 'chosen'\) body\.status = 'pending'/.test(page),
  'clearing what they chose un-chooses it - there is no dropdown to undo it with any more')
ok((page.match(/missingFor\(\{ \.\.\.sel, budget_line_item_id: (lineId|newId) \}, 'chosen'\)/g) ?? []).length === 2,
  'linking a budget line to a named choice moves it to Chosen, as the row promises - on both link paths')

// The client sees the same stage.
const portal = code('app/portal/[token]/selections/page.tsx')
ok(/CLIENT_STATUS\[selectionStage\(sel, true\)\]/.test(portal),
  'the portal reads the derived stage too, so it says Waiting on you when the options are there')

done()
