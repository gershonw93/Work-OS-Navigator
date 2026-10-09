// ─────────────────────────────────────────────────────────────────────────────
// A lot list, read into rows somebody can check before anything is created.
//
// THE FILE THAT STARTED THIS was a PDF of 42 scattered lots in two cities:
// address, parcel ID, block, lot, size, city water, city sewer, garage side,
// environmental. And NO city, state or ZIP on a single row - the city and
// county were in each page's HEADING ("Palm Coast | Flagler | 21 addresses").
// That is why Bulk Add never placed a house: "89 White Hall Dr" alone is too
// vague to pin (`tooVagueToPin`), correctly, because there are a hundred of
// them. So the heading has to travel onto every row, and the review table
// shows each row's full address before anything is looked up.
//
// Two ways in, one shape out:
//   * a spreadsheet or CSV is read HERE, by its column headings - no model,
//     no scan used up, and exact;
//   * a PDF or a photo is read by the model (`/api/projects/bulk/scan`), whose
//     answer comes back through `rowsFromScan` and the same cleaning.
//
// Nothing is created from a row until a person has seen it. The model is
// allowed to be unsure, and says which fields it was unsure of.
// ─────────────────────────────────────────────────────────────────────────────

import { cleanLotDetails, type LotDetails } from './lot-details'
import { stateIn, zipIn } from './geocode-match'

export interface LotRow extends Partial<LotDetails> {
  /** Street line only - "89 White Hall Dr". */
  street: string
  city: string | null
  state: string | null
  zip: string | null
  /** The house model, if the list names one. Matched to a model on the site later. */
  model: string | null
  /** Fields the reader was not sure of, by key - shown, never hidden. */
  unsure: string[]
}

export const MAX_LOTS = 100

/** A street line starts with its house number: "89 White Hall Dr", "1042A Oak St". */
export const hasHouseNumber = (street: string | null | undefined): boolean => /^\d+[a-z]?\b\s*\S/i.test(String(street ?? '').trim())

const s = (v: unknown): string | null => {
  if (v === null || v === undefined) return null
  const t = String(v).replace(/\s+/g, ' ').trim()
  return t && !/^[-\u2010-\u2015]+$/.test(t) ? t : null
}

/** "89 White Hall Dr, Palm Coast, FL 32164" - what is looked up and stored. */
export function fullAddress(r: Pick<LotRow, 'street' | 'city' | 'state' | 'zip'>): string {
  const tail = [r.state, r.zip].filter(Boolean).join(' ')
  return [r.street, r.city, tail].map(x => (x ?? '').trim()).filter(Boolean).join(', ')
}

/** Why this row cannot be created as written, or null. Asked by the screen AND the route. */
export function lotRowProblem(r: Pick<LotRow, 'street' | 'city' | 'state' | 'zip'>): string | null {
  if (!s(r.street)) return 'No street address.'
  if (!hasHouseNumber(r.street)) return 'The street address has to start with a house number.'
  const full = fullAddress(r)
  if (!stateIn(full) && !zipIn(full)) return 'Needs a state or ZIP - without one the map has a hundred streets to choose from.'
  return null
}

// ── reading a spreadsheet by its headings ───────────────────────────────────

type Field =
  | 'street' | 'city' | 'state' | 'zip' | 'full' | 'parcel_id' | 'block' | 'lot'
  | 'lot_size' | 'lot_size_unit' | 'city_water' | 'city_sewer' | 'garage_side'
  | 'environmental_notes' | 'model'

/** Heading words, folded, to the field they mean. First match wins. */
const HEADINGS: [RegExp, Field][] = [
  [/^(full )?(property |site |job )?address( line 1)?$|^street( address)?$|^location$/, 'street'],
  [/^(city|town|municipality)$/, 'city'],
  [/^(state|st)$/, 'state'],
  [/^(zip|zip code|zipcode|postal code|postcode)$/, 'zip'],
  [/^(parcel( id| number| no)?|pin|folio|apn|tax id)$/, 'parcel_id'],
  [/^(block|blk)$/, 'block'],
  [/^(lot|lot( number| no| #)?)$/, 'lot'],
  [/^(gis )?(sq ?ft|sqft|square feet|area|size|lot size|acres|acreage)( ?\/ ?acres)?$|^gis sqft acres$/, 'lot_size'],
  [/^(unit|size unit)$/, 'lot_size_unit'],
  [/^(city )?water$/, 'city_water'],
  [/^(city )?sewer$/, 'city_sewer'],
  [/^garage( side| handing)?$|^handing$/, 'garage_side'],
  [/^(environmental|enviro|environment|environmental notes)$/, 'environmental_notes'],
  [/^(model|plan|house model|home model|elevation|floor ?plan)$/, 'model'],
]

const fold = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9#/ ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Map each column of a heading row to a field, or null when nothing fits. */
export function headingMap(row: unknown[]): (Field | null)[] {
  const used = new Set<Field>()
  return row.map(cell => {
    const f = fold(cell)
    if (!f) return null
    const hit = HEADINGS.find(([re, field]) => re.test(f) && !used.has(field))
    if (!hit) return null
    used.add(hit[1])
    return hit[1]
  })
}

/**
 * Rows of cells (a sheet, or a parsed CSV) into lot rows.
 *
 * The heading row is the first one naming an address column. Anything above it
 * is a title. A row with only one or two filled cells and no house number is a
 * SECTION HEADING ("Palm Coast | Flagler") and is read for a city and state to
 * carry onto the rows under it - the same thing the PDF needed.
 */
export function rowsFromTable(table: unknown[][], area: { city?: string | null; state?: string | null } = {}): { rows: LotRow[]; problem: string | null } {
  const start = table.findIndex(r => headingMap(r ?? []).includes('street'))
  if (start < 0) return { rows: [], problem: 'No column called Address (or Street) was found. Add a heading row, or upload the file as a PDF to have it read.' }
  const map = headingMap(table[start])
  let city = s(area.city), state = s(area.state)
  const rows: LotRow[] = []
  for (const raw of table.slice(start + 1)) {
    const cells = (raw ?? []).map(c => s(c))
    const filled = cells.filter(Boolean)
    if (!filled.length) continue
    const get = (f: Field) => { const i = map.indexOf(f); return i >= 0 ? cells[i] ?? null : null }
    const street = get('street')
    if (!street || !hasHouseNumber(street)) {
      // A section heading - read it for a place, and carry it down.
      if (filled.length <= 3) {
        const place = sectionPlace(filled.join(' | '))
        if (place.city) city = place.city
        if (place.state) state = place.state
      }
      continue
    }
    rows.push(cleanRow({
      street,
      city: get('city') ?? city,
      state: get('state') ?? state,
      zip: get('zip'),
      parcel_id: get('parcel_id'), block: get('block'), lot: get('lot'),
      lot_size: get('lot_size'), lot_size_unit: get('lot_size_unit'),
      city_water: get('city_water'), city_sewer: get('city_sewer'),
      garage_side: get('garage_side'), environmental_notes: get('environmental_notes'),
      model: get('model'),
    }))
    if (rows.length >= MAX_LOTS) break
  }
  return { rows, problem: rows.length ? null : 'The address column was found, but no row under it had a house number.' }
}

/** "Palm Coast | Flagler | 21 addresses" -> a city, and a state if one is named. */
export function sectionPlace(text: string): { city: string | null; state: string | null } {
  const parts = text.split(/[|,\u2022]/).map(p => p.trim()).filter(Boolean)
  const first = parts.find(p => !/\d/.test(p) && !/county|addresses?|lots?$/i.test(p)) ?? null
  return { city: first, state: stateIn(`x, ${text.replace(/\|/g, ',')}`) }
}

/** One row's every field cleaned the way the routes clean them. */
export function cleanRow(input: Record<string, unknown>): LotRow {
  const lot = cleanLotDetails({
    parcel_id: input.parcel_id, block: input.block, lot: input.lot,
    lot_size: input.lot_size, lot_size_unit: input.lot_size_unit,
    city_water: input.city_water, city_sewer: input.city_sewer,
    garage_side: input.garage_side, environmental_notes: input.environmental_notes,
  })
  const street = s(input.street) ?? ''
  const st = s(input.state)
  return {
    ...lot,
    street,
    city: s(input.city),
    // "Florida" -> "FL", so the map lookup and the match check agree.
    state: st ? (stateIn(`x, ${st}`) ?? st) : null,
    zip: s(input.zip)?.match(/\d{5}/)?.[0] ?? null,
    model: s(input.model),
    unsure: Array.isArray(input.unsure) ? (input.unsure as unknown[]).map(String).slice(0, 12) : [],
  }
}

/**
 * The model's answer into rows. It returns each section's place separately
 * from its rows (that is how the PDF is laid out), so a row with no city of
 * its own takes its section's.
 */
export function rowsFromScan(parsed: unknown, columns: readonly string[] = []): LotRow[] {
  const p = (parsed ?? {}) as { sections?: unknown[]; rows?: unknown[] }
  const out: LotRow[] = []
  const sections = Array.isArray(p.sections) ? p.sections : [{ rows: p.rows }]
  // A row may come back as an array in `columns` order (the compact form the
  // scan asks for) or as an object; both end up as the same named fields.
  const named = (r: unknown): Record<string, unknown> => {
    if (!Array.isArray(r)) return (r ?? {}) as Record<string, unknown>
    const o: Record<string, unknown> = {}
    columns.forEach((c, i) => { o[c] = r[i] })
    return o
  }
  for (const sec of sections as Record<string, unknown>[]) {
    const rows = Array.isArray(sec?.rows) ? (sec.rows as unknown[]).map(named) : []
    for (const r of rows) {
      if (out.length >= MAX_LOTS) return out
      const row = cleanRow({
        ...r,
        city: r.city ?? sec.city,
        state: r.state ?? sec.state,
        lot_size_unit: r.lot_size_unit ?? sec.lot_size_unit,
      })
      if (row.street) out.push(row)
    }
  }
  return out
}

/** The place every row shares, for naming the site: "Palm Coast, FL", or null. */
export function sharedPlace(rows: LotRow[]): string | null {
  const keys = new Set(rows.map(r => [r.city ?? '', r.state ?? ''].join('|')))
  if (keys.size !== 1) return null
  const [c, st] = Array.from(keys)[0].split('|')
  return [c, st].filter(Boolean).join(', ') || null
}

/** The job's name: the street line, with the lot when there is one. */
export function lotJobName(r: Pick<LotRow, 'street' | 'lot'>, prefix?: string | null): string {
  const base = r.lot ? `${r.street} (Lot ${r.lot})` : r.street
  return prefix?.trim() ? `${prefix.trim()} - ${base}` : base
}

// `matchPrecision` lives in geocode-match.ts beside the other answers about
// whether a match describes the address; re-exported for the review screen.
export { matchPrecision } from './geocode-match'

/**
 * Pasted lines with no heading: one address per line. A line that already
 * names a state keeps it; the rest take the area typed beside the box.
 */
export function rowsFromLines(text: string, area: { city?: string | null; state?: string | null } = {}): LotRow[] {
  const out: LotRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const t = s(line)
    if (!t || !hasHouseNumber(t)) continue
    const parts = t.split(',').map(p => p.trim()).filter(Boolean)
    const street = parts[0]
    const rest = parts.slice(1).join(', ')
    const zip = zipIn(rest)
    const state = stateIn(`x, ${rest.replace(/\b\d{5}(-\d{4})?\b/, '')}`)
    const city = parts.length > 1 ? (parts[1].replace(/\b\d{5}\b/, '').trim() || null) : null
    out.push(cleanRow({ street, city: city ?? area.city, state: state ?? area.state, zip }))
    if (out.length >= MAX_LOTS) break
  }
  return out
}
