// AN ENABLED PERMISSION HAS TO PRODUCE AN ACCESSIBLE SURFACE.
//
// THE REPORT: "Field Worker's enabled permissions are unreachable. Role
// Defaults give Field Worker View ON for Plans, Projects, Files, Equipment,
// Materials and Approvals, but an actual qa.field login is forced into /field -
// direct navigation to all 9 of those routes redirects back to /field... An
// enabled permission has to produce an accessible surface, otherwise the
// checkbox is false configuration."
//
// THE CAUSE was one line in app/(dashboard)/layout.tsx: every FIELD_ROLE was
// redirected to /field from EVERY screen under it. Field Mode is where a
// worker LANDS; writing that rule in the shared layout made it also the limit
// of where they may go.
//
// AND IT WAS A ROLE CHECK STANDING ON TOP OF PERMISSION CHECKS THAT ALREADY
// WORK. ProjectTabGuard refuses a tab the role does not hold and says so, the
// two navs filter through the same `can()`, and every /api/ route gates on
// requirePermission. The office app already degrades correctly for a narrow
// role - it is what a Field Supervisor has always seen. The redirect was the
// only thing stopping a worker getting the same treatment.
//
// THE TENTH CASE THE REPORT COULD NOT FIND. `mark-ready` was granted to every
// field role and its only button lived on the office Inspections tab, gated on
// `inspections`, which those roles are denied. It has no slug, so there was no
// URL to discover it with - and it is the audience of the 7:30am "nobody has
// marked this ready" email, which means that reminder was asking people to do
// something with no control anywhere in the app.

import { RESOURCES, ROLE_DEFAULTS, FIELD_ROLES, getRoleDefaults, can, isFieldRole, FIELD_HOME } from '../permissions'
import { ok, done, code, read, exists } from './_helpers'

const dashLayout = code('app/(dashboard)/layout.tsx')
// Read defensively: deleting the landing layout is one of the regressions this
// suite is for, and a thrown ENOENT at import time reports a stack trace where
// the assertion below would name the file.
const homeLayout = exists('app/(dashboard)/dashboard/layout.tsx')
  ? code('app/(dashboard)/dashboard/layout.tsx')
  : ''

// ── the regression itself ───────────────────────────────────────────────────
// Read the COMMENT-STRIPPED source: this file and that one both explain the
// bug at length, and the explanation names FIELD_ROLES.
ok(!dashLayout.includes('FIELD_ROLES'),
  'THE BUG: the shared dashboard layout no longer redirects on role at all')
ok(!/redirect\(['"]\/field['"]\)/.test(dashLayout),
  '...and does not send anybody to /field from every office screen')

ok(exists('app/(dashboard)/dashboard/layout.tsx'),
  'THE LANDING RULE has a home of its own, scoped to the office home')
ok(/FIELD_ROLES/.test(homeLayout) && /redirect\(['"]\/field['"]\)/.test(homeLayout),
  '...and it is still true: a field role landing on /dashboard goes to Field Mode')

// It has to be a server redirect. A useEffect would paint the office dashboard
// first, which is the screen the rule exists to skip.
ok(!homeLayout.includes("'use client'") && !homeLayout.includes('useEffect'),
  '...on the server, before any of the office home is sent')

// ── every granted view resolves to somewhere ────────────────────────────────
// Where a resource can be opened. A slug is a project tab (ProjectTabGuard
// decides); a nav key is a global screen (the sidebar and phone bar filter on
// the same `can()`). Anything with neither has to be named here WITH the
// surface it actually has, or it is a checkbox that does nothing.
const NAV_SCREENS = ['dashboard', 'projects', 'customers', 'directory', 'files', 'equipment', 'materials', 'approvals']

const NO_SCREEN_OF_ITS_OWN: Record<string, string> = {
  // The button this suite exists for. Office: the Inspections tab. Field:
  // ReadyCard on Field Home, fed by /api/me/inspections.
  'mark-ready': 'app/field/ready-card.tsx',
  // Shown inside the Budget tab, to people who also hold `budget`.
  margin: 'app/(dashboard)/projects/[id]/budget/page.tsx',
  // A dialog in the project header, with no URL of its own.
  'client-portal': 'components/layout/share-portal-button.tsx',
  settings_company: 'app/(dashboard)/settings/page.tsx',
  settings_team: 'app/(dashboard)/settings/page.tsx',
  settings_billing: 'app/(dashboard)/settings/page.tsx',
}

function surfaceOf(key: string): string | null {
  const def = RESOURCES.find(r => r.key === key)
  if (def?.slug) return `project tab /${def.slug}`
  if (NAV_SCREENS.includes(key)) return `nav screen /${key}`
  if (NO_SCREEN_OF_ITS_OWN[key]) return NO_SCREEN_OF_ITS_OWN[key]
  return null
}

for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
  for (const def of RESOURCES) {
    if (!can(perms, def.key, 'view')) continue
    ok(surfaceOf(def.key) !== null,
      `${role}: "${def.label}" is granted view and has a surface to reach it on`)
  }
}

// Every exempted resource's named surface must actually be on disk - otherwise
// the exemption list is a way to pass this suite by asserting nothing.
for (const [key, file] of Object.entries(NO_SCREEN_OF_ITS_OWN)) {
  ok(exists(file), `${key}: its surface (${file}) exists`)
}

// ── the six the report named ────────────────────────────────────────────────
// Named one at a time rather than counted: a count passes while the wrong six
// are reachable.
const worker = getRoleDefaults('worker')
for (const key of ['plans', 'projects', 'files', 'equipment', 'materials']) {
  ok(can(worker, key, 'view'), `Field Worker still holds view on ${key}`)
  ok(surfaceOf(key) !== null, `...and ${key} is reachable (${surfaceOf(key)})`)
}
// The sixth is the one that was genuinely wrong: Approvals is a window onto
// invoices and RFIs, and this role is denied both.
ok(!can(worker, 'approvals', 'view'),
  'Approvals is no longer granted: it could only ever have been empty for them')
ok(!can(worker, 'invoices', 'view') && !can(worker, 'rfis', 'view'),
  '...which is why - the two things it lists are both denied')

// ── mark-ready: the permission that had no button ───────────────────────────
for (const role of FIELD_ROLES) {
  ok(can(getRoleDefaults(role), 'mark-ready', 'edit'),
    `${role} may mark work ready`)
  ok(!can(getRoleDefaults(role), 'inspections', 'view'),
    `...while being denied the office Inspections tab, which is the whole reason it was split out`)
}
ok(exists('app/api/me/inspections/route.ts'), 'Field Mode has a feed of what it can mark ready')
const feed = code('app/api/me/inspections/route.ts')
ok(/requirePermission\([^)]*['"]mark-ready['"]/.test(feed),
  "...gated on mark-ready, not on inspections - it carries nothing an office tab would")
// The screen and the 7:30am email must fire on one rule, or a row looks calm
// here while the reminder goes out about it.
ok(feed.includes('inspectionCountdown'),
  '...and its urgency comes from the same rule the reminder email fires on')

const card = code('app/field/ready-card.tsx')
ok(/ready_marked_by/.test(card) && /PATCH/.test(card),
  'THE CONTROL EXISTS: the card writes the two columns the permission names')
ok(read('app/field/page.tsx').includes('<ReadyCard'),
  '...and it is on Field Home, where the reminder email sends people')
// Loading, failed and empty are three different facts, and here "empty" is the
// HAPPY one - so defaulting to it states good news that has not been checked.
ok(/'loading'\s*\|\s*'ready'\s*\|\s*'failed'/.test(card),
  "...and it does not say \"nothing to mark ready\" until it has been told so")

// ── a worker in the office app is not stranded ──────────────────────────────
// "Dashboard" would bounce them to /field - a control leading somewhere other
// than the thing it names, and their only route home.
ok(isFieldRole('worker') && isFieldRole('member') && !isFieldRole('admin'),
  'isFieldRole answers for the two roles Field Mode is for')
ok(FIELD_HOME.href === '/field' && FIELD_HOME.label === 'Field Mode',
  'FIELD_HOME is the one home for where a worker\'s nav points')
for (const nav of ['components/layout/sidebar.tsx', 'components/layout/mobile-tab-bar.tsx']) {
  const src = code(nav)
  // THE CALL, not the import. The first version of this asserted
  // `src.includes('isFieldRole')`, which matches the import line - so gutting
  // the branch at its one call site left this suite green. Same vacuous shape
  // as a gate check that matched `import { isSuperAdmin }`.
  ok(/isFieldRole\(\s*role\s*\)/.test(src),
    `${nav.split('/').pop()}: asks isFieldRole(role) where the nav is built`)
  ok(/FIELD_HOME\.href/.test(src) && /FIELD_HOME\.label/.test(src),
    `...and points that entry at FIELD_HOME rather than a second spelling of /field`)
  ok(/href\s*!==\s*'\/dashboard'/.test(src),
    `...and drops the /dashboard entry that would have bounced them`)
  // The way home must not be permission-gated. Field Mode is the worker's own
  // shell - /field/layout.tsx asks for the ROLE and no permission - so a
  // company unticking Dashboard for Worker must not delete their only route
  // out of the office app. The entry is prepended AFTER the can() filter.
  const filterLine = src.split('\n').findIndex(l => /\.filter\(\s*(item|t)\s*=>/.test(l) && l.includes('can('))
  const fieldLine = src.split('\n').findIndex(l => l.includes('FIELD_HOME.href'))
  ok(filterLine >= 0 && fieldLine > filterLine,
    `...and that entry is added after the permission filter, so it is never gated away`)
}

done()
