// A UX pass over the demo company's Budget and Materials screens.
//
// 1. BUDGET ON A PHONE printed every line fully expanded - Budgeted,
//    Committed, Actual and Variance as four label/value rows, the linked sub,
//    a pencil and a trash can - so a thirty-line budget was a scroll of a
//    hundred and fifty numbers, and the line that was over budget looked like
//    every other. The toolbar above it was five equal buttons wrapping into
//    three rows, and Delete was one tap from the list.
//
// 2. "NOT IN THE BUDGET" was a pill on every unfiled receipt in Materials, and
//    Budget's own materials list labelled EVERY row "in a budget line" or "not
//    linked to a line". The same words a dozen times, internal wording, and no
//    way to see the ones needing attention together.
//
// Source-shape checks: nothing renders React here. Each was run against the
// old files and failed there first.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/budget/page.tsx')

// ── 1. the phone list ────────────────────────────────────────────────────────
const phoneAt = page.indexOf('data-budget-phone-list')
ok(phoneAt > 0, 'the Budget page has a phone list of its own')
const phone = page.slice(page.lastIndexOf('<div', phoneAt), page.indexOf('</>', phoneAt))
ok(/lg:hidden/.test(page.slice(page.lastIndexOf('<div', phoneAt), phoneAt)), '...shown only below lg')
ok(/<div className="hidden lg:block bg-panel rounded-xl border border-line overflow-hidden">/.test(page),
  '...while the desktop table sits under hidden lg:block, unchanged')

// Collapsed by default: nothing is open until tapped.
ok(/const \[openLines, setOpenLines\] = useState<Set<string>>\(new Set\(\)\)/.test(page),
  'lines start COLLAPSED - the open set starts empty')
ok(/toggleIn\(setOpenLines, item\.id\)/.test(phone), '...and a tap on the line opens it')
ok(/\{open && !selectMode && \(/.test(phone), '...and the four figures only render once it is open')
ok(/<VarianceChip variance=\{v\} \/>/.test(phone), 'a collapsed line carries its variance as a chip')
ok(/money\(item\.actual_amount\)/.test(phone.slice(0, phone.indexOf('<VarianceChip'))),
  '...beside what it has cost')

// Categories fold.
ok(/toggleIn\(setFoldedCats, catKey\)/.test(phone) && /\{!folded && \(/.test(phone),
  'a category heading folds its lines away')

// Delete is inside the opened line, never on the collapsed row.
const collapsedRow = phone.slice(phone.indexOf('const open = openLines.has'), phone.indexOf('{open && !selectMode && ('))
ok(collapsedRow.length > 0 && !/Trash2|remove\(/.test(collapsedRow), 'no trash can on a collapsed phone line')
const openedRow = phone.slice(phone.indexOf('{open && !selectMode && ('))
ok(/onClick=\{\(\) => remove\(item\.id\)\}/.test(openedRow), '...delete is inside the opened line')
ok(/guardDelete\(async \(\) => \{[\s\S]{0,300}method: 'DELETE'/.test(page),
  '...and remove() still goes through the delete guard')

// Toolbar: Add Line and a More menu on the phone.
const phoneBar = page.slice(page.indexOf('flex w-full items-center gap-2 lg:hidden'), page.indexOf('</RowMenu>'))
ok(/Add Line/.test(phoneBar) && /<RowMenu label="More budget actions">/.test(phoneBar),
  'the phone toolbar is Add Line plus a More menu')
for (const a of ['Import Estimate', 'Use Template', 'Save as Template', 'Select lines']) {
  ok(new RegExp(a).test(phoneBar), `...with ${a} inside it`)
}
ok(!/setAdding\(v => !v\)/.test(page), 'Add Line OPENS the dialog, it does not toggle it')

// ── 2. one aggregate, not a badge per row ────────────────────────────────────
const view = code('components/materials/materials-view.tsx')
ok(!/Not in the budget/.test(view), 'Materials no longer stamps "Not in the budget" on every unfiled row')
ok(/data-unfiled-summary/.test(view) && /no budget line yet/.test(view),
  '...it says it ONCE, above the list, in plain words')
ok(/const filtered = onlyUnfiled && unfiled\.length > 0 \? unfiled : searched/.test(view),
  '...and that line narrows the list to those receipts')
ok(/fileReceipt\(m, e\.target\.value\)/.test(view) && /budget_line_id: lineId/.test(view),
  '..."Assign them" is kept: an opened unfiled receipt can be filed against a line from here')

ok(!/'in a budget line' : 'not linked to a line'/.test(page),
  'Budget\'s materials list no longer labels every row with its filing state')
ok(/receipt\{unfiledReceipts !== 1 \? 's have' : ' has'\} no budget line yet/.test(page),
  '...one line counts the unfiled receipts instead')
ok(/getElementById\('not-on-a-line'\)/.test(page) && /id="not-on-a-line"/.test(page),
  '...and takes you to where each one is filed')

// MONEY IN A TOTAL HAS TO BE ON A ROW OR NAMED - the panel that names each one
// is untouched by any of this.
ok(/Not on a budget line/.test(page) && /fileAgainstLine\('receipt', r\.id, e\.target\.value\)/.test(page),
  'the "Not on a budget line" panel still lists every unfiled receipt with a way to file it')

done()
