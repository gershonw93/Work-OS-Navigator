import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { billingAccess } from '@/lib/billing-state'
import { entitlement, scanLimitProblem } from '@/lib/plan-limits'
import { readBilling, readUsage } from '@/lib/billing-read'
import type { ScanKind } from './scan-kinds'

// ─────────────────────────────────────────────────────────────────────────────
// "150, 300 or 750 AI scans a month" - the number the pricing page has been
// printing while nothing in the product counted a single one.
//
// Twelve routes call the model and none of them left a trace, so the allowance
// was a claim with no mechanism: a customer could not see where they were, we
// could not answer if they asked, and the cap could not be enforced without
// first inventing the counting. This is the counting.
//
// THE ROW GOES IN BEFORE THE MODEL IS CALLED, marked failed, and is flipped to
// succeeded when an answer comes back. Written the other way round - record it
// once it works - a route that times out or throws records nothing at all, and
// `succeeded` becomes a column that is true on every row and therefore says
// nothing. This way a scan that died is visible to support, and only the ones
// that produced an answer count against the allowance: a customer who got
// nothing has not spent anything.
// ─────────────────────────────────────────────────────────────────────────────

export { SCAN_KINDS, type ScanKind } from './scan-kinds'

/**
 * The scanner, looked up from a user id.
 *
 * For the routes that resolve a user off the token and never ask a permission.
 * One profile read; a company we cannot find means unmetered, which is the
 * permissive guess and the right one - see `lib/billing-state.ts`.
 */
export async function scanActorFor(db: SupabaseClient, userId: string): Promise<ScanActor> {
  const { data, error } = await db.from('profiles').select('company_id').eq('id', userId).maybeSingle()
  if (error) console.error('[scan] could not resolve the scanning company', error.message)
  return { userId, companyId: (data as { company_id: string | null } | null)?.company_id ?? null }
}

export type ScanGate =
  | { denied: NextResponse }
  | { ok: true; succeeded: () => Promise<void> }

export function scanDenied(g: ScanGate): g is { denied: NextResponse } {
  return 'denied' in g
}

/**
 * Who is scanning. Deliberately looser than `ActorPerms`: four of the twelve
 * scan routes never ask a permission at all - they resolve a user off the
 * token and go - so this takes the two fields the meter needs rather than
 * forcing a permission model onto routes that are a separate piece of work.
 */
export interface ScanActor {
  userId: string
  companyId: string | null
}

/**
 * Ask whether this scan may run, and open a record for it.
 *
 * A company with no billing row is unmetered - a subcontractor scanning its
 * own paperwork on somebody else's job is not spending our customer's
 * allowance, and has no plan of its own to spend.
 */
export async function guardScan(
  db: SupabaseClient,
  actor: ScanActor | null | undefined,
  kind: ScanKind,
  projectId: string | null,
  now: Date = new Date(),
): Promise<ScanGate> {
  const companyId = actor?.companyId
  if (!actor || !companyId) return { ok: true, succeeded: async () => {} }

  const row = await readBilling(db, companyId)
  if (!row) return { ok: true, succeeded: async () => {} }

  const access = billingAccess(row, now)
  // A locked account is already refused by `requirePermission` before it gets
  // here, but a scan route that only needs `view` would slip past that, so the
  // question is asked again rather than assumed.
  if (!access.writable) {
    return { denied: NextResponse.json({ error: access.reason, billing: 'locked' }, { status: 402 }) }
  }

  const ent = entitlement(access)
  const usage = await readUsage(db, companyId, now)
  const problem = scanLimitProblem(ent, usage.scansThisMonth, now)
  if (problem) {
    return { denied: NextResponse.json({ error: problem, billing: 'scan_limit' }, { status: 402 }) }
  }

  const { data, error } = await db
    .from('ai_scans')
    .insert({ company_id: companyId, project_id: projectId, user_id: actor.userId, kind, succeeded: false })
    .select('id')
    .single()

  // METERING MUST NOT BE ABLE TO REFUSE A SCAN. If the record cannot be
  // written, the customer still gets their answer and we lose one tick of a
  // counter - the other way round, a broken table stops the product.
  if (error || !data) {
    console.error('[scan] could not open a usage record', { kind, error: error?.message })
    return { ok: true, succeeded: async () => {} }
  }

  const id = (data as { id: string }).id
  return {
    ok: true,
    succeeded: async () => {
      const { error: e } = await db.from('ai_scans').update({ succeeded: true }).eq('id', id)
      if (e) console.error('[scan] could not close a usage record', { id, error: e.message })
    },
  }
}
