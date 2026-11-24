import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { callGate, loadCall, actorName, logEvent } from '@/lib/service-calls-server'
import { punchLocation, punchMessage } from '@/lib/punch-location'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

// POST { action: 'in' | 'out', lat?, lng?, accuracy? } - clock in or out on a
// call, with where the phone was.
//
// Measured against the call's site with the SAME rule as a job punch
// (lib/punch-location.ts), and the outcome is stored on the row so a review
// months later still knows which it was. An address the map could not place
// is `no_site` - the office's to fix, never a mark against the tech - and no
// fix from the phone is `no_fix`. A punch is never refused for either: the
// work happened, and a punch that cannot be recorded is worse than one that
// is flagged.
//
// Only the person themselves punches (`profile_id` from the token), and only
// on a call they are on, or, for the office, any of the company's calls.
export async function POST(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call

  const body = await request.json().catch(() => ({}))
  const action = body?.action === 'out' ? 'out' : body?.action === 'in' ? 'in' : null
  if (!action) return NextResponse.json({ error: 'Clock in or clock out?' }, { status: 400 })

  const worker = { lat: num(body?.lat), lng: num(body?.lng) }
  const accuracy = num(body?.accuracy)
  const loc = punchLocation(worker, { lat: call.site_lat, lng: call.site_lng })
  const name = await actorName(db, gate.actor.userId)
  const now = new Date().toISOString()

  if (action === 'in') {
    const { error } = await db.from('service_call_time').insert({
      call_id: call.id, profile_id: gate.actor.userId, person_name: name, clock_in: now,
      in_lat: worker.lat, in_lng: worker.lng, in_accuracy: accuracy, in_fix: loc.fix,
    })
    if (error) {
      // service_call_time_one_open: one open punch per person, anywhere.
      if ((error as any).code === '23505') {
        return NextResponse.json({ error: 'You are already clocked in on a call. Clock out of it first.' }, { status: 409 })
      }
      console.error('[service-calls] punch in failed', { call: call.id, error: error.message })
      return NextResponse.json({ error: 'Could not clock you in. Try again.' }, { status: 500 })
    }
    await logEvent(db, call.id, { kind: 'punch_in', note: loc.fix, actorId: gate.actor.userId, actorName: name })
    return NextResponse.json({ ok: true, fix: loc.fix, distance: loc.distance, message: punchMessage('in', loc) })
  }

  const { data, error } = await db.from('service_call_time').update({
    clock_out: now, out_lat: worker.lat, out_lng: worker.lng, out_accuracy: accuracy, out_fix: loc.fix,
  }).eq('call_id', call.id).eq('profile_id', gate.actor.userId).is('clock_out', null).select('id')
  if (error) {
    console.error('[service-calls] punch out failed', { call: call.id, error: error.message })
    return NextResponse.json({ error: 'Could not clock you out. Try again.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'You are not clocked in on this call.' }, { status: 409 })
  await logEvent(db, call.id, { kind: 'punch_out', note: loc.fix, actorId: gate.actor.userId, actorName: name })
  return NextResponse.json({ ok: true, fix: loc.fix, distance: loc.distance, message: punchMessage('out', loc) })
}
