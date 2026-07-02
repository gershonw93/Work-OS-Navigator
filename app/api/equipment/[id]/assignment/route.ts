import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const { data: history } = await db
    .from('equipment_assignments')
    .select('*, projects(name)')
    .eq('equipment_id', params.id)
    .order('checked_out_at', { ascending: false })

  return NextResponse.json({ history: history ?? [] })
}

// Check OUT: create an open assignment and flip the equipment to checked_out.
// Closes any pre-existing open assignment first so an item is never in two hands.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user, companyId } = ctx

  const { data: equipment } = await db.from('equipment').select('id, status').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  return NextResponse.json({ assignment: data })
}

// Check IN: close the open assignment and flip the equipment back to available.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getContext(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, companyId } = ctx

  const { data: equipment } = await db.from('equipment').select('id').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.from('equipment_assignments')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('equipment_id', params.id)
    .is('checked_in_at', null)

  await db.from('equipment').update({ status: 'available' }).eq('id', params.id)
  return NextResponse.json({ ok: true })
}
