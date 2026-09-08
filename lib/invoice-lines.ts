// ─────────────────────────────────────────────────────────────────────────────
// An invoice's breakdown, and whether it adds up.
//
// Every invoice should be able to answer "what am I being charged for?" without
// opening the PDF, and the lines have to reconcile to the total. A breakdown
// that does not add up is worse than none: it looks like detail, so nobody
// checks it, and the difference is exactly where a quiet extra hides.
// ─────────────────────────────────────────────────────────────────────────────

export interface InvoiceLine {
  description: string
  qty?: number | null
  unit?: string | null
  unit_price?: number | null
  amount?: number | null
}

export const num = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const cleaned = v.replace(/[^0-9.\-]/g, '')
    const n = Number(cleaned)
    return cleaned && isFinite(n) ? n : null
  }
  return null
}

/** Money read off a document is rarely cleaner than the cent. */
const EPSILON = 0.01

/**
 * Round to cents without the float artefact.
 *
 * 3 × 1.005 is 3.0149999999999997 in binary floating point, so a plain
 * Math.round(x * 100) / 100 gives 3.01 where a person - and the vendor's own
 * invoice - says 3.02. The nudge has to be applied to the SCALED value: adding
 * one ULP before multiplying by 100 is swallowed by the multiply. 1e-9 of a
 * cent is far below any real money and comfortably above the float noise, and
 * it is signed so a credit rounds away from zero the same way.
 */
const round2 = (n: number) => {
  const scaled = n * 100
  return Math.round(scaled + Math.sign(scaled) * 1e-9) / 100
}

/**
 * A line's value: what it says, or qty × unit price when it only gives those.
 */
export function lineAmount(line: InvoiceLine): number | null {
  const direct = num(line.amount)
  if (direct != null) return direct
  const qty = num(line.qty)
  const unit = num(line.unit_price)
  if (qty != null && unit != null) return round2(qty * unit)
  return null
}

export function linesTotal(lines: InvoiceLine[]): number {
  return round2(lines.reduce((s, l) => s + (lineAmount(l) ?? 0), 0))
}

export interface Reconciliation {
  /** Lines that carry a value. */
  counted: number
  /** Lines present but with no readable amount - they make the sum a guess. */
  unpriced: number
  linesTotal: number
  /** lines + tax − retainage. What the total ought to be. */
  expected: number | null
  invoiceTotal: number | null
  difference: number | null
  /** true when there is a breakdown and it agrees with the total. */
  balanced: boolean
  /** No lines at all - nothing to check, not a failure. */
  noBreakdown: boolean
}

/**
 * Check the breakdown against the total.
 *
 * Deliberately does NOT treat a mismatch as "the invoice is wrong". Sheets omit
 * a freight line, tax gets folded into a line, retainage is shown two ways. It
 * reports the difference and lets a human decide, because the useful signal is
 * "these do not reconcile - look", not a verdict.
 */
export function reconcile(input: {
  lines: InvoiceLine[]
  subtotal?: unknown
  tax?: unknown
  retainage?: unknown
  amount?: unknown
}): Reconciliation {
  const lines = Array.isArray(input.lines) ? input.lines : []
  const priced = lines.filter(l => lineAmount(l) != null)
  const total = linesTotal(lines)
  const invoiceTotal = num(input.amount)
  const tax = num(input.tax) ?? 0
  const retainage = num(input.retainage) ?? 0

  if (!lines.length) {
    return {
      counted: 0, unpriced: 0, linesTotal: 0,
      expected: null, invoiceTotal, difference: null,
      balanced: false, noBreakdown: true,
    }
  }

  const expected = round2(total + tax - retainage)
  const difference = invoiceTotal != null ? round2(invoiceTotal - expected) : null

  return {
    counted: priced.length,
    unpriced: lines.length - priced.length,
    linesTotal: total,
    expected,
    invoiceTotal,
    difference,
    // An unpriced line means the sum is incomplete, so it cannot be called
    // balanced even when the arithmetic happens to land.
    balanced: difference != null && Math.abs(difference) <= EPSILON && priced.length === lines.length,
    noBreakdown: false,
  }
}

/** One line a human can read. */
export function reconciliationNote(r: Reconciliation): string | null {
  if (r.noBreakdown) return null
  if (r.balanced) return null
  if (r.unpriced > 0 && r.difference == null) {
    return `${r.unpriced} line${r.unpriced > 1 ? 's have' : ' has'} no amount, so the breakdown does not add up to a total.`
  }
  const money = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
  const bits: string[] = []
  if (r.difference != null && Math.abs(r.difference) > EPSILON) {
    bits.push(
      r.difference > 0
        ? `The total is ${money(r.difference)} more than the lines add up to.`
        : `The lines add up to ${money(r.difference)} more than the total.`,
    )
  }
  if (r.unpriced > 0) {
    bits.push(`${r.unpriced} line${r.unpriced > 1 ? 's have' : ' has'} no amount.`)
  }
  return bits.join(' ') || null
}

// ─────────────────────────────────────────────────────────────────────────────
// The same money counted twice.
//
// THE BUG. The scanner reads tax into `invoices.tax`, and its prompt tells the
// model NOT to repeat tax as a line item "because repeating them makes the
// breakdown add up to double". Nothing stopped a PERSON adding one. The result
// was "the lines add up to $62 more than the total" on a bill that was correct
// - the $62 was the tax, counted once in the field and once as a line.
//
// The deeper cause is that `tax` had no input at all: written once by the scan,
// then invisible and uneditable. Somebody entering a bill by hand had nowhere
// to put tax except a line, and somebody correcting a scan could not zero the
// field to compensate. The warning was a symptom of a field with no door.
//
// This flags it AT ENTRY and never rewrites anything on its own. Silently
// folding a line into a field changes somebody's numbers without telling them,
// and a bill whose breakdown no longer matches the paper in the folder is hard
// to argue with later.
// ─────────────────────────────────────────────────────────────────────────────

/** Words that mean "this line is tax", not "this line is work". */
const TAX_WORDS = /\b(sales\s*tax|use\s*tax|vat|gst|hst|pst|tax)\b/i

/**
 * Does this line describe tax?
 *
 * Deliberately narrow. "Tax preparation services" from an accountant is a real
 * line of work, so a description that merely CONTAINS the word is not enough -
 * it has to read as a tax line, which in practice means short and tax-led.
 */
export function looksLikeTaxLine(description: unknown): boolean {
  const text = String(description ?? '').trim()
  if (!text) return false
  if (!TAX_WORDS.test(text)) return false
  // Four words or fewer: "Sales tax", "NY sales tax 8.875%", "Tax". A longer
  // sentence is describing work that happens to mention tax.
  return text.split(/\s+/).length <= 4
}

export interface TaxConflict {
  /** Index into the lines array. */
  index: number
  description: string
  amount: number | null
}

/**
 * Lines that look like tax while a tax amount is already recorded.
 *
 * Returns [] when there is no tax on the bill, because then a "Sales tax" line
 * is simply where the tax lives - which is a perfectly good way to enter a
 * bill, and not something to nag about.
 */
export function taxLineConflicts(input: {
  lines: InvoiceLine[]
  tax: unknown
}): TaxConflict[] {
  const tax = num(input.tax)
  if (tax == null || Math.abs(tax) <= EPSILON) return []
  const out: TaxConflict[] = []
  input.lines.forEach((line, index) => {
    if (looksLikeTaxLine(line?.description)) {
      out.push({ index, description: String(line?.description ?? ''), amount: lineAmount(line) })
    }
  })
  return out
}

/** What to say about it, in the words somebody can act on. */
export function taxConflictNote(conflicts: TaxConflict[], tax: unknown): string | null {
  if (!conflicts.length) return null
  const t = num(tax) ?? 0
  const money = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const first = conflicts[0]
  const amt = first.amount != null ? ` (${money(first.amount)})` : ''
  return conflicts.length === 1
    ? `"${first.description}"${amt} looks like tax, and this bill already records ${money(t)} of tax separately. Counting both would double it.`
    : `${conflicts.length} lines look like tax, and this bill already records ${money(t)} of tax separately. Counting both would double it.`
}
