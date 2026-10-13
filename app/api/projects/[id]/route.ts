import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { ownsProject } from '@/lib/project-access'
import { friendlyDbError } from '@/lib/db-error'
import { billingLock } from '@/lib/api-guard'
import { updateProject } from '@/lib/writes/project'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * One project.
 *
 * THIS DID NOT EXIST. The file exported PATCH and DELETE and no GET, so the
 * Reports tab - which fetches exactly this URL - got a 405, `projRes.ok` was
 * false, and the header printed "PROJECT -  CLIENT -  STATUS -" on every job.
 * Nothing logged an error, because a 405 on a page that tolerates a failed
 * fetch looks identical to a project with no data.
 *
 * Returns the row under `project`, which is the shape the Reports page already
 * tries first (`d.project ?? d`).
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied

  // `customers(name)` joined rather than fetched separately - the client's
  // name lives on the customer, not on the project, and a second round trip
  // for one string is what made project pages slow in #325.
  const { data, error } = await db
    .from('projects')
    .select('*, customers(name)')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  return NextResponse.json({ project: data })
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Enforce what the UI hides. Field roles get view-only on projects, so
  // without this any signed-in user could rename a job or flip its status.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to edit this project.' }, { status: 403 })
  }

  // Gated by hand rather than through `requirePermission`, so the read-only
  // lock has to be asked for explicitly here - see `billingLock`.
  const locked = await billingLock(db, actor?.companyId)
  if (locked) return locked

  // A job of another company is not this caller's to edit, whatever their role
  // says about jobs in general - and the customer cascade below writes to every
  // house under it.
  const owned = await ownedProject<{ id: string; is_site: boolean | null; customer_id: string | null }>(
    db, actor as any, params.id, 'id, is_site, customer_id')
  if ('denied' in owned) return owned.denied

  // Everything after the gate is `updateProject` (lib/writes/project.ts) -
  // the activation pre-flight, the status check and THE PROJECT CAP on a job
  // coming back into a counted status, so Claude's door meets all three too.
  const body = await request.json()
  const result = await updateProject(db, { companyId: actor?.companyId ?? null, projectId: params.id, owned, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 'edit' rather than 'delete': the Projects list has always offered delete to
  // anyone who can manage a project, and project_manager has edit without
  // delete. Gating on 'delete' would take that away from PMs, which is a
  // separate decision. This closes the actual hole - view-only roles.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to delete projects.' }, { status: 403 })
  }

  // WHOSE JOB IT IS. The gate above asks whether the caller may delete
  // projects at all; it does not ask whether THIS project is theirs - and a
  // sub invited onto a GC's job, holding projects:edit in their own company,
  // passed it for the GC's job. Deleting is the GC's act, never the sub's.
  const owned = await ownedProject<{ id: string; name: string | null }>(db, actor!, params.id, 'id, name')
  if ('denied' in owned) return owned.denied

  // A SITE TAKES ITS UNITS WITH IT. parent_project_id is ON DELETE SET NULL
  // (migration 063), so deleting only the site detached every unit and turned
  // "a building with 10 floors" into 10 loose projects - reported exactly so
  // after a bulk-added building was deleted. The units are deleted first, and
  // only if every one of them is this company's too.
  const { data: units, error: unitsError } = await db
    .from('projects')
    .select('id, gc_company_id, created_by_company_id')
    .eq('parent_project_id', params.id)
  if (unitsError) {
    console.error('[projects DELETE] reading units', unitsError)
    return NextResponse.json({ error: friendlyDbError(unitsError) }, { status: 500 })
  }
  const unitRows = units ?? []
  if (unitRows.some(u => !ownsProject(actor!.companyId, u))) {
    return NextResponse.json(
      { error: 'Some jobs on this site belong to another company, so the site cannot be deleted.' },
      { status: 403 },
    )
  }
  if (unitRows.length) {
    const { error: unitDeleteError } = await db.from('projects').delete().in('id', unitRows.map(u => u.id))
    if (unitDeleteError) {
      console.error('[projects DELETE] deleting units', unitDeleteError)
      return NextResponse.json({ error: friendlyDbError(unitDeleteError) }, { status: 500 })
    }
  }

  const { error } = await db.from('projects').delete().eq('id', params.id)
  if (error) {
    console.error('[projects DELETE]', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  return NextResponse.json({ success: true, unitsDeleted: unitRows.length })
}
