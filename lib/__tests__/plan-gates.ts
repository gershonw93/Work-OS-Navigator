// THE PLAN ROUTES AND THE GROUP ROLL-UP ASKED NOTHING BUT "ARE YOU SIGNED IN".
//
// Every route under plans/ checked only that a token resolved to a user, then
// acted with the service-role client - so any signed-in person, of any
// company, could upload into, rename or delete another company's drawings
// given the ids, and read a group's budget roll-up the same way. Deleting a
// plan also left its file in storage behind a URL signed for ten years.

import { ROLE_DEFAULTS } from '../permissions'
import { ok, done, code } from './_helpers'

const P = 'app/api/projects/[id]/plans/'
const gateOf = (src: string, fn: string): string | null => {
  const start = src.indexOf(`export async function ${fn}`)
  if (start < 0) return null
  const next = src.indexOf('export async function', start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}

const expect: [string, string, RegExp, boolean][] = [
  ['route.ts', 'GET', /requirePermission\(db, request, 'plans', 'view'\)/, false],
  ['route.ts', 'POST', /requirePermission\(db, request, 'plans', 'create'\)/, true],
  ['upload/route.ts', 'POST', /requirePermission\(admin, request, 'plans', 'create'\)/, true],
  ['upload-url/route.ts', 'POST', /requirePermission\(db, request, 'plans', 'create'\)/, true],
  ['[planId]/route.ts', 'PATCH', /requirePermission\(db, request, 'plans', 'edit'\)/, true],
  ['[planId]/route.ts', 'DELETE', /requirePermission\(db, request, 'plans', 'delete'\)/, true],
  ['folders/[folderId]/route.ts', 'DELETE', /requirePermission\(db, request, 'plans', 'delete'\)/, true],
]
for (const [file, fn, re, owned] of expect) {
  const body = gateOf(code(P + file), fn) ?? ''
  ok(re.test(body), `${file} ${fn} asks for the plans permission it acts under`)
  if (owned) ok(/ownedProject\(/.test(body), `${file} ${fn} also asks whether the job is the caller's - a sub's own admin holds plans:delete in THEIR company`)
}

const pins = code(P + '[planId]/pins/route.ts')
ok(/requirePermission\(db, request, 'plans', 'view'\)/.test(pins) && /requirePermission\(db, request, 'tasks', task\)/.test(pins),
  'a pin asks for plans:view AND the task permission it really is')
ok(/gateFor\(db, request, 'edit'\)/.test(gateOf(pins, 'POST') ?? '') && /gateFor\(admin\(\), request, 'edit'\)/.test(gateOf(pins, 'DELETE') ?? ''),
  'dropping and removing a pin both ask tasks:edit')
ok(/\.eq\('project_id', params\.id\)/.test(gateOf(pins, 'DELETE') ?? ''), 'removing a pin is scoped to this job, not only to a plan id from the URL')
// The field crews pin drawings on site; the invited vendor only looks.
ok(!!ROLE_DEFAULTS.field_supervisor.tasks?.edit && !!ROLE_DEFAULTS.worker.tasks?.edit && !ROLE_DEFAULTS.read_only.tasks?.edit,
  'tasks:edit is held by the field crews and not by an invited vendor - the line the pin gate draws')
for (const role of Object.keys(ROLE_DEFAULTS)) {
  ok(!!ROLE_DEFAULTS[role].plans?.view, `${role} can still view plans - gating must not take drawings away from the site`)
}

const del = gateOf(code(P + '[planId]/route.ts'), 'DELETE') ?? ''
ok(/storage\.from\('plans'\)\.remove\(\[path\]\)/.test(del), 'deleting a plan removes its file, not only the row')
ok(del.indexOf(".delete()") < del.indexOf(".remove([path])"), '...AFTER the row, so a failed delete never strands a row pointing at nothing')

const children = code('app/api/projects/[id]/children/route.ts')
ok(/requirePermission\(db, request, 'projects', 'view'\)/.test(children) && /ownedProject\(/.test(children),
  'the group roll-up - every house\'s money - needs projects:view and the group to be the caller\'s')

const tasks = gateOf((code('app/api/projects/[id]/tasks/route.ts') + code('lib/writes/task.ts')), 'POST') ?? ''
ok(/jobGate\(db, request, params\.id, 'tasks', 'view', \{ write: true \}\)/.test(tasks),
  'creating a task needs at least tasks:view AND a place on this job (it asked the permission alone, so any account could add a task to any job)')
// `write: true` is what applies the read-only lock to a view-level gate - the
// lock this handler used to ask for by hand.

for (const f of ['route.ts', 'upload/route.ts', 'upload-url/route.ts', '[planId]/route.ts', 'folders/[folderId]/route.ts', '[planId]/pins/route.ts']) {
  ok(/requirePermission/.test(code(P + f)), `${f}: no plan route is left on "signed in" alone`)
}

// "upload file for bulk add doesn't load up the file": both new upload buttons
// opened a display:none input with ref.click(), which WebKit (the native
// shell) will not reliably do. Every other upload here is a label wrapping an
// sr-only input, so the tap reaches the input itself.
for (const f of ['components/projects/lot-list-builder.tsx', 'components/projects/site-models-panel.tsx']) {
  const src = code(f)
  ok(!/fileRef\.current\?\.click\(\)/.test(src), `${f}: no file picker opened by a programmatic click`)
  ok(/<label(?:(?!<\/label>)[\s\S])*<input ref=\{fileRef\} type="file"[^>]*className="sr-only"/.test(src), `${f}: the file input sits inside its label, sr-only`)
}

done()
