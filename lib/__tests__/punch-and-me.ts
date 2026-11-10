// Two asks from one message about Tasks:
//   "by tasks can i assign them to myself? why am i not on the crew of the
//    job if i created it" - nothing put a job's creator on its crew, and the
//    assignee picker only offers the crew.
//   "an easy way to add punch list items, like open a box and every line is a
//    punch list item" - ticking Punch on a new task turns the name into a box.

import { punchLines, MAX_PUNCH_LINES } from '../punch-lines'
import { jobRoleFor } from '../crew-self'
import { ok, done, code } from './_helpers'

// ── the box ──────────────────────────────────────────────────────────────────
const box = [
  'Touch up paint in the hallway',
  '',
  '- Replace cracked outlet cover - kitchen',
  '• Caulk master tub',
  '3. Adjust closet door',
  '[ ] Clean windows',
  '[x] Grout line, guest bath',
  '   ',
  'Touch up paint in the hallway',
].join('\n')
const got = punchLines(box)
ok(got.length === 7, `every non-blank line is an item (${got.length})`)
ok(got[1] === 'Replace cracked outlet cover - kitchen', 'a leading dash comes off, a dash INSIDE the item stays')
ok(got[2] === 'Caulk master tub' && got[3] === 'Adjust closet door' && got[4] === 'Clean windows' && got[5] === 'Grout line, guest bath',
  'pasted bullets, numbers and checkboxes come off')
ok(got[0] === got[6], 'a repeated line is KEPT - it is usually two rooms')
ok(punchLines('a\r\nb').length === 2, 'Windows line endings split too')
ok(punchLines('\n\n').length === 0, 'an empty box is no items, not one blank one')
ok(punchLines('2x4 blocking in garage')[0] === '2x4 blocking in garage', 'a line that merely STARTS with a number is not a list marker')
ok(MAX_PUNCH_LINES >= 50, 'the cap is room for a real walk-through')

// ── the role a creator gets on the crew ──────────────────────────────────────
ok(jobRoleFor('admin') === 'Project Manager', 'an admin goes on as Project Manager')
ok(jobRoleFor('field_supervisor') === 'Superintendent', 'a field supervisor as Superintendent')
ok(jobRoleFor(undefined) === 'Other', 'an unknown role is Other, never a guess with authority in it')

// ── the doors ────────────────────────────────────────────────────────────────
const project = code('lib/writes/project.ts')
ok(/ensureOnCrew\(admin, project\.id, userId\)/.test(project), 'creating a job puts its creator on the crew')
ok(code('app/api/projects/route.ts').includes('userId: user.id'), '...and the Projects screen says who that is')
ok(code('lib/mcp/areas/customers-projects.ts').includes('userId: actor.userId'), '...and so does Claude\'s create_project')
ok(code('app/api/projects/[id]/children/new/route.ts').includes('ensureOnCrew(db, project.id, gate.actor.userId)'),
  '...and adding a house to a development')

const me = code('app/api/projects/[id]/team/me/route.ts')
ok(/requirePermission\(db, request, 'team', 'edit'\)/.test(me) && me.includes('ownedProject('),
  '"Me" asks the same two questions as adding anybody to the team')
ok(me.indexOf('ownedProject(') < me.indexOf('ensureOnCrew('), '...BEFORE writing anything')

const crew = code('lib/crew-self.ts')
ok(!/\.eq\('name'/.test(crew), 'never finds "me" on the crew by name')
ok(crew.indexOf("eq('profile_id', userId)") < crew.indexOf('.insert('), 'finds an existing row before adding one')

const tasks = code('app/api/projects/[id]/tasks/route.ts')
ok(/m\.profile_id === user\.id/.test(tasks), 'the board is told which crew row is the person asking')
ok(/profile_id: _p/.test(tasks), '...and the profile ids themselves are not handed to the page')

const page = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
ok(page.includes('const bulk = !editTask && isPunch'), 'only a NEW punch item becomes a box - editing one stays one item')
ok(/for \(const line of lines\)/.test(page) && page.includes('failed.push(line)'),
  'every line gets its own answer; one failure does not abandon the rest')
ok(page.includes("setTitle(failed.join('\\n'))"), 'what did not land stays in the box')
ok(page.includes('onClick={assignMe}'), 'the picker has a Me button')

done()
