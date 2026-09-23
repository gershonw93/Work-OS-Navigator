// Adding people to a job - from the team panel, and people not on SyteNav.
//
// ASKED FOR: "an add members button [in the team panel] and if someone's not
// on the platform you can add them as well". Both halves existed only on the
// Subs & Team page, as two modals behind two buttons. Now ONE dialog serves
// both doors, with a "Not on SyteNav" tab.
//
// FOUND ON THE WAY: POST /team and PATCH/DELETE /team/[memberId] asked
// nothing - any signed-in user from any company could add, edit or remove
// people on any job by its id. They now take team:edit AND ownership.

import { missingMember, missingMemberBody, JOB_ROLES } from '../team-member'
import { ok, done, code } from './_helpers'

// ── the one rule both doors ask ─────────────────────────────────────────────
const base = { mode: 'outside' as const, profileId: '', name: 'Mike Torres', role: 'Foreman', phone: '', email: '' }
ok(missingMember(base) === null, 'a name and a role is enough for somebody not on SyteNav')
ok(/name/i.test(missingMember({ ...base, name: '  ' }) ?? ''), 'a blank name is named as the problem')
ok(/role/i.test(missingMember({ ...base, role: '' }) ?? ''), 'no role is named as the problem - the select starts empty on purpose')
ok(/email/i.test(missingMember({ ...base, email: 'mike@' }) ?? ''), 'a half-typed email is caught, a blank one is fine')
ok(/pick who/i.test(missingMember({ ...base, mode: 'teammate' }) ?? ''), 'teammate mode needs somebody picked')
ok(missingMemberBody({ name: 'A', role: 'Foreman' }) === null && !!missingMemberBody({ name: 'A' }), 'the route asks the same questions')
ok(JOB_ROLES.includes('Foreman'), 'job roles have one home')

// ── the routes ask who, and whose job ───────────────────────────────────────
const post = code('app/api/projects/[id]/team/route.ts')
const postFn = post.slice(post.indexOf('export async function POST'))
ok(postFn.indexOf("requirePermission(db, request, 'team', 'edit')") > 0
  && postFn.indexOf('ownedProject(') > 0
  && postFn.indexOf('ownedProject(') < postFn.indexOf('.insert('),
  'POST /team takes team:edit and ownership before inserting')
ok(/missingMemberBody\(body\)/.test(postFn), '...and validates with the shared rule')
const one = code('app/api/projects/[id]/team/[memberId]/route.ts')
for (const verb of ['PATCH', 'DELETE']) {
  const fn = one.slice(one.indexOf(`export async function ${verb}`))
  const end = verb === 'PATCH' ? fn.indexOf('export async function DELETE') : fn.length
  const body = fn.slice(0, end)
  const write = verb === 'PATCH' ? body.indexOf('.update(') : body.indexOf('.delete()')
  ok(body.indexOf("requirePermission(db, request, 'team', 'edit')") > 0 && body.indexOf('ownedProject(') > 0
    && body.indexOf('ownedProject(') < write, `${verb} /team/[memberId] takes team:edit and ownership before writing`)
}

// ── the team panel ──────────────────────────────────────────────────────────
const panel = code('components/layout/team-quick-view.tsx')
ok(/<AddTeamMemberDialog/.test(panel), 'the team panel opens the add dialog')
ok(/const canAdd = can\('team', 'edit'\) && vc\.owns/.test(panel), '...only for somebody the route will accept')
ok(/totalCount === 0 && !canAdd/.test(panel), 'an empty job keeps the button for anyone who can add - that is when it is needed')
ok((panel.match(/My Team/g) ?? []).length === 1 && /^function TeamList\(/m.test(panel),
  'the list is written once and hoisted, not twice and not declared inside the component')

// ── one dialog, both kinds of person ────────────────────────────────────────
const dlg = code('components/projects/add-team-member-dialog.tsx')
ok(/'From your team'/.test(dlg) && /'Not on SyteNav'/.test(dlg), 'the dialog adds a teammate or somebody not on SyteNav')
ok(/missingMember\(/.test(dlg) && /disabled=\{saving\}/.test(dlg), 'Add fires and names what is missing - disabled only while saving')
ok(/data-overlay/.test(dlg) && /className="overlay /.test(dlg), 'it is an .overlay with data-overlay')

const page = code('app/(dashboard)/projects/[id]/team/page.tsx')
ok(/<AddTeamMemberDialog/.test(page) && !/Add Company Member/.test(page), 'Subs & Team uses the same dialog - the second modal is gone')
ok(/canAdd && \(/.test(page), '...and hides Add for somebody the route would refuse')
done()
