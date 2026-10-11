import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelOnSite } from '@/lib/site-models-read'
import { HANDINGS, type Handing } from '@/lib/site-models'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PLAN_TYPES = ['architectural', 'structural', 'mep', 'civil', 'landscape', 'other']
type Ctx = { params: { id: string; modelId: string } }

/** Record an uploaded plan file against the model. The path must be this model's own. */
export async function POST(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const path = String(body?.storage_path ?? '')
  // The path comes back from the browser, so it is checked rather than trusted:
  // a path under another model would hand this one somebody else's drawing.
  if (!path.startsWith(`models/${model.id}/`)) return NextResponse.json({ error: 'That upload does not belong to this model.' }, { status: 400 })
  const name = String(body?.name ?? '').trim() || 'Plan'
  const handing: Handing = HANDINGS.includes(body?.handing) ? body.handing : 'any'
  const plan_type = PLAN_TYPES.includes(body?.plan_type) ? body.plan_type : 'architectural'
  const { data, error } = await db.from('site_model_plans')
    .insert({ model_id: model.id, name: name.slice(0, 200), plan_type, handing, storage_path: path })
    .select('id, name, plan_type, handing, created_at').single()
  if (error) {
    console.error('[models/plans] insert failed', error.message)
    await db.storage.from('plans').remove([path])
    return NextResponse.json({ error: 'Could not save the plan.' }, { status: 500 })
  }
  return NextResponse.json({ plan: data }, { status: 201 })
}

/** Take a plan off the model, and its file with it. Copies on houses stay - they are each house's own file. */
export async function DELETE(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })
  const planId = new URL(request.url).searchParams.get('plan')
  const { data: plan } = await db.from('site_model_plans').select('id, storage_path').eq('id', planId ?? '').eq('model_id', model.id).maybeSingle()
  if (!plan) return NextResponse.json({ error: 'That plan is not on this model.' }, { status: 404 })
  const { error } = await db.from('site_model_plans').delete().eq('id', plan.id)
  if (error) {
    console.error('[models/plans] delete failed', error.message)
    return NextResponse.json({ error: 'Could not remove the plan.' }, { status: 500 })
  }
  const { error: rm } = await db.storage.from('plans').remove([plan.storage_path])
  if (rm) console.error('[models/plans] could not remove the file', rm.message)
  return NextResponse.json({ ok: true })
}
