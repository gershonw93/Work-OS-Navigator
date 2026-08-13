// ─────────────────────────────────────────────────────────────────────────────
// Cost-plus markup, per cost item.
//
// The way this is actually billed: the electrician invoices $35,000, you add
// your 15%, and the client owes $40,250. Item by item - not one percentage
// smeared across the job total at the end, which is what this used to be.
//
// Some items carry no markup at all: a permit fee, something the client paid
// direct, a pass-through you agreed at cost. Those need to be excluded
// individually, not compensated for by fiddling the rate for everything.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarkupSource {
  /** Own rate as a PERCENT (15 = 15%). null means follow the project rate. */
  markup_pct?: number | null
  /** Billed to the client at cost - no markup, whatever the rate says. */
  markup_excluded?: boolean | null
}

export interface MarkedUpItem {
  /** What it cost you. */
  cost: number
  /** The rate applied, as a percent. 0 when excluded. */
  pct: number
  /** cost × pct. */
  markup: number
  /** cost + markup - what the client is billed. */
  clientPrice: number
  /** true when this item is following the project rate rather than its own. */
  usingProjectRate: boolean
  excluded: boolean
}

const n = (v: unknown): number | null => {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim()) {
    const x = Number(v.replace(/[^0-9.\-]/g, ''))
    return isFinite(x) ? x : null
  }
  return null
}

const round2 = (v: number) => {
  const scaled = v * 100
  return Math.round(scaled + Math.sign(scaled) * 1e-9) / 100
}

/**
 * The rate in force for one item, as a percent.
 *
 * An explicit 0 is a real answer ("no markup on this one") and is NOT the same
 * as null ("whatever the project says"). Storing 0 to mean the latter would
 * silently stop the item following a later change to the project rate.
 */
export function effectivePct(item: MarkupSource, projectPct: number): number {
  if (item?.markup_excluded) return 0
  const own = n(item?.markup_pct)
  if (own != null) return Math.max(own, 0)
  return Math.max(projectPct, 0)
}

/** What to bill the client for one cost item. */
export function markUp(cost: unknown, item: MarkupSource, projectPct: number): MarkedUpItem {
  const base = n(cost) ?? 0
  const excluded = !!item?.markup_excluded
  const pct = effectivePct(item, projectPct)
  const markup = round2(base * (pct / 100))
  return {
    cost: base,
    pct,
    markup,
    clientPrice: round2(base + markup),
    usingProjectRate: !excluded && n(item?.markup_pct) == null,
    excluded,
  }
}

export interface MarkupTotals {
  /** What the job has cost so far. */
  cost: number
  /** Your fee on it. */
  markup: number
  /** What the client owes for it. */
  clientPrice: number
  /** Items billed at cost, and what they came to. */
  excludedCount: number
  excludedCost: number
  /** Items given a rate of their own rather than the project's. */
  customCount: number
}

/** Roll a set of cost items up into cost / fee / what to bill. */
export function markupTotals(
  items: (MarkupSource & { cost: unknown })[],
  projectPct: number,
): MarkupTotals {
  const t: MarkupTotals = {
    cost: 0, markup: 0, clientPrice: 0,
    excludedCount: 0, excludedCost: 0, customCount: 0,
  }
  for (const i of items) {
    const m = markUp(i.cost, i, projectPct)
    t.cost = round2(t.cost + m.cost)
    t.markup = round2(t.markup + m.markup)
    t.clientPrice = round2(t.clientPrice + m.clientPrice)
    if (m.excluded) { t.excludedCount++; t.excludedCost = round2(t.excludedCost + m.cost) }
    else if (!m.usingProjectRate) t.customCount++
  }
  return t
}

/** "15% · your rate" / "10% on this one" / "at cost - no markup" */
export function markupLabel(m: MarkedUpItem): string {
  if (m.excluded) return 'At cost - no markup'
  if (m.usingProjectRate) return `${m.pct}% · project rate`
  return `${m.pct}% on this one`
}
