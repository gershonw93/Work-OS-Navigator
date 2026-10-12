import type { SupabaseClient } from '@supabase/supabase-js'
import type { HouseHas, HouseLike, ModelItem, ModelPlan, TemplateLine } from './site-models'

// The reads behind the model screens and the apply. Server-only; the rules
// that use them are pure, in lib/site-models.ts.

export const MODEL_COLUMNS = 'id, site_id, name, budget_template_id, created_at'

/** A model, only if it belongs to this site - an id from a body proves nothing. */
export async function modelOnSite(db: SupabaseClient, siteId: string, modelId: string) {
  const { data } = await db.from('site_models').select(MODEL_COLUMNS).eq('id', modelId).eq('site_id', siteId).maybeSingle()
  return (data as { id: string; site_id: string; name: string; budget_template_id: string | null } | null) ?? null
}

/** The houses in a group. A refused read throws: an empty group is a claim. */
export async function siteHouses(db: SupabaseClient, siteId: string): Promise<(HouseLike & { lot: string | null })[]> {
  const { data, error } = await db.from('projects')
    .select('id, name, model_id, garage_side, lot')
    .eq('parent_project_id', siteId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`reading the houses: ${error.message}`)
  return (data ?? []) as any
}

/** Everything a model carries. */
export async function modelBundle(db: SupabaseClient, model: { id: string; budget_template_id: string | null }) {
  const [plans, items, lines] = await Promise.all([
    db.from('site_model_plans').select('id, name, plan_type, handing, storage_path').eq('model_id', model.id).order('created_at'),
    db.from('site_model_items').select('id, kind, title, sort_order, assignee_profile_id, assignee_company_id, assignee_name').eq('model_id', model.id).order('sort_order').order('created_at'),
    model.budget_template_id
      ? db.from('budget_template_items').select('id, category, cost_code, description, default_amount, cost_type, sort_order').eq('template_id', model.budget_template_id).order('sort_order')
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [plans, items, lines]) if (r.error) throw new Error(`reading the model: ${r.error.message}`)
  return {
    plans: (plans.data ?? []) as ModelPlan[],
    items: (items.data ?? []) as ModelItem[],
    templateLines: (lines.data ?? []) as TemplateLine[],
  }
}

/** What each house already holds, by source, in four reads for any number of houses. */
export async function housesHave(db: SupabaseClient, houseIds: string[]): Promise<Record<string, HouseHas>> {
  const out: Record<string, HouseHas> = {}
  for (const id of houseIds) out[id] = { planSources: [], taskSources: [], inspectionTypes: [], budgetDescriptions: [], budgetLines: [] }
  if (!houseIds.length) return out
  const [plans, tasks, insp, lines] = await Promise.all([
    db.from('project_plans').select('project_id, source_model_plan_id').in('project_id', houseIds).not('source_model_plan_id', 'is', null),
    db.from('project_tasks').select('project_id, source_model_item_id').in('project_id', houseIds).not('source_model_item_id', 'is', null),
    db.from('project_required_inspections').select('project_id, type').in('project_id', houseIds),
    db.from('budget_line_items').select('id, project_id, description, budgeted_amount, source_template_item_id, source_amount').in('project_id', houseIds),
  ])
  // A failed read here would make every house look empty and the apply would
  // write a second copy of everything. Refuse instead.
  for (const r of [plans, tasks, insp, lines]) if (r.error) throw new Error(`reading what the houses hold: ${r.error.message}`)
  for (const r of (plans.data ?? []) as any[]) out[r.project_id]?.planSources.push(r.source_model_plan_id)
  for (const r of (tasks.data ?? []) as any[]) out[r.project_id]?.taskSources.push(r.source_model_item_id)
  for (const r of (insp.data ?? []) as any[]) out[r.project_id]?.inspectionTypes.push(r.type)
  for (const r of (lines.data ?? []) as any[]) {
    out[r.project_id]?.budgetDescriptions.push(r.description)
    out[r.project_id]?.budgetLines?.push({
      id: r.id, description: r.description, budgeted_amount: r.budgeted_amount,
      source_template_item_id: r.source_template_item_id, source_amount: r.source_amount,
    })
  }
  return out
}
