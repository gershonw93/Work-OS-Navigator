import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { updateSubmittal } from '@/lib/writes/submittal'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; submittalId: string } },
) {
  const db = admin()
  // Was: any signed-in account, on any job. Submittals are the GC's record of
  // what was submitted for review - only the GC's Submittals tab calls these
  // routes (a sub's job page never does), so the job must be the caller's
  // company's own as well as the permission held.
  const gate = await requirePermission(db, request, 'submittals', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const user = { id: gate.actor.userId }

  const body = await request.json().catch(() => ({}))
  // Everything after the gate lives in lib/writes/submittal.ts, shared with the
  // MCP server (Claude): the same two fields and the same status set.
  const result = await updateSubmittal(db, { userId: user.id, projectId: params.id, submittalId: params.submittalId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; submittalId: string } },
) {
  const db = admin()
  // `edit`, not `delete`: Office Staff hold submittals view+edit and the tab has
  // always let them remove one - same reasoning as the inspections delete.
  const gate = await requirePermission(db, request, 'submittals', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { error } = await db
    .from('submittals')
    .delete()
    .eq('id', params.submittalId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
