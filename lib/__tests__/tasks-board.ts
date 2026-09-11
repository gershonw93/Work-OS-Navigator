// The Tasks board: fifteen cards, and most of what was on them was noise.
//
// Each card carried Open / In Progress / Completed - forty-five controls on a
// board of fifteen, forty of them saying what the COLUMN already says. Above
// them two rows repeated the same five numbers, one row clickable and one not.
// Below them a detail panel sat docked in the layout permanently, so the board
// was squeezed to half its height whether or not anything was open. And a
// finished card said "6d overdue".
//
// TWO REAL BUGS UNDERNEATH THE CLEANUP, both of the same shape - a write that
// silently did not happen:
//
//   1. The PATCH route whitelists which fields it will write, and the three
//      assignment fields were not on the list. The edit form has always sent
//      them; the route dropped them and answered 200. Assigning somebody while
//      CREATING a task worked, so it looked intermittent rather than dead.
//   2. `completed_at` has been in the schema since migration 046 and nothing
//      outside the demo seed ever wrote it. So a finished task knew it was
//      finished and not WHEN - which is why the only date a completed card had
//      to show was its due date.

import { dueLabel } from '../task-due'
import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
const patch = code('app/api/projects/[id]/tasks/[taskId]/route.ts')
const post = code('app/api/projects/[id]/tasks/route.ts')

// ── 1. a finished task is not late ──────────────────────────────────────────
const ymd = (offset: number) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const past = ymd(-6)

ok(dueLabel({ due_date: past, status: 'open' }) === '6d overdue',
  `open work that is late says so (${dueLabel({ due_date: past, status: 'open' })})`)
ok(!/overdue/.test(dueLabel({ due_date: past, status: 'completed', completed_at: '2026-09-08T15:00:00Z' }) ?? ''),
  'THE BUG: the same date on a COMPLETED task never says overdue')
ok(/^Done /.test(dueLabel({ due_date: past, status: 'completed', completed_at: '2026-09-08T15:00:00Z' }) ?? ''),
  `...it says when it was done (${dueLabel({ due_date: past, status: 'completed', completed_at: '2026-09-08T15:00:00Z' })})`)
ok(!/overdue/.test(dueLabel({ due_date: past, status: 'completed', completed_at: null }) ?? ''),
  'a task finished BEFORE completed_at was ever written still never says overdue')
ok(dueLabel({ due_date: past, status: 'completed', completed_at: null }) === dueLabel({ due_date: past, status: 'completed' }),
  '...it falls back to the due date - not knowing when is not a reason to call it late')
ok(dueLabel({ due_date: ymd(0), status: 'open' }) === 'Due today'
  && dueLabel({ due_date: ymd(1), status: 'open' }) === 'Due tomorrow',
  'the near dates read as words')
ok(dueLabel({ due_date: null, status: 'open' }) === null
  && dueLabel({ due_date: null, status: 'completed', completed_at: null }) === null,
  'nothing to say prints nothing, not "Invalid Date"')
ok(!/undefined|NaN|Invalid Date/.test([
  dueLabel({ due_date: past, status: 'open' }),
  dueLabel({ due_date: past, status: 'completed', completed_at: '2026-09-08T15:00:00Z' }),
  dueLabel({ due_date: ymd(9), status: 'in_progress' }),
].join('|')), 'and no state of it leaks a broken date')

// The page reads the one function rather than formatting a date itself.
ok(/import \{ dueLabel \} from '@\/lib\/task-due'/.test(page), 'the board asks the one function')
ok(!/d overdue`/.test(page), '...and holds no copy of the words')

// ── 2. the write that never happened ────────────────────────────────────────
for (const field of ['assigned_to_member_id', 'assigned_to_company_id', 'assigned_to_name']) {
  ok(new RegExp(`body\\.${field} !== undefined\\) updates\\.${field} = body\\.${field}`).test(patch),
    `THE BUG: saving an edit writes ${field}`)
}
ok(/assigned_to_name: string \| null/.test(page) || /assigned_to_name,/.test(page),
  'the form still sends them - it always did; the route was the half that was missing')
ok(/updates\.assigned_to_name !== \(prev as any\)\?\.assigned_to_name/.test(patch),
  '...and a reassignment is written into job history, so it is visible afterwards')

ok(/updates\.completed_at = body\.status === 'completed' \? new Date\(\)\.toISOString\(\) : null/.test(patch),
  'THE OTHER BUG: finishing a task records WHEN')
ok(/: null/.test(patch.slice(patch.indexOf('updates.completed_at'))),
  '...and reopening one clears it, or a reopened task keeps a finish date')
ok(/completed_at: status === 'completed'/.test(post),
  'a task created straight into the Completed column gets one too')
ok(!/body\.completed_at/.test(patch),
  'it is derived from the move, never taken from the body - a client that could set it could date a task finished last year')

// The drawer's own shape, which the browser cannot be asked about: it is one
// class rather than a second hand-rolled `fixed top-0 right-0`, it is sized off
// the VISIBLE viewport, and its entrance animation is guarded.
const css = code('app/globals.css')
ok(/\.overlay-drawer \{[\s\S]*?height: var\(--vv-h, 100%\)/.test(css),
  'the drawer is the height of what you can SEE, not of the layout viewport')
ok(/\.overlay-drawer \{[\s\S]*?top: var\(--vv-t, 0px\)/.test(css), '...starting where that strip starts')
ok(/\.overlay-drawer \{[\s\S]*?justify-content: flex-end/.test(css), '...flush to the right edge')
ok(/\.overlay-drawer \{[\s\S]*?padding-left: max\(2\.5rem, calc\(env\(safe-area-inset-left\)/.test(css),
  '...leaving something of the page to aim at, and clearing the rounded corner of a phone')
ok(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.overlay-drawer > \* \{ animation:/.test(css),
  'it slides in only where somebody has not asked it not to')
const drawer = code('components/layout/activity-drawer.tsx')
ok(/overlay-drawer/.test(drawer),
  'Job History is on the same class - it was the OTHER hand-rolled drawer')
ok(!/fixed top-0 right-0/.test(drawer),
  '...and no longer measures itself against a viewport that does not shrink for a keyboard')

// ── 3. the status radios are gone ───────────────────────────────────────────
ok(!/StageButtons/.test(page), 'THE ASK: no three-button status control on a card')
ok(/function StatusPicker\(/.test(page), '...one tiny status icon instead')
ok(/aria-label=\{`Status: \$\{current\.label\}\. Move this task`\}/.test(page),
  'it is icon-only, so it says what it is and what it does')
ok(/aria-haspopup="menu"/.test(page) && /role="menuitem"/.test(page), '...and opens a real menu')
ok(!/data-overlay/.test(// Bounded by the next DECLARATION, not by a comment: `code()` strips
// comments, so a marker written in one is not there to slice on.
  page.slice(page.indexOf('function StatusPicker('), page.indexOf('function PriorityBadge('))),
  'the menu is absolute in a relative parent, like RowMenu - it travels with the page and must not freeze it')
// Not click-to-advance. That version shipped once: one stray tap on a finished
// task reopened it, with no confirm and no undo.
ok(!/STATUSES\[\(idx \+ 1\)/.test(page) && !/% STATUSES\.length/.test(page),
  'tapping the icon does not advance the stage - it asks')
ok(/if \(!isCurrent\) onPick\(st\.value\)/.test(page),
  '...and picking the stage it is already on does nothing')
// One definition, used by both card shapes.
ok((page.match(/<StatusPicker /g) ?? []).length === 2,
  'the board card and the list row use the same picker')

// ── 4. one row of counts, not two ───────────────────────────────────────────
ok(/const FILTERS: \{ key: FilterMode/.test(page),
  'THE ASK: the counts and the filters are one list')
ok(/\{FILTERS\.map\(f => \{/.test(page) && /items=\{FILTERS/.test(page),
  '...rendered twice from it, so the desktop row and the phone card cannot disagree about a number')
ok(/onClick: \(\) => setFilterMode\(f\.key\)/.test(page),
  'a count on a phone IS the filter - a StatStrip cell can be a button')
ok(/scroll-fade/.test(page), 'and the row still fades at its right edge, the only sign a phone gets that it continues')
ok(!/\{totalCount\} total/.test(page) && !/\{inProgCount\} in progress/.test(page),
  'the second strip of stat pills is gone')

// ── 5. overdue is said once ─────────────────────────────────────────────────
const cards = page.slice(page.indexOf('function BoardCard('), page.indexOf('function TaskDrawer('))
// The exact markup it used to carry. A `bg-danger-tint` survives in here on
// the delete icon's HOVER state, which is a different thing entirely - so this
// names the wash rather than the colour.
ok(!/bg-danger-tint\/30/.test(cards),
  'THE ASK: an overdue card is not washed red - the red date already says it')
ok(!/border-danger\/30/.test(cards), '...nor outlined red on top of that')
ok(!/isOverdue\(task\) \? 'lg:border/.test(cards), '...at any width')
ok(/text-danger/.test(code('app/(dashboard)/projects/[id]/tasks/page.tsx')),
  '...while the red text itself stays')

// ── 6. four things on a card ────────────────────────────────────────────────
const boardCard = page.slice(page.indexOf('function BoardCard('), page.indexOf('function ListCard('))
ok(/\{task\.title\}/.test(boardCard), 'title')
ok(/<DueChip task=\{task\} \/>/.test(boardCard), 'due date')
ok(/\{task\.assigned_to_name\}/.test(boardCard), 'assignee')
ok(/<TaskTag task=\{task\} \/>/.test(boardCard), 'trade or role')
ok(!/<ChevronDown/.test(boardCard), '...and no chevron: nothing expands in place any more')
ok(!/ImagePlus|CalendarClock/.test(boardCard), '...and no glyphs for facts the panel states in words')
ok(/w-1\.5 h-1\.5/.test(code('app/(dashboard)/projects/[id]/tasks/page.tsx')),
  'the priority dot is kept, at 6px')

// DERIVED, NEVER STORED. Neither trade nor role is a column on a task, and
// copying one there would be a second place for it to be wrong.
ok(/function taskTag\(task: Task\)/.test(page), 'the tag is computed')
ok(/subs\.find\(s => s\.companies\?\.id === task\.assigned_to_company_id\)\?\.trade/.test(page),
  "...a sub's trade comes off the subcontract")
ok(/members\.find\(m => m\.id === task\.assigned_to_member_id\)\?\.role/.test(page),
  "...and a crew member's role off the team row")
ok(!/tag:/.test(post), 'and nothing new is stored on the task to hold it')

done()
