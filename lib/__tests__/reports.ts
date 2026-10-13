// "Can we create a reports tab - very detailed reports by job, customer,
// supplier, sub... then save and share with the developer or sub or export pdf"
//
// What this pins is what would make a report WRONG rather than ugly:
//   - numbers arrive from PostgREST quoted, and must still add up;
//   - a bill waiting for approval is not money owed;
//   - a report ABOUT a sub, which is the kind that gets shared WITH that sub,
//     carries their rows and nobody else's, and no job-wide money at all;
//   - a saved "This month" means this month when it is run, not when saved;
//   - a shared link is re-run on the server, never trusted from the browser.

import {
  buildReport, normalizeConfig, configProblem, resolvePeriod, inPeriod, sectionsFor,
  SECTIONS, EMPTY_DATA, type ReportConfig, type ReportData,
} from '../report-builder'
import { RESOURCES } from '../permissions'
import { UNTRACKED_PREFIXES } from '../analytics'
import { APP_PATH_PREFIXES } from '../hosts'
import { docToSheets } from '../report-format'
import { ok, done, read, code } from './_helpers'

const P1 = '11111111-1111-1111-1111-111111111111'
const P2 = '22222222-2222-2222-2222-222222222222'
const SUB_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const SUB_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const DEPOT = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const CUST = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

// Amounts QUOTED, as PostgREST sends a `numeric` - the fixture that only uses
// numbers is the one that passed while four bugs shipped in schedule-dependencies.
const data: ReportData = {
  ...EMPTY_DATA,
  projects: [
    { id: P1, name: 'Maple St', status: 'active', customer_id: CUST, sellout_amount: '500000.00', contractor_fee_pct: '0.10' },
    { id: P2, name: 'Oak Ave', status: 'planning', customer_id: null, sellout_amount: '250000.00', contractor_fee_pct: null },
  ],
  customers: [{ id: CUST, name: 'Rivera Development' }],
  companies: [
    { id: SUB_A, name: 'QA Concrete', type: 'subcontractor' },
    { id: SUB_B, name: 'Bright Electric', type: 'subcontractor' },
    { id: DEPOT, name: 'Home Depot', type: 'supplier' },
  ],
  subcontracts: [
    { id: 's1', project_id: P1, company_id: SUB_A, trade: 'Concrete', contract_amount: '40000.00', status: 'active' },
    { id: 's2', project_id: P1, company_id: SUB_B, trade: 'Electrical', contract_amount: '30000.00', status: 'active' },
    { id: 's3', project_id: P2, company_id: SUB_B, trade: 'Electrical', contract_amount: '20000.00', status: 'active' },
  ],
  invoices: [
    { id: 'i1', project_id: P1, subcontract_id: 's1', company_id: SUB_A, amount: '10000.00', status: 'paid', created_at: '2026-10-02T15:00:00Z' },
    { id: 'i2', project_id: P1, subcontract_id: 's1', company_id: SUB_A, amount: '9000.00', status: 'pending_approval', created_at: '2026-10-05T15:00:00Z' },
    { id: 'i3', project_id: P1, subcontract_id: 's2', company_id: SUB_B, amount: '5000.00', status: 'approved', created_at: '2026-09-20T15:00:00Z' },
    { id: 'i4', project_id: P2, subcontract_id: 's3', company_id: SUB_B, amount: '2500.50', status: 'approved', created_at: '2026-10-07T15:00:00Z' },
  ],
  changeOrders: [
    { id: 'co1', project_id: P1, subcontract_id: 's1', title: 'Extra footing', amount: '3000.00', status: 'approved', created_at: '2026-10-03T12:00:00Z' },
    { id: 'co2', project_id: P1, subcontract_id: 's1', title: 'Pump truck', amount: '800.00', status: 'pending', created_at: '2026-10-04T12:00:00Z' },
  ],
  materials: [
    { id: 'm1', project_id: P1, company_id: null, store_name: 'home depot', amount: '412.37', purchase_date: '2026-10-06' },
    { id: 'm2', project_id: P1, company_id: null, store_name: 'Home Depot Pro Rentals', amount: '999.00', purchase_date: '2026-10-06' },
  ],
  clientInvoices: [
    { id: 'ci1', project_id: P1, invoice_number: '1001', status: 'sent', issue_date: '2026-10-01' },
    { id: 'ci2', project_id: P1, invoice_number: '1002', status: 'draft', issue_date: '2026-10-08' },
    { id: 'ci3', project_id: P1, invoice_number: '0999', status: 'void', issue_date: '2026-10-01' },
  ],
  clientInvoiceLines: [
    { client_invoice_id: 'ci1', amount: '20000.00' },
    { client_invoice_id: 'ci1', amount: '1500.00' },
    { client_invoice_id: 'ci2', amount: '7000.00' },
    { client_invoice_id: 'ci3', amount: '99999.00' },
  ],
  clientPayments: [{ id: 'p1', project_id: P1, paid_date: '2026-10-09', amount: '15000.00' }],
  timeEntries: [
    { id: 't1', project_id: P1, worker_name: 'Luis', profile_id: 'w1', clock_in_at: '2026-10-05T12:00:00Z', clock_out_at: '2026-10-05T20:30:00Z' },
    { id: 't2', project_id: P1, worker_name: 'Luis', profile_id: 'w1', clock_in_at: '2026-10-06T12:00:00Z', clock_out_at: null },
  ],
}
const opts = { today: '2026-10-13', generatedAt: '2026-10-13T14:00:00Z' }
const cfg = (p: Partial<ReportConfig>): ReportConfig => normalizeConfig({ subject: 'job', sections: ['summary'], ...p })
const stat = (doc: ReturnType<typeof buildReport>, key: string, label: string) =>
  doc.sections.find(s => s.key === key)?.stats.find(s => s.label === label)?.value

// ── the money adds up, from quoted strings ───────────────────────────────────
{
  const doc = buildReport(cfg({ sections: ['summary'] }), data, opts)
  const summary = doc.sections.find(s => s.key === 'summary')!
  const maple = summary.tables[0].rows.find(r => r.label === 'Maple St')!
  ok(maple.contract === 500000, 'a quoted sellout_amount reads as a number, not as zero')
  // i1 paid 10000 + i3 approved 5000 = 15000 billed. i2 is waiting for approval.
  ok(maple.billed === 15000, `billed counts approved/sent/paid only (got ${maple.billed})`)
  ok(maple.awaiting === 9000, 'a bill waiting for approval is shown beside owed...')
  ok(maple.outstanding === 5000, '...and never added into it')
  ok(maple.invoiced === 21500, `client invoiced leaves out the draft and the void (got ${maple.invoiced})`)
  ok(maple.received === 15000, 'received from client')
  ok(stat(doc, 'summary', 'Vendor bills') === 17500.5, 'the total keeps the cents across jobs')
}

// ── a sub report is about the sub, and only the sub ──────────────────────────
{
  const c = normalizeConfig({ subject: 'sub', ids: [SUB_A], sections: ['summary', 'contracts', 'bills', 'client_billing', 'margin'] })
  ok(!c.sections.includes('client_billing') && !c.sections.includes('margin'),
    'a sub report cannot carry client billing or margin, even if asked - it is the kind that gets shared with the sub')
  const doc = buildReport(c, data, { ...opts, pickedNames: ['QA Concrete'] })
  ok(doc.jobCount === 1, 'only the jobs the sub is on - not Oak Ave')
  const bills = doc.sections.find(s => s.key === 'bills')!
  const vendors = new Set(bills.tables.flatMap(t => t.rows.map(r => r.vendor)))
  ok(vendors.size === 1 && vendors.has('QA Concrete'), 'no other sub\'s bill appears in it')
  const contracts = doc.sections.find(s => s.key === 'contracts')!
  const row = contracts.tables[0].rows[0]
  ok(row.revised === 43000, 'revised contract = original + APPROVED change orders')
  ok(row.pending === 800, 'pending change orders are shown, not added in')
  ok(row.balance === 33000, `left to bill = revised - billed (got ${row.balance})`)
  ok(doc.title === 'QA Concrete report', 'the title names who it is about')
  ok(sectionsFor('sub').every(s => s.key !== 'client_billing' && s.key !== 'permits' && s.key !== 'daily_logs'),
    'no job-wide section is even offered for a vendor')
}

// ── a supplier is matched by store name exactly, never loosely ───────────────
{
  const doc = buildReport(normalizeConfig({ subject: 'supplier', ids: [DEPOT], sections: ['materials'] }), data, opts)
  const rows = doc.sections[0].tables.flatMap(t => t.rows)
  ok(rows.length === 1 && rows[0].amount === 412.37, 'a receipt typed "home depot" counts; "Home Depot Pro Rentals" does not')
}

// ── a customer report covers that customer's jobs ────────────────────────────
{
  const doc = buildReport(normalizeConfig({ subject: 'customer', ids: [CUST], sections: ['summary'] }), data, opts)
  ok(doc.jobCount === 1, 'a customer report is the jobs linked to that customer')
}

// ── periods are resolved when the report RUNS ────────────────────────────────
{
  const r = resolvePeriod({ preset: 'this_month' }, '2026-10-13')
  ok(r.from === '2026-10-01' && r.to === '2026-10-31', 'this month')
  const lq = resolvePeriod({ preset: 'last_quarter' }, '2026-10-13')
  ok(lq.from === '2026-07-01' && lq.to === '2026-09-30', 'last quarter')
  const lm = resolvePeriod({ preset: 'last_month' }, '2026-01-20')
  ok(lm.from === '2025-12-01' && lm.to === '2025-12-31', 'last month in January is last December')
  ok(resolvePeriod({ preset: 'last_30' }, '2026-03-05').from === '2026-02-04', 'last 30 days crosses a month boundary')
  ok(!inPeriod(null, r), 'an undated row is not shown to belong to a dated period')
  ok(inPeriod(null, { from: null, to: null }), '...and is in an open one')
  ok(inPeriod('2026-10-31T23:00:00Z', r), 'the last day is inside the period')

  const doc = buildReport(cfg({ sections: ['bills'], period: { preset: 'this_month' } }), data, opts)
  const n = doc.sections[0].tables.flatMap(t => t.rows).length
  ok(n === 3, `a September bill is out of "This month" (got ${n})`)
  const saved = normalizeConfig({ subject: 'job', sections: ['bills'], period: { preset: 'this_month', from: '2020-01-01', to: '2020-01-31' } })
  ok(!saved.period.from && !saved.period.to, 'a saved preset stores no dates - so it is this month next month too')
}

// ── settings that cannot run say why ─────────────────────────────────────────
{
  ok(normalizeConfig({ sections: [] }).sections.length > 0, 'an empty section list falls back to one section rather than an empty report')
  const bad = normalizeConfig({ sections: ['summary'], period: { preset: 'custom', from: '2026-10-10', to: '2026-10-01' } })
  ok(configProblem(bad) === 'The start date is after the end date.', 'a backwards custom range is refused with a reason')
  ok(normalizeConfig({ ids: ['not-a-uuid', P1] }).ids.length === 1, 'ids that are not ids are dropped')
}

// ── a shift still clocked in counts no hours ────────────────────────────────
{
  const doc = buildReport(cfg({ sections: ['time'] }), data, opts)
  const row = doc.sections[0].tables[0].rows[0]
  ok(row.hours === 8.5 && row.open === 1, 'an open shift is counted as open, not as hours up to "now"')
}

// ── grouping ─────────────────────────────────────────────────────────────────
{
  const per = buildReport(cfg({ sections: ['bills'], groupBy: 'job' }), data, opts)
  ok(per.sections[0].tables.length === 2 && per.sections[0].tables.every(t => !!t.heading), 'a table per job, each headed')
  const one = buildReport(cfg({ sections: ['bills'], groupBy: 'none' }), data, opts)
  ok(one.sections[0].tables.length === 1 && one.sections[0].tables[0].columns[0].key === 'job', 'one table leads with a Job column')
  ok(one.sections[0].tables[0].totals?.amount === 26500.5, 'its total adds every row')
  const sheets = docToSheets(one)
  ok(sheets.length === 2 && sheets.every(s => s.name.length <= 31), 'Excel gets a sheet per section, names within Excel\'s limit')
}

// ── every section asks a real permission ─────────────────────────────────────
{
  const keys = new Set(RESOURCES.map(r => r.key))
  const bad = SECTIONS.filter(s => !keys.has(s.resource))
  ok(bad.length === 0, `every section's permission is a real resource${bad.length ? ` - ${bad[0].resource}` : ''}`)
  ok(SECTIONS.find(s => s.key === 'margin')?.resource === 'margin', 'margin is gated on `margin`, the split that exists so a PM can run a budget without seeing it')
}

// ── the routes ───────────────────────────────────────────────────────────────
{
  const share = code('app/api/reports/shares/route.ts')
  ok(/runReport\(/.test(share), 'a share re-runs the report on the server')
  ok(!/body\??\.doc\b|body\??\.snapshot\b/.test(share), '...and never stores a document the browser posted')
  ok(/reportCtx\(db, request, 'create'\)/.test(share), 'sharing needs reports: create')
  const pub = code('app/api/report-share/[token]/route.ts')
  ok(/revoked_at/.test(pub) && /410/.test(pub), 'a turned-off link answers 410')
  ok(!/from\('projects'\)|from\('invoices'\)/.test(pub), 'the public route reads the snapshot, never a live table')
  for (const f of ['app/api/reports/run/route.ts', 'app/api/reports/options/route.ts', 'app/api/reports/saved/route.ts', 'app/api/reports/saved/[id]/route.ts', 'app/api/reports/shares/[id]/route.ts']) {
    ok(/reportCtx\(db, request/.test(code(f)), `${f} asks who is calling`)
  }
  const saved = code('app/api/reports/saved/[id]/route.ts')
  ok((saved.match(/\.eq\('company_id', gate\.ctx\.companyId\)/g) ?? []).length >= 2, 'a saved report is only changed or deleted inside the caller\'s company')
  const load = code('lib/report-load.ts')
  ok(/permittedConfig\(ctx\.actor/.test(load), 'a section the caller may not see is taken out before the rows are read')
  ok(/\.range\(from, to\)/.test(load), 'every table is paged - a select stops at 1,000 rows and says nothing')
  ok(/billingLock/.test(load), 'saving and sharing are writes, and meet the billing lock')
}

// ── the link is a token link ─────────────────────────────────────────────────
{
  ok(UNTRACKED_PREFIXES.includes('/shared-report'), 'a shared report is never measured - the path is the secret')
  ok(APP_PATH_PREFIXES.includes('/shared-report') && APP_PATH_PREFIXES.includes('/reports'), 'both live on the app host')
  ok(/'\/shared-report'/.test(read('app/robots.ts')), 'and robots keeps search engines off it')
  ok(/label: 'Reports', href: '\/reports', icon: BarChart2, resource: 'reports'/.test(read('components/layout/sidebar.tsx')),
    'the tab is in the nav, behind the reports permission')
}

// ── the report reaches a phone as a list, and paper as a table ──────────────
{
  const view = read('components/reports/report-view.tsx')
  ok(/hidden lg:block print:block overflow-x-auto/.test(view), 'the table is for the desktop AND for the printed PDF, which is narrower than lg')
  ok(/lg:hidden print:hidden/.test(view), 'a phone gets the same rows as a list')
}

done()
