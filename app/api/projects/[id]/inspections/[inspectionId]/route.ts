import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { requirePermission, denied } from '@/lib/api-guard'
import { inspectionUpdates, updateInspection } from '@/lib/writes/inspection'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const db = admin()
  const body = await request.json()

  const updates = inspectionUpdates(body)

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // WHO MAY DO WHAT, AND IT IS A SETTING. This route gated NOTHING - the
  // permission checks were on DELETE and restore only - so anyone who could
  // reach the API could mark work ready, change a booking or set a status,
  // whatever their role said.
  //
  // Two gates, because they are two different jobs. RUNNING an inspection is
  // office work and stays on `inspections`. Saying THE WORK IS FINISHED is a
  // report from the site, and the people who can honestly make it - a field
  // supervisor, a worker, a sub - all have `inspections: N`. Both are rows in
  // the permissions matrix a company edits, so this is configurable rather
  // than my opinion compiled in.
  const readyOnly = Object.keys(updates).every(k => k === 'ready_marked_by' || k === 'ready_marked_at')
  const gate = await requirePermission(db, request, readyOnly ? 'mark-ready' : 'inspections', 'edit')
  if (denied(gate)) return gate.denied

  // Everything after the gate is `updateInspection`, which Claude's MCP server
  // calls too - every status guard, the derived booking stamp, the history
  // line and the notifications.
  const result = await updateInspection(db, {
    userId: gate.actor.userId, projectId: params.id, inspectionId: params.inspectionId, updates,
  })
  return NextResponse.json(result.body, { status: result.status })
}

/**
 * Void an inspection. Nothing here is ever hard-deleted.
 *
 * WHAT THIS USED TO BE. A `.delete()` guarded by nothing but "are you signed
 * in" - no permission check, and no check that the project belonged to the
 * caller's company. A `worker` or `read_only`, neither of whom can so much as
 * VIEW inspections, could permanently destroy any inspection on any project in
 * any company. It logged nothing, and returned `{ success: true }` when it had
 * matched no rows at all.
 *
 * The tester reported "Office Staff can delete inspections". It was worse.
 *
 * Voiding rather than deleting is what this codebase already does with client
 * invoices, whose comment is the doctrine: "Not delete. A client already has
 * this document, so it stays in the list with its number, greyed out." A
 * compliance record deserves at least that - and it means the audit trail
 * records something that still exists, and a notification about it still
 * resolves to a record rather than to a gap.
 *
 * Gated on `edit`, not `delete`: no route in this repo uses the `delete`
 * action, and voiding is a reversible edit rather than destruction.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = await db.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  // Read it first so the history entry can NAME what was voided - the trick the
  // budget-line delete already uses. "Inspection voided" tells nobody anything.
  const { data: before } = await db
    .from('inspections').select('type, trade, status')
    .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Not found on this project.' }, { status: 404 })
  if ((before as any).status === 'void') return NextResponse.json({ ok: true, alreadyVoid: true })

  const { data: inspection, error } = await db
    .from('inspections')
    .update({ status: 'void', voided_at: new Date().toISOString(), voided_by: user.id })
    .eq('id', params.inspectionId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const voidedLabel = (before as any).type
    ? `${(before as any).type}${(before as any).trade ? ` (${(before as any).trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'Someone', 'inspection_voided',
    `${voidedLabel} voided`,
    { inspection_id: params.inspectionId, was_status: (before as any).status },
    user.id,
  )

  return NextResponse.json({ ok: true, inspection })
}

/**
 * Put a voided inspection back.
 *
 * If nothing is ever deleted, a mis-void needs a way back - otherwise people
 * route around it by creating a duplicate, and the audit trail ends up holding
 * two records of one inspection with the wrong dates on one of them.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = await db.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body?.action !== 'restore') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }

  const { data: before } = await db
    .from('inspections').select('type, trade, status, completed_date')
    .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Not found on this project.' }, { status: 404 })
  if ((before as any).status !== 'void') return NextResponse.json({ ok: true, notVoid: true })

  // Back to where it can be worked on. A restored inspection with a completion
  // date is finished; one without is waiting to be booked.
  const restored = (before as any).completed_date ? 'passed' : 'not_scheduled'

  const { data: inspection, error } = await db
    .from('inspections')
    .update({ status: restored, voided_at: null, voided_by: null })
    .eq('id', params.inspectionId).eq('project_id', params.id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const restoredLabel = (before as any).type
    ? `${(before as any).type}${(before as any).trade ? ` (${(before as any).trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'Someone', 'inspection_restored',
    `${restoredLabel} restored`,
    { inspection_id: params.inspectionId, status: restored },
    user.id,
  )

  return NextResponse.json({ ok: true, inspection })
}
