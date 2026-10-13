import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import type { ActorPerms } from '@/lib/server-permissions'
import { updateMaterialPurchase } from '@/lib/writes/material-purchase'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The receipt, and whether it sits on one of the caller's company's OWN jobs.
 * The permission check alone does not ask that - a sub's own admin holds
 * `materials: edit` in their company - so without it any account holding an id
 * could edit or delete a GC's receipt. 403, not 404: the job is real.
 */
async function ownedReceipt(db: ReturnType<typeof admin>, actor: ActorPerms, id: string) {
  const { data: row, error } = await db.from('material_purchases').select('id, project_id').eq('id', id).maybeSingle()
  if (error) return { denied: NextResponse.json({ error: 'Could not load that receipt.' }, { status: 500 }) }
  if (!row) return { denied: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  const owned = await ownedProject(db, actor, (row as any).project_id, 'id')
  if ('denied' in owned) return owned
  return { projectId: (row as any).project_id as string }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'materials', 'edit')
  if (denied(gate)) return gate.denied

  const found = await ownedReceipt(db, gate.actor, params.id)
  if ('denied' in found) return found.denied

  const body = await request.json()
  // Moving it to another job: that job has to be ours too.
  if (body.project_id && body.project_id !== found.projectId) {
    const target = await ownedProject(db, gate.actor, String(body.project_id), 'id')
    if ('denied' in target) return target.denied
  }

  const result = await updateMaterialPurchase(db, { userId: gate.actor.userId, id: params.id, projectId: found.projectId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'materials', 'edit')
  if (denied(gate)) return gate.denied

  const found = await ownedReceipt(db, gate.actor, params.id)
  if ('denied' in found) return found.denied

  const { error } = await db.from('material_purchases').delete().eq('id', params.id).eq('project_id', found.projectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
