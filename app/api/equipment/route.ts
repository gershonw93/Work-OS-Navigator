import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { createEquipment, updateEquipment } from '@/lib/writes/equipment'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Every handler here used to ask only "is somebody signed in", so a role the
// permission map gives `equipment: view` (read-only, a vendor) could add, edit
// and delete the company's equipment. Each now asks the action it performs -
// view, create, edit, delete - and everything stays scoped to the actor's own
// company, because equipment belongs to a company, not to a job.

// List all equipment for the company, each with its current holder + location
// (its latest open assignment). Also returns projects + teammates for the
// checkout selectors so the page needs a single fetch.
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ equipment: [], projects: [], teammates: [] })

  const [{ data: equipment }, { data: openAssignments }, { data: projects }, { data: teammates }] = await Promise.all([
    db.from('equipment').select('*').eq('company_id', companyId).order('name'),
    db.from('equipment_assignments')
      .select('id, equipment_id, project_id, holder_name, holder_profile_id, checked_out_at, note')
      .eq('company_id', companyId)
      .is('checked_in_at', null),
    db.from('projects').select('id, name').eq('gc_company_id', companyId).order('name'),
    db.from('profiles').select('id, full_name').eq('company_id', companyId).order('full_name'),
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

// Add a piece of equipment: `create`, the same action that lets somebody take
// one out. The body lives in lib/writes/equipment.ts, shared with Claude.
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'create')
  if (denied(gate)) return gate.denied
  if (!gate.actor.companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const result = await createEquipment(db, { userId: gate.actor.userId, companyId: gate.actor.companyId, body })
  return NextResponse.json(result.body, { status: result.status })
}

// Edit its details (never its status - see lib/writes/equipment.ts).
export async function PATCH(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'edit')
  if (denied(gate)) return gate.denied
  if (!gate.actor.companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const result = await updateEquipment(db, { userId: gate.actor.userId, companyId: gate.actor.companyId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'delete')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await db.from('equipment').delete().eq('id', id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
