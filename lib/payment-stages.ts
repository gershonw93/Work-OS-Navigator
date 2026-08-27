// ─────────────────────────────────────────────────────────────────────────────
// The client's payment stages, turned into amounts you can actually ask for.
//
// `projects.payment_stages` is written by the AI that reads your estimate. It
// comes back as a mix, because real quotes are a mix: some stages are a
// percentage ("50% deposit"), some a flat figure ("$5,000 on signing"), and
// some are neither because the quote said something vague.
//
// Everything that has to decide "how much is this stage worth?" needs the same
// answer, so it is decided once, here, rather than in the page that lists them
// and again in the route that raises the request.
//
// A stage with no resolvable amount is NOT dropped and NOT guessed at. It is
// returned with `amount: null` so the UI can show it and say why it cannot be
// requested. Inventing a number for money you are about to ask a client for is
// the worst available option.
// ─────────────────────────────────────────────────────────────────────────────

export interface RawStage {
  label?: string | null
  percent?: number | null
  amount?: number | null
  trigger?: string | null
}

export interface ResolvedStage {
  index: number
  label: string
  /** Dollars, or null when the quote did not say enough to work it out. */
  amount: number | null
  /** How the amount was arrived at, so the UI never has to guess. */
  basis: 'amount' | 'percent' | 'unknown'
  percent: number | null
  dueHint: string | null
}

/** Round to cents. Percentages of six-figure totals otherwise carry float dust. */
function money(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Resolve every stage against the quote total.
 *
 * An explicit amount always wins over a percentage: if the quote says both,
 * the number the client read is the number on the page.
 */
export function resolveStages(stages: unknown, quoteTotal: number | null | undefined): ResolvedStage[] {
  if (!Array.isArray(stages)) return []
  const total = Number(quoteTotal)
  const haveTotal = Number.isFinite(total) && total > 0

  return stages.map((raw, index) => {
    const s = (raw ?? {}) as RawStage
    const label = String(s.label ?? '').trim() || `Stage ${index + 1}`
    const dueHint = typeof s.trigger === 'string' && s.trigger.trim() ? s.trigger.trim() : null

    const explicit = Number(s.amount)
    if (Number.isFinite(explicit) && explicit > 0) {
      return { index, label, amount: money(explicit), basis: 'amount', percent: null, dueHint }
    }

    const pct = Number(s.percent)
    if (Number.isFinite(pct) && pct > 0 && haveTotal) {
      return { index, label, amount: money(total * pct / 100), basis: 'percent', percent: pct, dueHint }
    }

    // A percentage with no quote total to apply it to is still worth showing -
    // "50% deposit" tells the user what they agreed, it just cannot be turned
    // into a request until the estimate has a total.
    return {
      index,
      label,
      amount: null,
      basis: 'unknown',
      percent: Number.isFinite(pct) && pct > 0 ? pct : null,
      dueHint,
    }
  })
}

/** Whether a stage can be turned into a request for money. */
export function isRequestable(stage: ResolvedStage): boolean {
  return stage.amount != null && stage.amount > 0
}

/**
 * Why a stage cannot be requested, in the user's terms.
 *
 * Returns null when it can be. The distinction matters: "we do not know the
 * job total" is fixable on the Estimate tab in a minute; "the quote never said"
 * needs the number typed in.
 */
export function blockedReason(stage: ResolvedStage, quoteTotal: number | null | undefined): string | null {
  if (isRequestable(stage)) return null
  const total = Number(quoteTotal)
  if (stage.percent != null && !(Number.isFinite(total) && total > 0)) {
    return `${stage.percent}% of what? Set an estimate total first and this becomes a figure.`
  }
  return 'The estimate did not give an amount or a percentage for this stage.'
}
