// ─────────────────────────────────────────────────────────────────────────────
// What "Committed" means. Once, for the whole app.
//
// THE BUG. Three screens showed a figure called Committed and disagreed:
// Budget said $776,621, Summary and Master Money said $534,101, and each was
// defensible on its own. They were counting different things:
//
//   Budget        = subcontracts LINKED to a budget line
//                 + committed typed on lines with no subcontract
//   Master Money  = every subcontract, linked or not
//
// So neither number contained the other. Budget added money committed outside
// a contract - a materials order, an equipment hire, a supplier - typed
// straight onto a line. Master Money added contracts nobody had tied to a
// budget line. Each screen was missing a different half.
//
// A builder who opens two screens and sees a $240,000 gap stops trusting both,
// and then stops trusting the rest of the numbers too. That is the actual cost,
// and it is why the fix is one derivation rather than three careful ones.
//
// THE DEFINITION, chosen deliberately: everything you have promised to pay,
// counted once. Every subcontract, plus the commitments that never became a
// subcontract. A line LINKED to a contract contributes nothing of its own -
// its contract is already counted, and adding both is the double count this
// exists to prevent.
//
// Note on statuses: subcontracts are only ever written as 'active' and never
// moved, so there is nothing stale to exclude. Approved change orders are
// already folded into `subcontracts.contract_amount` by the change-order route,
// so they are included here without any special handling. If either of those
// ever stops being true, this is the function that has to learn about it.
// ─────────────────────────────────────────────────────────────────────────────

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

export interface CommittedSubcontract {
  id: string
  contract_amount?: unknown
}

export interface CommittedLine {
  /** Set when this line is tied to a subcontract. */
  subcontract_id?: string | null
  committed_amount?: unknown
}

export interface CommittedTotal {
  /** The one number every screen shows. */
  total: number
  /** From signed subcontracts. */
  fromSubcontracts: number
  /** Promised on a budget line with no contract behind it. */
  fromLines: number
  /**
   * How much of `fromSubcontracts` belongs to contracts no budget line points
   * at. Not a separate part of the total - it is already inside it - but worth
   * having, because it is the money the Budget screen used to lose.
   */
  subcontractsWithNoBudgetLine: number
}

export function committedTotal(input: {
  subcontracts: CommittedSubcontract[]
  lines: CommittedLine[]
}): CommittedTotal {
  const { subcontracts = [], lines = [] } = input

  const linkedSubIds = new Set(
    lines.map(l => l.subcontract_id).filter((id): id is string => !!id),
  )

  let fromSubcontracts = 0
  let subcontractsWithNoBudgetLine = 0
  for (const sub of subcontracts) {
    const amount = n(sub.contract_amount)
    fromSubcontracts += amount
    if (!linkedSubIds.has(sub.id)) subcontractsWithNoBudgetLine += amount
  }

  // Only unlinked lines. A linked line's committed_amount is its contract's
  // amount, already counted above.
  let fromLines = 0
  for (const line of lines) {
    if (line.subcontract_id) continue
    fromLines += n(line.committed_amount)
  }

  return {
    total: fromSubcontracts + fromLines,
    fromSubcontracts,
    fromLines,
    subcontractsWithNoBudgetLine,
  }
}
