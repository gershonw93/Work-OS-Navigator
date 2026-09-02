// ─────────────────────────────────────────────────────────────────────────────
// "Raise it with a change order first" - as a link that actually raises it.
//
// The pay-app screen refuses a line billed past its scheduled value and names
// the fix. Naming a fix and then leaving somebody to find the screen, work the
// number out again and retype it is half an answer, so the words are a link and
// the change order arrives filled in.
//
// BUILT AND PARSED HERE, ONCE. A link is two halves that have to agree about
// every parameter name, and when they stop agreeing the form opens empty - which
// looks exactly like a link that did nothing rather than like a bug. One module
// writes it and reads it, so they cannot drift.
//
// WHAT THE CHANGE ORDER HAS TO CARRY. Not just the money - the LINE. A change
// order that names no budget line becomes an "Approved change orders" row of its
// own on the G703, so the overbilled line stays exactly as over as it was and
// the certificate is still refused. Same rule the selections overage flow
// already follows: an overage that floats free of its line is money the budget
// cannot see.
// ─────────────────────────────────────────────────────────────────────────────

import type { PayAppProblem } from './pay-app-rules'

export interface ChangeOrderPrefill {
  /** The overage, to the cent. Editable once the form opens. */
  amount: number
  title: string
  description: string
  reason: string
  /** The budget line to raise. */
  budgetLineItemId: string | null
  /** Or the subcontract, when the row has no budget line behind it. */
  subcontractId: string | null
}

/** Only this one is fixed by a change order. */
export function isFixableByChangeOrder(p: PayAppProblem): boolean {
  return p.kind === 'over_scheduled' && (p.overBy ?? 0) > 0
}

export interface PayAppContext {
  applicationNumber: number | string
  /** Set when a subcontractor is billing us; null when we bill the owner. */
  subcontractId: string | null
}

/**
 * What the change order should say, worked out from the problem itself.
 *
 * A change order raised from here should read like one somebody wrote: what it
 * covers, how much, and where the number came from. "Additional work" with a
 * bare figure is what people write when a form asks them to invent a reason.
 */
export function prefillFor(p: PayAppProblem, ctx: PayAppContext): ChangeOrderPrefill {
  const over = Math.round((p.overBy ?? 0) * 100) / 100
  const name = (p.lineDescription ?? '').trim() || 'this line'
  const money = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

  return {
    amount: over,
    title: `Additional work - ${name}`,
    description:
      `Raised from pay application #${ctx.applicationNumber}. ` +
      `${name} is billed ${money(over)} past its scheduled value of ` +
      `${money(p.scheduledValue ?? 0)}. Approving this raises the scheduled value ` +
      `so the work can be certified.`,
    reason: 'Scope increase',
    // A budget line if the row has one - that is what raises the schedule.
    // Otherwise the subcontract, whose contract amount is what a sub's
    // fallback row is built from. Never both.
    budgetLineItemId: p.budgetLineItemId ?? null,
    subcontractId: p.budgetLineItemId ? null : ctx.subcontractId,
  }
}

/** The parameter names. Written once so the two halves cannot disagree. */
const PARAM = {
  amount: 'co_amount',
  title: 'co_title',
  description: 'co_description',
  reason: 'co_reason',
  budgetLine: 'co_budget_line',
  subcontract: 'co_subcontract',
} as const

/** `/projects/<id>/change-orders?…` - everything the form needs to open ready. */
export function changeOrderHref(projectId: string, pre: ChangeOrderPrefill): string {
  const q = new URLSearchParams()
  q.set(PARAM.amount, String(pre.amount))
  q.set(PARAM.title, pre.title)
  q.set(PARAM.description, pre.description)
  q.set(PARAM.reason, pre.reason)
  if (pre.budgetLineItemId) q.set(PARAM.budgetLine, pre.budgetLineItemId)
  if (pre.subcontractId) q.set(PARAM.subcontract, pre.subcontractId)
  return `/projects/${projectId}/change-orders?${q.toString()}`
}

/**
 * Read it back on the other side.
 *
 * Null when there is nothing to prefill, so the form opens as it always did.
 * A link with an unreadable amount is treated as no link at all rather than as
 * a change order for zero - a zero would sail through and change nothing.
 */
export function readPrefill(params: URLSearchParams | null): ChangeOrderPrefill | null {
  if (!params) return null
  const raw = params.get(PARAM.amount)
  if (raw == null) return null
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount === 0) return null

  return {
    amount,
    title: params.get(PARAM.title) ?? '',
    description: params.get(PARAM.description) ?? '',
    reason: params.get(PARAM.reason) ?? '',
    budgetLineItemId: params.get(PARAM.budgetLine),
    subcontractId: params.get(PARAM.subcontract),
  }
}
