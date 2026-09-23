// Approvals, from a UX review.
//
// 1. At 1280px beside the desktop sidebar the seven-column table ran past the
//    card, and Reject sat behind the horizontal scrollbar. The primary actions
//    on a row must never need a scroll to reach, so the Actions column is
//    sticky to the right edge of the scroller (header AND cell, both painted,
//    or the scrolling columns show through underneath).
// 2. On a phone an amount rendered "$ 15,500": a DollarSign ICON, a flex gap,
//    then the bare number. The symbol is part of the figure, so it is one
//    string from the shared money label.

import { ok, done, code } from './_helpers'
import { contractAmountLabel } from '../contract-amount'

const src = code('app/(dashboard)/approvals/page.tsx')

const sticky = src.match(/className="sticky right-0[^"]*"/g) ?? []
ok(sticky.length === 2, `the Actions header and cell are both sticky to the right (found ${sticky.length})`)
ok(sticky.every(c => /\bbg-panel\b/.test(c)), '...each painted, so the scrolled columns do not show through')
ok(/group-hover:bg-surface/.test(sticky[1] ?? ''), '...and the cell follows the row hover, not a stripe of panel on a grey row')

ok(!/DollarSign/.test(src), 'no dollar ICON standing in for the dollar sign')
ok(!/Number\(item\.amount\)\.toLocaleString\(\)/.test(src), 'no hand-rolled amount formatting on either layout')
ok((src.match(/contractAmountLabel\(item\.amount, '-'\)/g) ?? []).length === 2,
  'both the phone list and the desktop table print the amount through the shared label')
ok(contractAmountLabel('15500.00') === '$15,500', 'a numeric column (a quoted string) prints "$15,500", no gap')
ok(contractAmountLabel(null, '-') === '-', '...and no amount prints the dash')

done()
