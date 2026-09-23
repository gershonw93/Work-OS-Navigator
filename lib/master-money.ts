// ─────────────────────────────────────────────────────────────────────────────
// What Master Money's numbers MEAN, in one place.
//
// "Escrow -$33,879" in red, with nothing beside it, was reported as a number
// nobody could read: is the job short? is it a bug? The sentence below is
// written from the arithmetic in app/api/master/money/route.ts, not from what
// escrow usually means, and lib/__tests__/master-money.ts reads that route and
// fails if the formula stops matching the words.
//
//   escrow = client payments received
//          - vendor payments made out of escrow
//          - your fee on vendor bills that are approved, sent or paid
//
// A vendor bill with a split (client_paid / escrow_paid) counts its escrow
// half; one marked paid with no split counts in full, as the project's own
// Billing the client tab does.
// ─────────────────────────────────────────────────────────────────────────────

export interface MoneyRow {
  budgeted: number
  committed: number
  billed: number
  paid: number
  outstanding: number
  received: number
  escrow: number
}

export const ESCROW_EXPLAINED =
  'Escrow here is the client money you are holding: what the client has paid you, '
  + 'minus what you have paid vendors out of escrow, minus your fee on vendor bills '
  + 'that are approved, sent or paid.\n\n'
  + 'A bill marked paid with no split counts as paid from escrow in full. '
  + 'Money the client paid a vendor directly does not touch it.\n\n'
  + 'Below zero means more has gone out - vendor payments plus your fee - than the '
  + 'client has paid in. You are carrying the difference until the client pays more.'

/** The plain sentence under a negative escrow total, or null when there is nothing to explain. */
export function escrowSentence(escrow: number, money: (n: number) => string): string | null {
  if (!(escrow < 0)) return null
  return `Escrow is below zero: ${money(-escrow)} more has gone out to vendors and your fee than the client has paid in.`
}

/**
 * A project with no money on it at all - nothing budgeted, committed, billed,
 * paid or received. On a phone these fold into one row, because six zeros per
 * job is a screen of nothing to scroll past before the jobs that have money.
 * Every field, not just the headline three: a job with a budget and no
 * payments yet is a job with money on it.
 */
export function hasNoMoney(r: MoneyRow): boolean {
  return [r.budgeted, r.committed, r.billed, r.paid, r.outstanding, r.received, r.escrow]
    .every(v => !Number(v))
}
