import { NextResponse } from 'next/server'
import { requestIsIosShell } from './native-request-server'
import { IOS_LOCKED } from './native-request'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActor, actorCan, type ActorPerms } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import { ownsProject } from '@/lib/project-access'
import { readBilling } from '@/lib/billing-read'
import { billingAccess } from '@/lib/billing-state'
import { jobSide, type JobSide } from '@/lib/job-side'
import { projectIdFromUrl, subLaneAllows, SUB_LANE_REFUSAL } from '@/lib/sub-scope'

// ─────────────────────────────────────────────────────────────────────────────
// "Are you allowed to do this?" - asked once, in one place.
//
// THE HOLE THIS EXISTS FOR. 152 API routes accept writes and 7 of them checked
// anything beyond "are you signed in". So a Field Supervisor - a role with
// view-only on money - could PATCH a budget line, approve a bill, or record a
// payment. The UI hid the buttons, which is why it looked fine: the buttons
// were never the enforcement. A reviewer noticed the controls were still
// visible in role preview; the controls were the least of it.
//
// Five lines repeated across forty routes is how the forty-first gets missed,
// so it is two lines and this file instead:
//
//   const gate = await requirePermission(db, request, 'budget', 'edit')
//   if ('denied' in gate) return gate.denied
//
// WHAT THIS DELIBERATELY DOES NOT DO: demand that the caller's company OWNS
// the project. Subcontractors legitimately write to jobs they do not own - they
// submit bills, file daily logs, clock in - which is exactly why
// `ownsProject` exists as a separate question rather than a blanket rule.
//
// What it DOES do, for a URL under /api/projects/<id>/, is ask whether the
// caller is ON that job at all (`jobSide`), and keep a sub to the lane the
// menu has always shown them (lib/sub-scope.ts). That was the "own piece of
// work" this comment used to defer, and deferring it left every money route
// open to every company holding the permission - see the block at the end.
// ─────────────────────────────────────────────────────────────────────────────

/** `side` is set when the URL named a project: which side of it the caller is on. */
export type Gate = { actor: ActorPerms; side?: JobSide } | { denied: NextResponse }

/**
 * The actions that change something. A locked account may still be READ.
 *
 * That is the whole shape of the lock: past the trial with no plan, every
 * screen and every job stays open and nothing is deleted - what stops is
 * writing. A lock that hid the data would be holding a crew's own site records
 * hostage, which is a different product decision from asking them to pay.
 */
const WRITE_ACTIONS: Action[] = ['create', 'edit', 'delete']

/**
 * 402, not 403. A client behaves differently on each and a person reads them
 * differently: 403 is "you personally may not", which sends somebody to their
 * admin to ask for a permission nobody can grant them. Payment Required is the
 * one status that says the account, not the person.
 */
function paymentRequired(reason: string): NextResponse {
  // Every web reason ends in "Choose a plan" - a call to buy, which the iOS app
  // may not carry (lib/native-request.ts). The fact goes out either way.
  return NextResponse.json({ error: requestIsIosShell() ? IOS_LOCKED : reason, billing: 'locked' }, { status: 402 })
}

/**
 * The same lock, for the routes that gate by hand.
 *
 * `POST /api/projects` and `PATCH /api/projects/[id]` resolve permissions
 * themselves with `actorCan` rather than through `requirePermission`, so the
 * check below would never have run on the two routes that decide how many
 * jobs a company has open - which is the thing the plans meter. Exported
 * rather than copied: a second spelling of the lock is how one of them stops
 * matching the other.
 */
export async function billingLock(db: SupabaseClient, companyId: string | null | undefined): Promise<NextResponse | null> {
  if (!companyId) return null
  const access = billingAccess(await readBilling(db, companyId))
  return access.writable ? null : paymentRequired(access.reason)
}

/**
 * The permission a route needs, resolved from the bearer token.
 *
 * Same resolution as the UI (`/api/me/permissions`) and as `usersWhoCan`:
 * role defaults, then this company's overrides of them, then per-user
 * overrides. One resolver, so what the screen hides and what the API refuses
 * cannot drift apart - drift being the reason the buttons looked authoritative
 * when they were decoration.
 */
export async function requirePermission(
  db: SupabaseClient,
  request: Request,
  resource: string,
  action: Action = 'edit',
  opts: {
    /**
     * A sub may pass on this resource because THE ROUTE checks the record is
     * theirs (a subcontract their company holds on this job). Never set it on
     * a route that does not: it is the whole of what stands between a sub and
     * the GC's version of that screen.
     */
    subOwnRecord?: boolean
  } = {},
): Promise<Gate> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) {
    return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const actor = await getActor(db, token)
  // No actor means the token did not resolve to a user at all - 401, not 403.
  // The two are different facts and a client behaves differently on each: one
  // means sign in again, the other means you are signed in and may not.
  if (!actor) {
    return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!actorCan(actor, resource, action)) {
    return {
      denied: NextResponse.json(
        { error: `You do not have permission to ${action} ${resource.replace(/-/g, ' ')}.` },
        { status: 403 },
      ),
    }
  }

  // ── and is the account itself allowed to write today? ────────────────────
  //
  // HERE, because this is the only thing all 152 write routes already have in
  // common. The alternative was a line in each of them, which is how the
  // forty-first gets missed - the exact reasoning that put the permission
  // check here in the first place. `middleware.ts` cannot do it: it returns
  // early for every `/api/` path.
  //
  // Only for writes, so a read costs nothing extra, and only when the caller
  // has a company - a token with no profile behind it is already handled above.
  if (WRITE_ACTIONS.includes(action)) {
    const locked = await billingLock(db, actor.companyId)
    if (locked) return { denied: locked }
  }

  // ── and is this person ON the job the URL names? ─────────────────────────
  //
  // The permission says "may this person edit budgets"; it never said WHOSE.
  // So every route under /api/projects/<id>/ that asked only this function -
  // the budget, the bills, the payments, the pay apps, the quote comparisons,
  // about a hundred handlers - answered any company holding the permission for
  // any job id. Every GC's admin holds all of them, and so does a sub's own
  // admin: one PATCH recorded a payment on somebody else's job and pushed it
  // into their QuickBooks.
  //
  // HERE, for the same reason the billing lock is here: it is the one door all
  // of those routes already share, and a line in each is how the
  // hundred-and-first gets missed. Read off the PATH (`projectIdFromUrl`), so
  // nothing in the body can aim it at a different job.
  //
  //   stranger          404, in the words a missing job gets
  //   gc                through (assigned-only crew: only to their own jobs)
  //   sub / member      only the lane in lib/sub-scope.ts - else 403, because
  //                     they can see the job. A route that checks the RECORD
  //                     is theirs (a sub's own bill) opts in with subOwnRecord.
  const projectId = projectIdFromUrl(request.url)
  if (projectId) {
    const on = await jobSide(db, actor, projectId)
    if ('denied' in on) return { denied: on.denied }
    if (on.side !== 'gc' && !opts.subOwnRecord && !subLaneAllows(resource, action)) {
      return { denied: NextResponse.json({ error: SUB_LANE_REFUSAL }, { status: 403 }) }
    }
    return { actor, side: on.side }
  }

  return { actor }
}

/** Narrowing helper, so a caller reads as one line rather than a type dance. */
export function denied(gate: Gate): gate is { denied: NextResponse } {
  return 'denied' in gate
}

export type OwnedProject<T> = { project: T } | { denied: NextResponse }

/**
 * The SECOND question, for the routes that genuinely need it: does the caller's
 * company own this job?
 *
 * `requirePermission` deliberately does not ask - subcontractors legitimately
 * write to jobs they do not own (they submit bills, file daily logs, clock in),
 * so a blanket company check would break every sub in the product. That is why
 * this is opt-in per route rather than folded into the gate.
 *
 * The client portal is the clearest case for opting in. It is a standing
 * read-only link to the WHOLE job - progress, selections, and the invoices the
 * GC has sent their client - so a sub who is legitimately on the job must not
 * be able to read it, mint one, or regenerate it. The permission map says the
 * same thing (`read_only` has `client-portal: N`), and this is the half that
 * survives a company remapping the defaults.
 *
 * 403, not 404: they can see the job, and pretending it does not exist would be
 * a worse answer to a person who is legitimately standing on it.
 */
export async function ownedProject<T extends Record<string, unknown>>(
  db: SupabaseClient,
  actor: ActorPerms,
  projectId: string,
  columns: string,
): Promise<OwnedProject<T>> {
  const { data: project, error } = await db
    .from('projects')
    .select(`${columns}, gc_company_id, created_by_company_id`)
    .eq('id', projectId)
    .maybeSingle()

  if (error) {
    return { denied: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!project) {
    return { denied: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  }
  if (!ownsProject(actor.companyId, project as any)) {
    return {
      denied: NextResponse.json(
        { error: 'This job belongs to another company.' },
        { status: 403 },
      ),
    }
  }

  return { project: project as unknown as T }
}
