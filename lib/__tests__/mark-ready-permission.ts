// Who may say the work is finished, and can they take it back.
//
// Off one screenshot: "should the office be able to mark ready?" and "can it be
// undone?". The answers were "anyone at all" and "no".
//
// ANYONE AT ALL, because the inspections PATCH route gated NOTHING -
// `requirePermission` was on DELETE and restore only - so whoever could reach
// the API could mark ready, change a booking or set a status whatever their
// role said.
//
// AND NO WAY BACK: `ready_marked_by` and `ready_marked_at` were on the route's
// whitelist the whole time and nothing in the app ever sent a null, so a wrong
// press was permanent. The office had pressed it.

import { RESOURCES, ROLE_DEFAULTS, getRoleDefaults, can } from '../permissions'
import { ok, done, code } from './_helpers'

// ── it is a row in the matrix, not an opinion in the code ───────────────────
const res = RESOURCES.find(r => r.key === 'mark-ready')
ok(!!res, 'THE SETTING: marking ready is its own resource, so a company can grant or take it away')
ok(res?.group === 'Field', '...in Field, where the people who press it live')
ok(!res?.slug, '...and with no slug, because there is no screen behind it - only a button')

// ── every built-in role answers explicitly ──────────────────────────────────
// A resource a role never names resolves to nothing, which is how a permission
// silently defaults to "no" for somebody who should have it.
for (const role of Object.keys(ROLE_DEFAULTS)) {
  ok('mark-ready' in getRoleDefaults(role), `${role} has an explicit mark-ready entry`)
}

// ── the split is the whole point ────────────────────────────────────────────
// Running inspections is office work. Saying the work is finished is a report
// from the site, and the people who can honestly make it all have inspections:N.
for (const role of ['field_supervisor', 'worker', 'member', 'read_only']) {
  const p = getRoleDefaults(role)
  ok(!can(p, 'inspections', 'edit'), `${role} still cannot run inspections`)
  ok(can(p, 'mark-ready', 'edit'),
    `THE SPLIT: ${role} CAN say the work is ready - it is their only voice, and a role's name is not an argument`)
}
for (const role of ['admin', 'manager', 'project_manager', 'office_staff']) {
  ok(can(getRoleDefaults(role), 'mark-ready', 'edit'),
    `${role} keeps it - a GC's own superintendent is "office" by role and is on the site`)
}

// ── and the route actually asks ─────────────────────────────────────────────
const patch = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')
ok(/const readyOnly = Object\.keys\(updates\)\.every\(/.test(patch),
  'the route tells a ready-only body from any other')
ok(/requirePermission\(db, request, readyOnly \? 'mark-ready' : 'inspections', 'edit'\)/.test(patch),
  'THE HOLE: PATCH is gated at all now, and on the right one of the two')
{
  // Before anything is written, not after.
  const gateAt = patch.indexOf('readyOnly ?')
  const writeAt = patch.indexOf('.update(updates)')
  ok(gateAt > -1 && writeAt > -1 && gateAt < writeAt, '...and before the update runs')
}

// ── the undo ────────────────────────────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
ok(/Not ready any more/.test(page), 'THE UNDO: there is a way to take it back')
ok(/setReady\(insp, null\)/.test(page), '...which nulls it rather than writing another name')
ok(/ready_marked_at: who \? new Date\(\)\.toISOString\(\) : null/.test(page),
  '...and clears the timestamp with it, so no row keeps a date for a claim nobody made')
ok(/insp\.ready_marked_by && !isVoid\(insp\.status\) && \(/.test(page),
  'and it only appears while there is something to undo')

// A RETRACTION IS AN EVENT. The history branch skips its generic entry whenever
// ready_marked_by is in play, and notify only fires when it is truthy - so
// without its own branch, taking a "ready" back left no trace anywhere.
ok(/no longer marked ready/.test(patch), 'Job History records the withdrawal, not just the claim')
{
  const retractAt = patch.indexOf("'ready_marked_by' in updates && !updates.ready_marked_by")
  ok(retractAt > -1, '...from a branch that fires on the null specifically')
}

done()
