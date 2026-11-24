import type { Action } from './permissions'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT SOMEBODY WHO DOES NOT OWN THE JOB MAY TOUCH ON IT.
//
// A sub awarded work on a GC's job sees eight tabs and nothing else. That rule
// lived in the tab menu (`components/layout/project-tabs.tsx`) and nowhere
// else, so the menu hid Budget and Bills while the routes behind them answered
// any account holding the permission - which a sub's own admin does, in full,
// for their own company. A guard on the menu is not a guard.
//
// ONE LIST, read by the menu AND by `requirePermission` for every route under
// `/api/projects/<id>/`. Same rule for an outside person on the job's team
// (`member` side): somebody the GC added to the roster is on the job, not in
// the GC's books.
//
// The lane is a RESOURCE list, not a tab list, and it is narrower than the
// tabs in one direction: plans, schedule and progress are for reading. A sub
// moves their own dates through My Jobs (`/api/my-jobs/.../delay`), never by
// rewriting the GC's schedule. What a sub WRITES on a GC's job is the field
// record - tasks, logs, time, RFIs, their own compliance paperwork - and the
// "it's ready for inspection" report.
//
// A sub's own bill is NOT here on purpose: `invoices: view` is every sub's
// bills on the job. The bill routes let a sub through by checking the RECORD
// (a subcontract their company holds on this job), and opt in with
// `requirePermission(..., { subOwnRecord: true })`.
// ─────────────────────────────────────────────────────────────────────────────

/** The tabs a sub sees on a job they were awarded. The menu's list. */
export const SUB_AWARDED_TABS = ['plans', 'schedule', 'tasks', 'progress', 'daily-logs', 'time', 'rfis', 'compliance'] as const

const READ_ONLY = new Set(['plans', 'schedule', 'progress'])
const READ_WRITE = new Set(['tasks', 'daily-logs', 'time', 'rfis', 'compliance', 'mark-ready'])

/** May a caller on the sub (or outside-team) side use this resource at this action? */
export function subLaneAllows(resource: string, action: Action): boolean {
  if (READ_WRITE.has(resource)) return true
  if (READ_ONLY.has(resource)) return action === 'view'
  return false
}

/** The refusal, in one spelling. 403: they are on the job, so it is not a 404. */
export const SUB_LANE_REFUSAL = 'That part of the job belongs to the general contractor.'

/**
 * The project a request is about, when its URL is `/api/projects/<uuid>/...`.
 *
 * A UUID only: `/api/projects/stats` and friends are not a project. Read off
 * the PATH, never the query or the body, so a caller cannot point the check at
 * a job other than the one the route will read.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function projectIdFromUrl(url: string): string | null {
  let path: string
  try { path = new URL(url).pathname } catch { return null }
  const m = path.match(/^\/api\/projects\/([^/]+)(?:\/|$)/)
  return m && UUID.test(m[1]) ? m[1] : null
}
