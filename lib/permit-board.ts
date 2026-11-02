// ─────────────────────────────────────────────────────────────────────────────
// The development permit board: every house down the side, every permit type
// across the top, and in each cell who has that permit now.
//
// Twenty houses was twenty jobs to open to answer "which lots are held up, and
// on what". The board answers it on one screen, and the bulk actions do the
// thing a city actually does to a subdivision - review a batch together - in
// one step instead of twenty. Pure: the page and the route both ask it.
// ─────────────────────────────────────────────────────────────────────────────

import { permitStanding, type Court, type PermitItem, type PermitRound, type Standing } from './permit-rounds'

/** The permit types the Add form offers. One list, so the board's "add to houses" offers the same. */
export const PERMIT_TYPES = [
  'Building', 'Electrical', 'Plumbing', 'Mechanical/HVAC',
  'Fire Protection', 'Fire Alarm', 'Sprinkler',
  'Demolition', 'Excavation', 'Grading',
  'Roofing', 'Siding', 'Windows/Doors',
  'Sewage/Septic', 'Stormwater', 'Utilities',
  'Fence/Wall', 'Pool/Spa', 'Solar',
  'Sign', 'Zoning/Land Use',
  'Notice of Commencement', 'Survey', 'Plans Review',
  'Other',
]

export const BULK_ACTIONS = ['add', 'submit', 'answer'] as const
export type BulkAction = typeof BULK_ACTIONS[number]

/** A batch large enough for any development we have, small enough to finish inside one request. */
export const BULK_MAX = 60

export function bulkProblem(input: {
  action: string; permit_type: string; project_ids: string[]; outcome?: string | null; items?: string[] | null
}): string | null {
  if ((BULK_ACTIONS as readonly string[]).indexOf(input.action) === -1) return 'Pick what to do.'
  if (!input.permit_type.trim()) return 'Pick the permit type.'
  if (!input.project_ids.length) return 'Pick at least one house.'
  if (input.project_ids.length > BULK_MAX) return `Pick at most ${BULK_MAX} at a time.`
  // AN APPROVAL IS NOT A BATCH. Each house's permit carries its own number
  // and issue date, and an approval without them is the claim `permitProblem`
  // exists to refuse. Corrections and rejections are the same answer to every
  // house in a batch review; an approval is twenty different pieces of paper.
  if (input.action === 'answer' && input.outcome === 'approved') {
    return 'Approvals are recorded house by house - each permit has its own number and issue date.'
  }
  if (input.action === 'answer' && input.outcome !== 'corrections' && input.outcome !== 'rejected') {
    return 'Pick what they said: corrections needed or rejected.'
  }
  return null
}

export interface BoardPermit {
  id: string
  project_id: string
  permit_type: string
  permit_number?: string | null
  status?: string | null
  issuing_authority?: string | null
}

export interface BoardCell {
  permit: BoardPermit
  /** More than one permit of this type on this house: the board shows the first and says so. */
  others: number
  standing: Standing
}

/**
 * The columns: every type any house (or the development itself) has, most
 * common first, so Building sits at the left of a subdivision rather than
 * wherever the alphabet put it.
 */
export function boardColumns(permits: Pick<BoardPermit, 'permit_type'>[]): string[] {
  const count = new Map<string, number>()
  for (const p of permits) count.set(p.permit_type, (count.get(p.permit_type) ?? 0) + 1)
  const order = (t: string) => { const i = PERMIT_TYPES.indexOf(t); return i === -1 ? PERMIT_TYPES.length : i }
  return Array.from(count.keys()).sort((a, b) =>
    (count.get(b)! - count.get(a)!) || (order(a) - order(b)) || a.localeCompare(b))
}

/** project id -> permit type -> the cell. */
export function boardCells(
  permits: BoardPermit[], rounds: PermitRound[], items: PermitItem[], today: string,
): Map<string, Map<string, BoardCell>> {
  const roundsBy = new Map<string, PermitRound[]>()
  for (const r of rounds) roundsBy.set(r.permit_id, [...(roundsBy.get(r.permit_id) ?? []), r])
  const itemsBy = new Map<string, PermitItem[]>()
  for (const i of items) itemsBy.set(i.permit_id, [...(itemsBy.get(i.permit_id) ?? []), i])

  const out = new Map<string, Map<string, BoardCell>>()
  for (const p of permits) {
    const row = out.get(p.project_id) ?? new Map<string, BoardCell>()
    const existing = row.get(p.permit_type)
    if (existing) { existing.others++; out.set(p.project_id, row); continue }
    row.set(p.permit_type, {
      permit: p, others: 0,
      standing: permitStanding(p, roundsBy.get(p.id) ?? [], itemsBy.get(p.id) ?? [], today),
    })
    out.set(p.project_id, row)
  }
  return out
}

export type BoardFilter = 'all' | 'them' | 'us' | 'chase' | 'done'

/** A cell answers a filter. "Chase" is a kind of "them" - the ones overdue for a call. */
export function cellMatches(cell: BoardCell | undefined, filter: BoardFilter): boolean {
  if (filter === 'all') return true
  if (!cell) return false
  if (filter === 'chase') return cell.standing.chase
  return cell.standing.court === (filter as Court)
}

/** The counts over the filter chips, counted per PERMIT, not per house. */
export function boardCounts(cells: Map<string, Map<string, BoardCell>>): Record<Exclude<BoardFilter, 'all'>, number> {
  const c = { them: 0, us: 0, chase: 0, done: 0 }
  cells.forEach(row => row.forEach(cell => {
    if (cell.standing.court === 'them') c.them++
    if (cell.standing.court === 'us') c.us++
    if (cell.standing.court === 'done') c.done++
    if (cell.standing.chase) c.chase++
  }))
  return c
}
