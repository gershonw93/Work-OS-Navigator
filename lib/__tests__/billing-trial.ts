// THE TRIAL, THE LOCK, AND A METER THAT IS ACTUALLY ATTACHED TO SOMETHING.
//
// Three things shipped together and this suite exists for the seam between
// them. The pure rules are cheap to test and are; the expensive half is the
// WIRING, because every one of these features is the kind that looks finished
// while doing nothing:
//
//   - a meter nothing writes to reads zero, which is indistinguishable from
//     plenty of allowance left. That was the literal state of the screen this
//     replaced: "Projects 0 / 10" drawn from a number in the JSX.
//   - a lock applied at one door and not the others is not a lock.
//   - a trial nothing starts leaves every new company unmetered for ever.
//
// So the assertions below are mostly "is it called", and they are anchored on
// the ROUTES rather than on the functions, because a function that nobody
// calls passes its own unit tests perfectly.

import {
  billingAccess, daysUntil, trialEnd, accessBadge, type BillingRow,
} from '../billing-state'
import {
  entitlement, usageMeters, projectLimitProblem, scanLimitProblem,
  scanWindowStart, nextResetIso, COUNTED_PROJECT_STATUSES, METER_WARN_AT,
} from '../plan-limits'
import { PLANS, TRIAL_DAYS, planByKey, projectLimitLabel } from '../plans'
import { SCAN_KINDS } from '../scan-kinds'
import { ok, done, code, read, walk, readCombined } from './_helpers'

const NOW = new Date('2026-09-24T14:30:00Z')
const at = (d: string) => new Date(d)
const row = (r: BillingRow): BillingRow => r

// ── a company with no billing row is not a freeloader ───────────────────────
// `companies` holds our customers AND every sub and inspector in a Directory.
// A sub writes to jobs it does not own, so "no row means locked" would have
// broken every subcontractor in the product on the day this deployed.
ok(billingAccess(null, NOW).state === 'unmetered', 'no billing row means unmetered, not locked')
ok(billingAccess(null, NOW).writable, '...and unmetered can write')
ok(billingAccess(row({ status: 'something-new' }), NOW).writable,
  'and a status we do not recognise is open too - an unreadable row is not a verdict about a customer')

// ── the trial ───────────────────────────────────────────────────────────────
const trialing = (endsAt: string) => billingAccess(row({ status: 'trialing', trial_ends_at: endsAt }), NOW)

ok(trialing('2026-10-09T00:00:00Z').state === 'trial', 'a trial with days left is a trial')
ok(trialing('2026-10-09T00:00:00Z').daysLeft === 15, '...and counts the days')
// THE LAST DAY IS STILL A DAY YOU MAY WORK. The same rule as a certificate of
// insurance that expires today: comparing timestamps would lock somebody out
// at midnight on the morning of their last good day.
ok(trialing('2026-09-24T09:00:00Z').writable,
  'a trial ending TODAY is still writable, even at an hour already past')
ok(trialing('2026-09-24T09:00:00Z').daysLeft === 0, '...and says zero days left rather than minus one')
ok(/ends today/i.test(trialing('2026-09-24T09:00:00Z').reason), '...and says so in words')
ok(!trialing('2026-09-23T23:59:00Z').writable, 'a trial that ended yesterday is locked')
ok(trialing('2026-09-23T23:59:00Z').state === 'locked', '...and says locked')
// The sentence has to carry the way out AND the reassurance, because this is
// the message somebody meets after their save failed.
const over = trialing('2026-09-01T00:00:00Z')
ok(/choose a plan/i.test(over.reason), 'the locked sentence says what to do')
ok(/nothing has been deleted/i.test(over.reason), '...and that nothing has been deleted')

// A trialing row with NO end date is a claim with no evidence. Guess the
// recoverable way - a wrong "open" costs a few dollars, a wrong "locked" takes
// a crew's screen away mid-job.
ok(billingAccess(row({ status: 'trialing' }), NOW).writable,
  'trialing with no end date stays writable rather than locking on a missing column')

// ── free access we granted ──────────────────────────────────────────────────
ok(billingAccess(row({ status: 'comped' }), NOW).state === 'comped', 'an open-ended comp is a comp')
ok(billingAccess(row({ status: 'comped' }), NOW).daysLeft === null, '...and nothing is counting down')
ok(billingAccess(row({ status: 'comped', comped_until: '2026-10-01T00:00:00Z' }), NOW).writable,
  'a comp with a date still to come is writable')
ok(!billingAccess(row({ status: 'comped', comped_until: '2026-09-01T00:00:00Z' }), NOW).writable,
  'a comp that has run out stops')

// ── a live plan ─────────────────────────────────────────────────────────────
const paid = billingAccess(row({ status: 'active', plan_key: 'up-to-10', current_period_end: '2026-10-24T00:00:00Z' }), NOW)
ok(paid.state === 'paid' && paid.writable, 'an active subscription can write')
ok(paid.plan?.key === 'up-to-10', '...and carries the plan it named')
// A PERIOD END IN THE PAST WITH THE STATUS STILL ACTIVE is a webhook that has
// not landed, not somebody who stopped paying. Stripe says `canceled` for that.
ok(billingAccess(row({ status: 'active', current_period_end: '2026-01-01T00:00:00Z' }), NOW).writable,
  'a stale period end does not lock an account Stripe still calls active')
ok(/will not renew/i.test(
  billingAccess(row({ status: 'active', plan_key: 'up-to-3', cancel_at_period_end: true, current_period_end: '2026-10-04T00:00:00Z' }), NOW).reason),
  'a plan set to cancel says so, with the days left')

// A FAILED CARD IS NOT A CANCELLATION. Stripe retries for weeks; locking on the
// first decline takes the job screen away over a card the office has not
// noticed. It shouts instead, and the lock arrives with `canceled`.
const late = billingAccess(row({ status: 'past_due', plan_key: 'up-to-3' }), NOW)
ok(late.writable && late.state === 'overdue', 'a failed payment stays writable while Stripe retries')
ok(/update the card/i.test(late.reason), '...and says what to do about it')
ok(!billingAccess(row({ status: 'canceled' }), NOW).writable, 'a cancelled plan is read-only')

// ── the badge and the sentence come off ONE answer ──────────────────────────
// So a calm badge can never sit over an alarming sentence - the failure the
// inspection countdown had when a six-month-overdue visit wore a blue
// "Scheduled" pill.
ok(accessBadge(billingAccess(null, NOW)) === null, 'an unmetered company gets no badge at all')
ok(accessBadge(trialing('2026-09-25T00:00:00Z'))?.tone === 'warn',
  'a trial ending tomorrow is amber, not quiet')
ok(accessBadge(trialing('2026-10-20T00:00:00Z'))?.tone === 'quiet',
  '...and one with a month to run is quiet')
ok(accessBadge(billingAccess(row({ status: 'canceled' }), NOW))?.label === 'Read-only',
  'a locked account says read-only on the badge, not "canceled"')

// ── the arithmetic ──────────────────────────────────────────────────────────
// Midnight on both sides, so a trial started in the afternoon is not half a day
// short for the person who started it.
ok(daysUntil('2026-09-25T01:00:00Z', NOW) === 1, 'days are counted between midnights, not by the clock')
ok(daysUntil(null, NOW) === null, 'no date means no countdown')
ok(daysUntil('not a date', NOW) === null, '...and neither does an unparseable one')
ok(trialEnd(at('2026-09-24T00:00:00Z')).getDate() === 9, `a trial from the 24th ends ${TRIAL_DAYS} days later`)

// ── what a company is entitled to ───────────────────────────────────────────
const featured = PLANS.find(p => p.featured)!
ok(entitlement(trialing('2026-10-09T00:00:00Z')).projects === featured.projectLimit,
  'a trial runs on the plan most people buy - it is "the whole product on a real job", not a cut-down one')
ok(entitlement(billingAccess(row({ status: 'comped' }), NOW)).projects === null,
  'a company we comped is uncapped - metering a favour is how it becomes a support ticket')
ok(entitlement(paid).scans === planByKey('up-to-10')!.scans, 'a plan brings its own allowance')

// ── the meters ──────────────────────────────────────────────────────────────
const ent10 = entitlement(paid)
const meters = usageMeters({ activeProjects: 9, scansThisMonth: 12 }, ent10, NOW)
const projects = meters.find(m => m.key === 'projects')!
ok(projects.used === 9 && projects.limit === 10, 'the project meter reports what it was given')
ok(projects.pct === 90 && projects.tone === 'warn', '...and the last fifth of an allowance is amber')
ok(usageMeters({ activeProjects: 10, scansThisMonth: 0 }, ent10, NOW)[0].tone === 'danger',
  'at the limit it is red')
ok(Math.round(METER_WARN_AT * 100) === 80, 'the amber line is the last fifth')
// NO BAR WHERE THERE IS NO LIMIT. A full-width bar under "unlimited" invents a
// ceiling for somebody to measure themselves against.
const uncapped = usageMeters({ activeProjects: 40, scansThisMonth: 900 }, entitlement(billingAccess(row({ status: 'comped' }), NOW)), NOW)
ok(uncapped.every(m => m.pct === null && m.limit === null), 'an uncapped meter draws no bar')
ok(uncapped.every(m => m.tone === 'ok'), '...and is never red for a limit it does not have')
// STORAGE IS NOT ONE OF THEM. The old card metered it against 5 GB, a number
// this product does not sell, meter, or look up.
ok(meters.length === 2 && !meters.some(m => /storage|team/i.test(m.label)),
  'there are two meters, and neither is storage or team members')
ok(meters.every(m => m.note.length > 0), 'every meter says what it is counting')
ok(/planning, active and on-hold/i.test(projects.note),
  'and the project meter names which statuses count, rather than leaving it to be discovered at a refusal')

// ── the refusals name the way out ───────────────────────────────────────────
const ent3 = { projects: 3, scans: 150, source: 'plan' as const }
ok(projectLimitProblem(ent3, 2) === null, 'under the cap, nothing is refused')
const full = projectLimitProblem(ent3, 3)!
ok(!!full, 'at the cap, a new job is refused')
ok(/close out a finished job/i.test(full), '...and the refusal offers the free way out first')
ok(/nothing is deleted/i.test(full), '...and says nothing is lost')
ok(full.includes('Up to 10'), '...and names the cheapest plan that would fit')
ok(projectLimitProblem({ projects: null, scans: null, source: 'comped' }, 900) === null,
  'and an uncapped company is never refused')

const scansGone = scanLimitProblem(ent3, 150, NOW)!
ok(!!scansGone, 'at the scan allowance, a scan is refused')
ok(/everything else in SyteNav keeps working/i.test(scansGone),
  '...and says the stop is on scanning rather than on the job - which is what the published FAQ promises')
ok(/refills on/i.test(scansGone), '...and when it comes back')
ok(scanLimitProblem(ent3, 149, NOW) === null, 'one under the allowance still runs')

// ── the month window ────────────────────────────────────────────────────────
// The meter's window and the guard's window come from ONE function. Two ideas
// of "this month" is how a screen says you have room while the route refuses.
ok(scanWindowStart(at('2026-09-24T23:00:00Z')) === '2026-09-01', 'the scan window starts on the 1st')
ok(nextResetIso(at('2026-12-15T00:00:00Z')) === '2027-01-01', 'and December rolls into January')

// ═══════════════════════════════════════════════════════════════════════════
// THE WIRING. Everything above passes with none of this attached.
// ═══════════════════════════════════════════════════════════════════════════

// ── the lock is at the door every write already goes through ────────────────
const guard = code('lib/api-guard.ts')
// READ THE FUNCTION BODY, NOT THE FILE. The first version of this asked whether
// the file mentioned `WRITE_ACTIONS` and `billingLock` - and deleting the call
// site left both behind (one is a const, the other an exported helper), so the
// check went green over a product with no lock in it at all. A whole feature
// could have shipped switched off under a passing suite.
const requirePerm = guard.slice(guard.indexOf('export async function requirePermission'))
  .slice(0, guard.slice(guard.indexOf('export async function requirePermission')).indexOf('\n}\n') + 2)
ok(requirePerm.length > 100, 'requirePermission is where we think it is')
ok(/billingLock\(/.test(requirePerm),
  'requirePermission itself asks whether the account may write')
ok(/WRITE_ACTIONS\.includes\(action\)/.test(requirePerm),
  '...only for the actions that change something')
ok(/'create', 'edit', 'delete'/.test(guard), '...for the three actions that change something')
ok(!/'view'/.test(guard.slice(guard.indexOf('WRITE_ACTIONS'), guard.indexOf('WRITE_ACTIONS') + 120)),
  '...and never for a read: a locked account can still be opened and read')
ok(/status: 402/.test(guard),
  'a lock answers 402, not 403 - 403 sends somebody to their admin for a permission nobody can grant')

// THE ROUTES THAT GATE BY HAND. `requirePermission` covers 152 routes and not
// these; two of them are the ones that decide how many jobs a company has open,
// which is the thing the plans meter.
for (const f of [
  'app/api/projects/route.ts',
  'app/api/projects/[id]/route.ts',
  'app/api/projects/bulk/route.ts',
  'app/api/file-shares/route.ts',
  'app/api/projects/[id]/daily-logs/[logId]/review/route.ts',
]) {
  ok(/billingLock\(/.test(code(f)), `${f.replace('app/api/', '')} asks for the lock itself`)
}

// ── the project cap is on BOTH doors ────────────────────────────────────────
// A rule that exists on one door has to exist on the others. Metering only the
// create route leaves the eleventh job one status change away - and a status
// change is how a finished job comes back, which is the likelier door.
ok(/projectSlotProblem\(/.test(code('app/api/projects/route.ts')), 'creating a job asks for a slot')
const patch = code('app/api/projects/[id]/route.ts')
ok(/projectSlotProblem\(/.test(patch), 'and so does bringing one back')
ok(/willCount && !wasCounted/.test(patch),
  '...only when the status moves INTO a counted one, so re-saving an active job is not refused for the slot it already holds')
ok(COUNTED_PROJECT_STATUSES.includes('on_hold' as never),
  'a job on hold is a job you are carrying, so it holds a slot')
ok(!(COUNTED_PROJECT_STATUSES as readonly string[]).includes('completed'),
  '...and a finished one does not')

// ── every route that calls the model is metered ─────────────────────────────
// The allowance was printed on a pricing page while nothing in the product
// counted a single scan. The list is derived from the routes themselves rather
// than typed here, so a thirteenth AI route cannot quietly arrive unmetered.
const modelRoutes = walk('app/api').filter(f => /anthropic\.messages\.create|await scan\(/.test(read(f)))
ok(modelRoutes.length >= 12, `every route that calls the model is found (${modelRoutes.length})`)
const unmetered = modelRoutes.filter(f => !/guardScan\(/.test(read(f)))
ok(unmetered.length === 0,
  `every model route opens a usage record${unmetered.length ? ` - missing in ${unmetered.join(', ')}` : ''}`)
const unclosed = modelRoutes.filter(f => !/\.succeeded\(\)/.test(read(f)))
ok(unclosed.length === 0,
  `...and closes it when an answer comes back${unclosed.length ? ` - missing in ${unclosed.join(', ')}` : ''}`)

// THE ROW GOES IN FIRST, MARKED FAILED. Written the other way round, a route
// that times out records nothing and `succeeded` becomes true on every row.
const scanGuard = code('lib/scan-guard.ts')
ok(/succeeded: false/.test(scanGuard), 'a scan is recorded before the model is called, marked failed')
ok(/update\(\{ succeeded: true \}\)/.test(scanGuard), '...and flipped only when an answer comes back')
ok(/if \(error \|\| !data\)[\s\S]{0,200}return \{ ok: true/.test(scanGuard),
  'and a meter that cannot write must not refuse the scan - the customer still gets their answer')
ok(SCAN_KINDS.length >= 12, 'there is a name for every door a scan comes through')
ok(new Set(SCAN_KINDS).size === SCAN_KINDS.length, '...and no two share one')

// ── the trial actually starts ───────────────────────────────────────────────
const signup = code('app/api/complete-signup/route.ts')
ok(/company_billing/.test(signup) && /trialing/.test(signup),
  'a new company is born on a trial, at the one place a tenant is born')
ok(/trialEnd\(/.test(signup), '...for TRIAL_DAYS, read rather than typed')
ok(/ignoreDuplicates: true/.test(signup),
  'and somebody joining an existing company cannot reset a paying customer back to a trial')

// ── Stripe ──────────────────────────────────────────────────────────────────
const checkout = code('app/api/billing/checkout/route.ts')
ok(/billing_plan_prices/.test(checkout) && /\.eq\('plan_key'/.test(checkout),
  'the price is looked up from the plan, never taken from the body')
ok(!/body\.(stripe_)?price/.test(checkout),
  '...because a caller that could send a price id could send a one-dollar one')
ok(/subscription_data: \{ metadata/.test(checkout),
  'the company id is on the SUBSCRIPTION as well as the session - renewals and cancellations arrive with no session attached')

const webhook = code('app/api/stripe/webhook/route.ts')
ok(/constructEvent\(/.test(webhook), 'the webhook verifies the signature')
ok(/await request\.text\(\)/.test(webhook),
  '...over the raw bytes, because a parsed and re-serialised body no longer matches')
ok(/webhookConfigured\(\)[\s\S]{0,200}status: 503/.test(webhook),
  'and with no signing secret it refuses everything rather than trusting what it is sent')
ok(/past_due/.test(webhook) && !/'canceled'[\s\S]{0,80}payment_failed/.test(webhook),
  'a failed payment moves the status and does not cancel the plan')

// ── the free-access control keeps its evidence ──────────────────────────────
const adminBilling = code('app/api/admin/billing/route.ts')
ok(/isSuperAdmin/.test(adminBilling), 'giving away the product is super-admin only')
ok(adminBilling.indexOf('isSuperAdmin') < adminBilling.indexOf('request.json'),
  '...gated BEFORE the body is read - no field in a request is a permission')
ok(/if \(!reason\)/.test(adminBilling),
  'a comp without a reason is refused - the row is the only thing that can answer "why is this company free" later')
ok(/comped_by_name/.test(adminBilling), '...and it records who did it')
ok(/'uncomp'[\s\S]{0,400}trialing/.test(adminBilling),
  'ending a comp drops somebody onto a trial, not straight into a read-only app')
// The same refusal is on the CONTROL, so it does not arrive as a failed request.
ok(/if \(!reason\.trim\(\)\)/.test(code('app/admin/billing/page.tsx')),
  'and the screen asks for the reason at the field, with the same rule the route uses')

// ── the screen ──────────────────────────────────────────────────────────────
const panel = code('components/settings/billing-panel.tsx')
ok(/'loading' \| 'ready' \| 'failed'/.test(panel),
  'the billing screen keeps loading, ready and failed apart')
ok(/could not read them/.test(panel),
  '...and a failed read says so rather than drawing an empty meter, which is what "you have plenty left" looks like')
ok(!/max: \d|used: 0/.test(panel), 'no number on it is a literal')
ok(/meters\.map/.test(panel), '...they are all counted server-side')
ok(!/alert\(|confirm\(/.test(panel) && !/alert\(|confirm\(/.test(code('app/admin/billing/page.tsx')),
  'and neither screen uses a native dialog')

// The banner exists so a locked account is not discovered by a failed save.
const banner = code('components/layout/billing-banner.tsx')
ok(/catch \{/.test(banner),
  'the banner stays silent when it cannot ask - a bad request is not a closed account')
ok(/'@\/components\/layout\/billing-banner'/.test(code('app/(dashboard)/layout.tsx')),
  '...and it is actually mounted in the chrome')

// ── the migration does not lock the people already here ─────────────────────
// Everybody in the product today came in through a beta that promised it free
// while they were in it. A fifteen-day clock on them would have taken a live
// job screen away from a real crew, on the strength of a promise made the
// other way.
const m118 = read('supabase/migrations/118_billing_trial_and_usage.sql')
ok(/INSERT INTO company_billing[\s\S]*'comped'/.test(m118),
  'existing companies are comped by the migration, not put on a clock')
ok(/WHERE EXISTS \(SELECT 1 FROM profiles/.test(m118),
  '...and only real tenants get a row - a Directory sub is not a customer')
ok(/ON CONFLICT \(company_id\) DO NOTHING/.test(m118), '...idempotently')
ok(/ON DELETE CASCADE/.test(m118) && /ON DELETE SET NULL/.test(m118),
  'every foreign key states its ON DELETE rule rather than leaving it at the default')
ok(/company_billing/.test(readCombined()) && /ai_scans/.test(readCombined()),
  'and the combined migration carries it for a fresh environment')

// ── one fact, one home ──────────────────────────────────────────────────────
// `projects` was the string '3 active projects', which reads perfectly and
// cannot be compared with anything. The sentence is derived from the number
// that enforces it now, so a tier cannot advertise ten and enforce three.
ok(PLANS.every(p => p.projectLimit === null || typeof p.projectLimit === 'number'),
  'a plan carries its cap as a NUMBER')
ok(projectLimitLabel(PLANS[0]) === '3 active projects', '...and the sentence is derived from it')
ok(projectLimitLabel(PLANS[2]) === 'Unlimited active projects', '...including the uncapped one')
ok(!/projects: '/.test(read('lib/plans.ts')), 'and the old string is gone rather than sitting beside it')
ok(new Set(PLANS.map(p => p.key)).size === PLANS.length, 'every plan has its own stable key')
ok(PLANS.every(p => planByKey(p.key)?.key === p.key), '...and a stored key resolves back to it')
ok(planByKey('starter') === null, 'and a key we do not sell resolves to nothing rather than to the first plan')

done()
