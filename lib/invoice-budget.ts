// ─────────────────────────────────────────────────────────────────────────────
// Where a sub's invoice lands on the budget.
//
// An invoice does NOT carry a budget line of its own. It attaches to a
// subcontract, and the budget line linked to that subcontract is where the
// money lands. That indirection is deliberate - the contract is the agreement,
// the budget line is where the agreement is tracked, and one contract belongs
// to one line. There is no per-invoice override: if an invoice is landing in
// the wrong place, the fix is to point the SUBCONTRACT at the right line on the
// Budget tab, which moves every invoice on it at once. Two invoices from one
// sub silently hitting two different lines is exactly the mess this prevents.
//
// The rollup below is the single source of truth for a line's Actual. The
// Budget tab and the Invoices tab both read it, so the "already billed" number
// on an invoice cannot drift from the one on the budget sheet.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An invoice counts against the budget once it has been accepted - not while it
 * is still sitting in someone's approval queue. Approving is the moment the
 * money becomes real, which is why 'approved' is in here and not just 'paid'.
 */
export const ACTUAL_STATUSES = new Set(['approved', 'sent', 'paid'])

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return isFinite(x) ? x : 0
}

export interface RollupLine {
  id: string
  subcontract_id?: string | null
  budgeted_amount?: unknown
  committed_amount?: unknown
  actual_amount?: unknown
  [k: string]: unknown
}

export interface RollupInvoice {
  subcontract_id?: string | null
  amount?: unknown
  status?: string | null
}

export interface RollupMaterial {
  budget_line_id?: string | null
  amount?: unknown
}

export interface RollupSub {
  id: string
  trade?: string | null
  contract_amount?: unknown
  companies?: { name?: string | null } | null
}

export interface RolledLine extends RollupLine {
  committed_amount: number
  actual_amount: number
  materials_amount: number
  linked: boolean
  linked_label: string | null
}

/**
 * Fold accepted invoices and assigned material receipts into each budget line.
 *
 * A line linked to a subcontract takes its Committed from the contract amount
 * and its Actual from that sub's accepted invoices - the numbers typed into
 * those columns by hand are ignored, because the contract is the better answer.
 * An unlinked line keeps whatever was typed and just adds its receipts.
 */
export function rollupBudgetLines(input: {
  lines: RollupLine[]
  invoices: RollupInvoice[]
  materials: RollupMaterial[]
  subs: RollupSub[]
}): RolledLine[] {
  const { lines, invoices, materials, subs } = input

  const actualBySub = new Map<string, number>()
  for (const inv of invoices) {
    if (inv.subcontract_id && ACTUAL_STATUSES.has(String(inv.status))) {
      actualBySub.set(inv.subcontract_id, (actualBySub.get(inv.subcontract_id) ?? 0) + n(inv.amount))
    }
  }

  const materialsByLine = new Map<string, number>()
  for (const m of materials) {
    if (m.budget_line_id) materialsByLine.set(m.budget_line_id, (materialsByLine.get(m.budget_line_id) ?? 0) + n(m.amount))
  }

  const subById = new Map(subs.map(s => [s.id, s]))

  return lines.map(line => {
    const materials_amount = materialsByLine.get(line.id) ?? 0
    const sub = line.subcontract_id ? subById.get(line.subcontract_id) : undefined
    if (sub) {
      return {
        ...line,
        committed_amount: n(sub.contract_amount),
        actual_amount: (actualBySub.get(line.subcontract_id!) ?? 0) + materials_amount,
        materials_amount,
        linked: true,
        linked_label: sub.companies?.name ?? sub.trade ?? 'Subcontract',
      }
    }
    return {
      ...line,
      committed_amount: n(line.committed_amount),
      actual_amount: n(line.actual_amount) + materials_amount,
      materials_amount,
      linked: false,
      linked_label: null,
    }
  })
}

/** What an invoice screen needs to say about the line the money is going to. */
export interface BudgetDestination {
  id: string
  cost_code: string | null
  category: string
  description: string
  budgeted_amount: number
  /** Accepted invoices + receipts already against this line. */
  billed_amount: number
  /** Budget less what has already landed. Negative once the line is blown. */
  remaining: number
}

/** Index the destinations by subcontract, which is how an invoice finds one. */
export function destinationsBySubcontract(rolled: RolledLine[]): Map<string, BudgetDestination> {
  const out = new Map<string, BudgetDestination>()
  for (const line of rolled) {
    // `linked`, not just a non-null subcontract_id. A line pointing at a
    // subcontract that isn't there would otherwise advertise itself as a
    // destination while the Budget tab treats it as unlinked and never rolls
    // invoices into its Actual - the two screens saying different things about
    // the same money is the whole thing this file exists to stop.
    if (!line.linked || !line.subcontract_id) continue
    const budgeted = n(line.budgeted_amount)
    // A sub pointed at two lines shouldn't happen, but if it does, the first
    // one wins rather than the last - stable, and it matches the budget sheet's
    // own ordering.
    if (out.has(line.subcontract_id)) continue
    out.set(line.subcontract_id, {
      id: line.id,
      cost_code: (line.cost_code as string) ?? null,
      category: String(line.category ?? 'General'),
      description: String(line.description ?? ''),
      budgeted_amount: budgeted,
      billed_amount: line.actual_amount,
      remaining: budgeted - line.actual_amount,
    })
  }
  return out
}

/** "06 · Framing - Rough carpentry", skipping the bits that aren't filled in. */
export function destinationLabel(d: BudgetDestination): string {
  const head = [d.cost_code, d.category].filter(Boolean).join(' · ')
  return [head, d.description].filter(Boolean).join(' - ')
}
