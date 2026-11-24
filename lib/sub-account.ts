import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// A SUB INVITED BY A GC STARTS LIGHT, AND RUNS HIS OWN JOBS WHEN HE SAYS SO.
//
// The owner's call (Nov 24, 2026): "a GC inviting a sub and if he wants to do
// more he can see 'upgrade your account' to do whatever". So the company an
// invite creates (lib/vendor-link-db.ts) is born `invited_only`: everything a
// sub does for a GC - My Jobs, bids, bills, compliance, the calendar - and no
// customers or jobs of his own until he presses "Run your own jobs".
//
// IT IS A TRIAL OF SUB_TRIAL_DAYS, AND ONLY ON THE WEB. The owner's call
// (Nov 24, 2026): pressing it starts a 30-day free trial, after which it is
// one of the plans like any GC's (`/api/account/run-own-jobs`). The iOS build
// offers no trial and no plan - the same as a GC's iPhone, which has no
// Billing tab at all since Apple rejected 1.0 (15) for one under 3.1.1 - so
// the card does not render there and the refusal sentence offers nothing.
// Whatever happens to the trial, the work a sub does on a GC's job is governed
// by the GC's plan (lib/api-guard.ts).
//
// THREE STATES, one place:
//   open          every company that is not one of the two below - nothing
//                 changes for any account that existed before 169
//   invited_only  born from an invite, light until he chooses
//   guest         his login sits INSIDE a GC's Directory row, where the old
//                 invite put him. Same limits; pressing the button gives him a
//                 company of his own and moves only his login - every record
//                 stays on the GC's row, which links to him
//
// THE SERVER ENFORCES IT (`ownJobsRefusal`) at every door that opens a job or
// a customer, the MCP tools included through lib/writes. The menu only
// follows: a hidden button is not a rule.
// ─────────────────────────────────────────────────────────────────────────────

export type SubAccount = 'open' | 'invited_only' | 'guest'

type CompanyFacts = { type?: string | null; invited_only?: boolean | null; added_by_company_id?: string | null } | null

const VENDOR = new Set(['subcontractor', 'supplier'])

export function subAccountState(company: CompanyFacts): SubAccount {
  if (!company) return 'open'
  if (company.added_by_company_id && VENDOR.has(company.type ?? '')) return 'guest'
  if (company.invited_only) return 'invited_only'
  return 'open'
}

/**
 * What the refusal says, wherever a light account tries to open a job or a
 * customer. ONE sentence for every shell: it states the fact and offers
 * nothing, because the offer is a trial and the iOS build may not carry one.
 * On the web the offer is on My Jobs, beside the button that was refused.
 */
export const OWN_JOBS_REFUSAL =
  'Your account is set up for the work contractors send you, so it does not have jobs or customers of its own.'

/** The offer on My Jobs (WEB ONLY) - one spelling for the card and Help. */
export const RUN_OWN_JOBS = {
  label: 'Run your own jobs',
  line: (days: number) =>
    `Add your own customers and jobs, alongside the work contractors send you. The first ${days} days are free; after that it is one of the plans. The work you do for contractors is never affected.`,
  button: (days: number) => `Start ${days} days free`,
}

/**
 * Null when this company may open its own jobs and customers; the sentence
 * otherwise. A read that FAILED is null too: every ambiguity resolves towards
 * writable (CLAUDE.md, billing) - a wrong refusal stops a sub mid-job, a wrong
 * yes is a light account that got one job early.
 */
export async function ownJobsRefusal(db: Pick<SupabaseClient, 'from'>, companyId: string | null | undefined): Promise<string | null> {
  if (!companyId) return null
  const { data, error } = await db.from('companies')
    .select('type, invited_only, added_by_company_id').eq('id', companyId).maybeSingle()
  if (error) {
    console.error('[sub-account] company read failed', { companyId, error: error.message })
    return null
  }
  return subAccountState(data as CompanyFacts) === 'open' ? null : OWN_JOBS_REFUSAL
}
