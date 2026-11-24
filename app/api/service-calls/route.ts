import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { callGate, CALL_COLS, pickFields, withDerivedStatus, referenceProblem, actorName, logEvent, tellAssignee, crewOf, type CallRow } from '@/lib/service-calls-server'
import { callProblem } from '@/lib/service-calls'
import { lookUpAddress } from '@/lib/geocode'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/service-calls - this company's calls; for crew, only their own.
// `?status=open` leaves out done and invoiced.
export async function GET(request: Request) {
  const db = admin()
  const gate = await callGate(db, request, 'view')
  if ('denied' in gate) return gate.denied

  let q = db.from('service_calls').select(CALL_COLS).eq('company_id', gate.companyId)
  if (gate.crew) q = q.eq('assigned_to', gate.actor.userId)
  if (new URL(request.url).searchParams.get('status') === 'open') q = q.not('status', 'in', '(done,invoiced)')
  const [{ data, error }, crew] = await Promise.all([
    q.order('created_at', { ascending: false }).limit(500),
    crewOf(db, gate.companyId),
  ])
  // A refused read is an error, never an empty list - "no calls" is a claim.
  if (error || crew === null) {
    console.error('[service-calls] list failed', { company: gate.companyId, error: error?.message ?? 'crew read failed' })
    return NextResponse.json({ error: 'Could not load the calls. Try again.' }, { status: 500 })
  }
  return NextResponse.json({
    calls: data ?? [],
    crew: crew.map(p => ({ id: p.id, name: p.full_name ?? 'Unnamed' })),
    crewView: gate.crew,
  })
}

// POST /api/service-calls - take a call.
export async function POST(request: Request) {
  const db = admin()
  const gate = await callGate(db, request, 'create')
  if ('denied' in gate) return gate.denied
  if (gate.crew) return NextResponse.json({ error: 'The office takes new calls.' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const f = pickFields(body)
  if (!f.source) f.source = f.gc_project_id ? 'gc_job' : 'direct'
  const status = withDerivedStatus('new', f)
  const problem = callProblem({ ...f, status })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const refs = await referenceProblem(db, gate.companyId, f)
  if (refs) return NextResponse.json({ error: refs }, { status: 403 })

  // Where it is, once. A miss is NOT a guess: the call is saved unmapped and a
  // punch there says the site is not on the map (lib/punch-location.ts).
  const placed = await lookUpAddress(f.site_address!).catch(() => null)
  const coords = placed && placed.ok ? placed.coords : null

  // The number: the next one for this company. Two calls taken at the same
  // moment collide on the unique (company, number) and the loser takes the
  // next - three tries, then a sentence rather than a hang.
  let created: CallRow | null = null
  for (let attempt = 0; attempt < 3 && !created; attempt++) {
    const { data: last } = await db.from('service_calls').select('call_number')
      .eq('company_id', gate.companyId).order('call_number', { ascending: false }).limit(1).maybeSingle()
    const call_number = ((last as any)?.call_number ?? 0) + 1
    const { data, error } = await db.from('service_calls').insert({
      ...f,
      company_id: gate.companyId,
      call_number,
      status,
      site_lat: coords?.lat ?? null,
      site_lng: coords?.lng ?? null,
      created_by: gate.actor.userId,
    }).select(CALL_COLS).single()
    if (!error) { created = data as unknown as CallRow; break }
    if ((error as any).code !== '23505') {
      console.error('[service-calls] create failed', { company: gate.companyId, error: error.message })
      return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
    }
  }
  if (!created) return NextResponse.json({ error: 'Could not number that call just now. Try again.' }, { status: 503 })

  const name = await actorName(db, gate.actor.userId)
  await logEvent(db, created.id, { kind: 'created', status: created.status, actorId: gate.actor.userId, actorName: name })
  if (created.assigned_to) {
    await logEvent(db, created.id, { kind: 'assigned', status: created.status, actorId: gate.actor.userId, actorName: name })
    await tellAssignee(db, created, gate.actor.userId, false)
  }
  return NextResponse.json({
    call: created,
    // Said, not hidden: an address the map could not place is a punch that
    // cannot be checked, and the office can fix the address now.
    unmapped: coords ? null : (placed && !placed.ok ? placed.why : 'We could not place this address on the map.'),
  }, { status: 201 })
}
