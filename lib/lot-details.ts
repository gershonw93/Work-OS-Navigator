// ─────────────────────────────────────────────────────────────────────────────
// What a builder knows about the dirt a house sits on.
//
// Arrived with a lot list: 42 scattered lots, each row carrying a parcel ID, a
// block and lot, a lot size, whether city water and city sewer reach it, which
// side the garage goes on, and an environmental note ("Wetland"). None of it had
// anywhere to live, so it lived in a PDF. Every field is OPTIONAL and on EVERY
// project - a custom home has a parcel ID too.
//
// Two of them drive behaviour rather than just being shown:
//
//   * city_water / city_sewer = false means a WELL and a SEPTIC system, which
//     means inspections a city-connected house never needs. `utilityInspections`
//     SUGGESTS them; nothing adds one on its own.
//   * garage_side is the plan's HANDING - "the Aspen, mirrored" - which is how
//     a model's left and right plan sets find the right house.
//
// THREE STATES FOR A YES/NO, not two. "No city sewer" is a fact that puts a
// septic inspection on the job; "nobody said" is not, and storing it as `false`
// would suggest a septic inspection for every house whose row had a dash in it.
// The lot list had exactly that row (3 Port Echo Ln: "-", "-").
//
// `lot_size` is NUMERIC, so it comes back from PostgREST as a STRING ("0.27").
// Read it through `toAmount`, never `Number.isFinite`.
// ─────────────────────────────────────────────────────────────────────────────

import { toAmount } from './schedule-dependencies'

export type LotSizeUnit = 'sqft' | 'acres'
export type GarageSide = 'left' | 'right'

/** The columns, exactly as migration 131 adds them. */
export interface LotDetails {
  parcel_id: string | null
  block: string | null
  lot: string | null
  /** NUMERIC - a string off the wire. */
  lot_size: number | string | null
  lot_size_unit: LotSizeUnit | null
  city_water: boolean | null
  city_sewer: boolean | null
  garage_side: GarageSide | null
  environmental_notes: string | null
}

export const LOT_FIELDS = [
  'parcel_id', 'block', 'lot', 'lot_size', 'lot_size_unit',
  'city_water', 'city_sewer', 'garage_side', 'environmental_notes',
] as const satisfies readonly (keyof LotDetails)[]

export const LOT_COLUMNS = LOT_FIELDS.join(', ')

export const EMPTY_LOT: LotDetails = {
  parcel_id: null, block: null, lot: null, lot_size: null, lot_size_unit: null,
  city_water: null, city_sewer: null, garage_side: null, environmental_notes: null,
}

const text = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  // A dash is how a spreadsheet says "nothing here". It is not a parcel ID.
  return s && !/^[-\u2010-\u2015]+$/.test(s) ? s.slice(0, 200) : null
}

/**
 * Yes / no / unknown, from whatever a form, a CSV or a model handed us.
 * Anything that is not clearly one or the other is UNKNOWN, never false.
 */
export function yesNo(v: unknown): boolean | null {
  if (v === true || v === false) return v
  const s = String(v ?? '').trim().toLowerCase()
  if (['yes', 'y', 'true', '1', 'city'].includes(s)) return true
  if (['no', 'n', 'false', '0', 'well', 'septic', 'private'].includes(s)) return false
  return null
}

export function garageSide(v: unknown): GarageSide | null {
  const s = String(v ?? '').trim().toLowerCase()
  if (s === 'left' || s === 'l' || s === 'lh') return 'left'
  if (s === 'right' || s === 'r' || s === 'rh') return 'right'
  return null
}

export function lotSizeUnit(v: unknown): LotSizeUnit | null {
  const s = String(v ?? '').trim().toLowerCase().replace(/[.\s]/g, '')
  if (['sqft', 'sf', 'squarefeet', 'squarefoot', 'ft2'].includes(s)) return 'sqft'
  if (['acres', 'acre', 'ac'].includes(s)) return 'acres'
  return null
}

/**
 * A lot size with no unit stated: a small number is acres, a big one is square
 * feet. No residential lot is 40 square feet and none is 400 acres, so the gap
 * between them is wide enough to guess across - and the review table still
 * shows which way it guessed.
 */
export function guessLotUnit(size: number | null): LotSizeUnit | null {
  if (size == null || size <= 0) return null
  return size < 200 ? 'acres' : 'sqft'
}

/**
 * The lot fields present in `body`, cleaned, as a partial update.
 *
 * Only keys the caller SENT come back - an edit form that never showed the lot
 * section must not null out what a lot list wrote. A key sent as empty is a
 * deliberate clear and comes back as null.
 */
export function cleanLotDetails(body: Record<string, unknown> | null | undefined): Partial<LotDetails> {
  const out: Partial<LotDetails> = {}
  if (!body) return out
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('parcel_id')) out.parcel_id = text(body.parcel_id)
  if (has('block')) out.block = text(body.block)
  if (has('lot')) out.lot = text(body.lot)
  if (has('environmental_notes')) out.environmental_notes = text(body.environmental_notes)
  if (has('city_water')) out.city_water = yesNo(body.city_water)
  if (has('city_sewer')) out.city_sewer = yesNo(body.city_sewer)
  if (has('garage_side')) out.garage_side = garageSide(body.garage_side)
  if (has('lot_size')) {
    const n = toAmount(typeof body.lot_size === 'string' ? body.lot_size.replace(/[,\s]/g, '') : body.lot_size)
    out.lot_size = n != null && n > 0 ? Math.round(n * 1000) / 1000 : null
  }
  if (has('lot_size_unit')) out.lot_size_unit = lotSizeUnit(body.lot_size_unit)
  // A size with no unit is half a fact. Guess it rather than store a number
  // nobody can read; a unit with no size is nothing and is dropped.
  if (out.lot_size != null && !out.lot_size_unit) {
    out.lot_size_unit = guessLotUnit(toAmount(out.lot_size))
  }
  if (has('lot_size') && out.lot_size == null) out.lot_size_unit = null
  return out
}

/** "0.27 acres", "13,322 sq ft", or null. */
export function lotSizeLabel(size: unknown, unit: LotSizeUnit | null | undefined): string | null {
  const n = toAmount(size)
  if (n == null || n <= 0) return null
  if (unit === 'acres') return `${Number(n.toFixed(3))} ${n === 1 ? 'acre' : 'acres'}`
  if (unit === 'sqft') return `${Math.round(n).toLocaleString('en-US')} sq ft`
  return String(n)
}

const yn = (v: boolean | null | undefined, yes: string, no: string) =>
  v === true ? yes : v === false ? no : null

/** The facts worth printing, in reading order, skipping the unknown ones. */
export function lotFacts(d: Partial<LotDetails> | null | undefined): { label: string; value: string }[] {
  if (!d) return []
  const out: { label: string; value: string }[] = []
  const lotBlock = [d.lot ? `Lot ${d.lot}` : null, d.block ? `Block ${d.block}` : null].filter(Boolean).join(', ')
  if (lotBlock) out.push({ label: 'Lot', value: lotBlock })
  if (d.parcel_id) out.push({ label: 'Parcel ID', value: d.parcel_id })
  const size = lotSizeLabel(d.lot_size, d.lot_size_unit ?? null)
  if (size) out.push({ label: 'Lot size', value: size })
  const water = yn(d.city_water, 'City water', 'Well')
  if (water) out.push({ label: 'Water', value: water })
  const sewer = yn(d.city_sewer, 'City sewer', 'Septic')
  if (sewer) out.push({ label: 'Sewer', value: sewer })
  if (d.garage_side) out.push({ label: 'Garage', value: d.garage_side === 'left' ? 'Left' : 'Right' })
  if (d.environmental_notes) out.push({ label: 'Environmental', value: d.environmental_notes })
  return out
}

/** "Lot 5, Block 58" - the short tag a row or a header carries, or null. */
export function lotTag(d: Partial<LotDetails> | null | undefined): string | null {
  if (!d) return null
  return [d.lot ? `Lot ${d.lot}` : null, d.block ? `Blk ${d.block}` : null].filter(Boolean).join(' · ') || null
}

/**
 * The inspections a lot's utilities imply, by their type names.
 *
 * SUGGESTED, NEVER ADDED: a jurisdiction might not inspect a well at all, and
 * an inspection the app invented sits on the job as "needs booking" for ever.
 * Only an explicit `false` suggests anything - unknown is not "no sewer".
 */
export function utilityInspections(d: Partial<LotDetails> | null | undefined): string[] {
  if (!d) return []
  const out: string[] = []
  if (d.city_sewer === false) out.push('Septic Permit / Site Evaluation', 'Septic Final')
  if (d.city_water === false) out.push('Well')
  return out
}

// ── the form ────────────────────────────────────────────────────────────────
// Strings in, strings out, so an input can be controlled without a null. The
// body it builds always carries every key: the form SHOWED all of them, so an
// empty box is a deliberate clear (see `cleanLotDetails`).

export interface LotForm {
  parcel_id: string
  block: string
  lot: string
  lot_size: string
  lot_size_unit: '' | LotSizeUnit
  city_water: '' | 'yes' | 'no'
  city_sewer: '' | 'yes' | 'no'
  garage_side: '' | GarageSide
  environmental_notes: string
}

const ynForm = (v: boolean | null | undefined): '' | 'yes' | 'no' => (v === true ? 'yes' : v === false ? 'no' : '')

export function lotFormFrom(d: Partial<LotDetails> | null | undefined): LotForm {
  const size = toAmount(d?.lot_size)
  return {
    parcel_id: d?.parcel_id ?? '',
    block: d?.block ?? '',
    lot: d?.lot ?? '',
    lot_size: size != null ? String(size) : '',
    lot_size_unit: d?.lot_size_unit ?? '',
    city_water: ynForm(d?.city_water),
    city_sewer: ynForm(d?.city_sewer),
    garage_side: d?.garage_side ?? '',
    environmental_notes: d?.environmental_notes ?? '',
  }
}

export function lotFormBody(f: LotForm): Record<string, string | null> {
  return {
    parcel_id: f.parcel_id, block: f.block, lot: f.lot,
    lot_size: f.lot_size, lot_size_unit: f.lot_size ? (f.lot_size_unit || null) : null,
    city_water: f.city_water || null, city_sewer: f.city_sewer || null,
    garage_side: f.garage_side || null, environmental_notes: f.environmental_notes,
  }
}

/** Whether a form holds anything at all - so a disclosure opens itself when it does. */
export function lotFormFilled(f: LotForm): boolean {
  return Object.values(f).some(v => v !== '')
}
