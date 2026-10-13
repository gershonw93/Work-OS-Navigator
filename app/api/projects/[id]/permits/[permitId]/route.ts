import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { updatePermit } from '@/lib/writes/permit'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Both handlers used to ask only "is somebody signed in", so anybody holding a
// project id - a worker, a vendor, a sub's admin - could rewrite or destroy a
// GC's permit. Gated on `permits: edit` and on the job being the caller's own.

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; permitId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json()
  // Everything after the gate is `updatePermit` - the whitelist and
  // `permitProblem(after)` against the row as it will be - which Claude's MCP
  // server calls too.
  const result = await updatePermit(db, { userId: gate.actor.userId, projectId: params.id, permitId: params.permitId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; permitId: string } },
) {
  // `edit`, not `delete`, the same as voiding an inspection: Office Staff hold
  // permits VE and remove a mistaken permit today, and no role should lose that.
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { error } = await db
    .from('permits')
    .delete()
    .eq('id', params.permitId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
