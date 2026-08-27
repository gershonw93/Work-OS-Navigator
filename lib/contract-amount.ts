// ─────────────────────────────────────────────────────────────────────────────
// "How much is this sub's contract?" - including when the answer is "nobody has
// said yet".
//
// `subcontracts.contract_amount` was NOT NULL, so adding a sub to a job without
// a number failed outright (migration 082 makes it nullable). Lining up who is
// doing the work and agreeing what they charge are two different moments, and
// the first one is exactly when you want them on the job so you can send them a
// scope to price.
//
// That makes NULL a state the whole app has to render, and there are two wrong
// ways to do it:
//
//   * `${sub.contract_amount.toLocaleString()}` throws on null - a blank screen
//     on a page that was working
//   * `$${Number(sub.contract_amount).toLocaleString()}` prints "$0", which is
//     a CLAIM. It reads as "this sub costs nothing", and it looks identical to
//     a real zero-dollar contract.
//
// So: `contractAmount()` for arithmetic, where an unknown contributes nothing
// and a total is unaffected, and `contractAmountLabel()` for anything a person
// reads, where an unknown says so.
// ─────────────────────────────────────────────────────────────────────────────

/** The number for maths. Unknown contributes nothing to a total. */
export function contractAmount(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** True when nobody has agreed a price yet - NOT the same as a $0 contract. */
export function isUnpriced(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

/**
 * The string a person reads. `$45,000`, or the placeholder when unpriced.
 *
 * A real $0 contract still prints `$0` - that is somebody's deliberate entry,
 * and it is not this function's job to second-guess it.
 */
export function contractAmountLabel(value: unknown, placeholder = 'Not set'): string {
  if (isUnpriced(value)) return placeholder
  const n = Number(value)
  if (!Number.isFinite(n)) return placeholder
  return `$${n.toLocaleString()}`
}
