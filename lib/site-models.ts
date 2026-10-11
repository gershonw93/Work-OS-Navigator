// ─────────────────────────────────────────────────────────────────────────────
// House models, and what applying one to a house would add.
//
// "I have 30 houses being built, all within three different models - upload
// plans and select which of the 30 get this plan, so I don't go into each one.
// Same with budget sheets, punch list, checklist items."
//
// A model holds: a budget template, plan sets (for either garage side, or for
// left or right only), required inspections and punch items. APPLYING COPIES
// them into each chosen house. Copies, not links: a house drifts (a change
// order on lot 12, pins on a plan tied to that house's own tasks), and a plan
// file shared by thirty jobs would vanish from all thirty when one deletes it.
//
// EVERY COPY REMEMBERS ITS SOURCE, so applying again adds only what is missing
// and never a second copy. Asked for explicitly: when a model changes later,
// "ask and I'll select" - the preview below IS that question, and the apply
// runs the SAME function over the houses the person ticked, so what was shown
// and what happens cannot drift (the shape of the schedule cascade's plan()).
//
// Pure. The routes read the rows; this decides.
// ─────────────────────────────────────────────────────────────────────────────

import { foldType } from './inspection-types'

export type Handing = 'any' | 'left' | 'right'
export const HANDINGS: Handing[] = ['any', 'left', 'right']
export const HANDING_LABEL: Record<Handing, string> = {
  any: 'Either garage side',
  left: 'Garage left',
  right: 'Garage right',
}

export type ApplyPart = 'plans' | 'budget' | 'inspections' | 'punch'
export const APPLY_PARTS: ApplyPart[] = ['plans', 'budget', 'inspections', 'punch']
export const PART_LABEL: Record<ApplyPart, string> = {
  plans: 'Plans',
  budget: 'Budget lines',
  inspections: 'Required inspections',
  punch: 'Punch items',
}

export interface ModelPlan { id: string; name: string; plan_type: string; handing: Handing; storage_path: string }
export interface ModelItem { id: string; kind: 'inspection' | 'punch'; title: string; sort_order?: number | null }
export interface TemplateLine {
  id: string; category: string | null; cost_code: string | null; description: string
  /** NUMERIC - a string off the wire. */
  default_amount: number | string | null
  cost_type?: string | null; sort_order?: number | null
}
export interface HouseLike { id: string; name: string; model_id: string | null; garage_side: 'left' | 'right' | null }

/** What a house already holds, by source - read once per house. */
export interface HouseHas {
  planSources: string[]
  taskSources: string[]
  inspectionTypes: string[]
  budgetDescriptions: string[]
}

export interface HouseApply {
  houseId: string
  houseName: string
  /** On this model, or another one (which applying to it is allowed but said). */
  onModel: boolean
  plans: ModelPlan[]
  /** Plans this house cannot take, with why - never dropped silently. */
  plansSkipped: { plan: ModelPlan; why: string }[]
  budget: TemplateLine[]
  inspections: string[]
  punch: ModelItem[]
}

/** Case, spacing and punctuation do not make a different budget line. */
export const foldLine = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Which of the model's plans fit this house, and why the rest do not. */
export function plansFor(house: Pick<HouseLike, 'garage_side'>, plans: readonly ModelPlan[]): { fit: ModelPlan[]; skipped: { plan: ModelPlan; why: string }[] } {
  const fit: ModelPlan[] = [], skipped: { plan: ModelPlan; why: string }[] = []
  for (const p of plans) {
    if (p.handing === 'any') fit.push(p)
    else if (!house.garage_side) skipped.push({ plan: p, why: `the garage side is not set on this house, so it is not known whether it takes the ${p.handing} set` })
    else if (house.garage_side === p.handing) fit.push(p)
    // The OTHER side's set is not a skip worth reporting - it is the point.
  }
  return { fit, skipped }
}

/**
 * What applying this model would add to each house. The preview shows it; the
 * apply runs it again over the ticked houses and parts and writes exactly this.
 */
export function planApply(args: {
  modelId: string
  plans: readonly ModelPlan[]
  items: readonly ModelItem[]
  templateLines: readonly TemplateLine[]
  houses: readonly HouseLike[]
  has: Record<string, HouseHas>
}): HouseApply[] {
  const inspectionItems = args.items.filter(i => i.kind === 'inspection')
  const punchItems = args.items.filter(i => i.kind === 'punch')
  return args.houses.map(h => {
    const has = args.has[h.id] ?? { planSources: [], taskSources: [], inspectionTypes: [], budgetDescriptions: [] }
    const { fit, skipped } = plansFor(h, args.plans)
    const heldTypes = new Set(has.inspectionTypes.map(foldType))
    const heldLines = new Set(has.budgetDescriptions.map(foldLine))
    const seenLines = new Set<string>()
    return {
      houseId: h.id,
      houseName: h.name,
      onModel: h.model_id === args.modelId,
      plans: fit.filter(p => !has.planSources.includes(p.id)),
      plansSkipped: skipped,
      budget: args.templateLines.filter(l => {
        const k = foldLine(l.description)
        if (!k || heldLines.has(k) || seenLines.has(k)) return false
        seenLines.add(k)
        return true
      }),
      inspections: inspectionItems.map(i => i.title).filter(t => {
        const k = foldType(t)
        if (heldTypes.has(k)) return false
        heldTypes.add(k)
        return true
      }),
      punch: punchItems.filter(i => !has.taskSources.includes(i.id)),
    }
  })
}

/** "2 plans · 14 budget lines · 9 inspections", or null when there is nothing new. */
export function applySummary(a: HouseApply, parts: readonly ApplyPart[] = APPLY_PARTS): string | null {
  const bits: string[] = []
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  if (parts.includes('plans') && a.plans.length) bits.push(n(a.plans.length, 'plan', 'plans'))
  if (parts.includes('budget') && a.budget.length) bits.push(n(a.budget.length, 'budget line', 'budget lines'))
  if (parts.includes('inspections') && a.inspections.length) bits.push(n(a.inspections.length, 'inspection', 'inspections'))
  if (parts.includes('punch') && a.punch.length) bits.push(n(a.punch.length, 'punch item', 'punch items'))
  return bits.length ? bits.join(' · ') : null
}

/** Why a model name cannot be used, or null. Asked by the form AND the route. */
export function modelNameProblem(name: unknown, others: readonly string[] = []): string | null {
  const s = String(name ?? '').replace(/\s+/g, ' ').trim()
  if (!s) return 'Give the model a name, e.g. "The Aspen".'
  if (s.length > 80) return 'Keep the model name under 80 characters.'
  if (others.some(o => o.trim().toLowerCase() === s.toLowerCase())) return `There is already a model called ${s} in this group.`
  return null
}

/** Model names off a lot list, matched to existing models by name, case-blind. */
export function distinctModelNames(names: readonly (string | null | undefined)[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const n of names) {
    const s = String(n ?? '').replace(/\s+/g, ' ').trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
  }
  return out
}
