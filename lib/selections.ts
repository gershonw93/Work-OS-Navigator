// Homeowner selections.
//
// The GC does not choose the paint colour, and cannot start painting without
// it. Every one of these is a decision somebody else owes you, with a date set
// by lead time rather than by the schedule - a six-week window order decided
// the week framing finishes is already late even though nobody was late.

export type SelectionStatus = 'pending' | 'waiting' | 'chosen' | 'ordered' | 'installed'

export const SELECTION_STATUSES: { key: SelectionStatus; label: string; hint: string }[] = [
  { key: 'pending', label: 'Not started', hint: 'No options put in front of them yet' },
  { key: 'waiting', label: 'Waiting on client', hint: 'They have the options - the ball is theirs' },
  { key: 'chosen', label: 'Chosen', hint: 'Decided, not yet ordered' },
  { key: 'ordered', label: 'Ordered', hint: 'On its way' },
  { key: 'installed', label: 'Installed', hint: 'Done' },
]

export const STATUS_LABEL: Record<SelectionStatus, string> =
  Object.fromEntries(SELECTION_STATUSES.map(s => [s.key, s.label])) as Record<SelectionStatus, string>

/** Tint classes per status - same semantic tokens as everywhere else. */
export const STATUS_TINT: Record<SelectionStatus, string> = {
  pending: 'bg-muted text-muted-fg',
  waiting: 'bg-warn-tint text-warn',
  chosen: 'bg-info-tint text-info',
  ordered: 'bg-accent-tint text-accent-fg',
  installed: 'bg-success-tint text-success',
}

/** Everything before "chosen" is a decision you are still chasing. */
export function isOutstanding(status: string): boolean {
  return status === 'pending' || status === 'waiting'
}

export interface SelectionCategory {
  category: string
  /** Typical picks, so a new board isn't a blank page. */
  items: string[]
  /** Order-to-delivery in days. What the needed-by date works backwards from. */
  lead_time_days: number
  /** Who is standing there waiting when it's late. */
  blocks: string
}

/**
 * The usual selections on a house, with lead times that are honest rather than
 * optimistic. Every one is editable - these are a starting board, not a rule.
 */
export const SELECTION_CATEGORIES: SelectionCategory[] = [
  { category: 'Windows & Exterior Doors', lead_time_days: 56, blocks: 'Dry-in and window install',
    items: ['Window package', 'Front door', 'Rear / patio door', 'Garage entry door'] },
  { category: 'Roofing', lead_time_days: 14, blocks: 'Roofing',
    items: ['Shingle product and colour', 'Ridge vent', 'Drip edge colour'] },
  { category: 'Siding & Exterior', lead_time_days: 21, blocks: 'Siding',
    items: ['Siding product and colour', 'Trim colour', 'Shutters', 'Stone or brick accent'] },
  { category: 'Exterior Paint', lead_time_days: 7, blocks: 'Exterior painting',
    items: ['Body colour', 'Trim colour', 'Front door colour'] },
  { category: 'Garage Doors', lead_time_days: 30, blocks: 'Garage door install',
    items: ['Door style and colour', 'Opener'] },
  { category: 'Gutters', lead_time_days: 10, blocks: 'Gutter install',
    items: ['Gutter colour and profile'] },
  { category: 'Cabinets', lead_time_days: 45, blocks: 'Cabinet install and countertop template',
    items: ['Kitchen cabinets', 'Bath vanities', 'Laundry cabinets', 'Cabinet hardware'] },
  { category: 'Countertops', lead_time_days: 21, blocks: 'Countertop install',
    items: ['Kitchen countertop', 'Bath countertops', 'Edge profile'] },
  { category: 'Appliances', lead_time_days: 45, blocks: 'Appliance install and cabinet sizing',
    items: ['Range', 'Refrigerator', 'Dishwasher', 'Microwave / hood', 'Washer and dryer'] },
  { category: 'Plumbing Fixtures', lead_time_days: 21, blocks: 'Plumbing trim-out',
    items: ['Kitchen sink and faucet', 'Bath faucets', 'Toilets', 'Tub', 'Shower valve and trim'] },
  { category: 'Light Fixtures', lead_time_days: 21, blocks: 'Electrical trim-out',
    items: ['Kitchen and island lights', 'Dining fixture', 'Bath vanity lights', 'Exterior lights', 'Ceiling fans'] },
  { category: 'Electrical Devices', lead_time_days: 10, blocks: 'Electrical trim-out',
    items: ['Switch and outlet colour', 'Plate style', 'Thermostat'] },
  { category: 'Interior Doors & Hardware', lead_time_days: 28, blocks: 'Trim',
    items: ['Door style', 'Door hardware finish', 'Hinges'] },
  { category: 'Trim & Moulding', lead_time_days: 14, blocks: 'Trim',
    items: ['Base profile', 'Casing profile', 'Crown', 'Stair parts'] },
  { category: 'Flooring', lead_time_days: 28, blocks: 'Flooring',
    items: ['Main floor product', 'Bedroom product', 'Stair treads', 'Transitions'] },
  { category: 'Tile', lead_time_days: 28, blocks: 'Tile',
    items: ['Bath floor tile', 'Shower wall tile', 'Kitchen backsplash', 'Grout colour'] },
  { category: 'Interior Paint', lead_time_days: 7, blocks: 'Painting',
    items: ['Wall colour', 'Trim colour', 'Ceiling colour', 'Accent walls'] },
  { category: 'Mirrors & Shower Glass', lead_time_days: 21, blocks: 'Final trim',
    items: ['Bath mirrors', 'Shower enclosure'] },
  { category: 'Closets & Shelving', lead_time_days: 14, blocks: 'Closet install',
    items: ['Closet system', 'Pantry shelving'] },
  { category: 'HVAC & Comfort', lead_time_days: 21, blocks: 'HVAC trim-out',
    items: ['Register style and finish', 'Thermostat'] },
  { category: 'Landscaping', lead_time_days: 14, blocks: 'Final grade and landscaping',
    items: ['Plantings', 'Sod or seed', 'Mulch or stone', 'Irrigation'] },
]

export function categoryDef(category: string): SelectionCategory | null {
  const c = category.trim().toLowerCase()
  return SELECTION_CATEGORIES.find(s => s.category.toLowerCase() === c) ?? null
}

/** What it costs above (or below) what the budget carried. */
export function variance(sel: { allowance_amount?: number | null; selected_price?: number | null }): number | null {
  if (sel.allowance_amount == null || sel.selected_price == null) return null
  return Math.round((Number(sel.selected_price) - Number(sel.allowance_amount)) * 100) / 100
}

/**
 * Days until it's needed. Negative is late.
 *
 * Late here does not mean "the trade is waiting" - it means the lead time has
 * already eaten the slack, which is the point of tracking the date at all.
 */
export function daysUntil(needed_by: string | null | undefined): number | null {
  if (!needed_by) return null
  const due = new Date(needed_by + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((due.getTime() - today.getTime()) / 86_400_000)
}

export type Urgency = 'late' | 'soon' | 'ok' | 'none'

export function urgency(sel: { needed_by?: string | null; status: string }): Urgency {
  if (!isOutstanding(sel.status)) return 'none'
  const d = daysUntil(sel.needed_by)
  if (d == null) return 'none'
  if (d < 0) return 'late'
  if (d <= 14) return 'soon'
  return 'ok'
}

/** Suggested decision date: back up the lead time from when it gets installed. */
export function neededByFrom(installDate: string, leadDays: number): string {
  const d = new Date(installDate + 'T00:00:00')
  d.setDate(d.getDate() - leadDays)
  return d.toISOString().slice(0, 10)
}
