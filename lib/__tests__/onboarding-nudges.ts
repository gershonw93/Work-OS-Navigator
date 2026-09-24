// THE FIRST FIFTEEN DAYS, AND THE WAYS A DRIP SEQUENCE BECOMES SPAM.
//
// A new company got a trial and then silence until the day-12 warning, because
// the product's own onboarding is a per-PROJECT checklist - invisible until a
// project exists, which is exactly the step somebody who drifted has not taken.
//
// Everything here guards against the two ways this feature fails. It can do
// nothing (a rule with no cron, a cron not in vercel.json, a gate that never
// lets anything through), or it can do too much - which is worse, because the
// failure mode of too much is a person marking us as spam and never coming
// back. So the assertions lean hard on the cases where it must stay SILENT.

import {
  nextNudge, wholeDaysSince, NUDGES, NUDGE_LAST_DAY, ACTIVE_WITHIN_DAYS,
  type OnboardingFacts,
} from '../onboarding-nudges'
import { TRIAL_DAYS } from '../plans'
import { TRIAL_WARN_FROM } from '../trial-warning'
import { NOTIFICATION_TYPES } from '../notifications'
import { usageMeters, entitlement, scanLimitProblem } from '../plan-limits'
import { billingAccess } from '../billing-state'
import { dayWords, dateWords } from '../dates'
import { ok, done, code, read, readCombined, walk } from './_helpers'

const NOW = new Date('2026-09-26T10:00:00Z')

/** A company that has done nothing at all, `d` days in, last seen `seen` days ago. */
const cold = (d: number, seen: number | null = 99, over: Partial<OnboardingFacts> = {}): OnboardingFacts => ({
  daysSinceSignup: d,
  daysSinceSignIn: seen,
  projects: 0, budgetLines: 0, teammates: 1, subcontracts: 0, scans: 0,
  sent: [],
  ...over,
})

// ── the sequence hands over rather than overlapping ─────────────────────────
// Days 12, 14 and 15 belong to the trial warnings. Two emails from us in one
// morning is how the one that mattered gets ignored, so the last nudge day is
// DERIVED from where those start - moving one cannot leave them colliding.
ok(NUDGE_LAST_DAY === TRIAL_DAYS - TRIAL_WARN_FROM - 1,
  'the nudges stop the day before the trial warnings start')
ok(NUDGE_LAST_DAY === 11, `...which is day ${NUDGE_LAST_DAY} today`)
ok(NUDGES.every(n => n.day <= NUDGE_LAST_DAY), 'and no nudge is scheduled past it')
ok(NUDGES.every(n => n.day >= 1), '...nor on the day they signed up, which is the welcome email\'s')

// ── silence is the common answer ────────────────────────────────────────────
ok(nextNudge(cold(0)) === null, 'nothing on the day they signed up')
ok(nextNudge(cold(12)) === null, 'nothing once the trial warnings have taken over')
ok(nextNudge(cold(40)) === null, '...or long after')

// THEY ARE ACTIVE. The screen in front of them says what to do next better than
// an email can, and mail to somebody already in the app reads as spam.
ok(nextNudge(cold(5, 0)) === null, 'nothing to somebody who signed in today')
ok(nextNudge(cold(5, 1)) === null, '...or yesterday')
ok(nextNudge(cold(5, ACTIVE_WITHIN_DAYS)) !== null,
  `...but somebody last seen ${ACTIVE_WITHIN_DAYS} days ago is fair game`)
ok(nextNudge(cold(5, null)) !== null,
  'and somebody who has NEVER signed in is the whole reason this exists')

// ── it asks for the first thing they have not done ──────────────────────────
ok(nextNudge(cold(1))?.key === 'first_project', 'day 1: put a job in')
// IN ORDER OF DEPENDENCY. Somebody who has done nothing by day seven is asked
// for a project, not for subs they would have nowhere to put.
ok(nextNudge(cold(7))?.key === 'first_project',
  'day 7 with nothing done: still the project, because the later steps need one')
ok(nextNudge(cold(7, 99, { projects: 2 }))?.key === 'budget',
  '...and with a job in place it moves on to the budget')
ok(nextNudge(cold(7, 99, { projects: 2, budgetLines: 40, teammates: 3 }))?.key === 'subs',
  '...skipping every step already done')

// A NUDGE WHOSE QUESTION IS ANSWERED IS NEVER SENT. "Create your first job" to
// somebody with three of them is the fastest way to teach a person to filter
// mail from us - and it is what a purely day-driven drip would do.
const busy = cold(10, 99, { projects: 4, budgetLines: 90, teammates: 6, subcontracts: 12, scans: 30 })
ok(nextNudge(busy) === null, 'a company that has done everything hears nothing at all')
for (const n of NUDGES) {
  ok(n.done(busy), `${n.key}: counts as done for a company that has done it`)
  ok(!n.done(cold(1)), `${n.key}: and undone for one that has not`)
}

// ── once each, ever ─────────────────────────────────────────────────────────
ok(nextNudge(cold(3, 99, { sent: ['first_project'] }))?.key === 'budget',
  'a nudge already sent is not repeated')
ok(nextNudge(cold(10, 99, { sent: NUDGES.map(n => n.key) })) === null,
  '...and a company that has had them all hears nothing')

// ONE PER RUN. `nextNudge` returns a single nudge by signature, which is the
// cheapest possible guarantee that a company cannot get four in one morning.
ok(nextNudge(cold(10)) !== null && !Array.isArray(nextNudge(cold(10))),
  'the rule answers with one nudge, never a list')

// ── the copy ────────────────────────────────────────────────────────────────
ok(new Set(NUDGES.map(n => n.key)).size === NUDGES.length, 'every nudge has its own key')
for (const n of NUDGES) {
  ok(n.title.length > 0 && n.message.length > 40, `${n.key}: has something to say`)
  ok(n.link.startsWith('/'), `${n.key}: goes somewhere in the app`)
  ok(!/\bfree trial\b/i.test(n.message), `${n.key}: does not sell the trial - that is the warnings' job`)
}

// ── the arithmetic ──────────────────────────────────────────────────────────
ok(wholeDaysSince('2026-09-25T23:00:00Z', NOW) === 1,
  'days are counted between midnights, so an evening signup is not half a day short')
ok(wholeDaysSince(null, NOW) === null, 'never signed in stays null rather than becoming zero')
ok(wholeDaysSince('nonsense', NOW) === null, '...and so does an unparseable date')

// ═══════════════════════════════════════════════════════════════════════════
// THE WIRING
// ═══════════════════════════════════════════════════════════════════════════

const cron = code('app/api/cron/onboarding-nudges/route.ts')
ok(/nextNudge\(/.test(cron), 'the job asks the shared rule rather than a second copy')
ok(/checkCronAuth/.test(cron), 'and checks its auth')
ok(cron.indexOf('checkCronAuth') < cron.indexOf("from('company_billing')"), '...before reading anything')

// A DEADLINE WITH NO JOB BEHIND IT WARNS NOBODY, and a job nothing schedules
// never runs.
const vercel = read('vercel.json')
const schedule = JSON.parse(vercel).crons.find((c: any) => c.path === '/api/cron/onboarding-nudges')
ok(!!schedule, 'vercel.json actually schedules it')
const hour = Number(String(schedule.schedule).split(' ')[1])
ok(hour >= 10 && hour <= 14, `it runs in the American morning, not the middle of the night (hour ${hour} UTC)`)
// After the trial warnings, so on a day both could fire the one that matters
// has already gone. They cannot both fire anyway - NUDGE_LAST_DAY sees to that -
// but the ordering costs nothing and removes the question.
const warnHour = JSON.parse(vercel).crons.find((c: any) => c.path === '/api/cron/trial-reminders').schedule
ok(String(schedule.schedule) > String(warnHour) || hour >= Number(String(warnHour).split(' ')[1]),
  'and it runs after the trial warnings, not before them')

// THE GATE IS WRITTEN BEFORE THE SEND. Two overlapping runs on a slow morning
// would otherwise send the same nudge twice.
const claimAt = cron.indexOf("from('onboarding_nudges_sent')\n      .insert")
const sendAt = cron.indexOf('await notify(')
ok(claimAt > 0 && sendAt > claimAt, 'the nudge is claimed before it is sent, not after')
ok(/23505/.test(cron), '...and a unique-constraint clash means somebody else has it, not an error')

// A READ THAT DID NOT COMPLETE IS NOT A READ THAT SAID NO. Half the sign-in
// pages missing looks exactly like half the customers never having signed in,
// and the mistake it produces is mail to somebody sitting in the app.
ok(/!accounts\.complete/.test(cron), 'an incomplete sign-in read stops the run')
ok(/sent: 0/.test(cron), '...saying nothing rather than guessing')

// BULK, not per company. A per-company round trip is how a nightly job becomes
// a timeout six months from now, on the morning somebody needed the email.
ok(!/for \(const trial of[\s\S]{0,900}await db\n?\s*\.from\('projects'\)/.test(cron),
  'the counts are gathered in bulk rather than inside the loop')

// ── the catalog ─────────────────────────────────────────────────────────────
const nudgeType = NOTIFICATION_TYPES.find(t => t.key === 'onboarding_nudge')
ok(!!nudgeType && nudgeType.status === 'live', 'the nudge is a live type, so it can be turned off')
ok(nudgeType?.defaults.email === true && nudgeType?.push === true,
  'email AND push are on - the whole point is reaching somebody who is not in the app')
ok(/'onboarding_nudge'/.test(cron), 'and the job sends under that type')

// ── telling US somebody asked ───────────────────────────────────────────────
// The row was inserted and sat there until somebody remembered to open the
// approvals page - while the applicant had just been told they would hear back.
const requestRoute = code('app/api/access-request/route.ts')
// AT STATEMENT LEVEL, not merely present. Asking whether the file MENTIONS
// notify() passes while the call sits behind an `if (false)` - the same trap
// that let a billing lock's call site be deleted with the helper still
// imported, and a banner keep its own threshold with the constant still
// imported. Third time; hence the anchor on the indentation.
ok(/\n  await notify\(\{/.test(requestRoute),
  'a new access request tells us, unconditionally')
ok(/'access_request'/.test(requestRoute), '...under the catalog type for it')
ok(/superAdminProfileIds/.test(requestRoute), '...routed to the super admins')
ok(requestRoute.indexOf('.insert(') < requestRoute.indexOf('await notify('),
  '...after the row is written: the request is the work, telling us is the side effect')

const requestType = NOTIFICATION_TYPES.find(t => t.key === 'access_request')
ok(requestType?.platform === true, 'it is marked a platform type')
ok(/filter\(t => !t\.platform\)/.test(code('app/api/settings/notifications/route.ts')),
  '...so no customer is shown a switch for an event they will never receive')

// And a second way to find out, because an unread email is not a system.
ok(/pendingRequests/.test(code('app/api/admin/stats/route.ts')), 'the platform stats count what is waiting')
ok(/Waiting for review/.test(code('app/admin/page.tsx')), '...and the Overview has a card for it')

// ── the welcome ─────────────────────────────────────────────────────────────
const signup = code('app/api/complete-signup/route.ts')
ok(/welcomeEmail\(/.test(signup), 'a new company is welcomed')
ok(/if \(meters\) \{[\s\S]{0,700}welcomeEmail/.test(signup),
  '...only when it has a trial - a subcontractor has none, and naming one is somebody else\'s account')

// ═══════════════════════════════════════════════════════════════════════════
// A SENTENCE MUST NOT PRINT AN OBJECT, AND THIS IS WHY THE SUITE SAYS SO.
//
// `dateWords` returns an OBJECT with two spellings in it and takes a DATE-ONLY
// string. Three shipped call sites interpolated it straight into a template:
// Settings -> Billing read "Resets [object Object]." on the scan meter, the
// over-allowance refusal said "refills on [object Object]", and the
// trial-ending email - one that goes to a customer - said "Your trial ends on
// null." because `trial_ends_at` is a timestamptz.
//
// EVERY ONE OF THEM PASSED A TEST. The assertions checked the stem of the
// sentence - "refills on", "Your trial ends on" - and never the value after it,
// which is a check on the half that could not be wrong.
// ═══════════════════════════════════════════════════════════════════════════

const NONSENSE = /\[object Object\]|\bundefined\b|\bnull\b|\bNaN\b/

const ent = entitlement(billingAccess({ status: 'active', plan_key: 'up-to-10' }, NOW))
for (const m of usageMeters({ activeProjects: 1, scansThisMonth: 2 }, ent, NOW)) {
  ok(!NONSENSE.test(m.note), `the ${m.key} meter's note reads as English: ${m.note}`)
}
ok(!NONSENSE.test(scanLimitProblem(ent, 300, NOW) ?? ''), 'and so does the out-of-scans refusal')
ok(/Resets \w+ \d+\./.test(usageMeters({ activeProjects: 0, scansThisMonth: 0 }, ent, NOW)[1].note),
  '...with a real date in it')

// The helper that fixed them, and the two shapes it has to take.
ok(dayWords('2026-10-01') === 'Oct 1', 'dayWords takes a date')
ok(dayWords('2026-10-09T14:00:00.000Z') === 'Oct 9', '...and a timestamp, which is what Postgres hands back')
ok(dayWords('2026-10-09T14:00:00.000Z', { weekday: true }) === 'Fri Oct 9',
  '...and carries the weekday when asked, which is how a date gets checked against a diary')
ok(dayWords(null) === null && dayWords('nonsense') === null,
  'and answers null rather than a placeholder, so a caller drops the clause')
ok(typeof dateWords('2026-10-01') === 'object',
  'dateWords still returns the object - this is about which one a SENTENCE uses')

// NOBODY INTERPOLATES THE OBJECT AGAIN. The bug was invisible in review three
// times; a scan is cheaper than a fourth pair of eyes.
//
// IT HAS TO READ THE WHOLE INTERPOLATION, not just the call. The first version
// flagged every `${dateWords(` and caught the shift email's subject line, which
// is correct - it takes `?.short ?? the raw date`. A scan that fails on working
// code is a scan somebody deletes, which would have cost the three real ones
// too. So this walks to the closing brace and asks which spelling comes out.
function badInterpolations(src: string): number {
  let count = 0
  let at = src.indexOf('${dateWords(')
  while (at !== -1) {
    let depth = 0
    let end = at + 1
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++
      else if (src[end] === '}') { depth--; if (depth === 0) break }
    }
    const inside = src.slice(at, end)
    if (!/\.short|\.withWeekday/.test(inside)) count++
    at = src.indexOf('${dateWords(', end)
  }
  return count
}
const raw = walk('lib').concat(walk('app')).filter(f => !f.includes('__tests__'))
const offenders = raw.filter(f => badInterpolations(read(f)) > 0)
ok(offenders.length === 0,
  `no sentence prints the dateWords object itself${offenders.length ? ` - ${offenders.join(', ')}` : ''}`)
// ...and the scan is not vacuous: it still SEES the correct call it must allow.
ok(/\$\{dateWords\(/.test(read('lib/email.ts')),
  'the shift email still builds its subject that way, so the check above is reading real code')

// ── the column ──────────────────────────────────────────────────────────────
const m121 = read('supabase/migrations/121_onboarding_nudges.sql').replace(/--[^\n]*/g, '')
ok(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_onboarding_nudge/.test(m121),
  'the gate is a unique index, so "have we said this already" is a constraint rather than a rule')
ok(/ON DELETE CASCADE/.test(m121), 'and what we said to a company goes with the company')
ok(/onboarding_nudges_sent/.test(readCombined()), 'the combined migration carries it')

done()
