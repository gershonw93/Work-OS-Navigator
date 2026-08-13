// ─────────────────────────────────────────────────────────────────────────────
// Reading a contractor's budget spreadsheet.
//
// The hard part is not the shape of the sheet, it is that money in a real
// estimate is almost never a plain number. It is "$24,000.00", or "24,000", or
// "(500)" for a credit, or a string because the column was formatted as text,
// or a CSV where every cell arrives as text no matter what it looks like.
//
// The first version only accepted cells where `typeof cell === 'number'`, so
// every one of those read as no amount at all and the whole sheet imported at
// zero dollars - silently, with the line items looking perfectly correct.
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportedLine {
  description: string
  default_amount: number | null
}

/** Column headers that mean "this row is a header, not a line item". */
const HEADER_WORDS = /^(description|desc|item|item ?#|line|line ?item|category|cost ?code|code|qty|quantity|unit|unit ?price|price|cost|amount|total|budget|notes?|scope|trade)$/i

/** Rows that are sums or titles rather than line items. */
const SKIP_LABEL = /^(total|subtotal|sub-total|grand total|contractor fee|overhead & profit|o&p|property address|phase\b|section\b|page \d+)/i

/** A label that is really a cost code - "100", "01-200", "3.1", "A" - not a name. */
const CODE_RE = /^[0-9]{1,6}([.\-][0-9a-z]{1,4})*$|^[a-z]{1,2}[0-9]{0,3}$/i

/**
 * Written like money rather than like a code.
 *
 * In a CSV every cell arrives as text, so "36216.67" is a string exactly like
 * the cost code "3.1" is - and "36216.67" matches a code pattern perfectly
 * well. The tell is the shape: a currency symbol, a thousands separator,
 * accounting parentheses, or cents. Cost codes have none of those.
 */
function looksLikeMoney(s: string): boolean {
  const t = s.trim()
  if (/[$£€¥]/.test(t)) return true
  if (/^\(.*\)$/.test(t)) return true
  if (/\d,\d/.test(t)) return true
  if (/^-?\d+\.\d{2}$/.test(t)) return true
  return false
}

/** A cell that reads as money is never a cost code or a line-item name. */
const CODE_LIKE = (s: string) => !looksLikeMoney(s) && CODE_RE.test(s)

/**
 * Turn whatever a spreadsheet put in a cell into a number, or null.
 *
 * Handles currency symbols, thousands separators, trailing/leading spaces, and
 * accounting-style negatives in parentheses. Deliberately refuses anything with
 * letters in it, so "24 units" or "TBD" stay null rather than becoming 24.
 */
export function parseAmount(cell: unknown): number | null {
  if (typeof cell === 'number') return isFinite(cell) ? cell : null
  if (typeof cell !== 'string') return null

  let s = cell.trim()
  if (!s) return null

  // Accounting negatives: (1,200) means -1200.
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim() }
  if (s.startsWith('-')) { negative = true; s = s.slice(1).trim() }

  // Currency symbols and thousands separators, but nothing alphabetic - a cell
  // reading "24 hrs" or "TBD" is not an amount and must not become one.
  s = s.replace(/[$£€¥]/g, '').replace(/,/g, '').replace(/\s/g, '')
  if (!s || !/^[0-9]*\.?[0-9]+$/.test(s)) return null

  const n = Number(s)
  if (!isFinite(n)) return null
  return negative ? -n : n
}

/** True when every text cell in the row reads like a column heading. */
function looksLikeHeaderRow(row: unknown[]): boolean {
  const texts = row.filter(c => typeof c === 'string' && (c as string).trim())
  if (texts.length < 2) return false
  return texts.every(t => HEADER_WORDS.test(String(t).trim()))
}

/**
 * Pick the line-item name out of a row.
 *
 * Sheets very often lead with a cost-code column, and taking the first text
 * cell turns every line item into "100", "200", "300" - the same trap as line
 * numbers in a takeoff. A code-looking cell is only used as the name when the
 * row has nothing better.
 */
function pickLabel(row: unknown[]): string | null {
  const texts = row
    .map(c => (typeof c === 'string' ? c.trim() : ''))
    // A money-shaped string is a value, never a name - otherwise a CSV whose
    // amount column is text turns the amount into the line item.
    .filter(t => t && !looksLikeMoney(t))
  if (!texts.length) return null
  const real = texts.find(t => !CODE_LIKE(t))
  return real ?? texts[0]
}

/** The cost code, when the row leads with one and also has a real name. */
function pickCode(row: unknown[]): string | null {
  const texts = row
    .map(c => (typeof c === 'string' ? c.trim() : ''))
    .filter(t => t && !looksLikeMoney(t))
  if (texts.length < 2) return null
  const code = texts.find(t => CODE_LIKE(t))
  return code && texts.some(t => !CODE_LIKE(t)) ? code : null
}

/**
 * Parse rows straight out of `sheet_to_json(..., { header: 1 })`.
 *
 * The amount is the LAST parseable number on the row, not the first. Estimate
 * sheets run quantity, unit price, then total, and the total is the number
 * anyone means by "what is this line worth".
 */
export function parseBudgetRows(rows: unknown[][]): ImportedLine[] {
  const out: ImportedLine[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    if (!Array.isArray(row)) continue
    if (looksLikeHeaderRow(row)) continue

    const label = pickLabel(row)
    if (!label) continue
    if (SKIP_LABEL.test(label)) continue
    if (HEADER_WORDS.test(label)) continue
    if (label.length > 120) continue

    const code = pickCode(row)
    // Numbers from cells that are not the label or the code.
    const amounts = row
      .filter(c => c !== label && c !== code)
      .map(parseAmount)
      .filter((n): n is number => n != null)
    const amount = amounts.length ? amounts[amounts.length - 1] : null

    const key = label.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)

    out.push({ description: code ? `${code} ${label}` : label, default_amount: amount })
  }

  return out
}
