// The client portal link is a standing, read-only view of a whole job -
// progress, the schedule, selections, and the invoices the GC has sent their
// client. Every route in the family checked exactly one thing: are you signed
// in.
//
// So any account holding a project id could read that link. And POST MINTED A
// NEW TOKEN unconditionally, which cuts off a client who is using the old one -
// the only thing standing between a live link and oblivion was a confirmation
// dialog in one of the two callers, which a second tab or a double press went
// straight round.
//
// Worst of it: `middleware.ts` returns early for every `/api/` path, so nothing
// else was gating them, and a SUBCONTRACTOR invited to the job had exactly as
// much access to the GC's client portal as the GC did.
//
// Two questions now, and they are different questions. `client-portal` is the
// ABILITY, remappable per company. `ownedProject` is WHOSE JOB IT IS -
// deliberately not part of `requirePermission`, because subs legitimately write
// to jobs they do not own, but never this one.

import { RESOURCES, ROLE_DEFAULTS, getRoleDefaults, can } from '../permissions'
import { ok, done, code } from './_helpers'

// ── the resource ────────────────────────────────────────────────────────────
const res = RESOURCES.find(r => r.key === 'client-portal')
ok(!!res, 'THE SETTING: the client portal link is its own resource, so a company can grant or take it away')
ok(!res?.slug, '...with no slug - there is no screen behind it, only the dialog in the project header')

// A resource a role never names resolves to nothing, which is a permission
// silently defaulting to "no" for somebody who should have it.
for (const role of Object.keys(ROLE_DEFAULTS)) {
  ok('client-portal' in getRoleDefaults(role), `${role} has an explicit client-portal entry`)
}

// ── who gets it, and why ────────────────────────────────────────────────────
for (const role of ['admin', 'manager', 'project_manager', 'office_staff']) {
  ok(can(getRoleDefaults(role), 'client-portal', 'view'),
    `${role} can read the client's link - they are who the client asks`)
  ok(can(getRoleDefaults(role), 'client-portal', 'edit'),
    `${role} can replace it, which is the point of having a regenerate at all`)
}

// THE ESCALATION. `read_only` is the VENDOR role - an invited subcontractor.
for (const role of ['read_only', 'field_supervisor', 'worker', 'member']) {
  const p = getRoleDefaults(role)
  ok(!can(p, 'client-portal', 'view'),
    `THE HOLE: ${role} cannot read the link that shows the GC's invoices to their client`)
  ok(!can(p, 'client-portal', 'create') && !can(p, 'client-portal', 'edit'),
    `...and certainly cannot mint or replace one`)
}

// It is NOT the same permission as editing the project. Splitting it is the
// whole move: handing an outsider a standing view of the job is a different act
// from renaming it or moving its dates.
ok(can(getRoleDefaults('field_supervisor'), 'projects', 'view')
  && !can(getRoleDefaults('field_supervisor'), 'client-portal', 'view'),
  'THE SPLIT: a field supervisor still sees projects and still cannot see the client link')

// ── every route in the family asks, and asks for the right one ──────────────
const mint = code('app/api/projects/[id]/portal-token/route.ts')
const send = code('app/api/projects/[id]/portal-token/send/route.ts')
const shared = code('app/api/projects/[id]/portal-token/shared/route.ts')

for (const [src, name] of [[mint, 'portal-token'], [send, 'send'], [shared, 'shared']] as const) {
  ok(/requirePermission\(db, request, 'client-portal', 'view'\)/.test(src),
    `${name} asks the permission before anything else`)
  ok(/ownedProject</.test(src), `${name} also asks whose job it is`)
  // Asking is not enough - the refusal has to END the request. A guard whose
  // answer is computed and then fallen past is the same as no guard.
  ok(/if \('denied' in owned\) return owned\.denied/.test(src),
    `...and RETURNS on it, rather than computing a refusal and carrying on`)
  ok(!/db\.auth\.getUser\(/.test(src),
    `${name} no longer stops at "are you signed in", which is all it ever checked`)
}

// Reading the link IS the power to send it - anyone who can see it can paste it
// into their own email - so the send is gated at `view`, not higher. Gating it
// above the read would be theatre.
ok(!/'client-portal', 'create'/.test(send) && !/'client-portal', 'edit'/.test(send),
  'the send is gated at view, because seeing the link is already the power to send it')

// ── creating and REPLACING are different powers ─────────────────────────────
ok(/regenerate/.test(mint),
  'THE DESTRUCTIVE ONE: replacing a live link has to be asked for in as many words')
ok(/if \(existing && !wantsNew\)/.test(mint),
  '...and a POST to a job that already has a link hands back the one that exists rather than destroying it')
ok(/const action = existing \? 'edit' : 'create'/.test(mint),
  'bringing a link into existence and cutting off a client using one are not the same permission')
{
  // The second gate must run BEFORE the token is written, not after.
  const gateAt = mint.indexOf("const action = existing ?")
  const writeAt = mint.indexOf('client_portal_token: portalToken')
  ok(gateAt > -1 && writeAt > -1 && gateAt < writeAt, '...and it is asked before the update runs')
}

// ── the shared guard ────────────────────────────────────────────────────────
const guard = code('lib/api-guard.ts')
ok(/export async function ownedProject/.test(guard),
  'the company check is a shared, opt-in guard rather than five hand-rolled copies')
ok(/ownsProject\(actor\.companyId, project as any\)/.test(guard),
  '...built on the one answer for whose project this is')
ok(/status: 403/.test(guard),
  'a job that is not yours is 403, not 404 - pretending it does not exist is a worse answer to somebody standing on it')
ok(!/requirePermission[\s\S]{0,400}ownsProject/.test(guard.slice(guard.indexOf('export async function requirePermission'), guard.indexOf('export function denied'))),
  'and it is NOT folded into requirePermission, which would break every sub in the product')

// ── the screens ─────────────────────────────────────────────────────────────
const button = code('components/layout/share-portal-button.tsx')
ok(/regenerate: true/.test(button),
  'the Replace-link button says so explicitly - it used to overwrite on any POST')
ok(/!permsLoading && !permsError && !can\('client-portal', 'view'\)/.test(button),
  "THE OTHER TRAP: the trigger hides only when the answer is KNOWN to be no - a permissions call that FAILED returns false exactly like a denial, and hiding a control on that is how the Plans Upload button vanished")
ok(/await res\.json\(\)\.catch\(\(\) => null\)/.test(button),
  'and a refusal is parsed rather than thrown away, so the dialog can say which refusal it was')

const selections = code('app/(dashboard)/projects/[id]/selections/page.tsx')
ok(/notify\(d\?\.error \?\?/.test(selections),
  "the other caller reports the route's reason instead of its own shrug")

done()
