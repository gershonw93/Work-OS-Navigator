// ─────────────────────────────────────────────────────────────────────────────
// Whether an AIA certificate is fit to leave the building.
//
// THE BUG. A full cycle was submitted, certified and funded carrying:
//
//   * retainage of 105% - $189,000 held on $180,000 earned, which made
//     "total earned less retainage" MINUS $9,000 and the balance to finish
//     $309,000 on a $300,000 contract
//   * lines at 110% complete, balances of -$12,000 and -$18,000
//   * -$1,000 billed on a line with a $0 scheduled value
//
// The arithmetic was never wrong - carryover, retainage release and previous
// certificates all reconcile. Nothing checked the inputs:
//
//     updates.this_period  = Number(l.this_period) || 0
//     header.retainage_pct = Number(body.retainage_pct) || 0
//
// The same expression as the budget lines in #345. It takes a negative, takes a
// percentage over 100, and turns a typo into a confident zero.
//
// A G702 goes to a lender. It is the worst document in the app to be wrong, and
// it was the only money screen with no validation at all.
//
// Pure, like lib/committed.ts and lib/company-owner.ts, because these decide
// what a bank is told and rules that need a server to test are rules nobody
// tests.
// ─────────────────────────────────────────────────────────────────────────────

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Retainage, as a percentage of the work completed.
 *
 * 0 to 100. Over 100 is not a strict rule somebody might want relaxed - it is
 * arithmetic nonsense: you cannot hold back more than has been earned, and
 * doing so is what produced a negative "earned less retainage".
 *
 * REFUSED, never clamped. Quietly turning 105 into 100 would put a number on a
 * bank document that nobody typed - which is the same class of mistake as
 * accepting the 105.
 */
export function retainagePct(raw: unknown): Checked<number> {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: true, value: 0 }
  const v = Number(text)
  if (!Number.isFinite(v)) return { ok: false, error: 'Retainage must be a number.' }
  if (v < 0) return { ok: false, error: 'Retainage cannot be negative.' }
  if (v > 100) {
    return {
      ok: false,
      error: `Retainage cannot be more than 100% - you would be holding back more than has been earned.`,
    }
  }
  return { ok: true, value: Math.round(v * 100) / 100 }
}

export interface PayAppLine {
  id?: string
  description?: string | null
  scheduled_value?: unknown
  previous_completed?: unknown
  this_period?: unknown
  materials_stored?: unknown
}

/** previous + this period + stored. What the G703 calls completed to date. */
export function lineCompletedToDate(l: PayAppLine): number {
  return n(l.previous_completed) + n(l.this_period) + n(l.materials_stored)
}

/**
 * One rule, covering two of the reported faults.
 *
 * A line's completed-to-date must land between zero and its scheduled value.
 * Below zero refuses the -$1,000 billed against a $0 line; above the scheduled
 * value refuses the 110%.
 *
 * DELIBERATELY NOT "this_period must be positive". A negative amount that
 * corrects a previous overbill is legitimate on a G703 - what must not happen
 * is the correction taking the line below nothing. Banning the entry outright
 * would remove the only way to fix a mistake in an earlier certificate.
 */
export function checkLine(l: PayAppLine): Checked<number> {
  const scheduled = n(l.scheduled_value)
  const toDate = lineCompletedToDate(l)
  const name = (l.description ?? '').trim() || 'This line'

  if (toDate < 0) {
    return { ok: false, error: `${name} would be billed below zero.` }
  }
  if (toDate > scheduled) {
    const over = toDate - scheduled
    return {
      ok: false,
      error: scheduled === 0
        ? `${name} has no scheduled value, so there is nothing to bill against it.`
        : `${name} is billed ${fmt(over)} over its scheduled value of ${fmt(scheduled)}. Raise it with a change order first.`,
    }
  }
  return { ok: true, value: toDate }
}

const fmt = (v: number) => `$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export interface PayAppProblem {
  /** The line it belongs to, or null for the application as a whole. */
  lineId: string | null
  message: string
}

/**
 * Everything wrong with an application, each problem naming where it is.
 *
 * Used twice: to mark the draft while somebody is editing it, and to refuse the
 * move to submitted / certified / funded. Same answer both times, so the screen
 * and the route cannot disagree about whether a certificate is sound.
 */
export function payAppProblems(
  app: { retainage_pct?: unknown },
  lines: PayAppLine[],
): PayAppProblem[] {
  const problems: PayAppProblem[] = []

  const pct = retainagePct(app.retainage_pct)
  if (!pct.ok) problems.push({ lineId: null, message: pct.error })

  for (const l of lines) {
    const c = checkLine(l)
    if (!c.ok) problems.push({ lineId: l.id ?? null, message: c.error })
  }
  return problems
}

/** The statuses an application may hold. Anything else was a typo or an attack. */
export const PAY_APP_STATUSES = ['draft', 'submitted', 'certified', 'funded'] as const
export type PayAppStatus = (typeof PAY_APP_STATUSES)[number]

/**
 * The statuses that put the certificate in front of somebody else.
 *
 * A draft may hold an overbilled line - a GC works mid-cycle and the change
 * order that fixes it may not be entered yet. A certificate may not: past this
 * point it is an owner's, an architect's or a bank's copy.
 */
export const STATUSES_NEEDING_A_SOUND_APP: PayAppStatus[] = ['submitted', 'certified', 'funded']

export function isPayAppStatus(v: unknown): v is PayAppStatus {
  return typeof v === 'string' && (PAY_APP_STATUSES as readonly string[]).includes(v)
}
