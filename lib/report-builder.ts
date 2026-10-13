// ─────────────────────────────────────────────────────────────────────────────
// Reports - the builder.
//
// ONE pure function turns a report's settings plus the rows a route loaded
// into a `ReportDoc`: a title, some sections, and tables of plain values. The
// screen renders a doc, the shared link renders the SAME doc (a snapshot taken
// when it was shared), and print / Excel read it too. So there is one place a
// number in a report is worked out, and the copy a developer opens cannot
// disagree with the copy the office printed.
//
// Pure: no database, no clock (`today` is an argument), no formatting. Values
// stay numbers and ISO dates; the renderer formats them. `numeric` columns
// arrive from PostgREST QUOTED ("80.00"), so every amount goes through
// `toAmount` - never `Number.isFinite`, which does not coerce.
//
// THE VENDOR RULE. A report ABOUT a sub or a supplier is the kind that gets
// shared WITH that sub or supplier, so it carries only rows that are about
// them - their contracts, their bills, their change orders, their schedule
// lines, what was bought from them. Job-wide sections (what the client was
// billed, margin, permits, the daily logs) do not apply to a vendor subject at
// all, and `sectionsFor` leaves them off rather than filtering them to nothing:
// an empty "Client billing" on a report sent to a sub reads as "there is none".
// ─────────────────────────────────────────────────────────────────────────────

import { toAmount } from './schedule-dependencies'
import { ACTUAL_STATUSES } from './invoice-budget'
import { projectEscrow } from './escrow'
import { committedTotal } from './committed'

export type ReportSubject = 'job' | 'customer' | 'sub' | 'supplier'

export const SUBJECTS: { key: ReportSubject; label: string; plural: string; hint: string }[] = [
  { key: 'job', label: 'Job', plural: 'Jobs', hint: 'One job, several, or every job.' },
  { key: 'customer', label: 'Customer', plural: 'Customers', hint: 'Every job for a customer or developer.' },
  { key: 'sub', label: 'Subcontractor', plural: 'Subcontractors', hint: 'Contracts, bills and schedule for a sub, across jobs.' },
  { key: 'supplier', label: 'Supplier', plural: 'Suppliers', hint: 'What was bought from a supplier, across jobs.' },
]

export const VENDOR_SUBJECTS: ReportSubject[] = ['sub', 'supplier']
const JOB_SIDE: ReportSubject[] = ['job', 'customer']
const ALL: ReportSubject[] = ['job', 'customer', 'sub', 'supplier']

export type SectionKey =
  | 'summary' | 'contracts' | 'bills' | 'change_orders' | 'materials'
  | 'budget' | 'margin' | 'client_billing' | 'schedule' | 'permits'
  | 'inspections' | 'daily_logs' | 'time'

export interface SectionDef {
  key: SectionKey
  label: string
  /** One line under the checkbox: what the section holds. */
  hint: string
  /** The permission resource a person needs to put this in a report. */
  resource: string
  subjects: ReportSubject[]
  /**
   * Internal to the company. Fine in a report you print for yourself; worth
   * a second look before it goes to a developer or a sub, so the share dialog
   * names these.
   */
  internal?: boolean
}

export const SECTIONS: SectionDef[] = [
  { key: 'summary', label: 'Money summary', hint: 'Contract, billed, paid and outstanding, per job and in total.', resource: 'financials', subjects: ALL },
  { key: 'contracts', label: 'Subcontracts', hint: 'Each contract with approved change orders, billed, paid and the balance left.', resource: 'team', subjects: ALL },
  { key: 'bills', label: 'Bills from vendors', hint: 'Every bill with its number, status, amount and what has been paid.', resource: 'invoices', subjects: ALL },
  { key: 'change_orders', label: 'Change orders', hint: 'Approved, pending and rejected, with amounts.', resource: 'change-orders', subjects: ALL },
  { key: 'materials', label: 'Material purchases', hint: 'Receipts and orders: store, category and amount.', resource: 'materials', subjects: ALL },
  { key: 'budget', label: 'Budget vs actual', hint: 'Each budget line: budgeted, committed, actual and variance.', resource: 'budget', subjects: JOB_SIDE, internal: true },
  { key: 'margin', label: 'Margin and fee earned', hint: 'Contract value, cost to date and the fee earned on each job.', resource: 'margin', subjects: JOB_SIDE, internal: true },
  { key: 'client_billing', label: 'Client invoices and payments', hint: 'What the client was invoiced and what they have paid.', resource: 'payments', subjects: JOB_SIDE },
  { key: 'schedule', label: 'Schedule', hint: 'Every schedule line with its dates and progress.', resource: 'schedule', subjects: ALL },
  { key: 'permits', label: 'Permits', hint: 'Permit type, number, status and expiry.', resource: 'permits', subjects: JOB_SIDE },
  { key: 'inspections', label: 'Inspections', hint: 'Type, date, inspector and result.', resource: 'inspections', subjects: JOB_SIDE },
  { key: 'daily_logs', label: 'Daily logs', hint: 'Date, crew size, weather, notes and issues.', resource: 'daily-logs', subjects: JOB_SIDE },
  { key: 'time', label: 'Time clock', hint: 'Hours worked, per person per job.', resource: 'time', subjects: JOB_SIDE, internal: true },
]

export function sectionDef(key: SectionKey): SectionDef {
  return SECTIONS.find(s => s.key === key)!
}

/** The sections that make sense for a subject - see THE VENDOR RULE above. */
export function sectionsFor(subject: ReportSubject): SectionDef[] {
  return SECTIONS.filter(s => s.subjects.includes(subject))
}

// ── The period ──────────────────────────────────────────────────────────────

export type PeriodPreset =
  | 'all' | 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter'
  | 'this_year' | 'last_year' | 'last_30' | 'last_90' | 'custom'

export const PERIODS: { key: PeriodPreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_30', label: 'Last 30 days' },
  { key: 'last_90', label: 'Last 90 days' },
  { key: 'this_quarter', label: 'This quarter' },
  { key: 'last_quarter', label: 'Last quarter' },
  { key: 'this_year', label: 'This year' },
  { key: 'last_year', label: 'Last year' },
  { key: 'custom', label: 'Custom dates' },
]

export interface ReportPeriod { preset: PeriodPreset; from?: string | null; to?: string | null }

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const iso = (y: number, m: number, d: number) => {
  // UTC on purpose: these are calendar days, and the machine's own zone must
  // not move one across midnight.
  const dt = new Date(Date.UTC(y, m, d))
  return dt.toISOString().slice(0, 10)
}

/**
 * The dates a preset means ON A GIVEN DAY.
 *
 * Resolved when the report RUNS, never when it is saved - a saved "This month"
 * has to mean this month next month too, which is the whole point of saving it.
 * Both ends inclusive; null means open.
 */
export function resolvePeriod(p: ReportPeriod, today: string): { from: string | null; to: string | null } {
  const [y, m, d] = today.split('-').map(Number)
  const mo = m - 1
  const q = Math.floor(mo / 3) * 3
  switch (p.preset) {
    case 'this_month': return { from: iso(y, mo, 1), to: iso(y, mo + 1, 0) }
    case 'last_month': return { from: iso(y, mo - 1, 1), to: iso(y, mo, 0) }
    case 'last_30': return { from: iso(y, mo, d - 29), to: today }
    case 'last_90': return { from: iso(y, mo, d - 89), to: today }
    case 'this_quarter': return { from: iso(y, q, 1), to: iso(y, q + 3, 0) }
    case 'last_quarter': return { from: iso(y, q - 3, 1), to: iso(y, q, 0) }
    case 'this_year': return { from: iso(y, 0, 1), to: iso(y, 11, 31) }
    case 'last_year': return { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) }
    case 'custom': {
      const from = p.from && ISO_DAY.test(p.from) ? p.from : null
      const to = p.to && ISO_DAY.test(p.to) ? p.to : null
      return { from, to }
    }
    default: return { from: null, to: null }
  }
}

/** Is a date (ISO day or timestamp) inside the period? An undated row is OUT
 *  of a dated period - it cannot be shown to belong - and IN an open one. */
export function inPeriod(value: string | null | undefined, range: { from: string | null; to: string | null }): boolean {
  if (!range.from && !range.to) return true
  if (!value) return false
  const day = String(value).slice(0, 10)
  if (range.from && day < range.from) return false
  if (range.to && day > range.to) return false
  return true
}

// ── The settings ────────────────────────────────────────────────────────────

export type GroupBy = 'job' | 'none'

export interface ReportConfig {
  subject: ReportSubject
  /** Which jobs / customers / companies. Empty means every one. */
  ids: string[]
  /** Job statuses to include. Empty means every status. */
  statuses: string[]
  period: ReportPeriod
  sections: SectionKey[]
  /** One table per job with a subtotal, or one table with a Job column. */
  groupBy: GroupBy
  /** Optional title; one is derived when blank. */
  title?: string | null
}

export const DEFAULT_CONFIG: ReportConfig = {
  subject: 'job',
  ids: [],
  statuses: [],
  period: { preset: 'all' },
  sections: ['summary', 'contracts', 'bills', 'change_orders'],
  groupBy: 'job',
  title: null,
}

const UUIDISH = /^[0-9a-f-]{36}$/i

/**
 * Untrusted settings (a request body, a saved row) in, a valid config out.
 * Anything unknown is dropped rather than refused: a saved report written
 * before a section was renamed should still run, minus that section.
 */
export function normalizeConfig(raw: unknown): ReportConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
  const subject: ReportSubject = SUBJECTS.some(s => s.key === r.subject) ? r.subject : 'job'
  const allowed = new Set(sectionsFor(subject).map(s => s.key))
  const sections = Array.isArray(r.sections)
    ? Array.from(new Set(r.sections.filter((k: unknown): k is SectionKey => typeof k === 'string' && allowed.has(k as SectionKey))))
    : []
  // Keep the catalog's order, whatever order they were ticked in.
  const ordered = SECTIONS.map(s => s.key).filter(k => sections.includes(k))
  const ids = Array.isArray(r.ids) ? r.ids.filter((x: unknown) => typeof x === 'string' && UUIDISH.test(x)).slice(0, 500) : []
  const statuses = Array.isArray(r.statuses) ? r.statuses.filter((x: unknown) => typeof x === 'string' && /^[a-z_]{1,30}$/.test(x)).slice(0, 20) : []
  const preset: PeriodPreset = PERIODS.some(p => p.key === r.period?.preset) ? r.period.preset : 'all'
  const period: ReportPeriod = preset === 'custom'
    ? { preset, from: ISO_DAY.test(r.period?.from ?? '') ? r.period.from : null, to: ISO_DAY.test(r.period?.to ?? '') ? r.period.to : null }
    : { preset }
  const title = typeof r.title === 'string' ? r.title.trim().slice(0, 120) || null : null
  return {
    subject, ids, statuses, period,
    sections: ordered.length ? ordered : sectionsFor(subject).slice(0, 1).map(s => s.key),
    groupBy: r.groupBy === 'none' ? 'none' : 'job',
    title,
  }
}

/** Ask at the form AND the route: the one thing that stops a report running. */
export function configProblem(c: ReportConfig): string | null {
  if (!c.sections.length) return 'Pick at least one thing to put in the report.'
  if (c.period.preset === 'custom') {
    if (!c.period.from && !c.period.to) return 'Pick a start date, an end date, or both.'
    if (c.period.from && c.period.to && c.period.from > c.period.to) return 'The start date is after the end date.'
  }
  return null
}

// ── The rows a route loads ──────────────────────────────────────────────────

type Num = number | string | null | undefined
export interface RProject { id: string; name: string; status: string | null; address?: string | null; client?: string | null; customer_id?: string | null; sellout_amount?: Num; contractor_fee_pct?: Num; start_date?: string | null; end_date?: string | null }
export interface RCustomer { id: string; name: string }
export interface RCompany { id: string; name: string; type?: string | null; trade?: string | null }
export interface RSubcontract { id: string; project_id: string; company_id: string | null; trade?: string | null; scope?: string | null; contract_amount?: Num; status?: string | null }
export interface RInvoice { id: string; project_id: string; subcontract_id?: string | null; company_id?: string | null; company_name?: string | null; invoice_number?: string | null; description?: string | null; amount?: Num; status: string | null; client_paid?: Num; escrow_paid?: Num; markup_pct?: Num; markup_excluded?: boolean | null; created_at?: string | null; submitted_at?: string | null; due_date?: string | null; paid_at?: string | null }
export interface RChangeOrder { id: string; project_id: string; subcontract_id?: string | null; title?: string | null; amount?: Num; status?: string | null; reason?: string | null; created_at?: string | null }
export interface RMaterial { id: string; project_id: string; company_id?: string | null; store_name?: string | null; amount?: Num; tax?: Num; purchase_date?: string | null; category?: string | null; notes?: string | null; created_at?: string | null }
export interface RBudgetLine { id: string; project_id: string; cost_code?: string | null; category?: string | null; description?: string | null; section?: string | null; budgeted_amount?: Num; committed_amount?: Num; actual_amount?: Num; subcontract_id?: string | null; markup_pct?: Num; markup_excluded?: boolean | null; progress_pct?: Num }
export interface RAllocation { invoice_id: string; budget_line_item_id: string; amount: Num }
export interface RClientInvoice { id: string; project_id: string; invoice_number?: string | null; status?: string | null; issue_date?: string | null; due_date?: string | null; created_at?: string | null }
export interface RClientInvoiceLine { client_invoice_id: string; amount?: Num }
export interface RClientPayment { id: string; project_id: string; paid_date?: string | null; amount?: Num; method?: string | null; reference?: string | null; memo?: string | null; created_at?: string | null }
export interface RScheduleItem { id: string; project_id: string; subcontract_id?: string | null; label?: string | null; trade?: string | null; start_date?: string | null; end_date?: string | null; progress_pct?: Num }
export interface RPermit { id: string; project_id: string; permit_type?: string | null; permit_number?: string | null; status?: string | null; issued_date?: string | null; expiry_date?: string | null; issuing_authority?: string | null; created_at?: string | null }
export interface RInspection { id: string; project_id: string; type?: string | null; status?: string | null; scheduled_date?: string | null; requested_date?: string | null; completed_date?: string | null; inspector_name?: string | null; failure_reason?: string | null; voided_at?: string | null }
export interface RDailyLog { id: string; project_id: string; log_date?: string | null; workers_onsite?: number | null; weather?: string | null; notes?: string | null; has_issues?: boolean | null; issue_description?: string | null; created_by_name?: string | null }
export interface RTimeEntry { id: string; project_id: string; worker_name?: string | null; profile_id?: string | null; clock_in_at?: string | null; clock_out_at?: string | null; approval_status?: string | null }

export interface ReportData {
  projects: RProject[]
  customers: RCustomer[]
  companies: RCompany[]
  subcontracts: RSubcontract[]
  invoices: RInvoice[]
  changeOrders: RChangeOrder[]
  materials: RMaterial[]
  budgetLines: RBudgetLine[]
  allocations: RAllocation[]
  clientInvoices: RClientInvoice[]
  clientInvoiceLines: RClientInvoiceLine[]
  clientPayments: RClientPayment[]
  scheduleItems: RScheduleItem[]
  permits: RPermit[]
  inspections: RInspection[]
  dailyLogs: RDailyLog[]
  timeEntries: RTimeEntry[]
}

export const EMPTY_DATA: ReportData = {
  projects: [], customers: [], companies: [], subcontracts: [], invoices: [], changeOrders: [],
  materials: [], budgetLines: [], allocations: [], clientInvoices: [], clientInvoiceLines: [],
  clientPayments: [], scheduleItems: [], permits: [], inspections: [], dailyLogs: [], timeEntries: [],
}

// ── The document ────────────────────────────────────────────────────────────

export type CellKind = 'text' | 'money' | 'date' | 'pct' | 'number' | 'hours' | 'status'
export type Cell = string | number | null

export interface ReportColumn { key: string; label: string; kind: CellKind }
export interface ReportTable {
  /** Set when the table is one job's slice of a section. */
  heading?: string | null
  columns: ReportColumn[]
  rows: Record<string, Cell>[]
  /** Only the summable columns; the first column carries the word "Total". */
  totals?: Record<string, Cell> | null
}
export interface ReportStat { label: string; value: number; kind: 'money' | 'number' | 'hours' }
export interface ReportSection {
  key: SectionKey
  title: string
  /** A sentence about what the numbers mean, where a reader could guess wrong. */
  note?: string | null
  stats: ReportStat[]
  tables: ReportTable[]
  /** Said instead of an empty table. */
  empty?: string | null
}
export interface ReportDoc {
  version: 1
  title: string
  subtitle: string
  subjectLabel: string
  period: { label: string; from: string | null; to: string | null }
  generatedAt: string
  jobCount: number
  sections: ReportSection[]
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const amt = (v: unknown): number => toAmount(v) ?? 0
const round2 = (n: number) => Math.round(n * 100) / 100
const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

function byJob<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    if (!m.has(r.project_id)) m.set(r.project_id, [])
    m.get(r.project_id)!.push(r)
  }
  return m
}

function sumCols(rows: Record<string, Cell>[], columns: ReportColumn[]): Record<string, Cell> | null {
  const summable = columns.filter(c => c.kind === 'money' || c.kind === 'hours')
  if (!summable.length || !rows.length) return null
  const t: Record<string, Cell> = { [columns[0].key]: 'Total' }
  for (const c of summable) t[c.key] = round2(rows.reduce((s, r) => s + (typeof r[c.key] === 'number' ? (r[c.key] as number) : 0), 0))
  return t
}

/**
 * Split one section's rows into tables, per the Group by setting. Grouped, the
 * Job column is dropped (the heading says it); ungrouped, it leads.
 */
function tablesOf(
  rows: (Record<string, Cell> & { __job: string })[],
  columns: ReportColumn[],
  groupBy: GroupBy,
  jobs: RProject[],
  totals = true,
): ReportTable[] {
  if (!rows.length) return []
  const strip = (r: Record<string, Cell>) => { const { __job: _j, ...rest } = r as any; return rest as Record<string, Cell> }
  if (groupBy === 'none') {
    const name = new Map(jobs.map(j => [j.id, j.name]))
    const cols: ReportColumn[] = [{ key: 'job', label: 'Job', kind: 'text' }, ...columns]
    const out = rows.map(r => ({ job: name.get(r.__job) ?? 'Job', ...strip(r) }))
    return [{ columns: cols, rows: out, totals: totals ? sumCols(out, cols) : null }]
  }
  const tables: ReportTable[] = []
  for (const j of jobs) {
    const mine = rows.filter(r => r.__job === j.id).map(strip)
    if (!mine.length) continue
    tables.push({ heading: j.name, columns, rows: mine, totals: totals ? sumCols(mine, columns) : null })
  }
  return tables
}

const hoursBetween = (a?: string | null, b?: string | null): number => {
  if (!a || !b) return 0
  const ms = new Date(b).getTime() - new Date(a).getTime()
  return ms > 0 ? round2(ms / 3_600_000) : 0
}

const periodLabel = (p: ReportPeriod, r: { from: string | null; to: string | null }) => {
  if (p.preset !== 'custom') return PERIODS.find(x => x.key === p.preset)?.label ?? 'All time'
  if (r.from && r.to) return `${r.from} to ${r.to}`
  if (r.from) return `From ${r.from}`
  if (r.to) return `Up to ${r.to}`
  return 'All time'
}

// ── Scope: which jobs, and which vendor rows ────────────────────────────────

export interface Scope {
  jobs: RProject[]
  /** Set for a sub or supplier report: the companies it is about. */
  vendorIds: Set<string> | null
  /** Their names, lowercased, for material receipts typed by store name. */
  vendorNames: Set<string>
  /** Their subcontracts on those jobs. */
  vendorSubIds: Set<string>
}

export function scopeOf(c: ReportConfig, d: ReportData): Scope {
  const ids = new Set(c.ids)
  const statusOk = (p: RProject) => !c.statuses.length || c.statuses.includes(p.status ?? '')
  let jobs = d.projects.filter(statusOk)
  let vendorIds: Set<string> | null = null
  const vendorNames = new Set<string>()
  const vendorSubIds = new Set<string>()

  if (c.subject === 'job') {
    if (ids.size) jobs = jobs.filter(p => ids.has(p.id))
  } else if (c.subject === 'customer') {
    if (ids.size) jobs = jobs.filter(p => p.customer_id && ids.has(p.customer_id))
  } else {
    const wantType = c.subject === 'sub' ? 'subcontractor' : 'supplier'
    const companies = d.companies.filter(co => ids.size ? ids.has(co.id) : co.type === wantType)
    vendorIds = new Set(companies.map(co => co.id))
    for (const co of companies) if (lower(co.name)) vendorNames.add(lower(co.name))
    for (const s of d.subcontracts) if (s.company_id && vendorIds.has(s.company_id)) vendorSubIds.add(s.id)
    // A vendor's jobs are the ones they have anything on - a contract, a bill,
    // a purchase. Not every job in the company.
    const touched = new Set<string>()
    for (const s of d.subcontracts) if (vendorSubIds.has(s.id)) touched.add(s.project_id)
    for (const i of d.invoices) if (isVendorInvoice(i, vendorIds, vendorSubIds)) touched.add(i.project_id)
    for (const m of d.materials) if (isVendorMaterial(m, vendorIds, vendorNames)) touched.add(m.project_id)
    jobs = jobs.filter(p => touched.has(p.id))
  }
  jobs = [...jobs].sort((a, b) => a.name.localeCompare(b.name))
  return { jobs, vendorIds, vendorNames, vendorSubIds }
}

function isVendorInvoice(i: RInvoice, vendorIds: Set<string>, subIds: Set<string>) {
  return (!!i.company_id && vendorIds.has(i.company_id)) || (!!i.subcontract_id && subIds.has(i.subcontract_id))
}
function isVendorMaterial(m: RMaterial, vendorIds: Set<string>, names: Set<string>) {
  // A receipt keeps the store as TEXT and only sometimes links the company, so
  // an exact (case-folded) name match counts as the same supplier. Exact, never
  // fuzzy: "Home Depot" must not pick up "Home Depot Pro Rentals".
  return (!!m.company_id && vendorIds.has(m.company_id)) || names.has(lower(m.store_name))
}

// ── The build ───────────────────────────────────────────────────────────────

export interface BuildOptions {
  today: string
  generatedAt: string
  /** Names for the subtitle: the picked jobs / customers / companies. */
  pickedNames?: string[]
}

export function buildReport(c: ReportConfig, d: ReportData, o: BuildOptions): ReportDoc {
  const range = resolvePeriod(c.period, o.today)
  const scope = scopeOf(c, d)
  const jobIds = new Set(scope.jobs.map(j => j.id))
  const vendor = scope.vendorIds
  const onJob = <T extends { project_id: string }>(rows: T[]) => rows.filter(r => jobIds.has(r.project_id))

  const subs = onJob(d.subcontracts).filter(s => !vendor || scope.vendorSubIds.has(s.id))
  const subIds = new Set(subs.map(s => s.id))
  const companyName = new Map(d.companies.map(co => [co.id, co.name]))
  const subName = (s?: RSubcontract | null) => (s?.company_id && companyName.get(s.company_id)) || s?.trade || 'Subcontract'
  const subById = new Map(d.subcontracts.map(s => [s.id, s]))

  const invoicesAll = onJob(d.invoices).filter(i => !vendor || isVendorInvoice(i, vendor, scope.vendorSubIds))
  const invoices = invoicesAll.filter(i => inPeriod(i.submitted_at ?? i.created_at, range))
  const cosAll = onJob(d.changeOrders).filter(co => !vendor || (!!co.subcontract_id && subIds.has(co.subcontract_id)))
  const cos = cosAll.filter(co => inPeriod(co.created_at, range))
  const materials = onJob(d.materials)
    .filter(m => !vendor || isVendorMaterial(m, vendor, scope.vendorNames))
    .filter(m => inPeriod(m.purchase_date ?? m.created_at, range))
  const clientInvoices = onJob(d.clientInvoices).filter(ci => inPeriod(ci.issue_date ?? ci.created_at, range))
  const payments = onJob(d.clientPayments).filter(p => inPeriod(p.paid_date ?? p.created_at, range))
  const lineTotal = new Map<string, number>()
  for (const l of d.clientInvoiceLines) lineTotal.set(l.client_invoice_id, (lineTotal.get(l.client_invoice_id) ?? 0) + amt(l.amount))
  const invoiceName = (i: RInvoice) => (i.company_id && companyName.get(i.company_id)) || i.company_name || subName(i.subcontract_id ? subById.get(i.subcontract_id) : null)

  const sections: ReportSection[] = []
  const dated = !!(range.from || range.to)

  for (const key of c.sections) {
    const def = sectionDef(key)
    if (!def.subjects.includes(c.subject)) continue

    if (key === 'summary') {
      const rows: (Record<string, Cell> & { __job: string })[] = []
      for (const j of scope.jobs) {
        const jInv = invoices.filter(i => i.project_id === j.id)
        const billed = jInv.filter(i => ACTUAL_STATUSES.has(String(i.status))).reduce((s, i) => s + amt(i.amount), 0)
        const paid = jInv.reduce((s, i) => {
          const cp = amt(i.client_paid), ep = amt(i.escrow_paid)
          return s + (cp || ep ? cp + ep : i.status === 'paid' ? amt(i.amount) : 0)
        }, 0)
        const awaiting = jInv.filter(i => i.status === 'pending_approval').reduce((s, i) => s + amt(i.amount), 0)
        const jSubs = subs.filter(s => s.project_id === j.id)
        const approvedCo = cosAll.filter(co => co.project_id === j.id && co.status === 'approved').reduce((s, co) => s + amt(co.amount), 0)
        const mats = materials.filter(m => m.project_id === j.id).reduce((s, m) => s + amt(m.amount), 0)
        if (vendor) {
          const contract = jSubs.reduce((s, x) => s + amt(x.contract_amount), 0) + approvedCo
          rows.push({
            __job: j.id, label: j.name, contract: round2(contract), billed: round2(billed), paid: round2(paid),
            outstanding: round2(Math.max(billed - paid, 0)), awaiting: round2(awaiting), materials: round2(mats),
            remaining: round2(Math.max(contract - billed, 0)),
          })
        } else {
          const jCi = clientInvoices.filter(ci => ci.project_id === j.id && ci.status !== 'draft' && ci.status !== 'void')
          const invoiced = jCi.reduce((s, ci) => s + (lineTotal.get(ci.id) ?? 0), 0)
          const received = payments.filter(p => p.project_id === j.id).reduce((s, p) => s + amt(p.amount), 0)
          rows.push({
            __job: j.id, label: j.name, status: j.status ?? null, contract: round2(amt(j.sellout_amount)),
            billed: round2(billed), paid: round2(paid), outstanding: round2(Math.max(billed - paid, 0)),
            awaiting: round2(awaiting), materials: round2(mats), invoiced: round2(invoiced), received: round2(received),
          })
        }
      }
      const columns: ReportColumn[] = vendor
        ? [
            { key: 'label', label: 'Job', kind: 'text' },
            { key: 'contract', label: 'Contract + approved COs', kind: 'money' },
            { key: 'billed', label: 'Billed', kind: 'money' },
            { key: 'paid', label: 'Paid', kind: 'money' },
            { key: 'outstanding', label: 'Outstanding', kind: 'money' },
            { key: 'awaiting', label: 'Awaiting approval', kind: 'money' },
            { key: 'materials', label: 'Materials', kind: 'money' },
            { key: 'remaining', label: 'Left to bill', kind: 'money' },
          ]
        : [
            { key: 'label', label: 'Job', kind: 'text' },
            { key: 'status', label: 'Status', kind: 'status' },
            { key: 'contract', label: 'Contract', kind: 'money' },
            { key: 'billed', label: 'Vendor bills', kind: 'money' },
            { key: 'paid', label: 'Paid to vendors', kind: 'money' },
            { key: 'outstanding', label: 'Owed to vendors', kind: 'money' },
            { key: 'awaiting', label: 'Awaiting approval', kind: 'money' },
            { key: 'materials', label: 'Materials', kind: 'money' },
            { key: 'invoiced', label: 'Invoiced to client', kind: 'money' },
            { key: 'received', label: 'Received', kind: 'money' },
          ]
      const clean = rows.map(({ __job: _j, ...r }) => r as Record<string, Cell>)
      const totals = sumCols(clean, columns)
      const tot = (k: string) => (typeof totals?.[k] === 'number' ? (totals![k] as number) : 0)
      const stats: ReportStat[] = vendor
        ? [
            { label: 'Contract + approved COs', value: tot('contract'), kind: 'money' },
            { label: 'Billed', value: tot('billed'), kind: 'money' },
            { label: 'Paid', value: tot('paid'), kind: 'money' },
            { label: 'Outstanding', value: tot('outstanding'), kind: 'money' },
          ]
        : [
            { label: 'Contract value', value: tot('contract'), kind: 'money' },
            { label: 'Vendor bills', value: tot('billed'), kind: 'money' },
            { label: 'Owed to vendors', value: tot('outstanding'), kind: 'money' },
            { label: 'Received from client', value: tot('received'), kind: 'money' },
          ]
      sections.push({
        key, title: def.label, stats,
        note: [
          'Bills count once approved; a bill still waiting for approval is shown beside "owed", never added into it.',
          dated ? 'Contract values are not dated; billed, paid, invoiced and received are for the period only.' : null,
        ].filter(Boolean).join(' '),
        tables: clean.length ? [{ columns, rows: clean, totals }] : [],
        empty: 'No jobs match these settings.',
      })
    }

    if (key === 'contracts') {
      const rows = subs.map(s => {
        const sCo = cosAll.filter(co => co.subcontract_id === s.id)
        const approved = sCo.filter(co => co.status === 'approved').reduce((t, co) => t + amt(co.amount), 0)
        const pending = sCo.filter(co => co.status === 'pending').reduce((t, co) => t + amt(co.amount), 0)
        const sInv = invoicesAll.filter(i => i.subcontract_id === s.id)
        const billed = sInv.filter(i => ACTUAL_STATUSES.has(String(i.status))).reduce((t, i) => t + amt(i.amount), 0)
        const paid = sInv.reduce((t, i) => {
          const cp = amt(i.client_paid), ep = amt(i.escrow_paid)
          return t + (cp || ep ? cp + ep : i.status === 'paid' ? amt(i.amount) : 0)
        }, 0)
        const revised = amt(s.contract_amount) + approved
        return {
          __job: s.project_id, vendor: subName(s), trade: s.trade ?? null, status: s.status ?? null,
          original: round2(amt(s.contract_amount)), approved: round2(approved), pending: round2(pending),
          revised: round2(revised), billed: round2(billed), paid: round2(paid),
          balance: round2(revised - billed),
          pct: revised > 0 ? Math.round((billed / revised) * 100) : null,
        }
      })
      sections.push({
        key, title: def.label,
        note: 'Contract figures are to date - the period does not apply to a contract. Pending change orders are listed but not added in.',
        stats: [
          { label: 'Contracts', value: rows.length, kind: 'number' },
          { label: 'Revised contract', value: round2(rows.reduce((t, r) => t + (r.revised as number), 0)), kind: 'money' },
          { label: 'Billed', value: round2(rows.reduce((t, r) => t + (r.billed as number), 0)), kind: 'money' },
          { label: 'Left to bill', value: round2(rows.reduce((t, r) => t + (r.balance as number), 0)), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'vendor', label: 'Vendor', kind: 'text' },
          { key: 'trade', label: 'Trade', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'original', label: 'Original', kind: 'money' },
          { key: 'approved', label: 'Approved COs', kind: 'money' },
          { key: 'pending', label: 'Pending COs', kind: 'money' },
          { key: 'revised', label: 'Revised', kind: 'money' },
          { key: 'billed', label: 'Billed', kind: 'money' },
          { key: 'paid', label: 'Paid', kind: 'money' },
          { key: 'balance', label: 'Left to bill', kind: 'money' },
          { key: 'pct', label: '% billed', kind: 'pct' },
        ], c.groupBy, scope.jobs),
        empty: 'No subcontracts on these jobs.',
      })
    }

    if (key === 'bills') {
      const rows = invoices
        .slice()
        .sort((a, b) => String(a.submitted_at ?? a.created_at ?? '').localeCompare(String(b.submitted_at ?? b.created_at ?? '')))
        .map(i => {
          const cp = amt(i.client_paid), ep = amt(i.escrow_paid)
          const paid = cp || ep ? cp + ep : i.status === 'paid' ? amt(i.amount) : 0
          return {
            __job: i.project_id, date: (i.submitted_at ?? i.created_at ?? null)?.slice(0, 10) ?? null,
            number: i.invoice_number ?? null, vendor: invoiceName(i), description: i.description ?? null,
            status: i.status ?? null, due: i.due_date ?? null, amount: round2(amt(i.amount)), paid: round2(paid),
            open: round2(ACTUAL_STATUSES.has(String(i.status)) ? Math.max(amt(i.amount) - paid, 0) : 0),
          }
        })
      sections.push({
        key, title: def.label,
        note: 'Drafts, rejected bills and bills waiting for approval are listed but owe nothing until approved.',
        stats: [
          { label: 'Bills', value: rows.length, kind: 'number' },
          { label: 'Amount', value: round2(rows.reduce((t, r) => t + (r.amount as number), 0)), kind: 'money' },
          { label: 'Paid', value: round2(rows.reduce((t, r) => t + (r.paid as number), 0)), kind: 'money' },
          { label: 'Still owed', value: round2(rows.reduce((t, r) => t + (r.open as number), 0)), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'number', label: 'Bill #', kind: 'text' },
          { key: 'vendor', label: 'Vendor', kind: 'text' },
          { key: 'description', label: 'Description', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'due', label: 'Due', kind: 'date' },
          { key: 'amount', label: 'Amount', kind: 'money' },
          { key: 'paid', label: 'Paid', kind: 'money' },
          { key: 'open', label: 'Still owed', kind: 'money' },
        ], c.groupBy, scope.jobs),
        empty: dated ? 'No bills in this period.' : 'No bills on these jobs.',
      })
    }

    if (key === 'change_orders') {
      const rows = cos
        .slice()
        .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
        .map(co => ({
          __job: co.project_id, date: co.created_at?.slice(0, 10) ?? null, title: co.title ?? null,
          vendor: co.subcontract_id ? subName(subById.get(co.subcontract_id)) : null,
          reason: co.reason ?? null, status: co.status ?? null, amount: round2(amt(co.amount)),
        }))
      const sumBy = (st: string) => round2(rows.filter(r => r.status === st).reduce((t, r) => t + (r.amount as number), 0))
      sections.push({
        key, title: def.label,
        stats: [
          { label: 'Approved', value: sumBy('approved'), kind: 'money' },
          { label: 'Pending', value: sumBy('pending'), kind: 'money' },
          { label: 'Rejected', value: sumBy('rejected'), kind: 'money' },
        ],
        note: 'The total under each table adds every status together; the figures above split them.',
        tables: tablesOf(rows, [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'title', label: 'Change order', kind: 'text' },
          { key: 'vendor', label: 'Vendor', kind: 'text' },
          { key: 'reason', label: 'Reason', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'amount', label: 'Amount', kind: 'money' },
        ], c.groupBy, scope.jobs),
        empty: dated ? 'No change orders in this period.' : 'No change orders on these jobs.',
      })
    }

    if (key === 'materials') {
      const rows = materials
        .slice()
        .sort((a, b) => String(a.purchase_date ?? '').localeCompare(String(b.purchase_date ?? '')))
        .map(m => ({
          __job: m.project_id, date: m.purchase_date ?? m.created_at?.slice(0, 10) ?? null,
          store: (m.company_id && companyName.get(m.company_id)) || m.store_name || null,
          category: m.category ?? null, notes: m.notes ?? null,
          tax: round2(amt(m.tax)), amount: round2(amt(m.amount)),
        }))
      sections.push({
        key, title: def.label,
        stats: [
          { label: 'Purchases', value: rows.length, kind: 'number' },
          { label: 'Spent', value: round2(rows.reduce((t, r) => t + (r.amount as number), 0)), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'store', label: 'Supplier', kind: 'text' },
          { key: 'category', label: 'Category', kind: 'text' },
          { key: 'notes', label: 'Notes', kind: 'text' },
          { key: 'tax', label: 'Tax', kind: 'money' },
          { key: 'amount', label: 'Amount', kind: 'money' },
        ], c.groupBy, scope.jobs),
        empty: dated ? 'No purchases in this period.' : 'No purchases on these jobs.',
      })
    }

    if (key === 'budget') {
      const lines = onJob(d.budgetLines)
      const rows = lines.map(l => {
        const budgeted = amt(l.budgeted_amount), committed = amt(l.committed_amount), actual = amt(l.actual_amount)
        return {
          __job: l.project_id, code: l.cost_code ?? null,
          item: l.description || l.category || l.section || 'Line',
          budgeted: round2(budgeted), committed: round2(committed), actual: round2(actual),
          variance: round2(budgeted - Math.max(committed, actual)),
          progress: toAmount(l.progress_pct),
        }
      })
      sections.push({
        key, title: def.label,
        note: 'Variance is the budget less whichever is larger, committed or actual - negative means over. Budgets are to date; the period does not apply.',
        stats: [
          { label: 'Budget', value: round2(rows.reduce((t, r) => t + (r.budgeted as number), 0)), kind: 'money' },
          { label: 'Committed', value: round2(rows.reduce((t, r) => t + (r.committed as number), 0)), kind: 'money' },
          { label: 'Actual', value: round2(rows.reduce((t, r) => t + (r.actual as number), 0)), kind: 'money' },
          { label: 'Variance', value: round2(rows.reduce((t, r) => t + (r.variance as number), 0)), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'code', label: 'Code', kind: 'text' },
          { key: 'item', label: 'Line', kind: 'text' },
          { key: 'budgeted', label: 'Budget', kind: 'money' },
          { key: 'committed', label: 'Committed', kind: 'money' },
          { key: 'actual', label: 'Actual', kind: 'money' },
          { key: 'variance', label: 'Variance', kind: 'money' },
          { key: 'progress', label: 'Progress', kind: 'pct' },
        ], c.groupBy, scope.jobs),
        empty: 'No budget lines on these jobs.',
      })
    }

    if (key === 'margin') {
      // The SAME derivation as the job's own tabs and Master Money
      // (lib/escrow.ts, lib/committed.ts) - a third spelling of "fee earned"
      // is how two screens came to disagree about escrow in the first place.
      const invByJob = byJob(onJob(d.invoices))
      const linesByJob = byJob(onJob(d.budgetLines))
      const subsByJob = byJob(onJob(d.subcontracts))
      const payByJob = byJob(onJob(d.clientPayments))
      const jobInvoiceIds = new Set(onJob(d.invoices).map(i => i.id))
      const allocs = d.allocations.filter(a => jobInvoiceIds.has(a.invoice_id))
      const rows = scope.jobs.map(j => {
        const lines = linesByJob.get(j.id) ?? []
        const e = projectEscrow({
          feePct: j.contractor_fee_pct, payments: (payByJob.get(j.id) ?? []) as any,
          invoices: (invByJob.get(j.id) ?? []) as any, budgetLines: lines as any, allocations: allocs as any,
        })
        const committed = committedTotal({ subcontracts: (subsByJob.get(j.id) ?? []) as any, lines: lines as any }).total
        const contract = amt(j.sellout_amount)
        const cost = e.vendorBilled
        return {
          __job: j.id, contract: round2(contract), budget: round2(e.budgetTotal), committed: round2(committed),
          cost: round2(cost), fee: round2(e.feeEarned),
          gross: contract ? round2(contract - Math.max(committed, cost)) : null,
          feePct: toAmount(j.contractor_fee_pct) != null ? round2(amt(j.contractor_fee_pct) * 100) : null,
        }
      })
      sections.push({
        key, title: def.label,
        note: 'Fee earned is worked out bill by bill, exactly as on the job\'s own tab. Projected margin is the contract less whichever is larger, committed or cost to date. All figures are to date.',
        stats: [
          { label: 'Contract value', value: round2(rows.reduce((t, r) => t + (r.contract as number), 0)), kind: 'money' },
          { label: 'Cost to date', value: round2(rows.reduce((t, r) => t + (r.cost as number), 0)), kind: 'money' },
          { label: 'Fee earned', value: round2(rows.reduce((t, r) => t + (r.fee as number), 0)), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'contract', label: 'Contract', kind: 'money' },
          { key: 'budget', label: 'Budget', kind: 'money' },
          { key: 'committed', label: 'Committed', kind: 'money' },
          { key: 'cost', label: 'Cost to date', kind: 'money' },
          { key: 'feePct', label: 'Fee rate', kind: 'pct' },
          { key: 'fee', label: 'Fee earned', kind: 'money' },
          { key: 'gross', label: 'Projected margin', kind: 'money' },
        ], 'none', scope.jobs),
        empty: 'No jobs match these settings.',
      })
    }

    if (key === 'client_billing') {
      const invRows = clientInvoices
        .filter(ci => ci.status !== 'void')
        .slice()
        .sort((a, b) => String(a.issue_date ?? '').localeCompare(String(b.issue_date ?? '')))
        .map(ci => ({
          __job: ci.project_id, kind: 'Invoice', date: ci.issue_date ?? ci.created_at?.slice(0, 10) ?? null,
          ref: ci.invoice_number ?? null, status: ci.status ?? null, due: ci.due_date ?? null,
          invoiced: round2(lineTotal.get(ci.id) ?? 0), received: 0,
        }))
      const payRows = payments.map(p => ({
        __job: p.project_id, kind: 'Payment', date: p.paid_date ?? p.created_at?.slice(0, 10) ?? null,
        ref: p.reference || p.method || null, status: null, due: null, invoiced: 0, received: round2(amt(p.amount)),
      }))
      const rows = [...invRows, ...payRows].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
      const sent = invRows.filter(r => r.status !== 'draft').reduce((t, r) => t + (r.invoiced as number), 0)
      const received = payRows.reduce((t, r) => t + (r.received as number), 0)
      sections.push({
        key, title: def.label,
        note: 'Drafts are listed but not counted as invoiced; voided invoices are left out.',
        stats: [
          { label: 'Invoiced', value: round2(sent), kind: 'money' },
          { label: 'Received', value: round2(received), kind: 'money' },
          { label: 'Difference', value: round2(sent - received), kind: 'money' },
        ],
        tables: tablesOf(rows, [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'kind', label: 'Type', kind: 'text' },
          { key: 'ref', label: 'Number / reference', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'due', label: 'Due', kind: 'date' },
          { key: 'invoiced', label: 'Invoiced', kind: 'money' },
          { key: 'received', label: 'Received', kind: 'money' },
        ], c.groupBy, scope.jobs),
        empty: dated ? 'No client invoices or payments in this period.' : 'No client invoices or payments on these jobs.',
      })
    }

    if (key === 'schedule') {
      const items = onJob(d.scheduleItems)
        .filter(s => !vendor || (!!s.subcontract_id && subIds.has(s.subcontract_id)))
        // A line is in the period when it OVERLAPS it, not only when it starts.
        .filter(s => {
          if (!range.from && !range.to) return true
          const start = s.start_date ?? s.end_date, end = s.end_date ?? s.start_date
          if (!start || !end) return false
          return (!range.to || start <= range.to) && (!range.from || end >= range.from)
        })
        .sort((a, b) => String(a.start_date ?? '9999').localeCompare(String(b.start_date ?? '9999')))
      const rows = items.map(s => ({
        __job: s.project_id,
        line: s.label || (s.subcontract_id ? subName(subById.get(s.subcontract_id)) : null) || s.trade || 'Schedule line',
        vendor: s.subcontract_id ? subName(subById.get(s.subcontract_id)) : null,
        start: s.start_date ?? null, end: s.end_date ?? null, progress: toAmount(s.progress_pct),
      }))
      sections.push({
        key, title: def.label,
        stats: [{ label: 'Schedule lines', value: rows.length, kind: 'number' }],
        tables: tablesOf(rows, [
          { key: 'line', label: 'Line', kind: 'text' },
          { key: 'vendor', label: 'Vendor', kind: 'text' },
          { key: 'start', label: 'Start', kind: 'date' },
          { key: 'end', label: 'Finish', kind: 'date' },
          { key: 'progress', label: 'Progress', kind: 'pct' },
        ], c.groupBy, scope.jobs, false),
        empty: dated ? 'Nothing scheduled in this period.' : 'Nothing on the schedule for these jobs.',
      })
    }

    if (key === 'permits') {
      const rows = onJob(d.permits)
        .filter(p => !dated || inPeriod(p.issued_date ?? p.created_at, range) || inPeriod(p.expiry_date, range))
        .map(p => ({
          __job: p.project_id, type: p.permit_type ?? null, number: p.permit_number ?? null,
          authority: p.issuing_authority ?? null, status: p.status ?? null,
          issued: p.issued_date ?? null, expires: p.expiry_date ?? null,
        }))
      sections.push({
        key, title: def.label,
        stats: [{ label: 'Permits', value: rows.length, kind: 'number' }],
        tables: tablesOf(rows, [
          { key: 'type', label: 'Permit', kind: 'text' },
          { key: 'number', label: 'Number', kind: 'text' },
          { key: 'authority', label: 'Issued by', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'issued', label: 'Issued', kind: 'date' },
          { key: 'expires', label: 'Expires', kind: 'date' },
        ], c.groupBy, scope.jobs, false),
        empty: 'No permits on these jobs.',
      })
    }

    if (key === 'inspections') {
      const rows = onJob(d.inspections)
        .filter(i => !i.voided_at && i.status !== 'void')
        .filter(i => inPeriod(i.completed_date ?? i.scheduled_date ?? i.requested_date, range))
        .sort((a, b) => String(a.scheduled_date ?? a.requested_date ?? '9999').localeCompare(String(b.scheduled_date ?? b.requested_date ?? '9999')))
        .map(i => ({
          __job: i.project_id, type: i.type ?? null, status: i.status ?? null,
          date: i.completed_date ?? i.scheduled_date ?? i.requested_date ?? null,
          inspector: i.inspector_name ?? null, note: i.failure_reason ?? null,
        }))
      const count = (st: string) => rows.filter(r => r.status === st).length
      sections.push({
        key, title: def.label,
        stats: [
          { label: 'Inspections', value: rows.length, kind: 'number' },
          { label: 'Passed', value: count('passed'), kind: 'number' },
          { label: 'Failed', value: count('failed') + count('pending_reinspection'), kind: 'number' },
        ],
        tables: tablesOf(rows, [
          { key: 'type', label: 'Inspection', kind: 'text' },
          { key: 'status', label: 'Status', kind: 'status' },
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'inspector', label: 'Inspector', kind: 'text' },
          { key: 'note', label: 'Note', kind: 'text' },
        ], c.groupBy, scope.jobs, false),
        empty: dated ? 'No inspections in this period.' : 'No inspections on these jobs.',
      })
    }

    if (key === 'daily_logs') {
      const rows = onJob(d.dailyLogs)
        .filter(l => inPeriod(l.log_date, range))
        .sort((a, b) => String(a.log_date ?? '').localeCompare(String(b.log_date ?? '')))
        .map(l => ({
          __job: l.project_id, date: l.log_date ?? null, crew: l.workers_onsite ?? null,
          weather: l.weather ?? null, notes: l.notes ?? null,
          issues: l.has_issues ? (l.issue_description || 'Yes') : null, by: l.created_by_name ?? null,
        }))
      sections.push({
        key, title: def.label,
        stats: [
          { label: 'Logs', value: rows.length, kind: 'number' },
          { label: 'With issues', value: rows.filter(r => r.issues).length, kind: 'number' },
        ],
        tables: tablesOf(rows, [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'crew', label: 'Crew', kind: 'number' },
          { key: 'weather', label: 'Weather', kind: 'text' },
          { key: 'notes', label: 'Notes', kind: 'text' },
          { key: 'issues', label: 'Issues', kind: 'text' },
          { key: 'by', label: 'By', kind: 'text' },
        ], c.groupBy, scope.jobs, false),
        empty: dated ? 'No daily logs in this period.' : 'No daily logs on these jobs.',
      })
    }

    if (key === 'time') {
      // Hours per person per job. An entry still clocked in has no end, so it
      // counts nothing and is SAID, rather than adding hours up to "now".
      const entries = onJob(d.timeEntries).filter(t => inPeriod(t.clock_in_at, range))
      const agg = new Map<string, { __job: string; person: string; shifts: number; hours: number; open: number; pending: number }>()
      for (const t of entries) {
        const person = t.worker_name || 'Unnamed'
        const k = `${t.project_id}|${t.profile_id ?? person}`
        if (!agg.has(k)) agg.set(k, { __job: t.project_id, person, shifts: 0, hours: 0, open: 0, pending: 0 })
        const a = agg.get(k)!
        a.shifts += 1
        if (!t.clock_out_at) a.open += 1
        a.hours = round2(a.hours + hoursBetween(t.clock_in_at, t.clock_out_at))
        if (t.approval_status === 'pending') a.pending += 1
      }
      const rows = Array.from(agg.values()).sort((a, b) => a.person.localeCompare(b.person))
        .map(a => ({ __job: a.__job, person: a.person, shifts: a.shifts, hours: a.hours, open: a.open || null, pending: a.pending || null }))
      sections.push({
        key, title: def.label,
        note: 'A shift still clocked in counts no hours until it is clocked out.',
        stats: [
          { label: 'Hours', value: round2(rows.reduce((t, r) => t + (r.hours as number), 0)), kind: 'hours' },
          { label: 'Shifts', value: rows.reduce((t, r) => t + (r.shifts as number), 0), kind: 'number' },
        ],
        tables: tablesOf(rows, [
          { key: 'person', label: 'Person', kind: 'text' },
          { key: 'shifts', label: 'Shifts', kind: 'number' },
          { key: 'hours', label: 'Hours', kind: 'hours' },
          { key: 'open', label: 'Still clocked in', kind: 'number' },
          { key: 'pending', label: 'Awaiting approval', kind: 'number' },
        ], c.groupBy, scope.jobs),
        empty: dated ? 'No time recorded in this period.' : 'No time recorded on these jobs.',
      })
    }
  }

  const subj = SUBJECTS.find(s => s.key === c.subject)!
  const picked = (o.pickedNames ?? []).filter(Boolean)
  const who = picked.length === 0
    ? `All ${subj.plural.toLowerCase()}`
    : picked.length <= 3 ? picked.join(', ') : `${picked.slice(0, 2).join(', ')} and ${picked.length - 2} more`
  const pLabel = periodLabel(c.period, range)
  const derived = c.subject === 'job'
    ? (picked.length === 1 ? `${picked[0]} report` : 'Jobs report')
    : `${picked.length === 1 ? picked[0] : subj.plural} report`

  return {
    version: 1,
    title: c.title?.trim() || derived,
    subtitle: `${subj.label}: ${who} - ${pLabel} - ${scope.jobs.length} ${scope.jobs.length === 1 ? 'job' : 'jobs'}`,
    subjectLabel: subj.label,
    period: { label: pLabel, ...range },
    generatedAt: o.generatedAt,
    jobCount: scope.jobs.length,
    sections,
  }
}

/** Which of a config's sections an internal-only reader should think twice about sending. */
export function internalSections(c: ReportConfig): SectionDef[] {
  return c.sections.map(sectionDef).filter(s => s.internal)
}
