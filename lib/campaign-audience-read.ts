import type { SupabaseClient } from '@supabase/supabase-js'
import { signIns, latestSignIn } from './auth-sign-ins'
import { COUNTED_PROJECT_STATUSES } from './plan-limits'
import { normaliseEmail, type CampaignPerson } from './campaign-audience'
import { isPlaceholderEmail, isEmailAddress } from './contact-email'
import type { BillingRow } from './billing-state'

// ─────────────────────────────────────────────────────────────────────────────
// Assembling everybody a campaign could reach, in six queries rather than six
// per person.
//
// GC COMPANIES ONLY, AND IT IS `companies.type` THAT SAYS SO. "Has a billing
// row" would have been the obvious filter and it is wrong: migration 118
// backfilled a row for every company, subcontractor tenants included, so all
// twenty of them have one. The type column is the only thing that still
// distinguishes a customer from a sub somebody invited onto a job.
//
// THE PEOPLE COME BACK EVEN WHEN A COUNT DOES NOT. A failed project count is
// not "zero projects" - it would put every customer into "no job yet" and mail
// them about creating one. `complete` carries that up, and the route refuses to
// build a list it could not take completely: bulk mail is the one thing here
// with no way back.
// ─────────────────────────────────────────────────────────────────────────────

export interface Audience {
  people: CampaignPerson[]
  /** Did every query answer? A partial read must not become a send. */
  complete: boolean
}

export async function readAudience(db: SupabaseClient): Promise<Audience> {
  let complete = true
  const failed = (what: string, message: string) => {
    console.error(`[campaigns] could not read ${what}`, message)
    complete = false
  }

  const companies = await db.from('companies').select('id, name, type').eq('type', 'gc')
  if (companies.error) {
    failed('the companies', companies.error.message)
    return { people: [], complete: false }
  }
  const companyRows = (companies.data ?? []) as { id: string; name: string | null; type: string | null }[]
  const companyIds = companyRows.map(c => c.id)
  if (!companyIds.length) return { people: [], complete }

  const [people, billing, projects, accounts] = await Promise.all([
    db.from('profiles').select('id, full_name, email, company_id').in('company_id', companyIds),
    db.from('company_billing')
      .select('company_id, status, plan_key, trial_ends_at, comped_until, current_period_end, cancel_at_period_end')
      .in('company_id', companyIds),
    db.from('projects').select('gc_company_id').in('gc_company_id', companyIds)
      .in('status', COUNTED_PROJECT_STATUSES as unknown as string[]),
    signIns(db),
  ])

  if (people.error) {
    failed('the people', people.error.message)
    return { people: [], complete: false }
  }
  if (billing.error) failed('the billing rows', billing.error.message)
  if (projects.error) failed('the project counts', projects.error.message)
  // A HALF-READ SIGN-IN LIST LOOKS EXACTLY LIKE HALF THE CUSTOMERS NEVER
  // HAVING SIGNED IN - the same trap the onboarding cron refuses to walk into,
  // and here it would put active customers into "quiet for a fortnight".
  if (!accounts.complete) failed('the sign-ins', 'the page-through did not finish')

  const company = new Map(companyRows.map(c => [c.id, c]))
  const billingBy = new Map<string, BillingRow>()
  for (const b of (billing.data ?? []) as (BillingRow & { company_id: string })[]) {
    billingBy.set(b.company_id, b)
  }
  const projectsBy = new Map<string, number>()
  for (const p of (projects.data ?? []) as { gc_company_id: string }[]) {
    projectsBy.set(p.gc_company_id, (projectsBy.get(p.gc_company_id) ?? 0) + 1)
  }

  const rows: CampaignPerson[] = []
  for (const p of (people.data ?? []) as
    { id: string; full_name: string | null; email: string | null; company_id: string | null }[]) {
    const address = normaliseEmail(p.email)
    // An address we cannot reach is not a recipient. 26 rows carry an invented
    // one, and `sendEmail` refuses them at the last gate anyway - counting them
    // in a list only makes the number on the confirmation a lie.
    if (!isEmailAddress(address) || isPlaceholderEmail(address)) continue
    const c = p.company_id ? company.get(p.company_id) : null
    if (!c) continue
    rows.push({
      profileId: p.id,
      email: address,
      firstName: (p.full_name ?? '').trim() || null,
      companyId: c.id,
      companyName: c.name,
      companyType: c.type,
      billing: billingBy.get(c.id) ?? null,
      projects: projectsBy.get(c.id) ?? 0,
      lastSignInAt: latestSignIn(accounts.rows, [p.id]),
    })
  }

  return { people: rows, complete }
}

/**
 * Every address that has asked us to stop.
 *
 * READ AT LIST BUILD AND AGAIN AT SEND. A failed read answers null rather than
 * an empty set, because an empty set is indistinguishable from "nobody has
 * unsubscribed" and would mail every one of them - the one mistake in this
 * feature that cannot be taken back.
 */
export async function readSuppressions(db: SupabaseClient): Promise<Set<string> | null> {
  const { data, error } = await db.from('email_suppressions').select('email')
  if (error) {
    console.error('[campaigns] could not read the suppression list', error.message)
    return null
  }
  return new Set(((data ?? []) as { email: string }[]).map(r => normaliseEmail(r.email)))
}
