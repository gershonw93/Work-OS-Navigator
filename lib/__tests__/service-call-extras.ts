// LABELS AND STEPS ON A SERVICE CALL, AND THE CALL PAGE'S SHAPE (migration 171).
//
// A call got the two things a task has: labels, and a list of steps to tick
// off on site. The rule that matters is WHO MAY DO WHAT - the office writes
// the steps and tags the call, a tech only ticks - and that the tick's "who
// and when" is the server's. Tested by calling `pickExtras`; the screens are
// read for the things that were asked for by name.

import { gcView, pickExtras } from '../service-calls'
import type { TaskSubtask } from '../task-extras'
import { ok, done, code, read } from './_helpers'

const NOW = '2026-11-25T15:00:00.000Z'
const held: TaskSubtask[] = [
  { id: 'a', text: 'Check the panel', done: true, done_at: '2026-11-25T14:00:00.000Z', done_by_name: 'Ray' },
  { id: 'b', text: 'Test the GFCI', done: false },
]

// ── the office ───────────────────────────────────────────────────────────────
const office = pickExtras({
  labels: [{ name: 'electrical' }, { name: 'My own tag' }],
  steps: [
    { id: 'a', text: 'Check the panel', done: true, done_by_name: 'Forged', done_at: '1999-01-01T00:00:00Z' },
    { id: 'b', text: ' Test the GFCI ', done: true, due: '2026-12-01', note: 'x', assignee_name: 'Lee' },
    { id: 'c', text: 'Trace the circuit', done: false },
    { text: '  ' },
  ],
}, { steps: held }, { crew: false, name: 'Dana' }, NOW)
ok(office.labels?.map(l => `${l.name}:${l.tone}`).join() === 'Electrical:info,My own tag:neutral', 'the office tags a call; a label on the list takes the list\'s spelling and colour')
ok(office.steps?.length === 3, 'the office writes the steps, and a blank one is dropped')
ok(office.steps?.[0].done_by_name === 'Ray' && office.steps?.[0].done_at === '2026-11-25T14:00:00.000Z', 'a step already done keeps who did it - a request cannot rewrite that')
ok(office.steps?.[1].done_by_name === 'Dana' && office.steps?.[1].done_at === NOW, 'a step ticked now is stamped with the person saving and the time')
ok(Object.keys(office.steps?.[1] ?? {}).sort().join() === 'done,done_at,done_by_name,id,text', 'a step is text and a tick - no date, note or person of its own is stored')
ok(office.steps?.[2].done_at === null, 'an unticked step carries no stamp')

// ── a tech ───────────────────────────────────────────────────────────────────
const crew = pickExtras({
  labels: [{ name: 'Urgent' }],
  steps: [{ id: 'b', text: 'REWRITTEN', done: true }, { id: 'z', text: 'A step of my own', done: false }],
}, { steps: held }, { crew: true, name: 'Ray' }, NOW)
ok(crew.labels === undefined, 'a tech cannot tag a call')
ok(crew.steps?.length === 2 && crew.steps.map(x => x.id).join() === 'a,b', 'a tech cannot add or remove a step - the stored list is kept')
ok(crew.steps?.[1].text === 'Test the GFCI', '...nor reword one')
ok(crew.steps?.[1].done === true && crew.steps?.[1].done_by_name === 'Ray', '...but ticking one is theirs, and it is stamped')
ok(crew.steps?.[0].done === true, '...and a step the request did not mention stays as it was')
const untick = pickExtras({ steps: [{ id: 'a', done: false }] }, { steps: held }, { crew: true, name: 'Ray' }, NOW)
ok(untick.steps?.[0].done === false && untick.steps?.[0].done_at === null, 'unticking clears the stamp')
ok(Object.keys(pickExtras({ notes: 'x' }, { steps: held }, { crew: false, name: 'Dana' }, NOW)).length === 0, 'a body that names neither changes neither')

// ── nothing leaves the sub's company ─────────────────────────────────────────
const seen = gcView({
  id: 'c', call_number: 1, status: 'on_site', scheduled_start: null, scheduled_end: null, completed_at: null, updated_at: null,
  ...({ labels: [{ name: 'Warranty', tone: 'special' }], steps: held } as object),
} as any, 'Bright Wire')
ok(!('labels' in seen) && !('steps' in seen), 'a contractor reading a call tied to their job never sees its labels or steps')

// ── the doors ────────────────────────────────────────────────────────────────
const server = code('lib/service-calls-server.ts')
ok(/'created_by, created_at, updated_at, labels, steps'/.test(server), 'the columns are read')
const patch = code('app/api/service-calls/[callId]/route.ts')
ok(/pickExtras\(body, call, \{ crew: gate\.crew, name: editor \}/.test(patch), 'the edit route asks who is saving, from the gate, never the body')
ok(/keys\.some\(k => k !== 'notes'\)/.test(patch), '...and a tech is still refused every string field but notes')
ok(/pickExtras\(body, \{ steps: \[\] \}, \{ crew: false, name: takenBy \}/.test(code('app/api/service-calls/route.ts')), 'a new call can be born with labels and steps')

// ── the call page: what was asked for ────────────────────────────────────────
const page = code('components/service-calls/call-detail.tsx')
ok(/\{showHistory && <HistoryDrawer events=\{d\.events\}/.test(page) && /^function HistoryDrawer\(/m.test(page) && /overlay-drawer/.test(page.slice(page.indexOf('function HistoryDrawer('))),
  'HISTORY IS A SIDE PANEL THAT IS OPENED, not a card always on the page')
ok(!/<p className="text-sm font-semibold text-ink">History<\/p>/.test(page), '...and the old card is gone')
const header = page.slice(page.indexOf('<History className="h-4 w-4" /> History'), page.indexOf('<ProgressPath status='))
ok(/\{openPunch && \(\s*<Button variant="outline" onClick=\{\(\) => punch\('out'\)\}/.test(header), 'CLOCK OUT IS AT THE TOP while somebody is on the clock')
ok(/\{clockInIsNext && \(\s*<Button onClick=\{\(\) => punch\('in'\)\}/.test(header), '...and Clock in is there when it is the next step')
ok(/const clockInIsNext = !openPunch && c\.status === 'on_site' && c\.assigned_to === me/.test(page), '...which is: arrived, assigned to you, and not on the clock yet')
ok(/\{!openPunch && !clockInIsNext && \(/.test(page), 'the Time card offers Clock in only when the top does not - one place to clock in, always one')
ok((page.match(/punch\('out'\)/g) ?? []).length === 2, '...and Clock out is offered once on the page (the other is the step that carries it)')
ok(/async function saveAll\(\)/.test(page) && !/Save notes/.test(page) && !/saveAssignment/.test(page), 'ONE SAVE for the notes, the labels and who does it when')
ok(/\? \{ notes \}\s*: \{ notes, labels, assigned_to:/.test(page), '...and a tech\'s save sends only what a tech may change')
ok(/async function saveSteps\(next: TaskSubtask\[\]\)/.test(page) && /A tick saves straight away/.test(read('components/service-calls/call-detail.tsx')), 'a step ticks on its own, and the page says so')
ok(!/<select id="cd-crew"/.test(page) && /role="group" aria-label="Crew member"/.test(page), 'the crew member is picked from buttons, not a native dropdown')

// ── the board ────────────────────────────────────────────────────────────────
const list = code('app/(dashboard)/service-calls/page.tsx')
ok(/const BOARD: CallStatus\[\] = \['new', 'scheduled', 'en_route', 'on_site', 'done'\]/.test(list), 'the board has a column per stage, and Invoiced is not one')
ok(/const drag = useRef<string \| null>\(null\)/.test(list), 'the drag is a ref - a setState on drag start drops the card')
ok(/if \(!offeredMoves\(from, crewMode\)\.includes\(to\)\) \{/.test(list), 'A DROP MOVES ONE STEP, and only a step the call page would offer')
ok(/if \(from === 'new' && to === 'scheduled'\) \{/.test(list), '...Scheduled comes from a person and a time, never from a drag')
ok(/if \(to === 'done' \|\| \(call\.assigned_to === me && punchWith\(from, to\)\)\) \{/.test(list) && /router\.push\(`\/service-calls\/\$\{call\.id\}`\)/.test(list),
  '...and Done, or an arrival that clocks you in, is sent to the call itself rather than half-done from the board')
ok(/\{ key: 'out', label: 'Out now', has: \['en_route', 'on_site'\] \}/.test(list), 'a phone shows one group at a time, and Out now is everybody en route or on site')

const sql = read('supabase/migrations/171_service_call_labels_steps.sql')
ok((sql.match(/ADD COLUMN IF NOT EXISTS (?:labels|steps) jsonb NOT NULL DEFAULT '\[\]'::jsonb/g) ?? []).length === 2, 'both columns are additive with a default')

// A READOUT IS NOT A BUTTON. The stage row was drawn as rounded boxes - the
// shape of a control - and did nothing when pressed. Reported: "why did the
// design up here change to button looks?? it was a progress dots".
{
  const detail = code('components/service-calls/call-detail.tsx')
  const path = detail.slice(detail.indexOf('function ProgressPath'), detail.indexOf('const STATUS_TONE'))
  ok(/rounded-full border-2/.test(path) && /h-0\.5 w-full/.test(path), 'the call\'s stages are dots on a line')
  ok(!/rounded-xl px-3\.5 py-2/.test(path), '...not button-shaped pills that do nothing')
}

done()
