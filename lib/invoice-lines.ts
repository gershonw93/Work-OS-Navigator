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
