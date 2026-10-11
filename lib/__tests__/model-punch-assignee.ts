// "punch items are tasks - cool but who does it get assigned to? after
// entering the lines, can it show an option to assign and select from a
// dropdown a user, sub or anyone wanted?"

import {
  modelAssigneeProblem, modelAssigneeRow, pickerValue, parsePickerValue, taskAssigneeFor, punchNotice, hasModelAssignee,
} from '../model-assignee'
import { ok, done, code } from './_helpers'

// ── the three kinds, and nobody ─────────────────────────────────────────────
ok(modelAssigneeProblem({ kind: 'none' }) === null, 'nobody is an answer - it takes the assignee off')
ok(modelAssigneeProblem({ kind: 'teammate', id: 'p1' }) === null && modelAssigneeProblem({ kind: 'company', id: 'c1' }) === null,
  'a teammate or a sub is picked by id')
ok(modelAssigneeProblem({ kind: 'teammate', id: '' }) !== null && modelAssigneeProblem({ kind: 'name', name: '  ' }) !== null,
  'an empty pick or a blank name is refused, with a reason')
ok(modelAssigneeProblem({ kind: 'admin', id: 'x' }) !== null && modelAssigneeProblem(null) !== null, '...and so is anything else')

const t = modelAssigneeRow({ kind: 'teammate', id: 'p1' }, 'Ana Ruiz')
ok(t.assignee_profile_id === 'p1' && t.assignee_company_id === null && t.assignee_name === 'Ana Ruiz',
  'ONE id at a time, with the name beside it so a removed account still reads as who it was')
const cleared = modelAssigneeRow({ kind: 'none' })
ok(!hasModelAssignee(cleared) && cleared.assignee_profile_id === null && cleared.assignee_name === null,
  '"Nobody yet" clears all three columns, not just the one that was set')
ok(modelAssigneeRow({ kind: 'teammate', id: 'p1' }).assignee_company_id === null, 'switching from a sub to a teammate drops the sub')

// ── the dropdown value round-trips ──────────────────────────────────────────
for (const v of ['p:abc', 'c:def', '']) ok(pickerValue(modelAssigneeRow(parsePickerValue(v), 'x')) === v, `the dropdown reads back what was picked (${v || 'nobody'})`)
ok(pickerValue({ assignee_name: 'Touch-up crew' }) === 'n', 'a typed name reads back as a typed name')
ok(pickerValue({ assignee_profile_id: null, assignee_name: 'Ana Ruiz' }) === 'n', '...and so does a teammate whose account has gone - still true')

// ── onto one house ──────────────────────────────────────────────────────────
const roster = [{ id: 'm1', profile_id: 'p1' }, { id: 'm2', profile_id: null }]
const onRoster = taskAssigneeFor({ assignee_profile_id: 'p1', assignee_name: 'Ana' }, roster)
ok(!!onRoster && 'assignee' in onRoster && onRoster.assignee.member_id === 'm1',
  'a teammate becomes THAT HOUSE\'s roster row - the id a task assignee and My Jobs read')
const notOn = taskAssigneeFor({ assignee_profile_id: 'p9', assignee_name: 'Bo' }, roster)
ok(!!notOn && 'addMember' in notOn && notOn.addMember === 'p9', '...and a house with no row for them asks for one rather than guessing')
const sub = taskAssigneeFor({ assignee_company_id: 'c1', assignee_name: 'QA Concrete' }, roster)
ok(!!sub && 'assignee' in sub && sub.assignee.company_id === 'c1' && !sub.assignee.member_id, 'a sub goes on as the company')
const typed = taskAssigneeFor({ assignee_name: ' Touch-up crew ' }, roster)
ok(!!typed && 'assignee' in typed && typed.assignee.name === 'Touch-up crew' && !typed.assignee.member_id && !typed.assignee.company_id,
  'a typed name goes on as a name')
ok(taskAssigneeFor({}, roster) === null, 'nobody stays nobody - Unassigned, as before')

// ── told once, where they can open it ───────────────────────────────────────
const many = punchNotice({ count: 9, houses: [{ id: 'h1', name: '12 Oak' }, { id: 'h2', name: '14 Oak' }, { id: 'h3', name: '16 Oak' }], siteId: 's1', siteName: 'Oak Ridge', sub: false })
ok(many.message === 'You have 9 punch items across 3 houses in Oak Ridge' && many.link === '/projects/s1/units',
  'ONE notification for the whole apply, counting items and houses')
ok(punchNotice({ count: 1, houses: [{ id: 'h1', name: '12 Oak' }], siteId: 's1', siteName: null, sub: true }).link === '/my-jobs/h1',
  'a sub is sent to My Jobs - they cannot open the GC\'s development page')
ok(punchNotice({ count: 2, houses: [{ id: 'h1', name: '12 Oak' }, { id: 'h2', name: '14 Oak' }], siteId: 's1', siteName: null, sub: true }).link === '/my-jobs',
  '...on any number of houses')

// ── the doors ───────────────────────────────────────────────────────────────
const apply = code('app/api/projects/[id]/models/[modelId]/apply/route.ts')
ok(/project_task_assignees/.test(apply) && /select\('id, source_model_item_id'\)/.test(apply),
  'THE ASK: applying puts the assignee on every punch task it makes')
ok(/for \(const \[userId, t\] of Array\.from\(told\.entries\(\)\)\)/.test(apply) && (apply.match(/await notify\(/g) ?? []).length === 1,
  '...and notifies per PERSON after the loop, never per task inside it')
ok(/subsHere\.has\(c\)/.test(apply), '...telling a sub only about houses they hold a contract on')
ok(/ctx\.mayStaff/.test(apply) && /actorCan\(gate\.actor, 'team', 'edit'\)/.test(apply),
  '...and putting a teammate on a house\'s team only for somebody who may staff it')
ok(/const tell = \(userId: string, sub: boolean\) => \{ pending\.push\(\[userId, sub\]\) \}/.test(apply) &&
  (apply.match(/\bcount\(/g) ?? []).length === 1 &&
  /for \(const \[u, sub\] of pending\) count\(u, sub\)/.test(apply) && apply.indexOf('for (const [u, sub] of pending)') > apply.indexOf("from('project_task_assignees').insert"),
  '...counting nobody as told until their assignment is actually saved')
const items = code('app/api/projects/[id]/models/[modelId]/items/route.ts')
ok(/export async function PATCH/.test(items) && /modelAssigneeProblem/.test(items) && /assignablePeople/.test(items),
  'the route checks the pick against the SAME list the dropdown was built from - an id from a body proves nothing')
ok(/\.eq\('kind', 'punch'\)/.test(items), '...and only a punch item takes an assignee')
const read = code('lib/site-models-read.ts') + code('app/api/projects/[id]/models/route.ts')
ok((read.match(/assignee_profile_id, assignee_company_id, assignee_name/g) ?? []).length >= 2,
  'both reads of a model carry the assignee - the editor and the apply')
const panel = code('components/projects/site-models-panel.tsx')
ok(/<PunchAssignee/.test(panel) && /Type a name…/.test(panel) && /Teammate/.test(panel) && /Sub\$\{/.test(panel),
  'the editor shows a dropdown beside each punch item: a teammate, a sub, or any name')
ok(/people === null/.test(panel), '...and says so when the list could not be read, rather than offering nobody')
ok(/^function PunchAssignee/m.test(panel),
  'the dropdown is a component of its own, not declared inside the editor')
const mig = code('supabase/migrations/136_model_punch_assignee.sql')
ok(/assignee_profile_id uuid REFERENCES profiles \(id\) ON DELETE SET NULL/.test(mig) && /assignee_company_id uuid REFERENCES companies \(id\) ON DELETE SET NULL/.test(mig),
  'the migration decides ON DELETE for both keys')

done()
