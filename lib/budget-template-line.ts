// ─────────────────────────────────────────────────────────────────────────────
// A budget template's lines, edited one at a time.
//
// "you can't just add the line with its amount - it's not an option". The
// Budget Templates page could upload a sheet, list it and delete it, and that
// was all: a template was frozen the moment it was made, while the model
// editor beside it said "fill the amounts in on the Budget Templates page" -
// a control that led to nothing. So a line can be added, changed and removed
// now, and these are the rules the form AND the route ask.
//
// Pure. The routes read and write; this decides.
// ─────────────────────────────────────────────────────────────────────────────

import { budgetAmount } from './validate'

export type CostType = 'hard' | 'soft'

export interface TemplateLineInput {
  description: string
  category: string
  cost_code: string | null
  /** Null is "no amount yet" - a line can be a placeholder. */
  default_amount: number | null
  cost_type: CostType
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

/** A line off a request body, cleaned - or why it cannot be saved. Asked by the form AND the route. */
export function cleanTemplateLine(body: Record<string, unknown>): { ok: true; value: TemplateLineInput } | { ok: false; error: string } {
  const description = text(body.description, 200)
  if (!description) return { ok: false, error: 'Give the line a description, e.g. "Framing labor".' }
  let default_amount: number | null = null
  if (body.default_amount !== '' && body.default_amount !== null && body.default_amount !== undefined) {
    const checked = budgetAmount(body.default_amount, 'amount')
    if (!checked.ok) return { ok: false, error: checked.error ?? 'Enter the amount as a number, e.g. 12500.' }
    default_amount = checked.value
  }
  return {
    ok: true,
    value: {
      description,
      category: text(body.category, 80) || 'General',
      cost_code: text(body.cost_code, 40) || null,
      default_amount,
      cost_type: body.cost_type === 'soft' ? 'soft' : 'hard',
    },
  }
}

/** Why a template name cannot be used, or null. */
export function templateNameProblem(name: unknown): string | null {
  const s = text(name, 200)
  if (!s) return 'Give the template a name.'
  if (s.length > 120) return 'Keep the template name under 120 characters.'
  return null
}

// ── a house's line following its template ───────────────────────────────────
//
// Applying a model COPIES its budget onto each house, and a copy cannot know
// the template moved later. Overwriting every house to match would undo a
// figure somebody changed on purpose on lot 12. So each copied line keeps the
// template line it came from and the amount it was copied at
// (`source_template_item_id`, `source_amount`, migration 138):
//
//   * amount on the house  != amount it was copied at  -> changed by hand: LEFT ALONE
//   * template amount      != amount it was copied at  -> the template moved: UPDATE
//   * no copied-at amount (a line from before tracking whose figure did not
//     match the template then)                         -> cannot tell: LEFT ALONE
//
// Compared in CENTS, because these are NUMERIC and come back as strings.

const cents = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

export interface HouseBudgetLine {
  id: string
  description: string
  /** NUMERIC - a string off the wire. */
  budgeted_amount: number | string | null
  source_template_item_id: string | null
  source_amount: number | string | null
}

export interface AmountUpdate { lineId: string; itemId: string; description: string; from: number; to: number }
export interface AmountKept { description: string; house: number; template: number; why: 'changed_here' | 'untracked' }

/** What following the template would do to one house line, or null for nothing to say. */
export function amountChange(
  line: HouseBudgetLine, item: { id: string; default_amount: number | string | null },
): { update: AmountUpdate } | { kept: AmountKept } | null {
  const now = cents(line.budgeted_amount) ?? 0
  const copied = cents(line.source_amount)
  const target = cents(item.default_amount) ?? 0
  if (target === now && (copied === null || copied === now)) return null
  if (copied === null) return { kept: { description: line.description, house: now / 100, template: target / 100, why: 'untracked' } }
  if (now !== copied) {
    // Changed here - and only worth saying when the template now disagrees too.
    return target === now ? null : { kept: { description: line.description, house: now / 100, template: target / 100, why: 'changed_here' } }
  }
  if (target === copied) return null
  return { update: { lineId: line.id, itemId: item.id, description: line.description, from: copied / 100, to: target / 100 } }
}

/** Every update and every line left alone, for one house. */
export function amountChanges(
  lines: readonly HouseBudgetLine[], items: readonly { id: string; default_amount: number | string | null }[],
): { updates: AmountUpdate[]; kept: AmountKept[] } {
  const byId = new Map(items.map(i => [i.id, i]))
  const updates: AmountUpdate[] = [], kept: AmountKept[] = []
  for (const l of lines) {
    const item = l.source_template_item_id ? byId.get(l.source_template_item_id) : undefined
    if (!item) continue
    const c = amountChange(l, item)
    if (!c) continue
    if ('update' in c) updates.push(c.update)
    else kept.push(c.kept)
  }
  return { updates, kept }
}

export const KEPT_WHY: Record<AmountKept['why'], string> = {
  changed_here: 'changed on this house',
  untracked: 'added before amounts were tracked, so a change here cannot be told apart from the template',
}
