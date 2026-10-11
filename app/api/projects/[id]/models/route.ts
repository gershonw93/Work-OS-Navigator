import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelNameProblem } from '@/lib/site-models'
import { MODEL_COLUMNS } from '@/lib/site-models-read'
import { assignablePeople } from '@/lib/model-assignee-db'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A group's house models, each with its plans and items, plus the budget
 * templates a model can point at. The houses (and which model each is) come
 * from /children, which the Jobs screen already reads.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id, is_site')
  if ('denied' in owned) return owned.denied

  const { data: models, error } = await db.from('site_models').select(MODEL_COLUMNS).eq('site_id', params.id).order('created_at')
  if (error) {
    console.error('[models] read failed', error.message)
    return NextResponse.json({ error: 'Could not load the models.' }, { status: 500 })
  }
  const ids = (models ?? []).map(m => m.id)
  const [plans, items, templates] = await Promise.all([
    ids.length ? db.from('site_model_plans').select('id, model_id, name, plan_type, handing, created_at').in('model_id', ids).order('created_at') : Promise.resolve({ data: [], error: null }),
    ids.length ? db.from('site_model_items').select('id, model_id, kind, title, sort_order, assignee_profile_id, assignee_company_id, assignee_name').in('model_id', ids).order('sort_order').order('created_at') : Promise.resolve({ data: [], error: null }),
    gate.actor.companyId
      ? db.from('budget_templates').select('id, name').eq('company_id', gate.actor.companyId).order('name')
      : Promise.resolve({ data: [], error: null }),
  ])
  for (const r of [plans, items]) if (r.error) {
    console.error('[models] read failed', r.error.message)
    return NextResponse.json({ error: 'Could not load the models.' }, { status: 500 })
  }
  // Who a punch item can go to. A failed read is said, not served as an empty
  // dropdown - "nobody" and "could not ask" are different facts.
  let people: Awaited<ReturnType<typeof assignablePeople>> | null = null
  if (gate.actor.companyId) {
    try { people = await assignablePeople(db, gate.actor.companyId) } catch (e: any) { console.error('[models] people read failed', e?.message) }
  }
  return NextResponse.json({
    models: (models ?? []).map(m => ({
      ...m,
      plans: (plans.data ?? []).filter((p: any) => p.model_id === m.id),
      items: (items.data ?? []).filter((i: any) => i.model_id === m.id),
    })),
    templates: templates.data ?? [],
    people,
  })
}

/** Add a model to the group. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<{ id: string; is_site: boolean }>(db, gate.actor, params.id, 'id, is_site')
  if ('denied' in owned) return owned.denied
  if (!owned.project.is_site) return NextResponse.json({ error: 'Models belong to a development, not a single job.' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { data: existing } = await db.from('site_models').select('name').eq('site_id', params.id)
  const problem = modelNameProblem(body?.name, (existing ?? []).map(e => e.name))
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data, error } = await db.from('site_models').insert({
    site_id: params.id,
    name: String(body.name).replace(/\s+/g, ' ').trim(),
    budget_template_id: body.budget_template_id || null,
    created_by: gate.actor.userId,
  }).select(MODEL_COLUMNS).single()
  if (error) {
    console.error('[models] insert failed', error.message)
    return NextResponse.json({ error: error.code === '23505' ? 'There is already a model with that name.' : 'Could not save the model.' }, { status: 500 })
  }
  return NextResponse.json({ model: { ...data, plans: [], items: [] } }, { status: 201 })
}
