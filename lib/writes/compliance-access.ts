import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { actorCan, type ActorPerms } from '@/lib/server-permissions'
import { ownsProject } from '@/lib/project-access'
import { vendorCompanyIds } from '@/lib/sub-companies'

// ─────────────────────────────────────────────────────────────────────────────
// Who may read and write a job's compliance - asked by every handler of
// /api/projects/[id]/compliance. Kept apart from compliance-document.ts so the
// MCP server, which has its own gates in the dispatcher, does not import the
// route machinery.
//
// The route used to ask only "is somebody signed in", so anybody holding a job
// id could file - or APPROVE - a certificate for any company on it. Two kinds
// of person legitimately write here, and they are different:
//   - the GC that owns the job, for any vendor on it (the Compliance tab);
//   - a sub ON the job, for its OWN company only (My Jobs -> Compliance). A sub
//     does not approve its own paperwork: the GC does.
// ─────────────────────────────────────────────────────────────────────────────

export type ComplianceAccess =
  | { actor: ActorPerms; scope: 'owner' }
  | { actor: ActorPerms; scope: 'own-company'; companyId: string; mine: string[] }
  | { denied: NextResponse }

/**
 * The gate every compliance handler asks. `write` adds the billing lock (the
 * base gate is asked at `view`, which skips it).
 *
 * The GC side READS at `compliance: view` and WRITES at `compliance: edit`.
 * It wrote at `view` while a Project Manager's default was view-only and the
 * tab let them add; the owner gave PMs edit instead, so the permission now
 * means what it says - same decision as the Directory's edit and delete.
 * The Printed report reads this route too, so `reports: view` also reads.
 */
export async function complianceAccess(
  db: SupabaseClient, request: Request, projectId: string, opts: { write: boolean },
): Promise<ComplianceAccess> {
  // `subOwnRecord`: this gate does its own "whose paperwork" check below (a
  // sub files only under its own company on this job). Without the flag the
  // sub lane in requirePermission refused `projects: view` on a GC's job, and
  // a sub's My Jobs -> Compliance answered 403 (#713).
  const gate = await requirePermission(db, request, 'projects', 'view', { subOwnRecord: true })
  if (denied(gate)) return gate
  const { actor } = gate

  const { data: project, error } = await db.from('projects')
    .select('id, gc_company_id, created_by_company_id').eq('id', projectId).maybeSingle()
  if (error) return { denied: NextResponse.json({ error: 'Could not check that job just now.' }, { status: 500 }) }
  if (!project) return { denied: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  const lock = async () => (opts.write ? billingLock(db, actor.companyId) : null)

  if (ownsProject(actor.companyId, project as any)) {
    const may = opts.write
      ? actorCan(actor, 'compliance', 'edit')
      : actorCan(actor, 'compliance', 'view') || actorCan(actor, 'reports', 'view')
    if (!may) return { denied: NextResponse.json({ error: `You do not have permission to ${opts.write ? 'edit' : 'view'} compliance.` }, { status: 403 }) }
    const locked = await lock(); if (locked) return { denied: locked }
    return { actor, scope: 'owner' }
  }

  // THE COMPANY A SUB FILES UNDER IS THE ONE ON THE SUBCONTRACT. Since 169 a
  // sub reaches a GC's job through the GC's Directory row for him, linked to
  // his own company - so his paperwork for this job is filed against that row,
  // which is what the GC's Compliance tab, the printed report and the expiry
  // reminders all read. His own company id is a key to the row, not the row.
  const mine = await vendorCompanyIds(db, actor.companyId)
  if (mine === null) return { denied: NextResponse.json({ error: 'Could not check that job just now.' }, { status: 500 }) }
  const row = await vendorRowOnJob(db, projectId, mine)
  if (row) {
    const locked = await lock(); if (locked) return { denied: locked }
    return { actor, scope: 'own-company', companyId: row, mine }
  }
  return { denied: NextResponse.json({ error: 'This job belongs to another company.' }, { status: 403 }) }
}

/**
 * The subcontract's company for one of `mine` on this job - the row a sub's
 * work on it is filed under. Null when none of them holds one (or the read
 * failed, logged): either way, not on the job.
 */
export async function vendorRowOnJob(
  db: Pick<SupabaseClient, 'from'>, projectId: string, mine: readonly string[],
): Promise<string | null> {
  if (!mine.length) return null
  const { data, error } = await db.from('subcontracts')
    .select('company_id').eq('project_id', projectId).in('company_id', mine as string[]).limit(1)
  if (error) { console.error('[compliance] subcontract lookup:', error.message); return null }
  return ((data ?? [])[0] as { company_id?: string } | undefined)?.company_id ?? null
}
