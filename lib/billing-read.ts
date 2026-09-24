import type { SupabaseClient } from '@supabase/supabase-js'
import { billingAccess, type Access, type BillingRow } from './billing-state'
import { entitlement, projectLimitProblem, scanWindowStart, COUNTED_PROJECT_STATUSES, type Entitlement, type Usage } from './plan-limits'

// ─────────────────────────────────────────────────────────────────────────────
// The ONE reader of what a company is entitled to and what it has used.
//
// Three callers ask it - the write guard, the billing screen, and the platform
// console - and they must not each assemble their own version. The rule this
// file exists to keep is the one the schedule roll-up broke: the number the
// METER prints and the number the GUARD counts have to be taken over the same
// window, with the same statuses, or a screen says you have room while the
// route refuses you.
//
// EVERY COLUMN BELOW EXISTS IN MIGRATION 118. PostgREST answers an unknown
// column with `data: null`, which a `?? null` turns into "this company has no
// billing row" - which resolves to unmetered, which is a silent hole in the
// only thing enforcing any of this.
// ─────────────────────────────────────────────────────────────────────────────

const BILLING_COLUMNS =
  'company_id, status, plan_key, trial_started_at, trial_ends_at, ' +
  'comped_by, comped_by_name, comped_reason, comped_at, comped_until, ' +
  'stripe_customer_id, stripe_subscription_id, stripe_price_id, ' +
  'current_period_end, cancel_at_period_end, created_at'

export type StoredBilling = BillingRow & {
  company_id: string
  comped_by_name?: string | null
  comped_reason?: string | null
  comped_at?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  created_at?: string | null
}

/** The row, or null when this company is not a paying tenant (a sub, a vendor). */
export async function readBilling(db: SupabaseClient, companyId: string): Promise<StoredBilling | null> {
  const { data, error } = await db
    .from('company_billing')
    .select(BILLING_COLUMNS)
    .eq('company_id', companyId)
    .maybeSingle()

  // A REFUSED QUERY IS NOT AN ANSWER. Keeping the log is the difference
  // between "this company is unmetered" and "we could not ask" - and the two
  // resolve to the same permissive result on purpose, so without this line
  // nothing anywhere would ever say the table was unreachable.
  if (error) {
    console.error('[billing] could not read company_billing', { companyId, error: error.message })
    return null
  }
  return (data as unknown as StoredBilling) ?? null
}

/** Active projects and this month's successful scans. */
export async function readUsage(db: SupabaseClient, companyId: string, now: Date = new Date()): Promise<Usage> {
  const [projects, scans] = await Promise.all([
    db.from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('gc_company_id', companyId)
      .in('status', COUNTED_PROJECT_STATUSES as unknown as string[]),
    db.from('ai_scans')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('succeeded', true)
      .gte('created_at', scanWindowStart(now)),
  ])

  if (projects.error) console.error('[billing] project count failed', projects.error.message)
  if (scans.error) console.error('[billing] scan count failed', scans.error.message)

  // A count that could not be taken is NOT zero. Zero is the answer that says
  // "you have used none of your allowance", which is the most permissive thing
  // this screen can say and the least true. -1 would be worse on a screen, so
  // the callers that matter (the two guards) treat a failed read as "do not
  // refuse", and the meter shows what it got.
  return {
    activeProjects: projects.count ?? 0,
    scansThisMonth: scans.count ?? 0,
  }
}

export interface BillingPicture {
  row: StoredBilling | null
  access: Access
  entitlement: Entitlement
  usage: Usage
}

/** Everything the billing screen and the platform console draw, in one trip. */
export async function billingPicture(
  db: SupabaseClient,
  companyId: string,
  now: Date = new Date(),
): Promise<BillingPicture> {
  const [row, usage] = await Promise.all([readBilling(db, companyId), readUsage(db, companyId, now)])
  const access = billingAccess(row, now)
  return { row, access, entitlement: entitlement(access), usage }
}

/**
 * Why another active job cannot be opened, or null if it can.
 *
 * ASKED ON EVERY DOOR THAT CAN OPEN ONE, which is two: creating a project, and
 * moving an existing one back out of completed or cancelled. Enforcing it only
 * at creation would mean the eleventh job was one status change away, and a
 * rule with a second door is not a rule - the same shape as `clearsCompletion`
 * having to be asked by all three inspection doors.
 */
export async function projectSlotProblem(
  db: SupabaseClient,
  companyId: string | null | undefined,
  now: Date = new Date(),
): Promise<string | null> {
  if (!companyId) return null
  const { access, entitlement: ent, usage } = await billingPicture(db, companyId, now)
  if (access.state === 'unmetered') return null
  return projectLimitProblem(ent, usage.activeProjects)
}
