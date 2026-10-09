// ─────────────────────────────────────────────────────────────────────────────
// Which inspections a job needs, and where each one stands.
//
// THE LIST OF TYPES WAS A CONSTANT INSIDE ONE PAGE. The request form read it
// and nothing else could, so a job could not say up front "these are the
// inspections this house needs" - you found out what was owed by requesting
// them one at a time. This is the one list now: the defaults below, plus the
// types a company adds for itself (`inspection_type_options`).
//
// A REQUIRED INSPECTION IS NOT AN INSPECTION ROW. `not_scheduled` already
// means "somebody asked for this and nobody is booking it yet" - it counts as
// "to book", it notifies the schedulers, and it demands a date. A house that
// will need a septic final in six months has asked for nothing yet, and filing
// it as `not_scheduled` would put six months of nagging on every job. So the
// list is its own table (`project_required_inspections`), and WHERE EACH ONE
// STANDS IS DERIVED from the inspection rows of that type - never stored, so it
// cannot disagree with them. Requesting one is the ordinary request form,
// pre-filled.
// ─────────────────────────────────────────────────────────────────────────────

/** The starting list every company gets. Order is the order a house is built in. */
export const DEFAULT_INSPECTION_TYPES = [
  'Septic Permit / Site Evaluation',
  'Footing',
  'Foundation',
  'Slab / Underslab Plumbing',
  'Framing',
  'Rough Electrical',
  'Rough Plumbing',
  'Rough Mechanical',
  'Insulation',
  'Drywall',
  'Well',
  'Septic Final',
  'Fire Sprinkler',
  'Final Electrical',
  'Final Plumbing',
  'Final Mechanical',
  'Building Final',
  'Certificate of Occupancy',
] as const

/** Case, spacing and punctuation do not make a different inspection. */
export function foldType(name: unknown): string {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** A type name as stored: trimmed, single-spaced, capped. Null when empty. */
export function cleanTypeName(name: unknown): string | null {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return s || null
}

/** Why a type name cannot be added, or null. Asked by the form AND the route. */
export function typeNameProblem(name: unknown): string | null {
  const s = cleanTypeName(name)
  if (!s) return 'Give the inspection a name.'
  if (!/[a-z]/i.test(s)) return 'An inspection name needs at least one word in it.'
  return null
}

/**
 * The picker's options: the defaults in building order, then the company's
 * own, without a second copy of anything that differs only by case.
 */
export function typeOptions(custom: readonly string[] = []): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of [...DEFAULT_INSPECTION_TYPES, ...custom]) {
    const clean = cleanTypeName(t)
    if (!clean) continue
    const k = foldType(clean)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(clean)
  }
  return out
}

/** Is this one of the built-in types (so it is not stored as a company option)? */
export const isDefaultType = (name: unknown): boolean =>
  DEFAULT_INSPECTION_TYPES.some(t => foldType(t) === foldType(name))

// ── where each required inspection stands ───────────────────────────────────

export type RequiredState =
  | 'not_requested'   // on the list, nobody has asked for it yet
  | 'to_book'         // asked for, waiting on somebody to book it
  | 'booked'          // a date is agreed
  | 'reinspection'    // failed and coming back
  | 'failed'
  | 'passed'

export interface RequiredRow { id: string; type: string; sort_order?: number | null }
export interface InspectionLike {
  id: string
  type: string | null
  status: string | null
  requested_date?: string | null
  scheduled_date?: string | null
  created_at?: string | null
}

export interface RequiredStatus {
  required: RequiredRow
  state: RequiredState
  /** The inspection row the state was read from, when there is one. */
  inspection: InspectionLike | null
  /** The date worth printing beside it, if any. */
  date: string | null
}

const STATE_OF: Record<string, RequiredState> = {
  not_scheduled: 'to_book',
  requested: 'to_book',
  scheduled: 'booked',
  pending_reinspection: 'reinspection',
  failed: 'failed',
  passed: 'passed',
}

/**
 * Each required type against the job's inspections of that type.
 *
 * The NEWEST non-void row of a type is the answer: a failed framing followed by
 * a passed one is passed, and a passed one followed by a fresh request (a
 * second visit) is waiting again. A voided row is a retraction and says
 * nothing about where the work stands.
 */
export function requiredStatuses(required: readonly RequiredRow[], inspections: readonly InspectionLike[]): RequiredStatus[] {
  const latest = new Map<string, InspectionLike>()
  for (const i of inspections) {
    if (!i.type || i.status === 'void') continue
    const k = foldType(i.type)
    const prev = latest.get(k)
    if (!prev || String(i.created_at ?? '') > String(prev.created_at ?? '')) latest.set(k, i)
  }
  return [...required]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(r => {
      const i = latest.get(foldType(r.type)) ?? null
      const state: RequiredState = i ? (STATE_OF[i.status ?? ''] ?? 'to_book') : 'not_requested'
      const date = !i ? null : state === 'booked' ? (i.scheduled_date ?? null) : (i.requested_date ?? i.scheduled_date ?? null)
      return { required: r, state, inspection: i, date }
    })
}

/** "3 of 9 passed" and the like, for the header of the list. */
export function requiredSummary(rows: readonly RequiredStatus[]): { passed: number; total: number; notRequested: number } {
  return {
    total: rows.length,
    passed: rows.filter(r => r.state === 'passed').length,
    notRequested: rows.filter(r => r.state === 'not_requested').length,
  }
}

/** Types in `wanted` the list does not already hold, in the order given. */
export function missingTypes(wanted: readonly string[], have: readonly { type: string }[]): string[] {
  const held = new Set(have.map(h => foldType(h.type)))
  const out: string[] = []
  for (const w of wanted) {
    const k = foldType(w)
    if (!k || held.has(k)) continue
    held.add(k)
    out.push(w)
  }
  return out
}

export const REQUIRED_STATE_LABEL: Record<RequiredState, string> = {
  not_requested: 'Not requested yet',
  to_book: 'Waiting to be booked',
  booked: 'Booked',
  reinspection: 'Re-inspection',
  failed: 'Failed',
  passed: 'Passed',
}

/**
 * Where a type sits in the list: a built-in one in building order, anything
 * else after them in the order it was added. Stored on the row so a list
 * reads footing-to-final whatever order the boxes were ticked in.
 */
export function typeSortOrder(name: unknown, addedIndex = 0): number {
  const i = DEFAULT_INSPECTION_TYPES.findIndex(t => foldType(t) === foldType(name))
  return i >= 0 ? (i + 1) * 10 : 1000 + addedIndex
}

/** A list of type names off a request body: cleaned, de-duplicated, capped. */
export function cleanTypeList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of v) {
    const name = cleanTypeName(t)
    if (!name || seen.has(foldType(name))) continue
    seen.add(foldType(name))
    out.push(name)
    if (out.length >= 40) break
  }
  return out
}
