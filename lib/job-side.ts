import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { ActorPerms } from './server-permissions'
import { ownsProject } from './project-access'
import { isAssignedOnly } from './permissions'
import { myJobs } from './my-jobs'
import { vendorCompanyIds } from './sub-companies'

// ─────────────────────────────────────────────────────────────────────────────
// WHICH SIDE OF THIS JOB IS THE CALLER ON - or none. The question under
// `jobGate` (lib/job-access.ts) and, for every route under
// `/api/projects/<id>/`, under `requirePermission` too (lib/api-guard.ts).
//
// It lives here rather than in job-access.ts so api-guard can ask it:
// job-access imports `billingLock` from api-guard, and the reverse import
// would be a cycle.
//
// Three ways to be on a job, strongest first:
//
//   gc      the caller's company owns it (`ownsProject`: the GC on the job or
//           the company that created it) - and, for a role that only ever sees
//           the jobs it is assigned to, the caller is assigned to THIS one.
//   sub     the caller's company holds a subcontract on it - the same test
//           `lib/rfi-access.ts` asks, and the way an invited vendor reaches
//           the job.
//   member  the caller is on the job's team: by `profile_id`, or by their
//           address (case-folded - rows carry what a human typed). NOT by
//           name: a name is not a key (`lib/my-jobs.ts`), and the name-only
//           rows that matter are inside the caller's own company, which is
//           already `gc`.
//
// Anybody else is refused with the SAME 404 a missing job gets, so a stranger
// probing ids learns nothing about which ones exist.
//
// THE CREW RULE. A worker, a field supervisor, a member or a read-only user
// sees only the jobs they are assigned to - in the Projects list, on the
// dashboard, in search and on the calendar - and then could open ANY job of
// their company by id, because owning the job was the whole test. Now the
// assignment is part of the answer, read through `myJobs`: the SAME resolution
// that builds their My Jobs list, so a job on the list always opens and a job
// off it never does. A different rule here would either lock somebody out of
// a job on their own screen or leave the hole open by a different route.
// ─────────────────────────────────────────────────────────────────────────────

export type JobSide = 'gc' | 'sub' | 'member'

type Db = Pick<SupabaseClient, 'from'>

const NOT_FOUND = () => NextResponse.json({ error: 'Project not found' }, { status: 404 })

const fold = (v: unknown): string => String(v ?? '').trim().toLowerCase()
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, m => `\\${m}`)

export async function jobSide(
  db: Db,
  actor: Pick<ActorPerms, 'userId' | 'companyId'> & { role?: string | null },
  projectId: string,
): Promise<{ side: JobSide } | { denied: NextResponse }> {
  const { data: project, error } = await db
    .from('projects').select('id, gc_company_id, created_by_company_id').eq('id', projectId).maybeSingle()
  if (error) {
    console.error('[job-side] project read failed', { projectId, error: error.message })
    return { denied: NextResponse.json({ error: 'Could not load this job. Try again.' }, { status: 500 }) }
  }
  if (!project) return { denied: NOT_FOUND() }

  if (ownsProject(actor.companyId, project as any)) {
    if (!isAssignedOnly(actor.role)) return { side: 'gc' }
    const { data: me } = await db.from('profiles')
      .select('email, full_name, company_id').eq('id', actor.userId).maybeSingle()
    const mine = await myJobs(db as SupabaseClient, actor.userId, me as any)
    if (mine.projectIds.includes(projectId)) return { side: 'gc' }
    // Not assigned. Fall through: they may still be on it another way (a
    // subcontract their company holds is impossible on its own job, but a team
    // row by address is not), and the answer otherwise is the stranger's 404.
  }

  // The sub side follows the Directory link (migration 169): a GC's
  // subcontract names the GC's own row for the vendor, which points at the
  // sub's company. `vendorCompanyIds` is that set - and null on a failed read,
  // which is a 500 here, never "not on this job".
  if (actor.companyId) {
    const mine = await vendorCompanyIds(db, actor.companyId)
    if (mine === null) {
      return { denied: NextResponse.json({ error: 'Could not load this job. Try again.' }, { status: 500 }) }
    }
    const { data: subs } = await db
      .from('subcontracts').select('id').eq('project_id', projectId).in('company_id', mine).limit(1)
    if (subs?.length) return { side: 'sub' }
  }

  const { data: byProfile } = await db
    .from('project_team_members').select('id').eq('project_id', projectId).eq('profile_id', actor.userId).limit(1)
  if (byProfile?.length) return { side: 'member' }

  const { data: me } = await db.from('profiles').select('email').eq('id', actor.userId).maybeSingle()
  const email = fold((me as any)?.email)
  if (email) {
    const { data: byEmail } = await db
      .from('project_team_members').select('id, email').eq('project_id', projectId).ilike('email', escapeLike(email))
    if (((byEmail ?? []) as { email?: string | null }[]).some(r => fold(r.email) === email)) return { side: 'member' }
  }

  return { denied: NOT_FOUND() }
}
