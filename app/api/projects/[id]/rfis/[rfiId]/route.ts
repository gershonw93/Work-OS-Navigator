import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { rfiGcGate } from '@/lib/rfi-access'
import { friendlyDbError } from '@/lib/db-error'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CO_STATUSES = new Set(['pending', 'approved', 'denied', 'revision_requested'])
const RFI_STATUSES = new Set(['open', 'answered', 'closed'])

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

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', gate.actor.userId).maybeSingle()
  const body = await request.json().catch(() => ({}))
  const { response, status, change_order_status, subject, description } = body

  if (status !== undefined && !RFI_STATUSES.has(status)) {
    return NextResponse.json({ error: 'That is not an RFI status.' }, { status: 400 })
  }
  if (change_order_status !== undefined && !CO_STATUSES.has(change_order_status)) {
    return NextResponse.json({ error: 'That is not a change order decision.' }, { status: 400 })
  }
  if (subject !== undefined && (typeof subject !== 'string' || !subject.trim())) {
    return NextResponse.json({ error: 'Give the RFI a subject.' }, { status: 400 })
  }

  const updates: Record<string, any> = {}
  // THE EDIT DIALOG SENDS subject AND description, and this whitelist did not
  // have them: the route dropped both, answered 200, and stamped the RFI as
  // responded by whoever pressed Save - a correction recorded as an answer.
  if (subject !== undefined) updates.subject = subject.trim()
  if (description !== undefined) updates.description = description || null

  // Only an actual answer or decision says who responded and when.
  const isAnswer = response !== undefined || status !== undefined || change_order_status !== undefined
  if (response !== undefined) updates.response = response
  if (status !== undefined) updates.status = status
  if (change_order_status !== undefined) updates.change_order_status = change_order_status
  if (isAnswer) {
    updates.responded_by_name = profile?.full_name ?? null
    updates.responded_at = new Date().toISOString()
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const { data: rfi, error } = await db
    .from('rfis')
    .update(updates)
    .eq('id', params.rfiId)
    .eq('project_id', params.id)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[rfis] update failed', { rfi: params.rfiId, error: error.message })
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  if (!rfi) return NextResponse.json({ error: 'RFI not found' }, { status: 404 })

  if (isAnswer) {
    const actorName = profile?.full_name ?? 'Someone'
    const action = change_order_status
      ? `Change order ${change_order_status.replace('_', ' ')} on RFI #${rfi.rfi_number}`
      : `RFI #${rfi.rfi_number} marked ${status ?? rfi.status}`
    await logActivity(db, params.id, actorName, 'rfi_answered', action, {
      rfi_id: rfi.id, rfi_number: rfi.rfi_number, status, change_order_status,
    })
  }

  return NextResponse.json({ rfi })
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
