import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

// List all equipment for the company, each with its current holder + location
// (its latest open assignment). Also returns projects + teammates for the
// checkout selectors so the page needs a single fetch.
export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ equipment: [], projects: [], teammates: [] })

  const [{ data: equipment }, { data: openAssignments }, { data: projects }, { data: teammates }] = await Promise.all([
    db.from('equipment').select('*').eq('company_id', profile.company_id).order('name'),
    db.from('equipment_assignments')
      .select('id, equipment_id, project_id, holder_name, holder_profile_id, checked_out_at, note')
      .eq('company_id', profile.company_id)
      .is('checked_in_at', null),
    db.from('projects').select('id, name').eq('gc_company_id', profile.company_id).order('name'),
    db.from('profiles').select('id, full_name').eq('company_id', profile.company_id).order('full_name'),
  ])

  const projName = new Map((projects ?? []).map((p: any) => [p.id, p.name]))
  const openByEquip = new Map<string, any>()
  for (const a of openAssignments ?? []) openByEquip.set(a.equipment_id, a)

  const rows = (equipment ?? []).map((e: any) => {
    const open = openByEquip.get(e.id)
    return {
      ...e,
      current: open
        ? {
            holder_name: open.holder_name,
            project_id: open.project_id,
            location: open.project_id ? (projName.get(open.project_id) ?? 'Project') : 'Shop / Yard',
            checked_out_at: open.checked_out_at,
            note: open.note,
          }
        : null,
    }
  })

  return NextResponse.json({
    equipment: rows,
    projects: projects ?? [],
    teammates: teammates ?? [],
  })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const { name, category, asset_tag, notes } = body
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await db
    .from('equipment')
    .insert({ company_id: profile.company_id, name, category, asset_tag, notes, status: 'available' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipment: { ...data, current: null } })
}

export async function PATCH(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const { id, name, category, asset_tag, notes, status } = body
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (category !== undefined) updates.category = category
  if (asset_tag !== undefined) updates.asset_tag = asset_tag
  if (notes !== undefined) updates.notes = notes
  if (status !== undefined) updates.status = status

  const { data, error } = await db
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', profile.company_id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipment: data })
}

export async function DELETE(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await db.from('equipment').delete().eq('id', id).eq('company_id', profile.company_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
