import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan, type ActorPerms } from './server-permissions'
import { ownsProject } from './project-access'
import { billingLock } from './api-guard'

/**
 * Who is asking about this job's RFIs, and from which side.
 *
 * Every RFI route used to ask one question - "is there a signed-in user?" - and
 * nothing else. So any account in the product could list another company's
 * RFIs, file one into a job it was not on under any company name it liked
 * (`company_id` and `company_name` came off the request body), answer one,
 * approve its change order, or delete it.
 *
 * `requirePermission` alone cannot fix that, for the reason it deliberately
 * leaves ownership out: a SUB submits RFIs on a job it does not own, and the
 * vendor role carries `rfis: view` only. So the answer has two sides:
 *
 *   gc  - the caller's company owns the job. Their role's `rfis` permission
 *         decides, action by action.
 *   sub - the caller's company holds a subcontract on the job. They may ask
 *         (POST) and read their own; answering, approving a change order and
 *         deleting are the GC's.
 *
 * Anybody else is refused, 403 - and the company an RFI is filed under is the
 * CALLER's, read here, never a field in the body.
 */
export type RfiSide =
  | { side: 'gc'; actor: ActorPerms }
  | { side: 'sub'; actor: ActorPerms; companyName: string | null }

export async function rfiSide(
  db: SupabaseClient,
  request: Request,
  projectId: string,
): Promise<RfiSide | { denied: NextResponse }> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const actor = await getActor(db, token)
  if (!actor) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: project, error } = await db
    .from('projects').select('id, gc_company_id, created_by_company_id').eq('id', projectId).maybeSingle()
  if (error) {
    console.error('[rfis] project read failed', { projectId, error: error.message })
    return { denied: NextResponse.json({ error: 'Could not load this job. Try again.' }, { status: 500 }) }
  }
  if (!project) return { denied: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }

  if (ownsProject(actor.companyId, project)) return { side: 'gc', actor }

  if (actor.companyId) {
    const { data: subs } = await db
      .from('subcontracts').select('id').eq('project_id', projectId).eq('company_id', actor.companyId).limit(1)
    if (subs?.length) {
      const { data: company } = await db.from('companies').select('name').eq('id', actor.companyId).maybeSingle()
      return { side: 'sub', actor, companyName: company?.name ?? null }
    }
  }

  return { denied: NextResponse.json({ error: 'You are not on this job.' }, { status: 403 }) }
}

/**
 * The GC-side gate for one action. A sub is refused outright - answering,
 * approving a change order, sending the answer link and deleting are decisions
 * about the GC's job - and the GC's own staff need the `rfis` permission.
 */
export async function rfiGcGate(
  db: SupabaseClient,
  request: Request,
  projectId: string,
  action: 'view' | 'create' | 'edit' | 'delete',
): Promise<{ actor: ActorPerms } | { denied: NextResponse }> {
  const who = await rfiSide(db, request, projectId)
  if ('denied' in who) return who
  if (who.side !== 'gc') {
    return { denied: NextResponse.json({ error: 'Only the general contractor can do that on an RFI.' }, { status: 403 }) }
  }
  if (!actorCan(who.actor, 'rfis', action)) {
    return { denied: NextResponse.json({ error: `You do not have permission to ${action} RFIs.` }, { status: 403 }) }
  }
  if (action !== 'view') {
    const locked = await billingLock(db, who.actor.companyId)
    if (locked) return { denied: locked }
  }
  return { actor: who.actor }
}
