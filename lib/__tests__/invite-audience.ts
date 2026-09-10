// One invite email for three different people.
//
// THE REPORT: inviting a subcontractor out of the Directory sent them the beta
// WAITLIST APPROVAL email - "YOU'RE APPROVED · Welcome to the SyteNav beta ·
// your access request is approved · start putting jobs in straight away".
//
// Not one clause of that is true for a sub. They asked for nothing, they are in
// no beta they applied to, and they do not put jobs in - they answer somebody
// else's. `inviteEmail` was written for one audience and used for three.
//
// There are two doors into SyteNav and they mean different things:
//
//   WAITLIST  a stranger asks, a super admin approves. "You're approved" is
//             true here and nowhere else.
//   INVITE    somebody already inside vouches for a person. There is no second
//             approval, because the invite IS the approval.
//
// And the thing found while tracing it: POST /api/invite checked only that you
// were SIGNED IN, then took `role` and `company_id` out of the request body -
// which /api/invite/accept writes onto the new profile. Any account at all
// could mint an admin of any company whose id it had.

import { inviteEmail, teamInviteEmail, vendorInviteEmail } from '../email'
import { ok, done, code, walk } from './_helpers'

const LINK = 'https://app.sytenav.com/auth/callback?token=abc'

// ── each template speaks to its own audience ─────────────────────────────────
const waitlist = inviteEmail({ name: 'Dana Reed', inviteUrl: LINK })
const team = teamInviteEmail({ name: 'Dana Reed', companyName: 'Gershon Construction', inviterName: 'Ilan Katz', inviteUrl: LINK })
const vendor = vendorInviteEmail({ name: 'Dana Reed', gcName: 'Gershon Construction', inviteUrl: LINK })

const all = (m: { subject: string; text: string; html: string }) =>
  `${m.subject}\n${m.text}\n${m.html}`.toLowerCase()

ok(/approved/.test(all(waitlist)) && /beta/.test(all(waitlist)),
  'the waitlist mail says approved and beta - it is the one place both are true')

// THE BUG, in one assertion each.
ok(!/approved/.test(all(vendor)) && !/beta/.test(all(vendor)),
  'a sub is told neither - they applied for nothing')
ok(!/putting jobs in|put jobs in/.test(all(vendor)),
  '...and is not told to start putting jobs in, which is the GC\'s side of the job')
ok(!/approved/.test(all(team)) && !/beta/.test(all(team)),
  'nor is a teammate somebody just added')

// ── and each says what it IS ────────────────────────────────────────────────
ok(/gershon construction/i.test(vendor.subject) && /invited you/i.test(vendor.subject),
  `a sub's subject names who invited them (${vendor.subject})`)
ok(/quote|bills|insurance/.test(all(vendor)),
  '...and the body says what the account is for, which is the only reason to make one')
ok(/ilan katz/i.test(all(team)) && /gershon construction/i.test(all(team)),
  'a teammate is told who added them and to what')

// A name we do not have must not leave a hole in the sentence.
const anon = vendorInviteEmail({ name: null, gcName: null, inviteUrl: LINK })
ok(!/undefined|null|\bhi ,/.test(all(anon)),
  'a missing name or company reads as a sentence, not as "Hi , null invited you"')
ok(/a contractor you work with/i.test(all(anon)), '...with something usable in its place')

// Every template still carries a real plain-text part - it is what keeps mail
// out of spam, not a fallback nobody reads.
for (const [what, m] of [['waitlist', waitlist], ['team', team], ['vendor', vendor]] as const) {
  ok(m.text.length > 120 && m.text.includes(LINK), `the ${what} mail has a real text part with its link in it`)
  ok(m.html.includes(LINK) && m.subject.length > 0, `...and an html part and a subject`)
}

// ── the route picks the audience, and does not take the sender's word ───────
const route = code('app/api/invite/route.ts')
ok(/body\.audience === 'vendor' \? 'vendor' : 'team'/.test(route),
  "the route reads an audience, defaulting to 'team' - an un-updated caller cannot silently get the beta text")
ok(/vendorInviteEmail\(/.test(route) && /teamInviteEmail\(/.test(route),
  '...and sends the matching template')
ok(!/\binviteEmail\(/.test(route),
  '...and never the waitlist one, which belongs to the approvals screen alone')
ok(/inviteEmail\(/.test(code('app/api/admin/access-requests/route.ts')),
  'the approvals screen still sends it, because there the words are true')

ok(/db\.from\('companies'\)\.select\('name'\)\.eq\('id', actor\.companyId\)/.test(route.replace(/\s+/g, ''))
  || /from\('companies'\)[\s\S]{0,60}\.eq\('id', actor\.companyId\)/.test(route),
  "the GC's name is looked up from the INVITER - the Directory page sends the sub's own name")

// ── the gate ────────────────────────────────────────────────────────────────
ok(/requirePermission\(db, request, audience === 'vendor' \? 'directory' : 'settings_team', 'edit'\)/.test(route),
  'inviting is gated like every other write - directory for a vendor, settings_team for a teammate')
ok(/if \(denied\(gate\)\) return gate\.denied/.test(route), '...and a refusal is returned, not logged')

ok(/company_id = actor\.companyId/.test(route),
  'a teammate always lands on the INVITER\'s company')
ok(/added_by_company_id !== actor\.companyId/.test(route),
  '...and a vendor must be a company this company actually put in its directory')
ok(!/let \{ company_id \} = body/.test(route) && !/company_id = inviterProfile/.test(route),
  '...so company_id no longer comes out of the request body at all')

ok(/role = 'read_only'/.test(route), 'a vendor is read_only whatever the body says')
ok(/role === 'admin' && actor\.role !== 'admin'/.test(route),
  '...and nobody mints an admin who is not one already - the escalation this was wide open to')

// Both callers say which door.
ok(/audience: 'vendor'/.test(code('app/(dashboard)/directory/page.tsx')),
  'the Directory invites a vendor')
ok((code('app/(dashboard)/settings/page.tsx').match(/audience: 'team'/g) ?? []).length === 2,
  '...and both Settings paths - first invite and resend - invite a teammate')
ok(!/company_id: profile\?\.company_id/.test(code('app/(dashboard)/settings/page.tsx')),
  '...without naming the company, which is what the route stopped trusting')

// ── a ratchet on the shape itself ───────────────────────────────────────────
//
// middleware.ts returns early for every /api/ path, so each route is on its own
// for this. A role that arrives in a request body and is written without a
// permission check is the exact shape of the bug above.
const bodyRoleUngated: string[] = []
for (const f of walk('app/api').filter(f => f.endsWith('route.ts'))) {
  const src = code(f)
  const fromBody = /body\.role\b/.test(src)
    || /const\s*\{[^}]*\brole\b[^}]*\}\s*=\s*(?:await\s*)?(?:request\.json\(\)|body)\b/.test(src)
  if (!fromBody) continue
  if (/requirePermission|requireSuperAdmin/.test(src)) continue
  bodyRoleUngated.push(f)
}
// ONE, and it is `project_team_members.role` - a job title like "Site Manager"
// on a project roster, which grants nothing. It is still an ungated write and
// this may only go DOWN.
ok(bodyRoleUngated.length <= 1,
  `${bodyRoleUngated.length} route(s) take a role from the body with no permission check`
  + `${bodyRoleUngated.length ? ` - ${bodyRoleUngated[0]}` : ''}`)
ok(!bodyRoleUngated.includes('app/api/invite/route.ts'),
  '...and the invite route is not one of them any more')

done()
