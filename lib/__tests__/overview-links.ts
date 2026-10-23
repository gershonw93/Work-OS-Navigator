// "project overview - make sure the links to whatever is clicked on goes
// there". Every line on the Overview linked to the TOP of a tab: "1 RFI
// unanswered" with an Answer button opened the RFI list, "15 certificates
// expired" opened the Compliance page at its stat tiles, and the person had to
// find again what the Overview had already found.
//
// A link carrying a param the page never reads lands at the top of the list,
// which looks exactly like a link that works. So this checks BOTH ends: what
// the route builds, and that the page at the other end reads it.

import { ok, done, code } from './_helpers'
import { overviewHref } from '../overview-links'

const one = [{ id: 'r1' }]
const two = [{ id: 'r1' }, { id: 'r2' }]

// ── one thing opens that thing; several land on where they are listed ────────
ok(overviewHref.rfis(one) === 'rfis?answer=r1', 'one RFI opens its answer box')
ok(overviewHref.rfis(two) === 'rfis', '...several open the list')
ok(overviewHref.bills(one) === 'invoices?open=r1', 'one bill opens that bill')
ok(overviewHref.overdueTasks(one) === 'tasks?open=r1', 'one overdue task opens it')
ok(overviewHref.overdueTasks(two) === 'tasks?filter=overdue', '...several open the overdue filter')
ok(overviewHref.inspectionsToBook(one) === 'inspections?inspection=r1#insp-r1', 'one inspection to book opens it and scrolls to it')
ok(overviewHref.inspectionsToBook(two) === 'inspections#to-book', '...several land on the pending ones')
ok(overviewHref.certificates() === 'compliance#needs-attention', 'certificates land on the compliance alerts')
ok(overviewHref.vendorsWithNothing(['c1']) === 'compliance#vendor-c1', 'one vendor with nothing on file lands on their card')
ok(overviewHref.paymentRequests() === 'payments#payment-requests', 'payment requests land on the requests')

// ── the route builds every link through it ───────────────────────────────────
const route = code('app/api/projects/[id]/overview/route.ts')
const hrefs = route.match(/href: [^,\n]+/g) ?? []
ok(hrefs.length >= 10 && hrefs.every(h => /overviewHref\.|SUBJECTS\[/.test(h)),
  `every Overview line takes its link from overviewHref (${hrefs.filter(h => !/overviewHref\.|SUBJECTS\[/.test(h)).join('; ') || 'all'})`)
ok(/key: 'overdue'/.test(route) && /tasks overdue|task\$\{overdueTasks\.length === 1 \? '' : 's'\} overdue/.test(route),
  'overdue tasks are waiting on you, as the design has them')
ok(/lateInspections: lateToBook/.test(route), 'requested inspections past their date travel to On site')

// ── and the page at the other end reads it ───────────────────────────────────
const P = 'app/(dashboard)/projects/[id]'
const tasks = code(`${P}/tasks/page.tsx`)
ok(/useLandOnParam\('filter'/.test(tasks) && /setFilterMode\(f as FilterMode\)/.test(tasks), 'Tasks reads ?filter=')
ok(/useLandOnParam\('open', !loading/.test(tasks) && /openTask\(id\)/.test(tasks), '...and ?open=, once the tasks are there')
const rfis = code(`${P}/rfis/page.tsx`)
ok(/useLandOnParam\('answer', !loading/.test(rfis) && /openRespond\(rfi\)/.test(rfis), 'RFIs read ?answer= and open the answer box')
const insp = code(`${P}/inspections/page.tsx`)
ok(/get\('inspection'\)/.test(insp) && /useLandOnHash\(!loading\)/.test(insp), 'Inspections read ?inspection= and scroll to it')
ok(/id=\{`insp-\$\{insp\.id\}`\}/.test(insp) && /id="to-book"/.test(insp), '...and both anchors exist')
const comp = code(`${P}/compliance/page.tsx`)
ok(/useLandOnHash\(!loading\)/.test(comp) && /id="needs-attention"/.test(comp) && /`vendor-\$\{sub\.companies\.id\}`/.test(comp),
  'Compliance scrolls to the alerts or the vendor')
const pay = code(`${P}/payments/page.tsx`)
ok(/useLandOnHash\(!loading\)/.test(pay) && /id="payment-requests"/.test(pay), 'Billing the client scrolls to the payment requests')
ok(/useOpenRecord\(\)/.test(code(`${P}/invoices/page.tsx`)), 'Bills from subs opens ?open=')
const ov = code(`${P}/overview/page.tsx`)
ok(/id="client-questions"/.test(ov) && /useLandOnHash\(!!data\)/.test(ov), 'the Overview lands on its own client thread')

// ── the act runs once, after the page is ready ───────────────────────────────
const land = code('lib/use-land-on.ts')
ok(/if \(!ready \|\| done\.current\) return/.test(land), 'a landing acts once and only once the page is ready')

// ── every figure in the rail goes somewhere ──────────────────────────────────
for (const t of ["to('payments')", "to('budget')", "to('invoices')", "to('schedule')", "to('inspections')", 'overviewHref.openTasks()', 'overviewHref.allTasks()']) {
  ok(ov.includes(t), `the Overview links ${t}`)
}

done()
