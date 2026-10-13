import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { ownedProjectsFilter } from '@/lib/project-access'
import { createMaterialPurchase } from '@/lib/writes/material-purchase'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// List material purchases across the company's projects, plus the projects list
// for the "which job" selector.
//
// Gated on `materials: view`. It used to ask only "is somebody signed in", so
// any account - a sub's included - could read every receipt on its own jobs
// whatever its role said about Materials.
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'materials', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: projects } = await db
    .from('projects').select('id, name')
    .or(ownedProjectsFilter(companyId))
    .order('name')
  const projectIds = (projects ?? []).map((p: any) => p.id)

  let materials: any[] = []
  if (projectIds.length) {
    const { data } = await db
      .from('material_purchases')
      .select('*')
      .in('project_id', projectIds)
      .order('purchase_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    const projName = new Map((projects ?? []).map((p: any) => [p.id, p.name]))
    materials = (data ?? []).map((m: any) => ({ ...m, project_name: projName.get(m.project_id) ?? 'Project' }))
  }

  return NextResponse.json({ materials, projects: projects ?? [] })
}

// Add a receipt. The body lives in lib/writes/material-purchase.ts, shared with
// Claude. The job comes from the body, so it must be one of the company's OWN
// jobs: a receipt on a job feeds that GC's budget and client billing, and a sub
// invited onto the job has no business writing one there.
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'materials', 'edit')
  if (denied(gate)) return gate.denied
  const { actor } = gate
  if (!actor.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  if (!body?.project_id) return NextResponse.json({ error: 'Pick which job this is for.' }, { status: 400 })
  const owned = await ownedProject(db, actor, String(body.project_id), 'id')
  if ('denied' in owned) return owned.denied

  const result = await createMaterialPurchase(db, { userId: actor.userId, companyId: actor.companyId, body })
  return NextResponse.json(result.body, { status: result.status })
}
