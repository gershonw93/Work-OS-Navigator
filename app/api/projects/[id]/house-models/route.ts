import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelOnSite } from '@/lib/site-models-read'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Say which model a set of houses is. Only houses in THIS group, and only a
 * model of this group - both ids arrive in a body, and a body proves nothing.
 * Assigning applies nothing by itself; Apply is its own step, with a preview.
 */
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  const houseIds: string[] = Array.isArray(body?.house_ids) ? body.house_ids.map(String).slice(0, 200) : []
  if (!houseIds.length) return NextResponse.json({ error: 'Pick at least one house.' }, { status: 400 })
  let modelId: string | null = null
  if (body?.model_id) {
    const model = await modelOnSite(db, params.id, String(body.model_id))
    if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 400 })
    modelId = model.id
  }
  const { data, error } = await db.from('projects').update({ model_id: modelId })
    .in('id', houseIds).eq('parent_project_id', params.id).select('id')
  if (error) {
    console.error('[house-models] update failed', error.message)
    return NextResponse.json({ error: 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ updated: (data ?? []).length })
}
