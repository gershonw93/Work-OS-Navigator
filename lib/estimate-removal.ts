// ─────────────────────────────────────────────────────────────────────────────
// Can this uploaded estimate be taken off the job - and if not, WHY NOT.
//
// THE REPORT. "Uploaded a appliance quote by finance. How do I remove it."
// They couldn't. Finance -> Estimate took the file, AI-scanned it into line
// items, and from then on offered exactly one control: Replace. The route had
// `GET`, `POST` and `PATCH` and no `DELETE`; `projects.quote_file_url` was
// written in one place and cleared in none. A wrong upload was permanent, and
// the lines it produced feed Budget and Progress.
//
// WHY REMOVAL NEEDS A GUARD AT ALL. A quote-derived row is an ordinary
// `budget_line_items` row, and six tables point at those. Five are
// `ON DELETE SET NULL` - tasks, materials, pay-app lines, selections and
// client-invoice lines survive and merely lose their link, which is
// recoverable by re-linking. `invoice_allocations` is `ON DELETE CASCADE`
// (migration 077), so deleting a line takes the allocations with it: money off
// a sub's bill that somebody mapped to that line, gone, with nothing left to
// say it was ever there.
//
// That is the same fault as the Budget page silently dropping an unlinked
// change order - money that reached nothing and was never named. A removal
// that quietly unmaps money is worse than no removal, so this refuses and says
// which line is holding it up.
// ─────────────────────────────────────────────────────────────────────────────

/** The category the scan stamps on every row it writes. See the quote route. */
export const QUOTE_CATEGORY = 'Quote'

export interface EstimateLine {
  description: string | null
  category: string | null
  committed_amount: number | null
  actual_amount: number | null
  /** Rows in `invoice_allocations` pointing at this line. CASCADE - see above. */
  allocation_count?: number | null
}

/** Only the rows the scan wrote. A hand-added budget line is not the estimate's. */
export function quoteLines(lines: EstimateLine[]): EstimateLine[] {
  return lines.filter(l => l.category === QUOTE_CATEGORY)
}

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

const name = (l: EstimateLine) => l.description?.trim() || 'A line'

/**
 * `null` when the estimate can be removed; otherwise the sentence to show.
 *
 * ORDER IS DELIBERATE. Allocations come first because they are the only one
 * that is destroyed rather than merely detached - the other two live on the row
 * being removed, so they go WITH the thing the user asked to remove, which is
 * what they asked for. An allocation belongs to somebody else's bill.
 *
 * The sentence names the line and the amount, because "this estimate cannot be
 * removed" tells nobody which of forty rows to go and unpick.
 */
export function estimateRemovalProblem(lines: EstimateLine[]): string | null {
  const mine = quoteLines(lines)

  const allocated = mine.find(l => (l.allocation_count ?? 0) > 0)
  if (allocated) {
    return `"${name(allocated)}" has a bill allocated against it. Removing the estimate would `
      + `delete that allocation along with the line. Re-point it to another budget line first, `
      + `then remove the estimate.`
  }

  const spent = mine.find(l => Number(l.actual_amount ?? 0) > 0)
  if (spent) {
    return `"${name(spent)}" has ${money(Number(spent.actual_amount))} of actual cost recorded `
      + `against it. Move that to another budget line before removing the estimate, or it goes `
      + `with it.`
  }

  const committed = mine.find(l => Number(l.committed_amount ?? 0) > 0)
  if (committed) {
    return `"${name(committed)}" has ${money(Number(committed.committed_amount))} committed `
      + `against it. Move that to another budget line before removing the estimate, or it goes `
      + `with it.`
  }

  return null
}

/** What the confirmation says is about to happen. Counted, not hand-waved. */
export function estimateRemovalSummary(lines: EstimateLine[], hasSchedule: boolean): string {
  const n = quoteLines(lines).length
  const parts = ['the uploaded file']
  if (n) parts.push(`${n} line item${n === 1 ? '' : 's'}`)
  if (hasSchedule) parts.push('the payment schedule')
  const last = parts.pop()
  return parts.length ? `${parts.join(', ')} and ${last}` : last!
}
