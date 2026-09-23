// A bin on every row is the irreversible act one tap from the list.
//
// From a UX review: Daily Logs cards, Plans rows and Quote request rows each
// carried a bare trash icon at list level, beside the tap that opens the thing.
// Each delete already went through useDeleteGuard, and that was never the
// point - the ask is that deleting is something you go looking for (a RowMenu
// or the opened record), not something sitting on every row. ONE PRIMARY
// ACTION PER ROW.

import { ok, done, code } from './_helpers'

// ── Daily logs: in the opened log, not on the collapsed card ────────────────
{
  const src = code('app/(dashboard)/projects/[id]/daily-logs/page.tsx')
  const call = src.indexOf('handleDeleteLog(log.id)')
  const detail = src.indexOf('{isExpanded && (')
  ok(call > detail && detail > 0, 'the delete control renders inside the expanded log, not on the row header')
  ok((src.match(/handleDeleteLog\(log\.id\)/g) ?? []).length === 1, '...and only there')
  ok(!/title="Delete log"/.test(src), 'the bare bin on the collapsed card is gone')
  ok(/function handleDeleteLog[\s\S]{0,80}guardDelete\(/.test(src), 'it is still behind the delete guard')
}

// ── Plans: behind the row's menu ─────────────────────────────────────────────
{
  const src = code('app/(dashboard)/projects/[id]/plans/page.tsx')
  ok(/<RowMenu label=\{`More for \$\{plan\.name\}`\}>/.test(src), 'each plan row has a RowMenu')
  ok(/<MenuItem danger onClick=\{\(\) => \{ close\(\); handleDeletePlan\(plan\.id\) \}\}>/.test(src),
    'Delete plan is a menu item inside it')
  ok(!/title="Delete plan"/.test(src), 'the bare bin on the row is gone')
  ok(/function handleDeletePlan[\s\S]{0,80}guardDelete\(/.test(src), 'it is still behind the delete guard')
  // A panel hanging off a row cannot live inside an overflow that clips it.
  ok(!/divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel/.test(src),
    'the plan list card no longer clips the menu with overflow-hidden')
  ok(/title="Send a scope update"/.test(src), 'the scope-update megaphone stays on the row')
}

// ── Quotes (the Quotes tab is request-quotes; /quotes redirects there) ───────
{
  const src = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')
  ok(/<MenuItem danger onClick=\{\(\) => \{ close\(\); deleteRequest\(req\.id\) \}\}>/.test(src),
    'Delete request is a menu item behind the request row\'s RowMenu')
  ok(!/<button onClick=\{\(\) => deleteRequest\(req\.id\)\}/.test(src), 'the bare bin on the request header is gone')
  ok(/function deleteRequest[\s\S]{0,80}guardDelete\(/.test(src), 'it is still behind the delete guard')
  ok(!/className=\{cn\('bg-panel rounded-xl border overflow-hidden'/.test(src),
    'the request card no longer clips its menus with overflow-hidden')
}

done()
