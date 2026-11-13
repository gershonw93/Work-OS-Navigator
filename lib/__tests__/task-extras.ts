// LABELS AND SUBTASKS ON THE SHARED TASKS (lib/task-extras.ts, migration 167).
//
// Two things here can go wrong quietly. A label list that does not steer
// people onto it fills a shared board with "Framing", "framing crew" and
// "framers" - three filters for one trade. And a subtask's "who ticked it,
// when" is only worth printing if a request cannot write it. Both are tested
// by calling the rules; the wiring is read off the write lib and the screen.

import {
  cleanTaskLabels, newlyDone, openTaskSubtasks, presetLabel, stampSubtasks, subtaskCount, suggestLabels,
  taskCalendarEntries, taskIsOverdue, taskMatches, TASK_LABEL_PRESETS, type TaskSubtask,
} from '../task-extras'
import { ok, done, code, read } from './_helpers'

// ── The list, and being steered onto it ──────────────────────────────────────
ok(TASK_LABEL_PRESETS.length >= 60, `the label list is a large one (${TASK_LABEL_PRESETS.length})`)
ok(new Set(TASK_LABEL_PRESETS.map(l => l.name.toLowerCase())).size === TASK_LABEL_PRESETS.length, 'no label is on the list twice')
ok(presetLabel('  drywall ')?.name === 'Drywall' && presetLabel('sheetrock') === null, 'an exact name is the preset, any case; another word for it is not')
const names = (q: string, taken: string[] = []) => suggestLabels(q, taken).map(l => l.name)
ok(names('sheetrock')[0] === 'Drywall', 'typing "sheetrock" is answered with Drywall')
ok(names('framing crew')[0] === 'Framing', '"framing crew" is answered with Framing')
ok(names('plumbng').includes('Plumbing'), 'a misspelling finds the label it meant')
ok(names('elec')[0] === 'Electrical', 'the start of a name finds it')
ok(names('homeowner')[0] === 'Client' && names('city')[0] === 'Township', 'the word a GC actually says finds the label it is filed under')
ok(names('').length === 0, 'nothing typed suggests nothing')
ok(!names('drywall', ['Drywall']).includes('Drywall'), 'a label the task already has is not offered again')
ok(names('zzzzqq').length === 0, 'a word nothing resembles gets no suggestion, so the picker can only offer it as typed')
ok(suggestLabels('e', [], 6).length <= 6, 'the suggestions are a short list')

const kept = cleanTaskLabels([{ name: 'drywall' }, { name: 'Drywall', tone: 'danger' }, { name: 'Lot 14 only', tone: 'chartreuse' }, { name: '  ' }, 'Permit'])
ok(kept.length === 3 && kept[0].name === 'Drywall' && kept[0].tone === 'info', 'a preset is stored under the list\'s spelling and colour, once')
ok(kept[1].name === 'Lot 14 only' && kept[1].tone === 'neutral', 'a label of somebody\'s own is kept, in grey')
ok(kept[2].name === 'Permit' && kept[2].tone === 'special', 'a bare string works too')
ok(cleanTaskLabels(Array.from({ length: 20 }, (_, i) => ({ name: `L${i}` }))).length === 8 && cleanTaskLabels('x').length === 0, 'eight at most, and a non-list is no labels')

// ── Who ticked it, and when, is derived ──────────────────────────────────────
const NOW = '2026-11-13T15:00:00.000Z'
const M = '11111111-1111-4111-8111-111111111111'
const held: TaskSubtask[] = [
  { id: 'a', text: 'Order tile', done: true, done_at: '2026-11-01T10:00:00.000Z', done_by_name: 'Dana' },
  { id: 'b', text: 'Set tile', done: false },
]
const sent = [
  { id: 'a', text: 'Order tile', done: true, done_at: '1999-01-01T00:00:00Z', done_by_name: 'Somebody Else' },
  { id: 'b', text: ' Set tile ', done: true, due: '2026-11-20', note: ' thinset first ', assignee_member_id: M, assignee_name: 'Lee', done_by_name: 'Forged' },
  { id: 'c', text: 'Grout', done: false, due: 'next week', assignee_name: 'Nobody' },
  { text: '   ' },
]
const next = stampSubtasks(sent, held, 'Robin', NOW)
ok(next.length === 3, 'a blank subtask is dropped')
ok(next[0].done_by_name === 'Dana' && next[0].done_at === '2026-11-01T10:00:00.000Z', 'a subtask already done keeps its stamp - a request cannot rewrite who did it')
ok(next[1].done_by_name === 'Robin' && next[1].done_at === NOW, 'one ticked NOW is stamped with the actor and the time, whatever the request claimed')
ok(next[1].text === 'Set tile' && next[1].note === 'thinset first' && next[1].due === '2026-11-20' && next[1].assignee_member_id === M && next[1].assignee_name === 'Lee',
  'its text, note, date and person are kept, trimmed')
ok(next[2].due === null && next[2].assignee_name === null && next[2].done_at === null, 'a date that is not one is dropped, and a name with nobody behind it is not an assignee')
const unticked = stampSubtasks([{ id: 'a', text: 'Order tile', done: false, done_by_name: 'Dana', done_at: NOW }], held, 'Robin', NOW)
ok(unticked[0].done_at === null && unticked[0].done_by_name === null, 'unticking clears the stamp')
ok(newlyDone(held, next).join() === 'Set tile', 'only the subtask that just went done is reported as finished')
ok(stampSubtasks('nope', held, 'Robin', NOW).length === 0, 'a non-list is no subtasks')

// ── Late, the count, the calendar, search ────────────────────────────────────
const TODAY = '2026-11-13'
const task = (over: Record<string, unknown>) => ({ id: 't', title: 'Bathroom', status: 'open', due_date: null as string | null, subtasks: [] as TaskSubtask[], ...over })
const late = task({ due_date: '2026-11-30', subtasks: [{ id: 'x', text: 'Rough in', done: false, due: '2026-11-10' }, { id: 'y', text: 'Trim out', done: false, due: '2026-11-25' }] })
ok(taskIsOverdue(late, TODAY), 'a task due later with a subtask past its date is overdue')
ok(!taskIsOverdue({ ...late, status: 'completed' }, TODAY), 'a completed task is never overdue, whatever is left unticked')
ok(!taskIsOverdue(task({ due_date: TODAY }), TODAY) && taskIsOverdue(task({ due_date: '2026-11-12' }), TODAY), 'due today is not late; due yesterday is')
ok(openTaskSubtasks(late).map(s => s.id).join() === 'x,y' && openTaskSubtasks({ ...late, status: 'completed' }).length === 0, 'open subtasks are soonest first, and a completed task has none')
ok(subtaskCount(late)?.total === 2 && subtaskCount(task({})) === null, 'the count is of the task\'s own subtasks, and none is no count')
ok(taskCalendarEntries([late]).map(e => `${e.date}:${e.subtask?.id ?? 'task'}`).join() === '2026-11-30:task,2026-11-10:x,2026-11-25:y',
  'the calendar carries the task on its date and each open dated subtask on its own')
const searchable = { title: 'Bathroom', description: 'second floor', labels: [{ name: 'Tile', tone: 'info' as const }], subtasks: [{ id: 'x', text: 'Rough in', done: false, assignee_name: 'Lee' }], assignees: [{ name: 'Dana' }] }
ok(taskMatches(searchable, 'ROUGH', '') && taskMatches(searchable, 'lee', '') && taskMatches(searchable, 'dana', '') && taskMatches(searchable, 'floor', ''),
  'search reads the subtasks, who they are given to, the assignees and the description')
ok(taskMatches(searchable, '', 'tile') && !taskMatches(searchable, '', 'Permit') && !taskMatches(searchable, 'kitchen', ''), 'the label filter is exact, and a miss is a miss')

// ── The doors ────────────────────────────────────────────────────────────────
const writes = code('lib/writes/task.ts')
ok(/labels: cleanTaskLabels\(body\?\.labels\)/.test(writes) && /updates\.labels = cleanTaskLabels\(body\.labels\)/.test(writes), 'labels are cleaned on create AND on edit')
ok((writes.match(/stampSubtasks\(/g) ?? []).length === 2 && /stampSubtasks\(body\.subtasks, \(prev as any\)\?\.subtasks, actorName,/.test(writes),
  'subtasks are stamped on both doors, the edit against what the task holds now')
ok(/description, subtasks'/.test(writes), '...which needs subtasks on the previous-state read')
ok(!/changes\.push\([^)]*subtask/i.test(writes), 'a ticked subtask is logged but is not a "task updated" notification every time')

const page = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
ok(/const dragTask = useRef<string \| null>\(null\)/.test(page) && !/setDrag|useState[^\n]*drag/i.test(page), 'the drag is a ref, not state - a setState on drag start remounts the card being dragged')
ok(/labels: formLabels, subtasks: formSubtasks,/.test(page), 'the form sends labels and subtasks with its one save')
ok(/<LabelPicker value=\{formLabels\}/.test(page) && /<SubtaskEditor value=\{formSubtasks\}/.test(page), 'the form has the label picker and the subtask editor')
ok(/\['board', 'Board'\], \['list', 'Table'\], \['assignee', 'By assignee'\], \['calendar', 'Calendar'\]/.test(page), 'four views: Board, Table, By assignee and Calendar')
ok(/const STATUSES = \[\s*\{ value: 'open'/.test(page) && (page.match(/\{ value: '(?:open|in_progress|completed)',/g) ?? []).length === 3, 'the stages are still exactly Open, In Progress and Completed')
const ui = code('components/tasks/task-extras-ui.tsx')
ok(/'Closest on the list:'/.test(ui) && /as it is/.test(ui), 'a word that is not on the list is shown the closest labels, and may still be used as typed')
ok(/onChange=\{\(\) => onToggle\?\.\(item\.id\)\}/.test(ui), 'a listed subtask is ticked where it is listed')

const sql = read('supabase/migrations/167_task_labels_subtasks.sql')
ok((sql.match(/ADD COLUMN IF NOT EXISTS (?:labels|subtasks) jsonb NOT NULL DEFAULT '\[\]'::jsonb/g) ?? []).length === 2, 'both columns are additive with a default, so the code before them still works')
done()
