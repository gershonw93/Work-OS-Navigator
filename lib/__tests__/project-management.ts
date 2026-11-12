// PROJECT MANAGEMENT IS PRIVATE, AND THAT IS A PROPERTY OF EVERY QUERY.
//
// The board belongs to one person. The routes run on the service role, so RLS
// does not stand between two people's cards - the route does, by filtering on
// the caller's own id. One query without that filter is somebody else's board
// answered by id. So this suite reads every route and every helper and demands
// the owner on each query, then checks nothing ELSE in the app reads the
// tables at all: no search, no report, no admin console, no Claude tool.
//
// The pure rules (what a card says about its date, where a moved card lands)
// are tested by calling them.

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  cardProblem, columnProblem, cardDue, placeAt, cleanLabels, cleanChecklist, checklistProgress,
  filterCards, monthGrid, pmAllowedRole, pmLinkHref, PM_DEFAULT_COLUMNS, PM_LINK_TYPES, type PmCard,
} from '../project-management'
import { RESOURCES, ROLE_DEFAULTS } from '../permissions'
import { ok, done, code, read, root, walk } from './_helpers'

// ── Who gets it ──────────────────────────────────────────────────────────────
ok(!pmAllowedRole('worker') && !pmAllowedRole('member'), 'the Field Mode roles do not have Project Management')
for (const role of Object.keys(ROLE_DEFAULTS).filter(r => r !== 'worker' && r !== 'member')) {
  ok(pmAllowedRole(role), `${role} has Project Management`)
}
ok(!pmAllowedRole('') && !pmAllowedRole(null), 'no role, no board')
ok(!RESOURCES.some(r => /project-management|^pm$/.test(r.key)), 'it is NOT a permission resource - nothing an admin can grant')

// ── A card as sent ───────────────────────────────────────────────────────────
const COL = '11111111-1111-4111-8111-111111111111'
ok(cardProblem({ title: 'Call the framer', column_id: COL }) === null, 'a title and a column is a card')
ok(/title/i.test(cardProblem({ title: '   ', column_id: COL }) ?? ''), 'a blank title is refused, by name')
ok(/column/i.test(cardProblem({ title: 'x' }) ?? ''), 'a new card with no column is refused')
ok(cardProblem({ notes: 'just notes' }, { partial: true }) === null, 'an edit that does not touch the title needs none')
ok(/title/i.test(cardProblem({ title: '' }, { partial: true }) ?? ''), '...but an edit cannot blank it')
ok(/date/i.test(cardProblem({ title: 'x', column_id: COL, due_date: 'next tuesday' }) ?? ''), 'a due date that is not a date is refused')
ok(cardProblem({ title: 'x', column_id: COL, due_date: null }) === null, 'no due date is fine')
ok(/priority/i.test(cardProblem({ title: 'x', column_id: COL, priority: 'urgent' }) ?? ''), 'priority is a closed set')
ok(/link/i.test(cardProblem({ title: 'x', column_id: COL, link_type: 'payment', link_id: COL }) ?? ''), 'a card cannot link to a kind that is not listed')
ok(/record/i.test(cardProblem({ title: 'x', column_id: COL, link_type: 'task' }) ?? ''), 'a link names its record')
ok(!('payment' in PM_LINK_TYPES) && pmLinkHref('p1', 'bill') === '/projects/p1/invoices' && pmLinkHref('p1', 'nope') === null,
  'a link opens the tab its record lives on, or nothing')

// ── Columns ──────────────────────────────────────────────────────────────────
ok(columnProblem('Punch', ['To do', 'Done']) === null, 'a new name is fine')
ok(/already/i.test(columnProblem(' done ', ['To do', 'Done']) ?? ''), 'a second column of the same name is refused, case and spaces aside')
ok(/name/i.test(columnProblem('', []) ?? ''), 'a column needs a name')
ok(PM_DEFAULT_COLUMNS.filter(c => c.is_done).length === 1 && PM_DEFAULT_COLUMNS[PM_DEFAULT_COLUMNS.length - 1].is_done,
  'a new board has exactly one done column, and it is the last')

// ── What a card says about its date. Built from the reported day. ────────────
const TODAY = '2026-11-12'
const due = (due_date: string | null, completed_at: string | null = null) => cardDue({ due_date, completed_at }, TODAY)
ok(due('2026-11-10')?.tone === 'overdue' && due('2026-11-10')?.text === 'Overdue - Tue Nov 10', 'two days late says Overdue and the weekday')
ok(due('2026-11-12')?.tone === 'today' && due('2026-11-12')?.text === 'Today', 'due today says Today, not overdue')
ok(due('2026-11-13')?.tone === 'plain' && due('2026-11-13')?.text === 'Fri Nov 13', 'tomorrow is a plain weekday date')
ok(due(null) === null, 'no date says nothing')
ok(due('2026-11-01', '2026-11-09T15:04:05+00:00')?.tone === 'done' && due('2026-11-01', '2026-11-09T15:04:05+00:00')?.text === 'Done Mon Nov 9',
  'a finished card is never overdue, whatever its due date - and the timestamp prints as a day')
ok(!/object|null|undefined/.test(JSON.stringify([due('2026-11-10'), due('2026-11-13'), due('2026-11-01', '2026-11-09T15:04:05Z')].map(d => d?.text))),
  'no sentence prints an object or the word null')

// ── Ordering ─────────────────────────────────────────────────────────────────
ok(placeAt(['a', 'b', 'c'], 'c', 0).join() === 'c,a,b', 'a card dropped at the top goes first')
ok(placeAt(['a', 'b', 'c'], 'a', null).join() === 'b,c,a', 'no index means the end')
ok(placeAt(['a', 'b'], 'x', 1).join() === 'a,x,b', 'a card from another column is inserted, not swapped')
ok(placeAt(['a', 'b'], 'x', 99).join() === 'a,b,x', 'an index off the end lands at the end')
ok(placeAt(['a', 'b', 'c'], 'b', 1).join() === 'a,b,c', 'the same place is the same order')

// ── Cleaning ─────────────────────────────────────────────────────────────────
const labels = cleanLabels([{ name: ' Framing ', tone: 'info' }, { name: 'framing', tone: 'warn' }, { name: 'Money', tone: 'chartreuse' }, { name: '' }])
ok(labels.length === 2 && labels[0].name === 'Framing' && labels[1].tone === 'neutral', 'labels are trimmed, de-duplicated, and an unknown colour is grey')
ok(cleanLabels('nope').length === 0 && cleanChecklist(null).length === 0, 'anything that is not a list is no list')
const list = cleanChecklist([{ id: 'a', text: 'Test tee', done: true }, { text: '   ' }, { id: 'c', text: 'Nail plates', done: 'yes' }])
ok(list.length === 2 && list[0].done === true && list[1].done === false, 'a checklist drops blanks and only `true` is done')
ok(checklistProgress(list)?.done === 1 && checklistProgress(list)?.total === 2 && checklistProgress([]) === null, 'progress counts, and an empty list has none')

const card = (over: Partial<PmCard>): PmCard => ({
  id: 'c', project_id: 'p', column_id: COL, title: 'Card', notes: null, due_date: null, priority: 'normal',
  labels: [], checklist: [], link_type: null, link_id: null, link_label: null, position: 0, completed_at: null, ...over,
})
const some = [card({ id: '1', title: 'Call the framer', labels: [{ name: 'Framing', tone: 'info' }] }), card({ id: '2', title: 'Tile sample', notes: 'from the showroom' })]
ok(filterCards(some, 'SHOWROOM', '').map(c => c.id).join() === '2', 'search reads the notes, any case')
ok(filterCards(some, '', 'framing').map(c => c.id).join() === '1', 'the label filter is exact, any case')
ok(filterCards(some, '', '').length === 2, 'no filter shows everything')

const nov = monthGrid(2026, 10)
ok(nov[0][0] === '2026-11-01' && nov.flat().filter(Boolean).length === 30 && nov.every(w => w.length === 7),
  'November 2026 starts on a Sunday, has 30 days, and every week is seven cells')
ok(monthGrid(2026, 11)[0].indexOf('2026-12-01') === 2, 'December 2026 starts on a Tuesday')

// ── EVERY QUERY IS THE CALLER'S OWN ──────────────────────────────────────────
function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(root(), rel)).isDirectory()) routes(rel, out)
    else if (name === 'route.ts') out.push(rel)
  }
  return out
}
const routeFiles = [...routes('app/api/projects/[id]/project-management'), 'app/api/me/project-management/route.ts']
ok(routeFiles.length === 7, `the Project Management routes were found (${routeFiles.length})`)

const SERVER = 'lib/project-management-server.ts'
let queries = 0
for (const file of [...routeFiles, SERVER]) {
  const src = code(file)
  const re = /\.from\('pm_(?:cards|columns)'\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    queries++
    const next = src.indexOf(".from('", m.index + 10)
    const chain = src.slice(m.index, Math.min(m.index + 600, next < 0 ? src.length : next))
    ok(/\.eq\('owner_id', (?:gate\.owner|owner)\)|owner_id: (?:gate\.owner|owner)\b/.test(chain),
      `${file.replace('app/api/', '')}: a pm query at ${m.index} is filtered on the caller's own id`)
  }
}
ok(queries >= 18, `the scan saw the queries it is checking (${queries})`)

let handlers = 0
for (const file of routeFiles) {
  const src = code(file)
  const re = /export async function (GET|POST|PUT|PATCH|DELETE)\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    handlers++
    const next = src.indexOf('export async function', m.index + 10)
    const body = src.slice(m.index, next < 0 ? undefined : next)
    const gateAt = body.indexOf('await pmGate(db, request,')
    const firstQuery = body.search(/\.from\(|request\.json\(|readColumns\(|readCards\(/)
    ok(gateAt > 0 && (firstQuery < 0 || gateAt < firstQuery), `${file.replace('app/api/', '')} ${m[1]} asks pmGate before it reads anything`)
    if (m[1] !== 'GET') ok(/pmGate\(db, request, params\.id, \{ write: true \}\)/.test(body), `...and ${m[1]} is a write, so it takes the billing lock`)
  }
}
ok(handlers === 10, `every handler was checked (${handlers})`)

const server = code(SERVER)
ok(/owner: actor\.userId/.test(server) && !/owner: (?:body|params|request)/.test(server), 'the owner is the ACTOR, never a value from the request')
ok(/if \(!pmAllowedRole\(actor\.role\)\) return refuse\(/.test(server), 'the gate refuses a Field Mode role')
ok(/await jobSide\(db, actor, projectId\)/.test(server), '...and asks whether the caller is on the job')
ok(!/as_user|searchParams/.test(server), 'there is no way to ask for another person in the gate')
ok(/gate\.side !== 'gc'\) return false/.test(server) && /ASSIGNED_ONLY_ROLES\.includes\(gate\.actor\.role\)\) return false/.test(server)
  && /actorCan\(gate\.actor, t\.resource, 'view'\)/.test(server),
  'a link is offered only on your own job, to a role that can open that kind of record')
for (const file of ['app/api/projects/[id]/project-management/cards/route.ts', 'app/api/projects/[id]/project-management/cards/[cardId]/route.ts']) {
  const src = code(file)
  ok(/mayLink\(gate, type\)/.test(src) && /link_label(?:: | = )found\.label/.test(src), `${file.split('project-management/')[1]}: a link is checked on the server and its label is read off the record`)
  ok(!/completed_at: body|body\.completed_at/.test(src), '...and the finished date is never taken from the body')
}
ok(/kind/.test(code('app/api/projects/[id]/project-management/links/route.ts'))
  && !/searchParams\.get\('(?:id|type)'\)/.test(code('app/api/projects/[id]/project-management/links/route.ts')),
  'the link picker\'s query param is not named like a path segment')

// ── NOTHING ELSE READS THE TABLES ────────────────────────────────────────────
const OWN = new Set([...routeFiles, SERVER])
const strangers = [...walk('app'), ...walk('lib'), ...walk('components')]
  .filter(f => !OWN.has(f.replace(/\\/g, '/')) && !f.includes('__tests__'))
  .filter(f => /pm_cards|pm_columns/.test(code(f)))
ok(strangers.length === 0, `no search, report, admin console or Claude tool reads a private board (${strangers.join(', ') || 'none'})`)
ok(walk('lib').some(f => /mcp/.test(f)), 'the scan covers the Claude tools it is clearing')

// ── The table ────────────────────────────────────────────────────────────────
const sql = read('supabase/migrations/166_project_management.sql')
ok((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length === 2 && !/CREATE POLICY/.test(sql), 'both tables: RLS on, no policy - service role only')
ok((sql.match(/owner_id\s+uuid NOT NULL REFERENCES profiles \(id\) ON DELETE CASCADE/g) ?? []).length === 2, 'both tables are keyed on their owner, and go with them')
ok(/position\s+integer/.test(sql) && !/position\s+numeric/.test(sql), 'position is an integer - a numeric comes back as a string')

// ── The doors ────────────────────────────────────────────────────────────────
const tabs = code('components/layout/project-tabs.tsx')
ok(/const showPm = ready && pmAllowedRole\(role\)/.test(tabs), 'the tab is offered by role, not by a permission')
ok((tabs.match(/showPm && \(/g) ?? []).length === 2, '...on the desktop row AND in the phone sheet')
ok(/i\.href !== '\/my-work'/.test(code('components/layout/sidebar.tsx')), 'a Field Mode role is not offered My Work')
const board = code('components/project-management/pm-board.tsx')
ok(/if \(!allowed\)/.test(board) && /previewing &&/.test(board), 'the screen refuses a Field Mode role and says whose board a preview is showing')
ok(/inside = cards\.filter\(c => c\.column_id === column\.id\)\.length/.test(board), 'deleting a column with cards in it is refused on the control, not only by the route')
done()
