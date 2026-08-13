// ─────────────────────────────────────────────────────────────────────────────
// Checking a vendor's invoice against what they quoted.
//
// The contract total is the easy check and the one everybody already does. The
// expensive surprises live a level down: a line billed at a rate nobody agreed
// to, or a line that was never on the quote at all and has no change order
// behind it. Both look perfectly ordinary on an invoice whose total is under
// the contract, which is exactly why they get paid.
//
// Everything here is advisory. It flags what to look at before approving; it
// never blocks an invoice, because a sub being owed money for real extra work
// is a normal thing that a strict rule would just push off-system.
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteLine {
  description?: string | null
  qty?: number | null
  unit?: string | null
  unit_price?: number | null
  amount?: number | null
}

export interface InvoiceLine {
  description?: string | null
  amount?: number | null
}

export type FindingKind = 'over_quoted_line' | 'not_on_quote'

export interface LineFinding {
  kind: FindingKind
  description: string
  invoiced: number | null
  /** The quoted line it was matched to, when there was one. */
  quoted_description?: string
  quoted: number | null
  /** How much more than quoted, for over_quoted_line. */
  over?: number
}

export interface QuoteCheck {
  /** 'matches' when nothing is worth a second look. */
  verdict: 'matches' | 'check' | 'no_quote'
  findings: LineFinding[]
  /** Amount by which the running total passes the contract, if it does. */
  over_contract: number | null
  contract_amount: number | null
  already_billed: number
  this_invoice: number | null
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/[^0-9.\-]/g, ''))
    return isFinite(n) ? n : null
  }
  return null
}

// Words that appear on every construction line and so carry no signal. Filtered
// BEFORE stemming - "materials" stems to "materi", so a stop list of singulars
// silently never fires. (Same trap as the selections budget matcher.)
const STOP = new Set([
  'and', 'the', 'for', 'with', 'per', 'all', 'any', 'each', 'incl', 'including',
  'includes', 'allowance', 'work', 'works', 'labor', 'labour', 'material',
  'materials', 'supply', 'install', 'installation', 'installed', 'provide',
  'furnish', 'new', 'existing', 'site', 'job', 'area', 'areas', 'as', 'of', 'to',
  'at', 'in', 'on', 'from', 'by', 'a', 'an', 'is', 'are', 'complete', 'total',
])

const stem = (w: string) => w.replace(/(ing|ed|es|s)$/i, '')

function tokens(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(stem)
    .filter(Boolean)
}

/**
 * Find the quoted line an invoice line refers to.
 *
 * Scored on shared words, and refuses to guess: a weak best match or a tie
 * returns null, which reads as "not on the quote" and gets looked at. Naming
 * the wrong quoted line would be worse than naming none - it would show a
 * confident comparison against something unrelated.
 */
export function matchQuoteLine(description: string, quote: QuoteLine[]): QuoteLine | null {
  const want = tokens(description)
  if (!want.length) return null

  let best: QuoteLine | null = null
  let bestScore = 0
  let tied = false

  for (const q of quote) {
    const have = tokens(String(q.description ?? ''))
    if (!have.length) continue
    let score = 0
    for (const w of want) if (have.includes(w)) score++
    if (!score) continue
    // Favour a match that covers more of the shorter line, so "Install LVP"
    // prefers "Install luxury vinyl plank" over a longer line that merely
    // mentions it in passing.
    const coverage = score / Math.min(want.length, have.length)
    const total = score + coverage

    if (total > bestScore + 0.001) { bestScore = total; best = q; tied = false }
    else if (Math.abs(total - bestScore) <= 0.001) tied = true
  }

  if (bestScore < 2 || tied) return null
  return best
}

/** Ignore pennies and rounding: only flag a real overage. */
function meaningfullyOver(invoiced: number, quoted: number): boolean {
  const over = invoiced - quoted
  return over > 1 && over / Math.max(quoted, 1) > 0.005
}

/**
 * Compare one invoice against the quoted lines on its subcontract.
 *
 * `alreadyBilled` should exclude this invoice - it is what was billed before.
 */
export function checkInvoiceAgainstQuote(input: {
  invoiceLines: InvoiceLine[]
  quoteLines: QuoteLine[]
  invoiceAmount: number | null
  contractAmount: number | null
  alreadyBilled: number
}): QuoteCheck {
  const { invoiceLines, quoteLines, invoiceAmount, contractAmount, alreadyBilled } = input

  const contract = num(contractAmount)
  const thisInv = num(invoiceAmount)

  // Running total past the contract is worth saying regardless of line detail.
  let overContract: number | null = null
  if (contract != null && thisInv != null) {
    const after = alreadyBilled + thisInv
    if (after - contract > 1) overContract = after - contract
  }

  const usableQuote = quoteLines.filter(q => String(q.description ?? '').trim())
  if (!usableQuote.length) {
    return {
      verdict: overContract != null ? 'check' : 'no_quote',
      findings: [],
      over_contract: overContract,
      contract_amount: contract,
      already_billed: alreadyBilled,
      this_invoice: thisInv,
    }
  }

  const findings: LineFinding[] = []
  for (const line of invoiceLines) {
    const desc = String(line.description ?? '').trim()
    if (!desc) continue
    const invoiced = num(line.amount)
    const match = matchQuoteLine(desc, usableQuote)

    if (!match) {
      // Only worth raising when there is money attached to it.
      if (invoiced != null && invoiced > 0) {
        findings.push({ kind: 'not_on_quote', description: desc, invoiced, quoted: null })
      }
      continue
    }

    const quoted = num(match.amount) ?? (
      num(match.qty) != null && num(match.unit_price) != null
        ? num(match.qty)! * num(match.unit_price)!
        : null
    )
    if (invoiced != null && quoted != null && meaningfullyOver(invoiced, quoted)) {
      findings.push({
        kind: 'over_quoted_line',
        description: desc,
        invoiced,
        quoted,
        quoted_description: String(match.description ?? ''),
        over: invoiced - quoted,
      })
    }
  }

  return {
    verdict: findings.length || overContract != null ? 'check' : 'matches',
    findings,
    over_contract: overContract,
    contract_amount: contract,
    already_billed: alreadyBilled,
    this_invoice: thisInv,
  }
}

/** One line a human can read at a glance. */
export function checkSummary(check: QuoteCheck): string {
  if (check.verdict === 'no_quote') return 'No quoted line items on this contract to check against.'
  if (check.verdict === 'matches') return 'Matches the quote.'
  const bits: string[] = []
  const over = check.findings.filter(f => f.kind === 'over_quoted_line').length
  const extra = check.findings.filter(f => f.kind === 'not_on_quote').length
  if (over) bits.push(`${over} line${over > 1 ? 's' : ''} billed above the quote`)
  if (extra) bits.push(`${extra} line${extra > 1 ? 's' : ''} not on the quote`)
  if (check.over_contract != null) bits.push(`$${Math.round(check.over_contract).toLocaleString()} past the contract`)
  return bits.join(' · ')
}
