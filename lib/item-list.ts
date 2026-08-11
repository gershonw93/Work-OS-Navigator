// The item list: the lines a supplier prices one by one.
//
// Most packages don't need one. A foundation sub brings his own material and
// quotes off the plans; an electrician prices per opening. You only need a list
// when YOU are buying the material and somebody has to count it - lumber,
// trusses, mouldings, windows, fixtures.
//
// When a list goes out, every bidder prices the same lines, so the quotes come
// back comparable to the penny instead of comparable in spirit.

export interface ItemLine {
  /** What it is. The only required field. */
  description: string
  qty: number | null
  unit: string
  /** Spec, size, grade - anything that changes the price. */
  notes?: string
}

export interface PricedLine extends ItemLine {
  /** Blank means they didn't price it (didn't carry it, or missed it). */
  unit_price: number | null
  /** Their own note on this line - substitution, lead time, "we don't stock it". */
  vendor_note?: string
}

/** Common construction units, roughly in order of how often they come up. */
export const UNITS = [
  'ea', 'lf', 'sf', 'sy', 'cy', 'sq', 'bf', 'lb', 'ton',
  'gal', 'hr', 'day', 'ls', 'set', 'pc', 'sheet', 'roll', 'bundle', 'box',
]

const UNIT_ALIASES: Record<string, string> = {
  each: 'ea', 'e.a.': 'ea', pcs: 'pc', piece: 'pc', pieces: 'pc',
  'lin ft': 'lf', 'lin. ft': 'lf', 'linear ft': 'lf', linft: 'lf', 'ln ft': 'lf',
  'sq ft': 'sf', sqft: 'sf', 'sq. ft': 'sf', 'square feet': 'sf', 'sq ft.': 'sf',
  lbs: 'lb', pounds: 'lb', pound: 'lb', tons: 'ton', gallons: 'gal', gallon: 'gal',
  'sq yd': 'sy', sqyd: 'sy', 'cu yd': 'cy', cuyd: 'cy', yard: 'cy', yds: 'cy',
  'board ft': 'bf', 'bd ft': 'bf', bdft: 'bf', mbf: 'bf',
  square: 'sq', squares: 'sq', sheets: 'sheet', rolls: 'roll', sets: 'set',
  boxes: 'box', bundles: 'bundle', hours: 'hr', days: 'day',
  'lump sum': 'ls', lumpsum: 'ls', allowance: 'ls',
}

export function normalizeUnit(raw: unknown): string {
  const s = String(raw ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!s) return 'ea'
  if (UNITS.includes(s)) return s
  return UNIT_ALIASES[s] ?? s.slice(0, 12)
}

export function lineTotal(line: Pick<PricedLine, 'qty' | 'unit_price'>): number | null {
  if (line.unit_price == null || !isFinite(line.unit_price)) return null
  const q = line.qty == null || !isFinite(line.qty) ? 1 : line.qty
  return Math.round(q * line.unit_price * 100) / 100
}

export function pricedTotal(lines: PricedLine[]): number {
  return lines.reduce((sum, l) => sum + (lineTotal(l) ?? 0), 0)
}

/** How many lines they actually put a number against. */
export function pricedCount(lines: PricedLine[]): number {
  return lines.filter(l => l.unit_price != null && isFinite(l.unit_price)).length
}

export function emptyLine(): ItemLine {
  return { description: '', qty: null, unit: 'ea', notes: '' }
}

/** Trust nothing that comes off a wire or out of a jsonb column. */
export function coerceLines(raw: unknown): ItemLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r: any) => ({
      description: String(r?.description ?? '').trim().slice(0, 300),
      qty: numOrNull(r?.qty),
      unit: normalizeUnit(r?.unit),
      notes: String(r?.notes ?? '').trim().slice(0, 300) || undefined,
    }))
    .filter(l => l.description.length > 0)
}

export function coercePricedLines(raw: unknown): PricedLine[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((r: any) => ({
      description: String(r?.description ?? '').trim().slice(0, 300),
      qty: numOrNull(r?.qty),
      unit: normalizeUnit(r?.unit),
      notes: String(r?.notes ?? '').trim().slice(0, 300) || undefined,
      unit_price: numOrNull(r?.unit_price),
      vendor_note: String(r?.vendor_note ?? '').trim().slice(0, 300) || undefined,
    }))
    .filter(l => l.description.length > 0)
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''))
  return isFinite(n) ? n : null
}

// ---------------------------------------------------------------------------
// Parsing what people already have
//
// Nobody retypes a takeoff. It arrives as a spreadsheet or as a block of cells
// pasted out of one, so both paths land here.
// ---------------------------------------------------------------------------

/**
 * Header matching is scored, not first-wins.
 *
 * Real takeoffs have an "ITEM #" line-number column sitting to the left of the
 * actual "DESCRIPTION" column. First-wins picks the line numbers and you get an
 * item list that reads 1, 2, 3. Highest score wins instead, and a line-number
 * header scores below zero so it can never be the description.
 */
function scoreHeader(s: string): { desc: number; qty: number; unit: number; note: number } {
  const t = s.trim().toLowerCase().replace(/\s+/g, ' ')
  const score = { desc: 0, qty: 0, unit: 0, note: 0 }

  // Line-number columns, which look like item columns and are not.
  if (/^(item ?#|item no\.?|#|no\.?|line ?#|ref|sl ?no)$/i.test(t)) return { desc: -1, qty: -1, unit: -1, note: -1 }

  if (/^(description|desc)$/.test(t)) score.desc = 10
  else if (/^(item|items|material|materials|product|line ?item|scope of work|work item|detail)$/.test(t)) score.desc = 7
  else if (/^(scope|work|task)$/.test(t)) score.desc = 4
  else if (/(description|item description)/.test(t)) score.desc = 6

  if (/^(qty|quantity)$/.test(t)) score.qty = 10
  else if (/^(qty|quantity)\b/.test(t)) score.qty = 5   // "QTY W/WASTAGE" - a fallback, not the first choice
  else if (/^(count|pieces|pcs)$/.test(t)) score.qty = 6

  if (/^(unit|uom|u\/?m|units)$/.test(t)) score.unit = 10
  else if (/^(unit of measure|measure)$/.test(t)) score.unit = 8

  if (/^(notes?|comments?|remarks?|specs?|size|spec)$/.test(t)) score.note = 10

  return score
}

/** Header rows, totals, and the label cells people leave in the margins. */
const SKIP_ROW = /^(total|subtotal|sub-total|grand total|sum|page \d|takeoff|estimate|project|address|date|prepared|quantity|description|item|notes?)$/i

/** Section headings inside a takeoff - real rows, but not priceable ones. */
const SECTION_ROW = /^(division\b|div\.? ?\d|section \d|subtotal\b|sub-total\b|total\b|csi\b)/i

/** Column headers → indexes, if this sheet has a header row at all. */
function findHeader(rows: any[][]): { row: number; desc: number; qty: number; unit: number; note: number } | null {
  const limit = Math.min(rows.length, 25)
  for (let r = 0; r < limit; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue
    const best = { desc: [-1, 0], qty: [-1, 0], unit: [-1, 0], note: [-1, 0] } as Record<string, [number, number]>
    row.forEach((cell, c) => {
      const s = String(cell ?? '').trim()
      if (!s || s.length > 40) return
      const sc = scoreHeader(s)
      for (const k of ['desc', 'qty', 'unit', 'note'] as const) {
        if (sc[k] > best[k][1]) best[k] = [c, sc[k]]
      }
    })
    // A description column plus at least one of qty/unit is a real header.
    if (best.desc[0] >= 0 && (best.qty[0] >= 0 || best.unit[0] >= 0)) {
      return { row: r, desc: best.desc[0], qty: best.qty[0], unit: best.unit[0], note: best.note[0] }
    }
  }
  return null
}

/**
 * Rows of cells → item lines.
 *
 * Uses the sheet's own header row when it has one. When it doesn't - and plenty
 * of real takeoffs don't - it falls back to: first text cell is the item, first
 * number is the quantity, a short text cell right after is the unit.
 */
export function parseItemRows(rows: any[][]): ItemLine[] {
  const header = findHeader(rows)
  const out: ItemLine[] = []

  for (let r = header ? header.row + 1 : 0; r < rows.length; r++) {
    const row = rows[r]
    if (!Array.isArray(row)) continue

    let description = '', qty: number | null = null, unit = '', notes = ''

    if (header) {
      description = String(row[header.desc] ?? '').trim()
      qty = header.qty >= 0 ? numOrNull(row[header.qty]) : null
      unit = header.unit >= 0 ? String(row[header.unit] ?? '').trim() : ''
      notes = header.note >= 0 ? String(row[header.note] ?? '').trim() : ''
      // With a quantity column present, a row without a quantity is a division
      // heading or a subtotal, not something anybody can price.
      if (header.qty >= 0 && qty == null) continue
    } else {
      const cells = row.map(c => (c == null ? '' : c))
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c]
        if (!description && typeof cell === 'string' && cell.trim().length > 1) {
          description = cell.trim()
          continue
        }
        if (description && qty == null) {
          const n = numOrNull(cell)
          if (n != null) {
            qty = n
            // The cell right after a quantity is usually its unit.
            const next = cells[c + 1]
            if (typeof next === 'string' && next.trim() && next.trim().length <= 12) unit = next.trim()
            continue
          }
        }
      }
    }

    // Takeoff descriptions run over several lines inside one cell.
    description = description.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()

    if (!description || description.length > 300) continue
    if (/^[\d.,\s$%-]+$/.test(description)) continue   // a line number, not an item
    if (SKIP_ROW.test(description)) continue
    if (SECTION_ROW.test(description)) continue

    out.push({
      description,
      qty,
      unit: normalizeUnit(unit),
      notes: notes ? notes.replace(/\s*[\r\n]+\s*/g, ' ').trim() : undefined,
    })
  }

  return out
}

/**
 * A block of cells pasted straight out of a spreadsheet.
 *
 * Excel and Sheets both put tabs between columns, so this is the same parse
 * with a different front door.
 */
export function parsePastedRows(text: string): ItemLine[] {
  const rows = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(line => (line.includes('\t') ? line.split('\t') : splitCsvLine(line)).map(c => c.trim()))
  return parseItemRows(rows)
}

/** Quote-aware CSV split, so "2x4, 8ft" stays one cell. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
