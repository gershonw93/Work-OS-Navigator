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
  /**
   * The subset of `items` that only exist on somewhere people live. A medical
   * suite has no laundry cabinets and no bathtub, and putting them on the board
   * anyway is how a useful list turns into noise nobody reads.
   */
  homes_only?: string[]
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
    items: ['Window package', 'Front door', 'Rear / patio door', 'Garage entry door'],
    homes_only: ['Rear / patio door', 'Garage entry door'] },
  { category: 'Roofing', lead_time_days: 14, blocks: 'Roofing',
    items: ['Shingle product and colour', 'Ridge vent', 'Drip edge colour'] },
  { category: 'Siding & Exterior', lead_time_days: 21, blocks: 'Siding',
    items: ['Siding product and colour', 'Trim colour', 'Shutters', 'Stone or brick accent'],
    homes_only: ['Shutters'] },
  { category: 'Exterior Paint', lead_time_days: 7, blocks: 'Exterior painting',
    items: ['Body colour', 'Trim colour', 'Front door colour'] },
  { category: 'Garage Doors', lead_time_days: 30, blocks: 'Garage door install',
    items: ['Door style and colour', 'Opener'] },
  { category: 'Gutters', lead_time_days: 10, blocks: 'Gutter install',
    items: ['Gutter colour and profile'] },
  { category: 'Cabinets', lead_time_days: 45, blocks: 'Cabinet install and countertop template',
    items: ['Kitchen cabinets', 'Bath vanities', 'Laundry cabinets', 'Cabinet hardware'],
    homes_only: ['Laundry cabinets'] },
  { category: 'Countertops', lead_time_days: 21, blocks: 'Countertop install',
    items: ['Kitchen countertop', 'Bath countertops', 'Edge profile'] },
  { category: 'Appliances', lead_time_days: 45, blocks: 'Appliance install and cabinet sizing',
    items: ['Range', 'Refrigerator', 'Dishwasher', 'Microwave / hood', 'Washer and dryer'],
    homes_only: ['Washer and dryer'] },
  { category: 'Plumbing Fixtures', lead_time_days: 21, blocks: 'Plumbing trim-out',
    items: ['Kitchen sink and faucet', 'Bath faucets', 'Toilets', 'Tub', 'Shower valve and trim'],
    homes_only: ['Tub'] },
  { category: 'Light Fixtures', lead_time_days: 21, blocks: 'Electrical trim-out',
    items: ['Kitchen and island lights', 'Dining fixture', 'Bath vanity lights', 'Exterior lights', 'Ceiling fans'],
    homes_only: ['Dining fixture', 'Ceiling fans'] },
  { category: 'Electrical Devices', lead_time_days: 10, blocks: 'Electrical trim-out',
    items: ['Switch and outlet colour', 'Plate style', 'Thermostat'] },
  { category: 'Interior Doors & Hardware', lead_time_days: 28, blocks: 'Trim',
    items: ['Door style', 'Door hardware finish', 'Hinges'] },
  { category: 'Trim & Moulding', lead_time_days: 14, blocks: 'Trim',
    items: ['Base profile', 'Casing profile', 'Crown', 'Stair parts'] },
  { category: 'Flooring', lead_time_days: 28, blocks: 'Flooring',
    items: ['Main floor product', 'Bedroom product', 'Stair treads', 'Transitions'],
    homes_only: ['Bedroom product'] },
  { category: 'Tile', lead_time_days: 28, blocks: 'Tile',
    items: ['Bath floor tile', 'Shower wall tile', 'Kitchen backsplash', 'Grout colour'],
    homes_only: ['Kitchen backsplash'] },
  { category: 'Interior Paint', lead_time_days: 7, blocks: 'Painting',
    items: ['Wall colour', 'Trim colour', 'Ceiling colour', 'Accent walls'] },
  { category: 'Mirrors & Shower Glass', lead_time_days: 21, blocks: 'Final trim',
    items: ['Bath mirrors', 'Shower enclosure'],
    homes_only: ['Shower enclosure'] },
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

// ---------------------------------------------------------------------------
// What to suggest, per kind of job
//
// A house has all 21 of these. A medical fit-out has about half, and none of
// the ones about sod, shutters or bathtubs. Handing every job the full list is
// how a board that should take a minute to set up looks like homework instead -
// so the checklist arrives pre-ticked for the job you're actually on.
//
// These are suggestions. Every box is yours to tick or clear.
// ---------------------------------------------------------------------------

export const PROJECT_TYPE_LABEL: Record<string, string> = {
  residential: 'home',
  mixed_use: 'mixed-use',
  renovation: 'renovation',
  commercial: 'commercial',
  industrial: 'industrial',
}

/** Jobs where somebody lives there, so the domestic items make sense. */
export function isHomeType(type: string | null | undefined): boolean {
  return type === 'residential' || type === 'mixed_use' || type === 'renovation'
}

const INTERIOR_FINISHES = [
  'Cabinets', 'Countertops', 'Plumbing Fixtures', 'Light Fixtures', 'Electrical Devices',
  'Interior Doors & Hardware', 'Trim & Moulding', 'Flooring', 'Tile', 'Interior Paint',
  'HVAC & Comfort',
]

const RECOMMENDED_BY_TYPE: Record<string, string[]> = {
  // Ground-up house: everything.
  residential: SELECTION_CATEGORIES.map(c => c.category),
  mixed_use: SELECTION_CATEGORIES.map(c => c.category),
  // A remodel is nearly always inside. Roof, siding and landscaping are a
  // different job, and you can tick them if this one happens to include them.
  renovation: [...INTERIOR_FINISHES, 'Windows & Exterior Doors', 'Mirrors & Shower Glass', 'Closets & Shelving'],
  // Fit-out work: finishes, storefront and the long-lead mechanical bits.
  commercial: [...INTERIOR_FINISHES, 'Windows & Exterior Doors', 'Roofing', 'Mirrors & Shower Glass'],
  // Almost nothing is a "selection" - it's spec'd, not chosen from samples.
  industrial: ['Flooring', 'Interior Paint', 'Light Fixtures', 'Electrical Devices',
    'Interior Doors & Hardware', 'HVAC & Comfort', 'Roofing', 'Windows & Exterior Doors'],
}

/** Categories worth suggesting for this kind of job. Unknown type → all. */
export function recommendedCategories(type: string | null | undefined): string[] {
  const rec = type ? RECOMMENDED_BY_TYPE[type] : null
  if (!rec) return SELECTION_CATEGORIES.map(c => c.category)
  // Keep the build-order the list is written in, not the order above.
  return SELECTION_CATEGORIES.filter(c => rec.includes(c.category)).map(c => c.category)
}

/**
 * The items in a category that apply to this kind of job.
 *
 * An unset job type keeps everything. Dropping a bathtub because nobody filled
 * in the project type would be a silent omission on a real decision - better to
 * show one line too many than to quietly lose one.
 */
export function itemsForType(cat: SelectionCategory, type: string | null | undefined): string[] {
  if (!type || isHomeType(type) || !cat.homes_only?.length) return cat.items
  return cat.items.filter(i => !cat.homes_only!.includes(i))
}

/** How many rows seeding these categories would actually create. */
export function seedRowCount(categories: string[], type: string | null | undefined): number {
  return SELECTION_CATEGORIES
    .filter(c => categories.includes(c.category))
    .reduce((n, c) => n + itemsForType(c, type).length, 0)
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
