import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { checkInProblem, checkoutProblem, type ReturnCondition } from '@/lib/equipment-state'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getContext(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return null
  return { db, user, companyId: profile.company_id }
}

// Assignment history for one piece of equipment (most recent first).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, companyId } = ctx

  const { data: equipment } = await db.from('equipment').select('id').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Checkouts AND everything else that happened to it - reported broken,
  // fixed, sent away, retired - so the history answers "when did this break,
  // and who said so" as well as "who had it".
  const [{ data: history, error: hErr }, { data: events, error: eErr }] = await Promise.all([
    db.from('equipment_assignments')
      .select('*, projects(name)')
      .eq('equipment_id', params.id)
      .order('checked_out_at', { ascending: false }),
    db.from('equipment_events')
      .select('id, kind, note, actor_name, created_at')
      .eq('equipment_id', params.id)
      .order('created_at', { ascending: false }),
  ])
  // A refused read is not an empty history.
  if (hErr || eErr) {
    console.error('[equipment/history] read failed', { id: params.id, error: (hErr ?? eErr)?.message })
    return NextResponse.json({ error: 'Could not load the history.' }, { status: 500 })
  }

  return NextResponse.json({ history: history ?? [], events: events ?? [] })
}

// Check OUT: create an open assignment and flip the equipment to checked_out.
// Closes any pre-existing open assignment first so an item is never in two hands.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user, companyId } = ctx

  const { data: equipment } = await db.from('equipment').select('id, status, name').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The screen hides Check out for these; this is the same rule at the door a
  // second tab goes through. A tool away being fixed is not on the shelf.
  const blocked = checkoutProblem(equipment)
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 })

  const body = await request.json()
  const { holder_name, holder_profile_id, project_id, note } = body
  if (!holder_name) return NextResponse.json({ error: 'holder_name is required' }, { status: 400 })

  // Close any dangling open assignment.
  await db.from('equipment_assignments')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('equipment_id', params.id)
    .is('checked_in_at', null)

  const { data, error } = await db.from('equipment_assignments').insert({
    equipment_id: params.id,
    company_id: companyId,
    project_id: project_id || null,
    holder_name,
    holder_profile_id: holder_profile_id || null,
    note: note || null,
    created_by: user.id,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('equipment').update({ status: 'checked_out' }).eq('id', params.id)

  if (project_id) {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    await logActivity(db, project_id, profile?.full_name || 'Someone', 'equipment_checked_out',
      `${equipment.name || 'Equipment'} checked out to ${holder_name}`,
      { equipment_id: params.id, holder_name }, user.id)
  }

  return NextResponse.json({ assignment: data })
}

// Check IN: close the open assignment and flip the equipment back to available.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user, companyId } = ctx

  const { data: equipment } = await db.from('equipment').select('id, name').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // What it came back in. An empty body is an old caller, and "it came back"
  // with nothing said is the answer it always gave: fine.
  const body = await request.json().catch(() => ({} as any))
  const condition: ReturnCondition = body.condition === 'needs_repair' ? 'needs_repair' : 'ok'
  const note = typeof body.note === 'string' ? body.note.trim() || null : null
  const problem = checkInProblem(condition, note)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data: openAssignment } = await db
    .from('equipment_assignments')
    .select('project_id, holder_name')
    .eq('equipment_id', params.id)
    .is('checked_in_at', null)
    .maybeSingle()

  await db.from('equipment_assignments')
    .update({ checked_in_at: new Date().toISOString(), return_condition: condition })
    .eq('equipment_id', params.id)
    .is('checked_in_at', null)

  const back: Record<string, unknown> = { status: 'available' }
  if (condition === 'needs_repair') {
    // Reported, not decided: it goes back on the shelf with the flag on it,
    // and the office chooses whether to send it away. Same rule as reporting
    // it from the list.
    const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const name = (me as any)?.full_name || null
    Object.assign(back, {
      repair_needed_at: new Date().toISOString(), repair_note: note,
      repair_reported_by: user.id, repair_reported_by_name: name,
    })
    const { error: evErr } = await db.from('equipment_events').insert({
      equipment_id: params.id, company_id: companyId, kind: 'repair_flagged',
      note, actor_id: user.id, actor_name: name,
    })
    if (evErr) console.error('[equipment/check-in] event not recorded', { id: params.id, error: evErr.message })
  }
  await db.from('equipment').update(back).eq('id', params.id)

  if (openAssignment?.project_id) {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    await logActivity(db, openAssignment.project_id, profile?.full_name || 'Someone', 'equipment_checked_in',
      `${equipment.name || 'Equipment'} checked back in from ${openAssignment.holder_name}${condition === 'needs_repair' ? ' - needs repair' : ''}`,
      { equipment_id: params.id }, user.id)
  }

  return NextResponse.json({ ok: true })
}
