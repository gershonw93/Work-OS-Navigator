import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; planId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'edit')
  if (denied(gate)) return gate.denied
  // THE PLAN SET IS THE GC'S. A sub's own company admin holds plans:delete in
  // THEIR company, which said nothing about this job's drawings.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if ('folder_id' in body) updates.folder_id = body.folder_id ?? null
  if ('name' in body) updates.name = body.name
  if ('plan_type' in body) updates.plan_type = body.plan_type

  const { error } = await db
    .from('project_plans')
    .update(updates)
    .eq('id', params.planId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; planId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'delete')
  if (denied(gate)) return gate.denied
  // THE PLAN SET IS THE GC'S. A sub's own company admin holds plans:delete in
  // THEIR company, which said nothing about this job's drawings.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  // Read the path first: the row is the only thing that knows where the file is.
  const { data: plan } = await db.from('project_plans').select('storage_path')
    .eq('id', params.planId).eq('project_id', params.id).maybeSingle()

  const { error } = await db
    .from('project_plans')
    .delete()
    .eq('id', params.planId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // REPLACE IS NOT REMOVE, AND NEITHER IS A ROW DELETE. The file is behind a
  // URL signed for ten years; deleting only the row left the drawing
  // reachable by anybody holding that link, for a decade. After the row, so a
  // failed delete never strands a row pointing at nothing.
  const path = (plan as { storage_path?: string | null } | null)?.storage_path
  if (path) {
    const { error: rm } = await db.storage.from('plans').remove([path])
    if (rm) console.error('[plans DELETE] row deleted, file not removed', { path, error: rm.message })
  }
  return NextResponse.json({ success: true })
}
