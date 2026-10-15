// THE COMPANY ROUTES: settings, QuickBooks, the dashboard and Master views,
// Approvals, global search, the Directory and the trade defaults.
//
// None of them is under a job, so there is no `ownedProject` to ask - every
// one reads or writes the CALLER'S OWN company, and the question is only which
// of its people may. They all answered "anybody signed in", on the
// service-role client, so the route's own code was the only limit there was.
//
// Each handler is pinned on the gate it now has AND on not having lost a role
// the screen offers it to: a gate that refuses somebody the screen still shows
// the button to is the other half of the same bug.

import { ok, done, code } from './_helpers'
import { ROLE_DEFAULTS, getRoleDefaults, can } from '../permissions'
import {
  mayManageCompanySetting, directoryReadLevel, DIRECTORY_SHARE_FIELDS,
  SEARCH_GROUP_RESOURCE, searchGroupAllowed,
} from '../company-access'

const ROLES = Object.keys(ROLE_DEFAULTS)
const as = (role: string) => ({ role, permissions: getRoleDefaults(role) })
const holders = (resource: string, action: 'view' | 'create' | 'edit' | 'delete' = 'view') =>
  ROLES.filter(r => can(getRoleDefaults(r), resource, action))

/** The body of one exported handler, so a gate in GET cannot pass for PATCH. */
function handler(src: string, method: string): string {
  const start = src.indexOf(`export async function ${method}(`)
  if (start < 0) return ''
  const next = src.indexOf('export async function', start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}
const gate = (body: string, resource: string, action: string) =>
  new RegExp(`requirePermission\\(db, request, '${resource}', '${action}'\\)`).test(body)
  && /if \(denied\(gate\)\) return gate\.denied/.test(body)
/** The old door: a bare sign-in, then straight on. */
const bareSignIn = (body: string) => /auth\.getUser\(token\)/.test(body)

// The scan can see what it is looking for - otherwise every "no bare sign-in"
// below passes for the wrong reason.
ok(bareSignIn("const { data: { user } } = await db.auth.getUser(token)"), 'the bare-sign-in pattern matches the old shape')
ok(gate("const gate = await requirePermission(db, request, 'x', 'view')\n  if (denied(gate)) return gate.denied", 'x', 'view'),
  'the gate pattern matches the new shape')

// ── the pure rules ──────────────────────────────────────────────────────────
ok(mayManageCompanySetting(as('admin')) && mayManageCompanySetting(as('manager')),
  'admin and manager still manage QuickBooks, the logo and delete protection - nobody who had it lost it')
for (const r of ['project_manager', 'office_staff', 'field_supervisor', 'worker', 'member', 'read_only']) {
  ok(!mayManageCompanySetting(as(r)), `${r} does not`)
}
ok(mayManageCompanySetting({ role: 'estimator', permissions: { settings_company: { view: true, edit: true } } }),
  '...and a custom role the company granted settings_company: edit does, so the Security tab and the route agree')
ok(!mayManageCompanySetting(null), 'no actor, no')

for (const r of ROLES) {
  const want = can(getRoleDefaults(r), 'directory', 'view') ? 'full' : can(getRoleDefaults(r), 'files', 'view') ? 'share' : null
  ok(directoryReadLevel(as(r)) === want, `directory read level for ${r} is ${want}`)
}
ok(directoryReadLevel(as('worker')) === 'share',
  'a Worker (directory: N) keeps the suggestions in Files > Share documents, which they can open today')
ok(directoryReadLevel({ role: 'x', permissions: {} }) === null, 'neither permission: nothing')
ok(DIRECTORY_SHARE_FIELDS.join() === 'id,name,contact_email,type',
  "the share slice is exactly what the share box reads (`contact_email`, not `email`)")

ok(!searchGroupAllowed(as('worker'), 'budget') && !searchGroupAllowed(as('worker'), 'invoices')
  && !searchGroupAllowed(as('worker'), 'customers') && !searchGroupAllowed(as('worker'), 'change-orders'),
  'search: a Worker no longer finds budget lines, bills, customers or change orders')
ok(searchGroupAllowed(as('worker'), 'tasks') && searchGroupAllowed(as('worker'), 'projects'),
  '...and still finds their jobs and tasks')
ok(!searchGroupAllowed(as('project_manager'), 'nonsense'), 'an unknown group is refused, not waved through')
for (const r of ROLES) {
  for (const [group, resource] of Object.entries(SEARCH_GROUP_RESOURCE)) {
    if (resource === null) continue
    ok(searchGroupAllowed(as(r), group) === can(getRoleDefaults(r), resource, 'view'),
      `search group ${group} for ${r} follows ${resource}: view`)
  }
}

// ── settings GET, PATCH ─────────────────────────────────────────────────────
const settings = code('app/api/settings/route.ts')
const sGet = handler(settings, 'GET')
ok(/const seesInvites = actorCan\(actor, 'settings_team', 'view'\)/.test(sGet)
  && /if \(profile\.company_id && seesInvites\)/.test(sGet),
  'settings GET (personal; every screen calls it): pending invites only for Team & Users')
const sPatch = handler(settings, 'PATCH')
ok(/!actorCan\(actor, 'settings_company', 'view'\)/.test(sPatch),
  'settings PATCH: the company half asks settings_company (view - the Company tab\'s Save is offered at view)')
ok(/wantsProtection && \(!companyId \|\| !mayManageCompanySetting\(actor\)\)/.test(sPatch),
  '...delete protection asks the manage rule')
ok(/auto_logout_minutes !== undefined && !mayManageCompanySetting\(actor\)/.test(sPatch),
  '...the sign-out timer (Security tab) asks it too')
ok(/const locked = await billingLock\(db, companyId\)/.test(sPatch), '...and a company write carries the billing lock')
ok(sPatch.indexOf('billingLock(') < sPatch.indexOf(".from('companies').update"),
  '...all asked BEFORE the first company write, so a refusal leaves nothing half saved')
ok(!/\.from\('profiles'\)\s*\.select\('company_id'\)/.test(sPatch),
  '...and the company written is the actor\'s, not a second read that could disagree')
for (const r of holders('settings_company', 'view')) {
  ok(can(getRoleDefaults(r), 'settings_company', 'view'), `${r} opens the Company tab and may still press Save`)
}

// ── settings/logo POST, DELETE ──────────────────────────────────────────────
const logo = code('app/api/settings/logo/route.ts')
for (const m of ['POST', 'DELETE']) {
  const b = handler(logo, m)
  ok(gate(b, 'settings_company', 'view') && /mayManageCompanySetting\(gate\.actor\)/.test(b)
    && /billingLock\(db, profile\.company_id\)/.test(b) && !bareSignIn(b),
    `settings/logo ${m}: Company tab + manage rule + billing lock, no bare sign-in`)
}

// ── settings/calendar GET, POST (personal) ──────────────────────────────────
const cal = code('app/api/settings/calendar/route.ts')
ok((cal.match(/\.eq\('id', user\.id\)/g) ?? []).length === 3,
  'settings/calendar (personal): the token read and both writes are the caller\'s own profile')

// ── settings/company/owner POST ─────────────────────────────────────────────
const owner = handler(code('app/api/settings/company/owner/route.ts'), 'POST')
ok(gate(owner, 'settings_team', 'view') && !bareSignIn(owner), 'company/owner: Team & Users first')
ok(/mayTransferOwnership\(/.test(owner) && /target\.company_id !== caller\.company_id/.test(owner),
  '...then only the owner, only to an admin in the same company')

// ── settings/teammates GET ──────────────────────────────────────────────────
const mates = handler(code('app/api/settings/teammates/route.ts'), 'GET')
ok(/const actor = await getActor\(db, token\)/.test(mates) && !bareSignIn(mates),
  'settings/teammates: resolved through the permission layer')
ok(/const profile = \{ company_id: actor\.companyId \}/.test(mates), '...the roster is the actor\'s own company')
ok(/seesInvites\s*\?\s*db\.from\('company_invites'\)/.test(mates), '...invites only for settings_team: view')
ok(/if \(repairsInvites && remainingInviteEmails\.length > 0\)/.test(mates)
  && /const repairsInvites = actorCan\(actor, 'settings_team', 'edit'\)/.test(mates),
  '...and the repair that MOVES profiles into this company only for settings_team: edit')

// ── settings/verify-delete-key POST (company, any member) ───────────────────
const vdk = code('app/api/settings/verify-delete-key/route.ts')
ok(/\.eq\('id', profile\.company_id\)/.test(vdk) && /hashKey\(key\) === company\.delete_key_hash/.test(vdk)
  && !/delete_key_hash[^;]*NextResponse\.json\(\{[^}]*delete_key_hash/.test(vdk),
  'verify-delete-key: checks against the caller\'s own company and never returns the hash')

// ── QuickBooks connect, disconnect, status, sync ────────────────────────────
for (const [file, m, lock] of [
  ['connect', 'GET', true], ['disconnect', 'POST', false], ['sync', 'POST', true],
] as const) {
  const b = handler(code(`app/api/quickbooks/${file}/route.ts`), m)
  ok(gate(b, 'settings_company', 'view') && /mayManageCompanySetting\(gate\.actor\)/.test(b) && !bareSignIn(b),
    `quickbooks/${file}: Integrations tab + the manage rule, no bare sign-in`)
  ok(!/\['admin', 'manager'\]\.includes\(profile\.role\)/.test(b), `...the role list lives in one place now (${file})`)
  ok(/billingLock\(db, profile\.company_id\)/.test(b) === lock,
    `...billing lock ${lock ? 'on' : 'off - letting go of a connection takes nothing'} (${file})`)
  ok(/const companyId = gate\.actor\.companyId/.test(b), `...on the actor's own company (${file})`)
}
const qStatus = handler(code('app/api/quickbooks/status/route.ts'), 'GET')
ok(gate(qStatus, 'settings_company', 'view') && !bareSignIn(qStatus), 'quickbooks/status: Integrations tab')
ok(/canManage: mayManageCompanySetting\(gate\.actor\)/.test(qStatus),
  '...and the card\'s buttons are offered by the SAME predicate the routes ask')

// ── trade-scopes GET, PUT ───────────────────────────────────────────────────
const ts = code('app/api/trade-scopes/route.ts')
ok(gate(handler(ts, 'GET'), 'bids', 'view') && !bareSignIn(handler(ts, 'GET')), 'trade-scopes GET: the Request Quotes tab (bids: view)')
ok(gate(handler(ts, 'PUT'), 'bids', 'edit') && !bareSignIn(handler(ts, 'PUT')), 'trade-scopes PUT: bids: edit (with the lock)')
ok(/company_id: profile\.company_id/.test(handler(ts, 'PUT')), '...written to the actor\'s company')

// ── approvals GET ───────────────────────────────────────────────────────────
const appr = handler(code('app/api/approvals/route.ts'), 'GET')
ok(/const actor = await getActor\(db, token\)/.test(appr) && !bareSignIn(appr), 'approvals: resolved through the permission layer')
const apprGate = appr.indexOf("actorCan(actor, 'approvals', 'view')")
ok(apprGate > appr.indexOf('if (isSub)') && apprGate < appr.indexOf(".eq('gc_company_id', companyId)"),
  '...the GC branch asks approvals: view before reading a single job; the sub branch stays personal')
ok(/\.in\('subcontract_id', subIds\)/.test(appr) && /\.eq\('company_id', companyId\)/.test(appr),
  '...and the sub branch is only that company\'s own bills and RFIs')

// ── dashboard activity, overview ────────────────────────────────────────────
const act = handler(code('app/api/dashboard/activity/route.ts'), 'GET')
ok(gate(act, 'dashboard', 'view') && !bareSignIn(act), 'dashboard/activity: dashboard: view')
ok(/if \(!isCompanyAdmin\)/.test(act), '...and a non-admin still sees only their own actions')
const ov = handler(code('app/api/dashboard/overview/route.ts'), 'GET')
ok(gate(ov, 'dashboard', 'view') && !bareSignIn(ov), 'dashboard/overview: dashboard: view')
ok(/\['admin', 'manager'\]\.includes\(profile\.role/.test(ov) && /actorCan\(gate\.actor, 'financials', 'view'\)/.test(ov),
  '...plus the admin/manager role and the Financial Summary - it is cash in and out across every job')

// ── master calendar, money ──────────────────────────────────────────────────
for (const [f, res] of [['calendar', 'schedule'], ['money', 'financials']] as const) {
  const b = handler(code(`app/api/master/${f}/route.ts`), 'GET')
  ok(gate(b, res, 'view') && /\['admin', 'manager'\]\.includes\(profile\.role/.test(b) && !bareSignIn(b),
    `master/${f}: ${res}: view on top of the admin/manager role`)
}
for (const r of ['admin', 'manager']) {
  ok(can(getRoleDefaults(r), 'financials', 'view') && can(getRoleDefaults(r), 'schedule', 'view'),
    `${r} keeps Master Money, Master Calendar and the overview cards`)
}

// ── projects/stats GET ──────────────────────────────────────────────────────
const stats = handler(code('app/api/projects/stats/route.ts'), 'GET')
ok(gate(stats, 'projects', 'view') && !bareSignIn(stats), 'projects/stats: projects: view')
ok(/isAssignedOnly\(profile\.role\)[\s\S]{0,300}myJobs\(db, user\.id, profile\)/.test(stats),
  '...an assigned-only role still counts only the jobs it is on')
ok(holders('projects').length === ROLES.length, '...which every built-in role holds - nobody lost the Projects list')

// ── search GET ──────────────────────────────────────────────────────────────
const search = handler(code('app/api/search/route.ts'), 'GET')
ok(/const actor = await actorOf\(request\)/.test(search) && !/getUser\(/.test(search),
  'search: resolved through the permission layer')
const groups = Object.keys(SEARCH_GROUP_RESOURCE)
for (const g of groups) {
  ok(new RegExp(`only\\('${g}', `).test(search), `search: the ${g} group asks before it queries`)
}
ok(!/\n    safe\(/.test(search), '...and no group is searched unconditionally')
ok(/allowed\(group\) \? safe\(fn\) : Promise\.resolve\(\[\]\)/.test(search), '...a refused group is never queried')
ok(/if \(assignedOnly\)[\s\S]{0,300}myJobs\(db, actor\.userId, me\)/.test(search)
  && /filter\(p => !onJobs \|\| onJobs\.has\(p\.id\)\)/.test(search),
  '...an assigned-only role searches the jobs it is ON')
ok(/taskIdsFor\(db, \{ memberIds: membership\.memberIds, name: myName \}\)/.test(search)
  && /if \(!mine \|\| !mine\.length\) return \[\]/.test(search),
  '...and only its own tasks there; a failed lookup searches nothing, never everything')

// ── notifications/audience GET (company, any member - by design) ────────────
const aud = handler(code('app/api/notifications/audience/route.ts'), 'GET')
ok(/audienceFor\(\{ db, companyId, type \}\)/.test(aud) && /select\('company_id'\)\.eq\('id', user\.id\)/.test(aud),
  'notifications/audience: ids of the caller\'s own colleagues only')

// ── directory GET, POST ─────────────────────────────────────────────────────
const dir = code('app/api/directory/route.ts')
const dGet = handler(dir, 'GET')
ok(/const level = directoryReadLevel\(actor\)/.test(dGet) && /if \(!level\) return forbidden\(\)/.test(dGet) && !/getUser\(/.test(dir),
  'directory GET: directory: view, or the share slice at files: view')
ok(/const myCompanyId = actor\.companyId/.test(dGet), '...always the actor\'s own company')
ok(/if \(level === 'share'\)[\s\S]{0,200}DIRECTORY_SHARE_FIELDS/.test(dGet), '...and the share reader gets the slice, not the rows')
const dPost = handler(dir, 'POST')
ok(/if \(!actorCan\(actor, 'directory', 'view'\)\) return forbidden\(\)/.test(dPost)
  && /billingLock\(admin\(\), myCompanyId\)/.test(dPost),
  'directory POST (Quick Add): directory: view + the billing lock by hand')
ok(/createDirectoryContact\(admin\(\), \{ myCompanyId, body \}\)/.test(dPost) && /const myCompanyId = actor\.companyId/.test(dPost),
  '...tagged with the actor\'s company, never one from the body')
for (const r of ['project_manager', 'office_staff', 'field_supervisor']) {
  ok(can(getRoleDefaults(r), 'directory', 'view') && !can(getRoleDefaults(r), 'directory', 'create'),
    `${r} holds directory: view only and keeps Quick Add`)
}

// ── admin/backfill-manual-bids POST ─────────────────────────────────────────
const bf = handler(code('app/api/admin/backfill-manual-bids/route.ts'), 'POST')
const sa = bf.indexOf('if (!isSuperAdmin(user.email))')
ok(sa > 0 && sa < bf.indexOf(".from('subcontracts')"),
  'admin/backfill-manual-bids: super admin only, asked before the platform-wide read')

done()
