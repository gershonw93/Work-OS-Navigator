// Five screens that took a screen or two of scrolling before the thing
// somebody came for, from one UX pass on a phone:
//
//   1. Projects: a five-cell stat card, a search, three filters and a sort -
//      the first project two screens down.
//   2. Home: Recent Activity ran to thirty rows.
//   3. Master Money: six label/value lines per project, zero-money jobs
//      included, and "Escrow -$33,879" in red with nothing saying what it is.
//   4. Master Calendar: 3-character chips in a 55px square, "+1 more" under
//      them - the rule in CLAUDE.md says a phone month cell is DOTS.
//   5. Bills from subs: a four-line explainer above the buttons on every
//      visit, long after anybody needed it.
//
// Source-shape checks, plus the pure half of Master Money called directly.

import { ESCROW_EXPLAINED, escrowSentence, hasNoMoney, type MoneyRow } from '../master-money'
import { ok, done, code } from './_helpers'

// ── 1. Projects ─────────────────────────────────────────────────────────────
const projects = code('app/(dashboard)/projects/page.tsx')
ok(!/<StatStrip/.test(projects), 'Projects: the three-row stat card is gone from the phone')
ok(/data-project-summary/.test(projects) && /onClick=\{\(\) => setStatusFilter\(s\.filter\)\}/.test(projects),
  '...replaced by ONE line of counts, each still a filter')
ok(/onClick=\{\(\) => setFilterSheet\(true\)\}/.test(projects)
  && /className=\{cn\('lg:hidden inline-flex min-h-11/.test(projects),
  'ONE Filter button on a phone, 44px tall')
ok(/<div className="hidden lg:flex lg:flex-wrap items-center gap-2">\s*<div className="relative">\s*<Building2/.test(projects),
  '...and the desktop keeps its type / status / sort / view controls, gated to lg')
ok(/<div className="flex gap-2 lg:gap-3 mb-5">/.test(projects),
  'the toolbar is one row on a phone (search + Filter) and the same row at lg')
ok(/^function ProjectFilterSheet\(/m.test(projects),
  'the sheet is HOISTED - declared inside the page it would be a new type every render')
ok(/<div className="overlay-sheet lg:hidden bg-black\/40" data-overlay onClick=\{onClose\}>/.test(projects)
  && /useSheetDismiss\(onClose\)/.test(projects),
  '...a real bottom sheet: .overlay-sheet, data-overlay, and it can be pulled down')
for (const label of ['Status', 'Type', 'Sort', 'Show as']) {
  ok(new RegExp(`<Chips label="${label}"`).test(projects), `...holding ${label}`)
}
ok(/activeFilterCount = \(statusFilter !== 'all' \? 1 : 0\) \+ \(typeFilter !== 'all' \? 1 : 0\)/.test(projects),
  'the button counts filters, not the sort - a sort hides nothing')

// ── 2. Recent Activity ──────────────────────────────────────────────────────
const home = code('app/(dashboard)/dashboard/page.tsx')
ok(/const ACTIVITY_PREVIEW = 3/.test(home), 'Recent Activity shows three rows')
ok(/\(activityAll \? activity : activity\.slice\(0, ACTIVITY_PREVIEW\)\)\.map/.test(home),
  '...sliced where it renders, not where it loads - "Show all" needs the rest')
ok(/activity\.length > ACTIVITY_PREVIEW &&/.test(home) && /`Show all \$\{activity\.length\}`/.test(home),
  '...and "Show all N" appears only when there is more to show')

// ── 3. Master Money ─────────────────────────────────────────────────────────
const row = (o: Partial<MoneyRow>): MoneyRow =>
  ({ budgeted: 0, committed: 0, billed: 0, paid: 0, outstanding: 0, received: 0, escrow: 0, ...o })
ok(hasNoMoney(row({})), 'a job with every figure zero has no money yet')
ok(!hasNoMoney(row({ budgeted: 120000 })),
  '...but a budget with nothing paid is money - it stays in the list')
ok(!hasNoMoney(row({ escrow: -500 })), '...and so is a negative escrow')
ok(hasNoMoney(row({ received: '0.00' as any })), 'a numeric that arrives as "0.00" is still zero')

const usd = (n: number) => `$${n.toLocaleString('en-US')}`
ok(escrowSentence(0, usd) === null && escrowSentence(12000, usd) === null,
  'nothing to explain at or above zero')
ok(escrowSentence(-33879, usd) === 'Escrow is below zero: $33,879 more has gone out to vendors and your fee than the client has paid in.',
  'below zero, the sentence says the size of the gap as a positive amount')

// THE WORDS HAVE TO MATCH THE ARITHMETIC. If the route changes what escrow
// is, this fails, and whoever changed it has to change the sentence too.
const route = code('app/api/master/money/route.ts')
ok(/escrow: rec - \(escrowPaid\.get\(p\.id\) \?\? 0\) - fee/.test(route),
  'route: escrow = received - paid from escrow - fee')
ok(/const fee = bi \* Number\(p\.contractor_fee_pct \?\? 0\)/.test(route)
  && /const ACTUAL = new Set\(\['approved', 'sent', 'paid'\]\)/.test(route),
  "route: the fee is the job's rate on vendor bills approved, sent or paid")
ok(/\? Number\(r\.escrow_paid \|\| 0\) : \(r\.status === 'paid' \? Number\(r\.amount \|\| 0\) : 0\)/.test(route),
  'route: a split bill counts its escrow half; a paid bill with no split counts in full')
ok(/client has paid you/.test(ESCROW_EXPLAINED) && /paid vendors out of escrow/.test(ESCROW_EXPLAINED)
  && /fee on vendor bills\s+that are approved, sent or paid/.test(ESCROW_EXPLAINED.replace(/\n/g, ' '))
  && /no split counts as paid from escrow in full/.test(ESCROW_EXPLAINED)
  && /paid a vendor directly does not touch it/.test(ESCROW_EXPLAINED),
  '...and the explanation names each of those terms')

const money = code('app/(dashboard)/master-money/page.tsx')
ok((money.match(/<InfoHint[^>]*text=\{ESCROW_EXPLAINED\}/g) ?? []).length >= 3,
  'the explanation is on the phone total, the desktop tile and the desktop column')
ok(/escrowSentence\(t\.escrow, money\)/.test(money), 'a negative total is explained in words under the phone strip')
ok(/<div className="lg:hidden divide-y divide-line-soft rounded-2xl border border-line bg-panel">/.test(money)
  && /<div className="hidden lg:block bg-panel rounded-2xl/.test(money),
  'a phone list and the desktop grid, each gated')
ok((money.match(/<Headline /g) ?? []).length === 3, 'a phone row shows THREE headline numbers')
ok(/open && \(/.test(money) && /Open financials/.test(money), '...and a tap opens the rest, with the way to the job')
ok(/rows\.filter\(hasNoMoney\)/.test(money) && /with no money yet/.test(money),
  'zero-money jobs fold into one "N projects with no money yet" row')
ok(/^function PhoneMoneyRow\(/m.test(money), 'the row component is hoisted')

// ── 4. Master Calendar ──────────────────────────────────────────────────────
const cal = code('app/(dashboard)/master-calendar/page.tsx')
ok(/<div className="lg:hidden flex flex-wrap gap-1">/.test(cal) && /KIND_DOT\[it\.kind\]/.test(cal),
  'Master Calendar: a phone square draws dots, coloured by kind')
ok(/<div className="hidden lg:block space-y-1">\s*\{dayItems\.slice\(0, 4\)/.test(cal),
  '...and the labelled chips are gated to lg, so the desktop is untouched')
ok(/data-calendar-legend/.test(cal) && /KIND_LABEL\[kind\]/.test(cal), 'a legend says what the dots mean')
ok(/role=\{open \? 'button'/.test(cal) && /onClick=\{open\}/.test(cal), 'the DAY is the control')
ok(/dot: KIND_DOT\[it\.kind\]/.test(cal), 'the day sheet uses the same dot as the square that opened it')

// ── 5. Bills from subs ──────────────────────────────────────────────────────
const bills = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/const showExplainer = explainerOpen \|\| \(!loading && !loadError && invoices\.length === 0\)/.test(bills),
  'Bills from subs: the explainer shows on a job with no bills, or when asked for')
ok(/\{showExplainer \? \(/.test(bills) && /How this works/.test(bills),
  '...and otherwise folds to "How this works"')
const how = bills.indexOf('How this works'), rollup = bills.indexOf('Approved so far:')
ok(how > 0 && rollup > how,
  'the cost-plus roll-up is NOT inside the fold - it is data, and it only exists once there are bills')

done()
