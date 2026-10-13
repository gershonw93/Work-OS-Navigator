import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { rfiGcGate } from '@/lib/rfi-access'
import { friendlyDbError } from '@/lib/db-error'
import { updateRfi } from '@/lib/writes/rfi'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Answering an RFI, approving the change order riding on it, and correcting its
// wording are the GC's - both used to be open to any signed-in account, on any
// job. See lib/rfi-access.ts.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rfiId: string } },
) {
  const db = admin()
  const gate = await rfiGcGate(db, request, params.id, 'edit')
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({}))
  // Everything after the gate lives in lib/writes/rfi.ts, shared with the MCP
  // server (Claude): the same status sets, and an edit that is not an answer.
  const result = await updateRfi(db, { userId: gate.actor.userId, projectId: params.id, rfiId: params.rfiId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; rfiId: string } },
) {
  const db = admin()
  const gate = await rfiGcGate(db, request, params.id, 'delete')
  if ('denied' in gate) return gate.denied

  const { error } = await db.from('rfis').delete().eq('id', params.rfiId).eq('project_id', params.id)
  if (error) {
    console.error('[rfis] delete failed', { rfi: params.rfiId, error: error.message })
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
