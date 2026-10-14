import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan, type ActorPerms } from './server-permissions'
import { ownsProject } from './project-access'
import { billingLock } from './api-guard'
import type { Action } from './permissions'

// ─────────────────────────────────────────────────────────────────────────────
// IS THIS PERSON ON THIS JOB - the question the field routes never asked.
//
// Daily logs, tasks, the time clock and the plan viewer are used by the people
// who are NOT the job's owner as much as by the people who are: a worker
// clocking in, a field supervisor filing the day's log, an invited sub ticking
// off a task from My Jobs. So `ownedProject` is the wrong check for them - it
// would lock every sub out of the job they were hired onto. And
// `requirePermission` alone is not a check about the JOB at all: it answers
// "may this person view daily logs" and then the route read the logs of
// whatever project id was in the URL. Any account in the product, at any
// company, could read any job's logs, photos and timesheets by its id.
//
// Three ways to be on a job, strongest first:
//
//   gc      the caller's company owns it (`ownsProject`: the GC on the job or
//           the company that created it).
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
// ─────────────────────────────────────────────────────────────────────────────

export type JobSide = 'gc' | 'sub' | 'member'

type Db = Pick<SupabaseClient, 'from'>

const NOT_FOUND = () => NextResponse.json({ error: 'Project not found' }, { status: 404 })

const fold = (v: unknown): string => String(v ?? '').trim().toLowerCase()
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, m => `\\${m}`)

export async function jobSide(
  db: Db,
  actor: Pick<ActorPerms, 'userId' | 'companyId'>,
  projectId: string,
): Promise<{ side: JobSide } | { denied: NextResponse }> {
  const { data: project, error } = await db
    .from('projects').select('id, gc_company_id, created_by_company_id').eq('id', projectId).maybeSingle()
  if (error) {
    console.error('[job-access] project read failed', { projectId, error: error.message })
    return { denied: NextResponse.json({ error: 'Could not load this job. Try again.' }, { status: 500 }) }
  }
  if (!project) return { denied: NOT_FOUND() }

  if (ownsProject(actor.companyId, project as any)) return { side: 'gc' }

  if (actor.companyId) {
    const { data: subs } = await db
      .from('subcontracts').select('id').eq('project_id', projectId).eq('company_id', actor.companyId).limit(1)
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

export type JobGate = { actor: ActorPerms; side: JobSide } | { denied: NextResponse }

const WRITE_ACTIONS: Action[] = ['create', 'edit', 'delete']

/**
 * The permission AND the job, for an actor already resolved (the plan viewer
 * resolves its user from cookies, not a bearer token).
 *
 * `write: true` applies the billing lock to a handler gated at `view` - several
 * field writes are, because the screens offer them to view-only roles today
 * (see each route). `requirePermission` only locks at a write action.
 */
export async function actorJobGate(
  db: SupabaseClient,
  actor: ActorPerms,
  projectId: string,
  resource: string,
  action: Action = 'view',
  opts: { write?: boolean } = {},
): Promise<JobGate> {
  if (!actorCan(actor, resource, action)) {
    return {
      denied: NextResponse.json(
        { error: `You do not have permission to ${action} ${resource.replace(/-/g, ' ')}.` },
        { status: 403 },
      ),
    }
  }
  if (opts.write || WRITE_ACTIONS.includes(action)) {
    const locked = await billingLock(db, actor.companyId)
    if (locked) return { denied: locked }
  }
  const on = await jobSide(db, actor, projectId)
  if ('denied' in on) return on
  return { actor, side: on.side }
}

/**
 * `requirePermission` plus "is this person on this job". The token comes off
 * the Authorization header, or `opts.token` for the one route a browser opens
 * as a plain link (the daily-log PDF takes `?token=`).
 */
export async function jobGate(
  db: SupabaseClient,
  request: Request,
  projectId: string,
  resource: string,
  action: Action = 'view',
  opts: { write?: boolean; token?: string | null } = {},
): Promise<JobGate> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') || opts.token
  if (!token) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const actor = await getActor(db, token)
  if (!actor) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return actorJobGate(db, actor, projectId, resource, action, opts)
}

/**
 * The ids of the people at the caller's company - what a sub's time manager
 * may see and approve on somebody else's job: their own crew, never the GC's.
 * Null when the read failed, which a caller must treat as "nobody", not "all".
 */
export async function companyProfileIds(db: Db, companyId: string | null | undefined): Promise<string[] | null> {
  if (!companyId) return []
  const { data, error } = await db.from('profiles').select('id').eq('company_id', companyId)
  if (error) {
    console.error('[job-access] company profiles read failed', error.message)
    return null
  }
  return ((data ?? []) as { id: string }[]).map(r => r.id)
}

/** The log named in a URL belongs to the job named beside it. */
export async function logOnJob(db: Db, projectId: string, logId: string): Promise<boolean> {
  const { data } = await db.from('daily_logs').select('id').eq('id', logId).eq('project_id', projectId).maybeSingle()
  return !!data
}
