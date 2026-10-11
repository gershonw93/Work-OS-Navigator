import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelNameProblem } from '@/lib/site-models'
import { modelOnSite, MODEL_COLUMNS } from '@/lib/site-models-read'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Ctx = { params: { id: string; modelId: string } }

/** Rename a model, or point it at a different budget template. */
export async function PATCH(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const { data: others } = await db.from('site_models').select('name').eq('site_id', params.id).neq('id', model.id)
    const problem = modelNameProblem(body.name, (others ?? []).map(o => o.name))
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    updates.name = String(body.name).replace(/\s+/g, ' ').trim()
  }
  if (body.budget_template_id !== undefined) {
    if (body.budget_template_id) {
      // A template from another company is not this company's to copy.
      const { data: t } = await db.from('budget_templates').select('id').eq('id', body.budget_template_id).eq('company_id', gate.actor.companyId ?? '').maybeSingle()
      if (!t) return NextResponse.json({ error: 'That budget template was not found.' }, { status: 400 })
    }
    updates.budget_template_id = body.budget_template_id || null
  }
  const { data, error } = await db.from('site_models').update(updates).eq('id', model.id).select(MODEL_COLUMNS).single()
  if (error) {
    console.error('[models] update failed', error.message)
    return NextResponse.json({ error: 'Could not save the model.' }, { status: 500 })
  }
  return NextResponse.json({ model: data })
}

/**
 * Delete a model. What it already put on houses STAYS - those plans, lines and
 * punch items are each house's own now - and the houses are left unassigned.
 * The model's own plan files go, because nothing else points at them.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })

  const { data: plans } = await db.from('site_model_plans').select('storage_path').eq('model_id', model.id)
  const { error } = await db.from('site_models').delete().eq('id', model.id)
  if (error) {
    console.error('[models] delete failed', error.message)
    return NextResponse.json({ error: 'Could not delete the model.' }, { status: 500 })
  }
  const paths = (plans ?? []).map(p => p.storage_path).filter(Boolean)
  if (paths.length) {
    const { error: rm } = await db.storage.from('plans').remove(paths)
    if (rm) console.error('[models] could not remove plan files', rm.message)
  }
  return NextResponse.json({ ok: true })
}
