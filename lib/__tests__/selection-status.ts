// "can we lock down this dropdown of not started"
//
// The selection status was a free select. A row with option cards under it and
// a portal link the client had opened read "Not started", and nothing stopped
// anybody picking "Ordered" for something nobody ordered. Every stage but one is
// a fact something else writes, so the pill reads those facts and the only
// manual move left is Installed - the one stage nothing in the app can see.

import { selectionStage } from '../selections'
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

// The control.
const page = code('app/(dashboard)/projects/[id]/selections/page.tsx')
const pill = page.slice(page.indexOf('function StatusPill('), page.indexOf('function BudgetDot('))
ok(pill.length > 0 && !/<select/.test(pill) && !/onChange/.test(pill),
  'the status pill is read-only - no select, no onChange')
ok((page.match(/<StatusPill status=\{selectionStage\(sel, !!portalToken\)\} \/>/g) ?? []).length === 2,
  'both the desktop and the phone row show the DERIVED stage')
ok(/changeStatus\(sel, 'installed'\)/.test(page) && /Mark installed/.test(page),
  'Installed is a row action, since nothing else can observe it')
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
