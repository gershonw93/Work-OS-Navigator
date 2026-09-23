/**
 * MORE THAN ONE PERSON ON A TASK, AND A RECORD OF WHO FINISHED IT.
 *
 * Asked for together, and they are one subject: the moment a task can carry
 * three people, "completed" stops meaning "the assignee did it" and starts
 * needing a name against it.
 *
 * A task used to hold ONE assignee across three columns on `project_tasks` -
 * `assigned_to_member_id` (somebody on the roster), `assigned_to_company_id`
 * (a whole sub) and `assigned_to_name` (a bare name, which was 104 of the 134
 * live tasks, so the common case rather than an edge).
 * `project_task_assignees` is the home now.
 *
 * THE REGRESSION THIS EXISTS TO CATCH is not the picker - it is every "my
 * tasks" surface. My Jobs, the dashboard count, the field list and the
 * project board each filtered `project_tasks` on ONE of those three columns.
 * The moment the form stopped writing them, a task assigned to two people
 * would have belonged to nobody, on four screens at once, with nothing on any
 * of them saying so.
 */
import { ok, done, code, read } from './_helpers'
import {
  assigneeLabel, assigneeName, assigneeNames, isAssignedTo,
  normalizeAssignees, completedByLabel, type TaskAssignee,
} from '../task-assignees'

console.log('\n\x1b[1mtask-assignees\x1b[0m')

function m(id: string, name: string): TaskAssignee {
  return { member_id: id, company_id: null, name }
}
function co(id: string, name: string): TaskAssignee {
  return { member_id: null, company_id: id, name }
}
function nameOnly(name: string): TaskAssignee {
  return { member_id: null, company_id: null, name }
}

// ── the label ───────────────────────────────────────────────────────────────
{
  ok(assigneeLabel([]) === 'Unassigned', 'nobody on it says so')
  ok(assigneeLabel(null) === 'Unassigned', '...and so does a missing list')
  ok(assigneeLabel([m('1', 'Mike Torres')]) === 'Mike Torres', 'one person is just their name')
  ok(assigneeLabel([m('1', 'Mike'), m('2', 'Dana')]) === 'Mike +1',
    'THE CARD HAS ONE LINE: beyond the first it counts, rather than handing five names the whole row')
  ok(assigneeLabel([m('1', 'Mike'), m('2', 'Dana')], 2) === 'Mike, Dana',
    '...and a panel with room asks for more')
  ok(assigneeNames([m('1', 'Mike'), co('c', 'QA Tile')]).join('|') === 'Mike|QA Tile',
    'the full list is available where it fits')
  ok(assigneeName({ member_id: 'x', name: null }) === 'Unnamed',
    'an assignee with no name is still an assignee - it never renders blank')
}

// ── normalise: what actually gets written ───────────────────────────────────
{
  const out = normalizeAssignees([m('1', 'Mike'), m('1', 'Mike Torres')])
  ok(out.length === 1,
    'THE UNIQUE INDEX: the same member twice is one row, not a write the database refuses')

  ok(normalizeAssignees([nameOnly('Mike'), nameOnly(' mike ')]).length === 1,
    'a name typed twice, differently spaced and cased, is one person')
  ok(normalizeAssignees([co('c1', 'A'), co('c1', 'A')]).length === 1, 'and the same company twice is one')
  ok(normalizeAssignees([m('1', 'Mike'), nameOnly('Mike')]).length === 2,
    'a roster member and a bare name are NOT merged - only the id knows they are the same person, and guessing would drop somebody')

  ok(normalizeAssignees([{ member_id: null, company_id: null, name: '  ' }]).length === 0,
    'a blank entry is DROPPED, never written as a row that renders "Unnamed" for ever')
  ok(normalizeAssignees(null).length === 0, 'a missing list normalises to nothing')
}

// ── is it mine ──────────────────────────────────────────────────────────────
{
  const list = [m('mem-1', 'Mike'), co('co-9', 'QA Tile'), nameOnly('Dana Reed')]
  ok(isAssignedTo(list, { memberIds: ['mem-1'] }) === true, 'my roster row counts')
  ok(isAssignedTo(list, { companyId: 'co-9' }) === true, 'my company counts')
  ok(isAssignedTo(list, { name: 'dana reed' }) === true, 'my typed name counts, folded')
  ok(isAssignedTo(list, { name: '  Dana   Reed ' }) === true, '...and whitespace-collapsed')
  ok(isAssignedTo(list, { memberIds: ['other'], companyId: 'other', name: 'Nobody' }) === false,
    "somebody else's task is not mine")

  // A NAME IS NOT A KEY, so the match is exact or it is nothing.
  ok(isAssignedTo([nameOnly('Mike Torres')], { name: 'Mike' }) === false,
    "THE PARTIAL MATCH: Mike does not claim Mike Torres - a list quietly holding another person's work is worse than one missing your own")
  ok(isAssignedTo([], { memberIds: ['mem-1'] }) === false, "an unassigned task is nobody's")
}

// ── who finished it ─────────────────────────────────────────────────────────
{
  ok(completedByLabel({ status: 'open' }) === null, 'an open task has no finisher')
  ok(completedByLabel({ status: 'completed', completed_by_name: 'Dana Reed' }) === 'Completed by Dana Reed',
    'THE SECOND ASK: a finished task names who finished it')
  ok(completedByLabel({ status: 'completed', completed_by_name: null }) === null,
    'EVERY TASK FINISHED BEFORE THE MIGRATION is in this case, and it says NOTHING rather than "completed by somebody" - an invented name is a claim')
  ok(completedByLabel({ status: 'completed', completed_by_name: '   ' }) === null, 'blank is not a name')
}

// ── the routes ──────────────────────────────────────────────────────────────
{
  const patch = code('app/api/projects/[id]/tasks/[taskId]/route.ts')
  ok(/updates\.completed_by = body\.status === 'completed' \? user\.id : null/.test(patch),
    'the finisher is the ACTOR, never taken from the body - a client that could name them could credit somebody who was not there')
  ok(/updates\.completed_by = [^\n]*: null/.test(patch),
    '...and is CLEARED when a task is re-opened, or the name outlives the work being done')
  ok(/delete\(\)\.eq\('task_id', params\.taskId\)/.test(patch) && /insert\(wanted\.map/.test(patch),
    'a save REPLACES the assignee rows - delete then insert, because the unique indexes refuse an overlapping insert')
  ok(/body\.assignees !== undefined/.test(patch),
    'and an EMPTY array is a real answer - it is how a task gets unassigned, so it must not read as "not mentioned"')

  const post = code('app/api/projects/[id]/tasks/route.ts')
  ok(/assigneesByTask/.test(post), 'the board is served the assignees')
  ok(/recipientIds/.test(post) && /new Set<string>\(\)/.test(post),
    'EVERYONE on a new task is told, ONCE each - somebody on the roster AND at the assigned sub is one person, not two emails')
}

// ── THE FOUR SCREENS THAT ASK "IS THIS MINE" ───────────────────────────────
{
  // Each of these filtered on one of the single-assignee columns. Every one
  // of them had to move, or a task with two people on it belongs to nobody.
  for (const f of [
    'app/api/me/tasks/route.ts',
    'app/api/dashboard/stats/route.ts',
    'app/api/my-jobs/[projectId]/route.ts',
    'app/api/projects/[id]/tasks/route.ts',
  ]) {
    ok(/taskIdsFor\(/.test(code(f)),
      `${f.split('/').slice(-2).join('/')} finds my tasks through the join table`)
  }

  const me = code('app/api/me/tasks/route.ts')
  ok(/mineIds === null/.test(me),
    'A FAILED LOOKUP IS NOT AN EMPTY ONE: null is reported rather than rendered as "you have no tasks"')
}

// ── the migration ───────────────────────────────────────────────────────────
{
  const sql = read('supabase/migrations/116_task_assignees_and_completed_by.sql')
  ok(/CREATE TABLE IF NOT EXISTS project_task_assignees/.test(sql), 'the join table is created')
  ok(/task_id UUID NOT NULL REFERENCES project_tasks \(id\) ON DELETE CASCADE/.test(sql),
    'an assignment is a fact about its task and goes with it')
  ok(/member_id UUID REFERENCES project_team_members \(id\) ON DELETE SET NULL/.test(sql),
    'but the RECORD outlives the person leaving the roster - which is exactly when somebody asks who was on it')
  ok(/name TEXT/.test(sql), '...which is why the name is kept beside the id')
  ok(/INSERT INTO project_task_assignees/.test(sql) && /NOT EXISTS/.test(sql),
    'existing assignments are backfilled, idempotently - nothing assigned today becomes unassigned')
  ok(/completed_by UUID REFERENCES profiles \(id\) ON DELETE SET NULL/.test(sql),
    'and the finisher is recorded, surviving the account being deleted')
  ok(/uniq_task_assignee_member/.test(sql) && /uniq_task_assignee_name/.test(sql),
    'the same person cannot be added twice')
}

done()
