// A sub on a job they were awarded: what they see, and the narrow things they
// may do. "he should be able to create RFIs, see scheduling, create a delay
// only to their schedule".
//
// The rule underneath every check here: the SUBCONTRACT is the fence, not a
// widened role. The vendor role stays `schedule: view`, `invoices: N`;
// widening either would hand a sub the GC's own screens.

import { getRoleDefaults } from '../permissions'
import { NOTIFICATION_TYPES } from '../notifications'
import { JOB_FILE_KINDS, jobFileHref, nameFromUrl } from '../job-files'
import { ok, done, code } from './_helpers'

const vendor = getRoleDefaults('read_only')
ok(!vendor.schedule?.edit && !vendor.invoices?.edit, 'the vendor role still cannot edit a schedule or the Invoices screen')

// ── the schedule ────────────────────────────────────────────────────────────
const jobRoute = code('app/api/my-jobs/[projectId]/route.ts')
ok(/from\('schedule_items'\)/.test(jobRoute) && /mine: /.test(jobRoute), 'THE SCHEDULE: the sub\'s job route returns every line, theirs marked')
ok(/linesErr \? null/.test(jobRoute), '...and a failed read is null, never "no schedule"')
ok(/schedule_delay_reports/.test(jobRoute) && /\.eq\('company_id', companyId\)/.test(jobRoute), '...with their OWN delay reports, not other trades\'')

// ── a delay is a REPORT, and only on their own line ─────────────────────────
const delay = code('app/api/my-jobs/[projectId]/schedule/[itemId]/delay/route.ts')
ok(/subcontracts\?\.company_id !== profile\.company_id/.test(delay), 'THE DELAY: refused on a line whose subcontract is not theirs')
ok(/missingDelay\(/.test(delay), '...asked the same rule the GC\'s delay dialog asks')
ok(!/from\('schedule_items'\)\s*\.update/.test(delay) && !/start_date:/.test(delay), '...and it moves NOTHING - the GC decides')
ok(/type: 'schedule_delay_reported'/.test(delay), '...it tells the GC')
const cascade = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
ok(/kind === 'delay' && typeof body\?\.delay_report_id === 'string'/.test(cascade) && /decideDelayReport\(/.test(cascade),
  'recording the delay is what applies the report - on the one writer of dates, not a second apply door')
const decide = code('lib/delay-report-db.ts')
ok(/\.eq\('status', 'pending'\)/.test(decide), 'only a pending report can be decided, so two presses tell the sub once')
for (const f of ['app/api/projects/[id]/schedule/delay-reports/route.ts', 'app/api/projects/[id]/schedule/delay-reports/[reportId]/route.ts']) {
  ok(/ownedProject\(/.test(code(f)), `${f.split('/').slice(-2).join('/')} asks whose job it is - a sub holds schedule: view too`)
}
const reported = NOTIFICATION_TYPES.find(t => t.key === 'schedule_delay_reported')
ok(reported?.audience === 'team' && reported.defaultAudience?.[0] === 'schedule' && reported.defaultAudience?.[1] === 'edit',
  'the report reaches whoever can act on it: schedule edit')
ok(NOTIFICATION_TYPES.find(t => t.key === 'schedule_delay_decided')?.audience === 'direct', 'and the answer reaches the sub who asked')
const migration = code('supabase/migrations/135_schedule_delay_reports.sql')
ok(/days BETWEEN 1 AND 365/.test(migration) && /length\(btrim\(reason\)\) >= 4/.test(migration), 'the table refuses what the dialog refuses')

// ── bills: their own subcontract, their own name ────────────────────────────
const bills = (code('app/api/projects/[id]/invoices/route.ts') + code('lib/writes/sub-bill.ts'))
ok(/\.eq\('company_id', actor\.companyId\)/.test(bills) && /company_id = sc\.company_id/.test(bills),
  'THE BILL: a sub may bill only against their own subcontract, and the company comes off it, not the body')

// ── Files: every job's paperwork, behind each tab's own permission ──────────
const files = code('app/api/files/jobs/route.ts')
ok(/actorCan\(actor, k\.resource, 'view'\)/.test(files), 'THE FILES: each kind asks the permission of the tab it lives on')
ok(JOB_FILE_KINDS.find(k => k.kind === 'bill')?.resource === 'invoices' && !getRoleDefaults('worker').invoices?.view,
  '...so a worker, who can see Files, does not get the bills')
ok(/myJobs\(/.test(files), '...and a restricted role sees only the jobs it is on')
ok(/failed\.push\(kind\)/.test(files), 'a kind that could not be read is named, not shown as empty')
ok(jobFileHref({ kind: 'plan', project_id: 'p1' }) === '/projects/p1/plans', 'a plan opens on the job\'s Plans tab')
ok(nameFromUrl('https://x.supabase.co/storage/v1/object/sign/a/1712345678901-Roof%20plan.pdf?token=z', 'F') === 'Roof plan.pdf', 'a stored name loses our timestamp and keeps theirs')
ok(nameFromUrl(null, 'Quote') === 'Quote', '...and no URL falls back to the kind')
ok(/setTab\('jobs'\)/.test(code('app/(dashboard)/files/page.tsx')), 'an empty company folder points at the job files instead of looking broken')

done()
