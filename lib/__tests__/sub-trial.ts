// "RUN YOUR OWN JOBS" IS A 30-DAY FREE TRIAL - AND NEVER COSTS A GC ITS SUB.
//
// The owner's call (Nov 24, 2026): it "should be a 30 day free trial but then
// on iphone app make it just say what plan they are on like the regular gcs
// have". A GC's iPhone has no Billing tab and no plan screen (Apple rejected
// 1.0 (15) for one), so the iOS build offers a sub no trial either.
//
// The rule that came with it: once a sub's company carries a trial, the
// billing lock could reach him - and the lock was per COMPANY on every write,
// so a lapsed trial would have stopped the bill, the daily log and the RFI a
// GC is waiting on. On somebody else's job the OWNER's plan governs.

import { ok, done, code } from './_helpers'

type Rows = Record<string, Record<string, unknown>[]>

function fakeDb(tables: Rows) {
  return {
    auth: { getUser: async (token: string) => ({ data: { user: token ? { id: token } : null } }) },
    from(table: string) {
      let rows = [...(tables[table] ?? [])]
      const q: any = {
        select: () => q, order: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter(r => r[c] === v); return q },
        in: (c: string, vs: unknown[]) => { rows = rows.filter(r => vs.includes(r[c])); return q },
        ilike: (c: string, p: string) => { const w = p.replace(/\\(.)/g, '$1').toLowerCase(); rows = rows.filter(r => String(r[c] ?? '').toLowerCase() === w); return q },
        or: (expr: string) => { const parts = expr.split(',').map(p => p.split('.eq.')); rows = rows.filter(r => parts.some(([c, v]) => r[c] === v)); return q },
        limit: (n: number) => { rows = rows.slice(0, n); return q },
        single: async () => rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res, rej),
      }
      return q
    },
  } as any
}

const GC_JOB = '11111111-1111-4111-8111-111111111111'
const OWN_JOB = '22222222-2222-4222-8222-222222222222'
const day = 86_400_000

async function main() {
  ;(globalThis as any).__dirname = '/'
  const { SUB_TRIAL_DAYS, TRIAL_DAYS } = await import('../plans')
  const { trialLength, billingAccess } = await import('../billing-state')
  const { requirePermission } = await import('../api-guard')

  // ── the length is the row's own ──────────────────────────────────────────
  ok(SUB_TRIAL_DAYS === 30 && TRIAL_DAYS === 15, 'the sub trial is 30 days; the waitlist trial is still 15')
  const now = new Date('2026-11-24T12:00:00Z')
  const subRow = { status: 'trialing', trial_started_at: new Date(now.getTime() - 40 * day).toISOString(), trial_ends_at: new Date(now.getTime() - 10 * day).toISOString() }
  ok(trialLength(subRow) === 30, 'trialLength reads 30 off a 30-day row')
  ok(trialLength({ trial_started_at: null, trial_ends_at: null }) === TRIAL_DAYS, '...and falls back to TRIAL_DAYS when the row cannot say')
  const ended = billingAccess(subRow as any, now)
  ok(!ended.writable && /Your 30 free days are up/.test(ended.reason), `a lapsed sub trial says 30, not 15 ("${ended.reason.slice(0, 40)}...")`)

  // ── a lapsed sub trial never stops the GC's job ─────────────────────────
  const db = fakeDb({
    projects: [
      { id: GC_JOB, gc_company_id: 'gc', created_by_company_id: 'gc' },
      { id: OWN_JOB, gc_company_id: 'pool', created_by_company_id: 'pool' },
    ],
    subcontracts: [{ id: 'sc', project_id: GC_JOB, company_id: 'pool' }],
    companies: [], project_team_members: [], company_roles: [],
    profiles: [{ id: 'owner', role: 'admin', company_id: 'pool', email: 'o@pool.com' }],
    company_billing: [{ company_id: 'pool', ...subRow }],
  })
  const call = async (job: string, resource: string, action: any) => {
    const g = await requirePermission(db, new Request(`https://app.sytenav.com/api/projects/${job}/x`, { headers: { Authorization: 'Bearer owner' } }), resource, action)
    return 'denied' in g ? g.denied.status : g.side
  }
  ok(await call(GC_JOB, 'daily-logs', 'create') === 'sub', 'a sub whose own trial lapsed still files a daily log on the GC\'s job')
  ok(await call(GC_JOB, 'rfis', 'create') === 'sub', '...and asks an RFI there')
  ok(await call(OWN_JOB, 'daily-logs', 'create') === 402, '...while his OWN job is read-only, like any lapsed company\'s (402)')
  ok(await call(OWN_JOB, 'daily-logs', 'view') === 'gc', '...and still fully readable')

  // the other doors a sub writes through on a GC's job
  ok(/on\.side === 'gc' && \(opts\.write \|\| WRITE_ACTIONS\.includes\(action\)\)/.test(code('lib/job-access.ts')), 'jobGate locks only on the owning side')
  ok(/who\.side === 'gc' \? await billingLock/.test(code('app/api/projects/[id]/rfis/route.ts')), 'the RFI route locks only on the owning side')
  ok(/gate\.side === 'gc' \? await billingLock/.test(code('app/api/projects/[id]/tasks/[taskId]/notes/route.ts')), 'a task note locks only on the owning side')
  const comp = code('lib/writes/compliance-access.ts')
  ok(/if \(row\) return \{ actor, scope: 'own-company', companyId: row, mine \}/.test(comp), 'a sub filing compliance on a GC\'s job is not locked by his own plan')

  // ── the trial starts once, at the button, and only there ────────────────
  const run = code('app/api/account/run-own-jobs/route.ts')
  ok(/trialEnd\(now, SUB_TRIAL_DAYS\)/.test(run) && /ignoreDuplicates: true/.test(run), 'Run your own jobs starts a SUB_TRIAL_DAYS trial, and never overwrites a billing row that exists')
  ok((run.match(/await startTrial\(db, /g) ?? []).length === 2, '...on both paths: a light company and a guest moving out of a GC\'s row')

  // ── not on the iPhone ────────────────────────────────────────────────────
  const card = code('components/my-jobs/run-own-jobs-card.tsx')
  ok(/useCanShowPricing\(\)/.test(card) && card.indexOf('if (!canOffer) return null') > 0 && card.indexOf('if (!canOffer) return null') < card.indexOf('<Button'),
    'the offer is hidden in the iOS build, shut until the platform is known')
  const { OWN_JOBS_REFUSAL } = await import('../sub-account')
  ok(!/trial|plan|run your own/i.test(OWN_JOBS_REFUSAL), 'the refusal a light account gets offers nothing - it is shown on every shell')

  // ── the crons ────────────────────────────────────────────────────────────
  ok(/trial_days: String\(trialLength\(row as any\)\)/.test(code('app/api/cron/trial-reminders/route.ts')), 'the trial-ending email names the row\'s own length')
  ok(/\.eq\('type', 'gc'\)/.test(code('app/api/cron/onboarding-nudges/route.ts')), 'the GC onboarding drip never reaches a sub on a trial')

  done()
}

main()
