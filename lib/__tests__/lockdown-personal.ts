// THE PERSONAL ROUTES: the ones that legitimately need only a sign-in, because
// they only ever touch the caller's OWN rows - their notifications, their
// tasks, a sub's own jobs and bids, their own signup.
//
// "Only a sign-in" is safe only while every query is scoped to the caller. The
// routes run on the service-role client, so RLS does not apply: an id from the
// URL or a claim in the body is answered for whoever asks unless the route
// itself checks it. Each handler below is pinned on the check that scopes it.

import { invitationToPackage, acceptedRole, escapeLike, inviteMove } from '../personal-access'
import { ok, done, code } from './_helpers'

const signedIn = (src: string) => /auth\.getUser\(token\)/.test(src)

// ── me/permissions GET ──────────────────────────────────────────────────────
// The caller's own profile; the two previews are admin-only and the per-user
// one is fenced to the admin's own company.
const perms = code('app/api/me/permissions/route.ts')
ok(signedIn(perms) && /\.eq\('id', user\.id\)/.test(perms), 'me/permissions reads the caller\'s own profile')
ok(/asUser && realRole === 'admin'/.test(perms) && /target\.company_id === callerProfile\?\.company_id/.test(perms),
  '...and previewing another user is an admin, in the same company')
ok(/viewAs && realRole === 'admin'/.test(perms), '...and previewing a role is an admin too')

// ── me/tasks GET ────────────────────────────────────────────────────────────
const tasks = code('app/api/me/tasks/route.ts')
ok(signedIn(tasks) && /myJobs\(db, user\.id, profile\)/.test(tasks), 'me/tasks starts from the jobs THIS person is on')
ok(/\.in\('project_id', projectIds\)\s*\.in\('id', mineIds\)/.test(tasks), '...and only their tasks on those jobs')
ok(/\.eq\('profile_id', user\.id\)/.test(tasks), '...and only their own clock')

// ── notifications GET, PATCH; [notifId] PATCH, DELETE ────────────────────────
const notes = code('app/api/notifications/route.ts')
ok((notes.match(/\.eq\('user_id', user\.id\)/g) ?? []).length === 2, 'notifications: the list and mark-all-read are the caller\'s own')
const note = code('app/api/notifications/[notifId]/route.ts')
ok((note.match(/\.eq\('id', params\.notifId\)\s*\.eq\('user_id', user\.id\)/g) ?? []).length === 2,
  'notifications/[id]: marking read and deleting both need the id AND the caller to match')

// ── settings/notifications GET, PATCH; me/device-token POST, DELETE; ────────
// ── me/push-test GET, POST ──────────────────────────────────────────────────
// Each signs in through a helper local to its file, which is why the sign-in
// scan could not see them until it learned to. All keyed on the caller.
const prefs = code('app/api/settings/notifications/route.ts')
ok((prefs.match(/\.eq\('user_id', user\.id\)/g) ?? []).length === 2 && /user_id: user\.id,/.test(prefs),
  'settings/notifications: reading and saving preferences are the caller\'s own rows')
const device = code('app/api/me/device-token/route.ts')
ok(/user_id: user\.id,/.test(device) && /\.delete\(\)\.eq\('token', value\)\.eq\('user_id', user\.id\)/.test(device),
  'me/device-token: registers to the caller, and only removes a token that is the caller\'s')
const pushTest = code('app/api/me/push-test/route.ts')
ok(/\.eq\('user_id', userId\)/.test(pushTest) && /pushToPhones\(db, \[user\.id\]/.test(pushTest)
  && !/request\.json\(\)[\s\S]{0,200}user_?id/i.test(pushTest),
  'me/push-test: counts and pushes to the caller\'s own phones, never an id from the body')

// ── my-jobs GET ─────────────────────────────────────────────────────────────
const jobs = code('app/api/my-jobs/route.ts')
ok(/if \(!profile\?\.company_id\) return NextResponse\.json\(\{ awarded: \[\], own: \[\] \}\)/.test(jobs),
  'my-jobs: no company, no jobs')
ok(/from\('subcontracts'\)[\s\S]{0,120}\.eq\('company_id', profile\.company_id\)/.test(jobs) &&
   /\.eq\('created_by_company_id', profile\.company_id\)/.test(jobs),
  '...awarded and own are both the caller\'s company\'s')

// ── my-jobs/[projectId] GET ─────────────────────────────────────────────────
const job = code('app/api/my-jobs/[projectId]/route.ts')
ok(/\.eq\('project_id', params\.projectId\)\.eq\('company_id', companyId\)/.test(job),
  'my-jobs/[id]: the subcontracts read is this company\'s on this job')
ok(/if \(!hasSubcontract\) \{[\s\S]{0,300}\.eq\('created_by_company_id', companyId\)[\s\S]{0,80}if \(!ownership\) return notFound\(\)/.test(job),
  '...and with none, only the company that created the job gets in')
ok(!/Access denied/.test(job) && !/Project not found \(/.test(job),
  '...refused in the same words as a missing job, without the database\'s text')
const gateAt = job.indexOf('if (!ownership) return notFound()')
ok(gateAt > 0 && gateAt < job.indexOf("from('rfis')") && gateAt < job.indexOf("from('schedule_items')"),
  '...and asked before a single job record is read')
ok(/from\('invoices'\)[\s\S]{0,120}\.eq\('company_id', companyId\)/.test(job), '...and only their own bills on it')

// ── my-jobs/[projectId]/schedule/[itemId]/delay POST ────────────────────────
const delay = code('app/api/my-jobs/[projectId]/schedule/[itemId]/delay/route.ts')
ok(/\.eq\('id', params\.itemId\)\s*\.eq\('project_id', params\.projectId\)/.test(delay),
  'delay: the line has to be on the job in the URL')
ok(/subcontracts\?\.company_id !== profile\.company_id/.test(delay), '...and on the caller\'s own subcontract')
ok(delay.indexOf('subcontracts?.company_id !== profile.company_id') < delay.indexOf("from('schedule_delay_reports')"),
  '...asked before any report is deleted or written')

// ── my-bids GET ─────────────────────────────────────────────────────────────
const bids = code('app/api/my-bids/route.ts')
ok(/if \(!profile\?\.company_id\) return/.test(bids), 'my-bids: no company, no invitations')
ok(/\.eq\('vendor_company_id', profile\.company_id\)/.test(bids), '...and only this company\'s')

// ── my-bids/[packageId] GET, POST ───────────────────────────────────────────
// THE HOLE: POST checked nothing but the sign-in. Any account holding a
// package id could post a bid onto it, upload into storage, mark invitations
// accepted and ring the GC's bell.
const pkg = code('app/api/my-bids/[packageId]/route.ts')
const handlers = pkg.split(/export async function /).slice(1)
const getH = handlers.find(h => h.startsWith('GET'))!
const postH = handlers.find(h => h.startsWith('POST'))!
for (const [name, h] of [['GET', getH], ['POST', postH]] as const) {
  const at = h.indexOf('invitationToPackage(db, profile.company_id, params.packageId)')
  ok(at > 0 && /if \(!invitation\) return NextResponse\.json\(\{ error: 'Package not found' \}, \{ status: 404 \}\)/.test(h),
    `my-bids/[id] ${name}: refused unless this company was invited, in the words for a missing package`)
  ok(at > 0 && at < h.indexOf("from('bid_packages')"), `...${name} asks before the package is read`)
}
ok(postH.indexOf('invitationToPackage') < postH.indexOf('request.formData()') &&
   postH.indexOf('invitationToPackage') < postH.indexOf('.upload('),
  '...and POST asks before reading the form or uploading anything')
ok(!/Not invited to this package/.test(pkg), '...and nothing says "not invited" about a real id')

// ── complete-signup POST ────────────────────────────────────────────────────
const signup = code('app/api/complete-signup/route.ts')
ok(!/\buserId\b/.test(signup) && /const targetId = user\.id/.test(signup),
  'complete-signup: the profile is written for the signed-in account, never an id from the body')
// The body's fields, read off the destructure: `acceptedTerms` joined them
// (migration 152). What matters is that `email` and `userId` never do.
const bodyFields = (signup.match(/const \{([^}]*)\} = await request\.json\(\)/)?.[1] ?? '').split(',').map(f => f.trim())
ok(bodyFields.includes('companyName') && !bodyFields.includes('email') && !bodyFields.includes('userId') &&
   /const email = \(user\.email \?\? ''\)\.trim\(\)/.test(signup),
  '...and the address on the account is the verified one, not the body\'s')
// NEVER JOINS A COMPANY BY EMAIL. It did - any company whose contact_email
// matched, as ADMIN, which was usually a GC's Directory entry for the person.
// Section 6 of docs/proposals/sub-company-link.md. Same for /api/settings,
// which also took company and role out of user_metadata (writable by the user).
ok(!/from\('companies'\)[^;]*contact_email/.test(signup.replace(/\.insert\(\{[^}]*\}\)/g, '')),
  'complete-signup never looks a company up by contact email')
const settingsSrc = code('app/api/settings/route.ts')
ok(!/\.eq\('contact_email'|\.ilike\('contact_email'/.test(settingsSrc),
  'settings never joins a company by contact email')
ok(!/user_metadata\?\.(company_id|role)/.test(settingsSrc),
  'settings never takes a company or a role from user_metadata, which the user can write')
ok(/from\('company_invites'\)[\s\S]{0,200}\.eq\('status', 'pending'\)/.test(settingsSrc) && /needsSignup: true/.test(settingsSrc),
  '...a missing profile is filled only from a pending invite, else sent to finish signup')
// A ROLE COMES FROM THE PROFILE, NEVER FROM user_metadata. getActor - the
// check behind every gated route - started from the metadata role and kept it
// when no profile row came back, so an account with no profile was whatever
// role it wrote into its own metadata. Scanned across every route and lib file.
for (const f of ['lib/server-permissions.ts', 'app/api/me/permissions/route.ts', 'app/api/settings/route.ts', 'app/api/projects/[id]/plans/[planId]/file/route.ts']) {
  ok(!/user_metadata\??\.role/.test(code(f)), `${f}: no role is read out of user_metadata`)
}
ok(/let role = 'read_only'/.test(code('lib/server-permissions.ts')), 'actorForUser: no profile means the least a role can be')
const purchase = code('lib/writes/material-purchase.ts')
ok(/\.eq\('added_by_company_id', companyId\)\s*\.ilike\('name', escapeLike\(store_name\.trim\(\)\)\)/.test(purchase),
  'a saved store is matched by name only inside the buyer\'s own Directory, escaped')

// ── invite/accept POST ──────────────────────────────────────────────────────
const accept = code('app/api/invite/accept/route.ts')
ok(/\.eq\('email', email\)/.test(accept) && /const email = user\.email/.test(accept),
  'invite/accept: only invites sent to the verified address')
ok(/acceptedRole\(existing, invite\)/.test(accept) && !/if \(!existing\.role\) patch\.role/.test(accept),
  '...and a role from ANOTHER company is not carried into the inviting one')

// ── behaviour: acceptedRole ─────────────────────────────────────────────────
ok(acceptedRole(null, { role: 'worker', company_id: 'B' }) === 'worker', 'a new profile gets the invited role')
ok(acceptedRole(null, { role: null, company_id: 'B' }) === 'read_only', '...read_only when the invite named none')
ok(acceptedRole({ role: 'admin', company_id: 'B' }, { role: 'worker', company_id: 'B' }) === null,
  'a role THIS company set is never downgraded by a re-invite')
ok(acceptedRole({ role: 'admin', company_id: 'A' }, { role: 'read_only', company_id: 'B' }) === 'read_only',
  'THE ESCALATION: an admin elsewhere, invited as read-only, arrives read-only')
ok(acceptedRole({ role: 'admin', company_id: null }, { role: 'worker', company_id: 'B' }) === 'worker',
  '...and so does a role with no company behind it')
ok(acceptedRole({ role: null, company_id: 'B' }, { role: 'worker', company_id: 'B' }) === 'worker',
  'a same-company profile with no role yet takes the invited one')

ok(escapeLike('a_b%c@x.com') === 'a\\_b\\%c@x.com', 'escapeLike keeps wildcards literal')

// ── behaviour: invitationToPackage, against a fake db ───────────────────────
type Row = { id: string; status: string; bid_package_id: string; company_id: string }
const ROWS: Row[] = [{ id: 'inv1', status: 'pending', bid_package_id: 'P1', company_id: 'C1' }]
let reads = 0
const fakeDb = (fail = false) => ({
  from(table: string) {
    reads++
    const filters: Record<string, unknown> = {}
    const q: any = {
      select: () => q,
      eq: (col: string, v: unknown) => { filters[col] = v; return q },
      limit: async () => fail
        ? { data: null, error: { message: 'boom' } }
        : { data: table === 'bid_invitations' ? ROWS.filter(r => Object.entries(filters).every(([k, v]) => (r as any)[k] === v)) : [], error: null },
    }
    return q
  },
}) as any

;(async () => {
  ok((await invitationToPackage(fakeDb(), 'C1', 'P1'))?.id === 'inv1', 'an invited company finds its invitation')
  ok(await invitationToPackage(fakeDb(), 'C2', 'P1') === null, 'another company does not')
  ok(await invitationToPackage(fakeDb(), 'C1', 'P2') === null, '...nor the invited company on a different package')
  reads = 0
  ok(await invitationToPackage(fakeDb(), null, 'P1') === null && reads === 0, 'no company is refused without asking the db')
  const origErr = console.error; console.error = () => {}
  ok(await invitationToPackage(fakeDb(true), 'C1', 'P1') === null, 'a failed read is a refusal, never a pass')
  console.error = origErr
  // AN INVITE NEVER MOVES SOMEBODY WHO ALREADY BELONGS TO ANOTHER COMPANY.
  // invite/accept runs on every sign-in and password reset, so a GC typing an
  // address into an invite used to take that person out of their own company.
  ok(inviteMove(null, { company_id: 'B' }) === 'join', 'no profile yet: joins')
  ok(inviteMove({ company_id: null }, { company_id: 'B' }) === 'join', 'a profile with no company: joins')
  ok(inviteMove({ company_id: 'B' }, { company_id: 'B' }) === 'join', 'already in the inviting company: stays')
  ok(inviteMove({ company_id: 'A' }, { company_id: 'B' }) === 'blocked', 'in ANOTHER company: never moved')
  const acceptRoute = code('app/api/invite/accept/route.ts')
  const block = acceptRoute.indexOf("inviteMove(existing, invite) === 'blocked'")
  ok(block > 0 && block < acceptRoute.indexOf(".from('profiles').update(") && block < acceptRoute.indexOf(".from('profiles').upsert(")
    && block < acceptRoute.indexOf("linkTeamRows(") && block < acceptRoute.indexOf("update({ status: 'accepted' })"),
    'invite/accept refuses the move BEFORE it writes the profile, claims team rows or marks the invite accepted')
  done()
})()
