// ─────────────────────────────────────────────────────────────────────────────
// The ONE invented company every picture of the app on the website belongs to.
//
// The hero's Projects screen listed nine jobs and the dashboard two screens
// down said "18 active projects, $4.2M under contract" - two companies, and
// neither added up. Reported as "your demo looks like an abandoned account":
// the Projects screen also rendered every count, percent and dollar as 0,
// because a count-up waited for a scroll that a crawler (and the first paint)
// never makes. Every number on either screen is now DERIVED from this list,
// so they cannot disagree, and the pictures are rendered at their final values.
//
// The names are deliberately generic ("Sample Residences", "Demo Lofts"): a
// model quoting the page must not be able to list an invented client as a
// customer.
// ─────────────────────────────────────────────────────────────────────────────

export type SampleStatus = 'active' | 'planning' | 'on_hold' | 'completed'

export interface SampleProject {
  name: string; type: string; address: string; client: string; status: SampleStatus
  start: number; months: number; done: number; tasks: number
  contract: number; paid: number; owed: number
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  { name: 'Sample Residences', type: 'Residential', address: '100 Sample St, Anytown', client: 'Sample Client LLC', status: 'active', start: -5, months: 11, done: 14, tasks: 19, contract: 1200000, paid: 610000, owed: 84000 },
  { name: 'Demo Lofts', type: 'Commercial', address: '200 Example Ave, Anytown', client: 'Demo Client Partners', status: 'active', start: -3, months: 14, done: 9, tasks: 16, contract: 2400000, paid: 920000, owed: 140000 },
  { name: 'Sample Commercial', type: 'Commercial', address: '300 Sample Blvd, Anytown', client: 'Sample Owner LLC', status: 'planning', start: 2, months: 12, done: 1, tasks: 8, contract: 3100000, paid: 0, owed: 0 },
  { name: 'Demo Townhomes', type: 'Residential', address: '400 Demo Rd, Anytown', client: 'Sample Homeowner', status: 'active', start: -9, months: 11, done: 21, tasks: 23, contract: 880000, paid: 702000, owed: 36000 },
  { name: 'Demo Duplex', type: 'Residential', address: '500 Example Ln, Anytown', client: 'Demo Homeowner', status: 'on_hold', start: -2, months: 8, done: 2, tasks: 9, contract: 310000, paid: 45000, owed: 12000 },
  { name: 'Demo Office Fit-out', type: 'Commercial', address: '600 Sample Ave, Anytown', client: 'Sample Tenant Co.', status: 'active', start: -4, months: 7, done: 8, tasks: 12, contract: 640000, paid: 330000, owed: 58000 },
  { name: 'Sample Retail Unit 4', type: 'Commercial', address: '700 Demo Plaza, Anytown', client: 'Demo Retail LLC', status: 'planning', start: 1, months: 6, done: 0, tasks: 4, contract: 1700000, paid: 0, owed: 0 },
  { name: 'Sample Kitchen Reno', type: 'Residential', address: '800 Example St, Anytown', client: 'Sample Homeowner', status: 'completed', start: -7, months: 5, done: 11, tasks: 11, contract: 190000, paid: 190000, owed: 0 },
  { name: 'Demo Warehouse', type: 'Industrial', address: '900 Sample Way, Anytown', client: 'Demo Logistics Inc.', status: 'active', start: -6, months: 16, done: 10, tasks: 22, contract: 2900000, paid: 1100000, owed: 210000 },
]

export const STATUS_LABEL: Record<SampleStatus, string> = {
  active: 'Active', planning: 'Planning', on_hold: 'On hold', completed: 'Completed',
}

export const progressPct = (p: SampleProject) => Math.round((p.done / p.tasks) * 100)

/** Same shape as the real card's fmtMoney. */
export function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

const open = SAMPLE_PROJECTS.filter(p => p.status !== 'completed')
const active = SAMPLE_PROJECTS.filter(p => p.status === 'active')

/** The dashboard's numbers, computed from the same jobs the Projects screen lists. */
export const SAMPLE_SUMMARY = {
  activeCount: active.length,
  underContract: active.reduce((s, p) => s + p.contract, 0),
  openTasks: open.reduce((s, p) => s + (p.tasks - p.done), 0),
  jobCount: SAMPLE_PROJECTS.length,
}

/** The jobs a dashboard lists, busiest first: active ones, by contract size. */
export const SAMPLE_ACTIVE_BY_SIZE = [...active].sort((a, b) => b.contract - a.contract)
