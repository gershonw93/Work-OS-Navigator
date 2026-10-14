import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { actorCan, type ActorPerms } from '@/lib/server-permissions'
import { ownsProject } from '@/lib/project-access'
import { companyOnJob } from './compliance-document'

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
  | { actor: ActorPerms; scope: 'own-company'; companyId: string }
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
  const gate = await requirePermission(db, request, 'projects', 'view')
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

  if (actor.companyId && await companyOnJob(db, projectId, actor.companyId)) {
    const locked = await lock(); if (locked) return { denied: locked }
    return { actor, scope: 'own-company', companyId: actor.companyId }
  }
  return { denied: NextResponse.json({ error: 'This job belongs to another company.' }, { status: 403 }) }
}
