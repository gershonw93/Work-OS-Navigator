import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'
import { signIns, latestSignIn } from '@/lib/auth-sign-ins'
import { nextNudge, wholeDaysSince, NUDGE_LAST_DAY, type OnboardingFacts } from '@/lib/onboarding-nudges'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The first fifteen days, for somebody who has not come back.
//
// A new company got a trial and then silence until the day-12 warning. The
// product's own onboarding is a per-PROJECT checklist, invisible until a project
// exists - which is the step somebody who drifted has not taken.
//
// THE RULE IS IN `lib/onboarding-nudges.ts` AND THIS ONLY GATHERS FACTS. Every
// decision - which nudge, whether to say anything at all, when to stop - is one
// pure function, so the sequence can be reasoned about and tested without a
// database. What is left here is queries.
//
// EVERY COUNT IS TAKEN IN BULK, five queries for the whole cohort rather than
// five per company. The cohort is small today; a per-company round trip is how
// a nightly job becomes a timeout six months from now, quietly, on the morning
// somebody actually needed the email.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const now = new Date()

  // The cohort: companies inside the nudge window. The horizon is generous by a
  // day at each end so the pure rule, not the SQL, decides who is in - a query
  // narrowed to exactly the window is how a filter and a rule drift apart.
  const from = new Date(now)
  from.setDate(from.getDate() - (NUDGE_LAST_DAY + 2))
  const { data: trials, error } = await db
    .from('company_billing')
    .select('company_id, trial_started_at')
    .eq('status', 'trialing')
    .not('trial_started_at', 'is', null)
    .gte('trial_started_at', from.toISOString())

  if (error) {
    console.error('[onboarding] could not read the trial cohort', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const companyIds = (trials ?? []).map((t: any) => t.company_id)
  if (!companyIds.length) return NextResponse.json({ ok: true, companies: 0, sent: 0 })

  // ── the facts, in bulk ───────────────────────────────────────────────────
  const [people, projects, scans, already, accounts] = await Promise.all([
    db.from('profiles').select('id, company_id').in('company_id', companyIds),
    db.from('projects').select('id, gc_company_id').in('gc_company_id', companyIds),
    db.from('ai_scans').select('company_id').in('company_id', companyIds).eq('succeeded', true),
    db.from('onboarding_nudges_sent').select('company_id, nudge_key').in('company_id', companyIds),
    signIns(db),
  ])

  // A READ WE COULD NOT COMPLETE IS NOT A READ THAT SAID NO. Half the sign-in
  // pages missing looks exactly like half the customers never having signed in,
  // and the mistake it produces is mail to somebody who is sitting in the app.
  // Silence for a day costs nothing and is recoverable; the other way round is
  // the reason people mark us as spam.
  if (!accounts.complete) {
    console.error('[onboarding] sign-in read was incomplete - saying nothing today')
    return NextResponse.json({ ok: true, skipped: 'incomplete sign-in read', companies: companyIds.length, sent: 0 })
  }

  const projectIds = ((projects.data ?? []) as any[]).map(p => p.id)
  // Keyed on project, not company, so these two need the ids above first.
  const [budget, subs] = await Promise.all([
    projectIds.length
      ? db.from('budget_line_items').select('project_id').in('project_id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
    projectIds.length
      ? db.from('subcontracts').select('project_id').in('project_id', projectIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const projectCompany = new Map<string, string>()
  for (const p of (projects.data ?? []) as any[]) projectCompany.set(p.id, p.gc_company_id)

  const tally = <T>(rows: T[], key: (r: T) => string | null | undefined) => {
    const out = new Map<string, number>()
    for (const r of rows) {
      const k = key(r)
      if (k) out.set(k, (out.get(k) ?? 0) + 1)
    }
    return out
  }

  const peopleBy = tally((people.data ?? []) as any[], r => r.company_id)
  const projectsBy = tally((projects.data ?? []) as any[], r => r.gc_company_id)
  const scansBy = tally((scans.data ?? []) as any[], r => r.company_id)
  const budgetBy = tally((budget.data ?? []) as any[], r => projectCompany.get(r.project_id))
  const subsBy = tally((subs.data ?? []) as any[], r => projectCompany.get(r.project_id))

  const sentBy = new Map<string, string[]>()
  for (const r of (already.data ?? []) as any[]) {
    sentBy.set(r.company_id, [...(sentBy.get(r.company_id) ?? []), r.nudge_key])
  }
  const staffBy = new Map<string, string[]>()
  for (const p of (people.data ?? []) as any[]) {
    staffBy.set(p.company_id, [...(staffBy.get(p.company_id) ?? []), p.id])
  }

  let sent = 0
  let quiet = 0

  for (const trial of (trials ?? []) as any[]) {
    const id: string = trial.company_id
    const staff = staffBy.get(id) ?? []

    const facts: OnboardingFacts = {
      daysSinceSignup: wholeDaysSince(trial.trial_started_at, now) ?? 0,
      daysSinceSignIn: wholeDaysSince(latestSignIn(accounts.rows, staff), now),
      projects: projectsBy.get(id) ?? 0,
      budgetLines: budgetBy.get(id) ?? 0,
      teammates: peopleBy.get(id) ?? 0,
      subcontracts: subsBy.get(id) ?? 0,
      scans: scansBy.get(id) ?? 0,
      sent: sentBy.get(id) ?? [],
    }

    const nudge = nextNudge(facts)
    if (!nudge) { quiet++; continue }

    // THE GATE IS WRITTEN FIRST, and it is a unique index rather than a check.
    // Two runs overlapping on a slow morning would otherwise send the same
    // nudge twice, and the second one is what gets somebody to unsubscribe. A
    // conflict here means another run already has it - not an error.
    const { error: claimErr } = await db
      .from('onboarding_nudges_sent')
      .insert({ company_id: id, nudge_key: nudge.key })
    if (claimErr) {
      if ((claimErr as any).code !== '23505') {
        console.error('[onboarding] could not claim a nudge', { company: id, key: nudge.key, error: claimErr.message })
      }
      quiet++
      continue
    }

    // Everybody at the company. During a trial that is one or two people, and
    // who set the account up is not a fact we hold - the person who signed up
    // and the person who will do the work are often not the same.
    if (staff.length) {
      await notify({
        db, userIds: staff, type: 'onboarding_nudge',
        title: nudge.title,
        message: nudge.message,
        link: nudge.link,
      })
      sent++
    } else {
      quiet++
    }
  }

  return NextResponse.json({ ok: true, companies: companyIds.length, sent, quiet })
}
