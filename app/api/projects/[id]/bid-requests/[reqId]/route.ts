import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { updateBidRequest } from '@/lib/writes/bid-request'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Both questions, as on the collection route: `request-quotes` and a job the
// caller's company owns. Both handlers answered any login before.

export async function PATCH(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'request-quotes', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json()
  const result = await updateBidRequest(db, { userId: gate.actor.userId, projectId: params.id, reqId: params.reqId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'request-quotes', 'delete')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { error } = await db.from('bid_requests').delete().eq('id', params.reqId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
