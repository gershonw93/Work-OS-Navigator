import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'view')
  if (denied(gate)) return gate.denied

  const [{ data: folders }, { data: plans }] = await Promise.all([
    db.from('plan_folders').select('*').eq('project_id', params.id).order('name'),
    db.from('project_plans').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ folders: folders ?? [], plans: plans ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'create')
  if (denied(gate)) return gate.denied
  // THE PLAN SET IS THE GC'S. A sub's own company admin holds plans:delete in
  // THEIR company, which said nothing about this job's drawings.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { name } = await request.json()

  const { data, error } = await db
    .from('plan_folders')
    .insert({ project_id: params.id, name })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ folder: data })
}
