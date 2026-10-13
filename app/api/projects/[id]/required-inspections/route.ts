import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { typeOptions, missingTypes } from '@/lib/inspection-types'
import { companyInspectionTypes } from '@/lib/inspection-types-read'
import { addRequiredInspections, REQUIRED_COLUMNS } from '@/lib/writes/required-inspection'
import { utilityInspections, LOT_COLUMNS } from '@/lib/lot-details'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const COLUMNS = REQUIRED_COLUMNS

/**
 * The inspections this job needs, the types that can be picked, and the ones
 * its lot suggests (no city sewer: septic; no city water: a well).
 *
 * Where each one STANDS is not here - it is derived on the page from the
 * inspection rows it already has (`requiredStatuses`), so the list and the
 * inspections under it cannot disagree.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'view')
  if (denied(gate)) return gate.denied

  const [req, proj, custom] = await Promise.all([
    db.from('project_required_inspections').select(COLUMNS).eq('project_id', params.id).order('sort_order'),
    db.from('projects').select(`id, ${LOT_COLUMNS}`).eq('id', params.id).maybeSingle(),
    companyInspectionTypes(db, gate.actor.companyId),
  ])
  // A refused read is not an empty list - "this job needs nothing" is a claim.
  if (req.error) {
    console.error('[required-inspections] read failed', req.error.message)
    return NextResponse.json({ error: 'Could not load the required inspections.' }, { status: 500 })
  }
  const required = req.data ?? []
  return NextResponse.json({
    required,
    options: typeOptions(custom),
    suggestions: missingTypes(utilityInspections(proj.data as any), required),
  })
}

/** Add one or more types to the job's list. Ones already on it are skipped, not refused. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied
  // The plan for the job is the GC's, not something an invited sub sets.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  // Everything after the gate is `addRequiredInspections`, which Claude's MCP
  // server calls too.
  const result = await addRequiredInspections(db, {
    userId: gate.actor.userId ?? null, companyId: gate.actor.companyId, projectId: params.id, body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

/** Take one off the list. The inspections already filed for it stay - they are the record. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const rid = new URL(request.url).searchParams.get('rid')
  if (!rid) return NextResponse.json({ error: 'Which one?' }, { status: 400 })
  const { error } = await db.from('project_required_inspections').delete().eq('id', rid).eq('project_id', params.id)
  if (error) {
    console.error('[required-inspections] delete failed', error.message)
    return NextResponse.json({ error: 'Could not remove it.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
