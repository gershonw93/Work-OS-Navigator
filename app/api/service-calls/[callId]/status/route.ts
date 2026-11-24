import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { callGate, loadCall, CALL_COLS, actorName, logEvent } from '@/lib/service-calls-server'
import { moveProblem, callProblem, CALL_STATUSES, type CallStatus } from '@/lib/service-calls'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/service-calls/<id>/status { to, completion_notes?, note? }
//
// The one door a status moves through, so the stamps that go with a move are
// written by the code that makes it: DONE carries what was done and who closed
// it, and moving back out of done clears that stamp - a call reopened is not
// still "completed by" anybody. UNSCHEDULING (scheduled -> new) frees the crew
// member and the time, or the board would still show them booked.
//
// The move is claimed by a conditional update on the status it was read with,
// so two phones pressing On site at once make one move, not two.
export async function POST(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call

  const body = await request.json().catch(() => ({}))
  const to = String(body?.to ?? '') as CallStatus
  if (!(CALL_STATUSES as readonly string[]).includes(to)) return NextResponse.json({ error: 'That is not a call status.' }, { status: 400 })
  const from = call.status as CallStatus
  if (to === from) return NextResponse.json({ call })

  const refused = moveProblem(from, to, { crew: gate.crew, userId: gate.actor.userId }, call)
  if (refused) return NextResponse.json({ error: refused }, { status: gate.crew ? 403 : 409 })

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: to, updated_at: now }
  if (to === 'done' && from === 'on_site') {
    patch.completion_notes = String(body?.completion_notes ?? '').trim() || null
    patch.completed_at = now
    patch.completed_by = gate.actor.userId
  }
  if (from === 'done' && to === 'on_site') {
    patch.completed_at = null
    patch.completed_by = null
  }
  if (to === 'new') {
    patch.assigned_to = null
    patch.scheduled_start = null
    patch.scheduled_end = null
  }
  const problem = callProblem({ ...call, ...(patch as any) })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data, error } = await db.from('service_calls').update(patch)
    .eq('id', call.id).eq('company_id', gate.companyId).eq('status', from)
    .select(CALL_COLS).maybeSingle()
  if (error) {
    console.error('[service-calls] status move failed', { call: call.id, from, to, error: error.message })
    return NextResponse.json({ error: 'Could not update the call. Try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Somebody else just moved this call. Reload to see where it is.' }, { status: 409 })

  await logEvent(db, call.id, {
    kind: 'status', status: to,
    note: to === 'done' ? (patch.completion_notes as string) : (String(body?.note ?? '').trim() || null),
    actorId: gate.actor.userId, actorName: await actorName(db, gate.actor.userId),
  })
  return NextResponse.json({ call: data })
}
