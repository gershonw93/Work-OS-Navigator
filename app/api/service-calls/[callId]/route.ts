import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { callGate, loadCall, CALL_COLS, pickFields, pickExtras, withDerivedStatus, referenceProblem, actorName, logEvent, tellAssignee, crewOf, type CallRow } from '@/lib/service-calls-server'
import { callProblem, nextStatuses, type CallStatus } from '@/lib/service-calls'
import { lookUpAddress } from '@/lib/geocode'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PHOTO_BUCKET = 'daily-log-photos'

// GET - one call with its history, its time and its photos.
export async function GET(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call

  const [events, time, photos, crew, job] = await Promise.all([
    db.from('service_call_events').select('id, kind, status, note, actor_name, created_at').eq('call_id', call.id).order('created_at', { ascending: true }),
    db.from('service_call_time').select('id, profile_id, person_name, clock_in, clock_out, in_fix, out_fix, in_accuracy').eq('call_id', call.id).order('clock_in', { ascending: true }),
    db.from('service_call_photos').select('id, storage_path, file_name, created_at').eq('call_id', call.id).order('created_at', { ascending: true }),
    crewOf(db, gate.companyId),
    call.gc_project_id ? db.from('projects').select('id, name').eq('id', call.gc_project_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  if (events.error || time.error || photos.error || crew === null) {
    console.error('[service-calls] detail read failed', { call: call.id, error: (events.error ?? time.error ?? photos.error)?.message ?? 'crew' })
    return NextResponse.json({ error: 'Could not load that call. Try again.' }, { status: 500 })
  }
  // Signed fresh per read, never stored: a stored signed URL is only as good as
  // the key that signed it.
  const signed = await Promise.all(((photos.data ?? []) as any[]).map(async p => {
    const { data } = await db.storage.from(PHOTO_BUCKET).createSignedUrl(p.storage_path, 60 * 60)
    return { id: p.id, file_name: p.file_name, created_at: p.created_at, url: data?.signedUrl ?? null }
  }))
  const assignee = crew.find(p => p.id === call.assigned_to)
  return NextResponse.json({
    call,
    assignee_name: assignee?.name ?? null,
    crew: gate.crew ? [] : crew.map(p => ({ id: p.id, name: p.name })),
    gc_job: (job as any).data ? { id: (job as any).data.id, name: (job as any).data.name } : null,
    events: events.data ?? [],
    time: time.data ?? [],
    photos: signed,
    moves: nextStatuses(call.status as CallStatus),
    crewView: gate.crew,
  })
}

// PATCH - edit the call, or (from the dispatch board) put somebody on it and
// give it a time. Crew may only add to the notes on their own call; who does a
// call and when is the office's decision.
export async function PATCH(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call

  const body = await request.json().catch(() => ({}))
  const f = pickFields(body)
  if (gate.crew) {
    const keys = Object.keys(f)
    if (keys.some(k => k !== 'notes')) return NextResponse.json({ error: 'The office changes who does a call and when.' }, { status: 403 })
  }
  // Labels and steps ride beside the string fields. Crew may tick a step and
  // nothing more (pickExtras); the stamp is the server's.
  const editor = await actorName(db, gate.actor.userId)
  const extras = pickExtras(body, call, { crew: gate.crew, name: editor }, new Date().toISOString())
  if (!Object.keys(f).length && !Object.keys(extras).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })

  const next = { ...call, ...f }
  const status = withDerivedStatus(call.status, next)
  const problem = callProblem({ ...next, status })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const refs = await referenceProblem(db, gate.companyId, f)
  if (refs) return NextResponse.json({ error: refs }, { status: 403 })

  const patch: Record<string, unknown> = { ...f, ...extras, status, updated_at: new Date().toISOString() }
  if (f.site_address !== undefined && f.site_address !== call.site_address) {
    const placed = await lookUpAddress(f.site_address ?? '').catch(() => null)
    patch.site_lat = placed && placed.ok ? placed.coords.lat : null
    patch.site_lng = placed && placed.ok ? placed.coords.lng : null
  }

  const { data, error } = await db.from('service_calls').update(patch)
    .eq('id', call.id).eq('company_id', gate.companyId).select(CALL_COLS).single()
  if (error) {
    console.error('[service-calls] update failed', { call: call.id, error: error.message })
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  const saved = data as unknown as CallRow

  const assigneeChanged = f.assigned_to !== undefined && f.assigned_to !== call.assigned_to
  const timeChanged = (f.scheduled_start !== undefined && f.scheduled_start !== call.scheduled_start)
    || (f.scheduled_end !== undefined && f.scheduled_end !== call.scheduled_end)
  if (assigneeChanged || timeChanged || status !== call.status) {
    const name = editor
    if (assigneeChanged) {
      await logEvent(db, call.id, { kind: saved.assigned_to ? 'assigned' : 'unassigned', status, actorId: gate.actor.userId, actorName: name })
    } else if (status !== call.status) {
      await logEvent(db, call.id, { kind: 'status', status, actorId: gate.actor.userId, actorName: name })
    }
    // ONE EVENT, ONE MESSAGE: a new assignee hears they have it; the same
    // assignee hears the time moved; nobody hears about a call taken away.
    if (saved.assigned_to && (assigneeChanged || timeChanged)) {
      await tellAssignee(db, saved, gate.actor.userId, !assigneeChanged)
    }
  }
  return NextResponse.json({ call: saved })
}
