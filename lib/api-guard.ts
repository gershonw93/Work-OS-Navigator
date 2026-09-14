import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActor, actorCan, type ActorPerms } from '@/lib/server-permissions'
import type { Action } from '@/lib/permissions'
import { ownsProject } from '@/lib/project-access'

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
// WHAT THIS DELIBERATELY DOES NOT DO: check that the caller's company owns the
// project. Subcontractors legitimately write to jobs they do not own - they
// submit bills, file daily logs, clock in - which is exactly why
// `ownsProject` exists as a separate question rather than a blanket rule.
// Getting that right means deciding, per route, which writes a sub may make.
// Bolting on a company check here would close a smaller hole by breaking every
// sub in the product, so it is its own piece of work.
// ─────────────────────────────────────────────────────────────────────────────

export type Gate = { actor: ActorPerms } | { denied: NextResponse }

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
