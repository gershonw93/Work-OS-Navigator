import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { actorCan } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import { updateSelection } from '@/lib/writes/selection'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Both handlers used to ask only "is somebody signed in". `selections` is the
// permission, and the job has to be the caller's company's - a sub on the job
// does not get to mark the client's tile Chosen.
async function gate(request: Request, projectId: string, action: Action) {
  const db = admin()
  const g = await requirePermission(db, request, 'selections', action)
  if (denied(g)) return g
  const owned = await ownedProject(db, g.actor, projectId, 'id')
  if ('denied' in owned) return owned
  return { db, actor: g.actor }
}

// The body is in `lib/writes/selection.ts` (the whitelist, the money checks,
// the ACCEPTED_STATUSES rule and the overage change order), shared with the
// MCP server so Claude edits a selection through the same rules.
export async function PATCH(request: Request, { params }: { params: { id: string; selId: string } }) {
  const g = await gate(request, params.id, 'edit')
  if ('denied' in g) return g.denied
  const { db, actor } = g

  const body = await request.json()

  // Turning an overage into a change order WRITES a change order, so it needs
  // the permission for that too - the narrow body on the narrow permission.
  if (body.create_change_order && !actorCan(actor, 'change-orders', 'create')) {
    return NextResponse.json({ error: 'You do not have permission to create change orders.' }, { status: 403 })
  }

  const result = await updateSelection(db, { userId: actor.userId, projectId: params.id, selId: params.selId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string; selId: string } }) {
  const g = await gate(request, params.id, 'delete')
  if ('denied' in g) return g.denied
  const { error } = await g.db.from('project_selections')
    .delete().eq('id', params.selId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
