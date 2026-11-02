// A permit was one status, so "pending" meant both "the township has had it
// three weeks" and "they sent it back and we have not fixed the energy calc".
// On a twenty-house development that history lived in ~250 emails. Rounds and
// items hold it now, and who has the permit is DERIVED from them - these pin
// the derivation, the rules each door asks, and that the doors ask them.

import {
  allowedStatuses, cleanItems, outcomeProblem, permitStanding, statusAfter, statusMoveProblem,
  submitProblem, type PermitRound,
} from '../permit-rounds'
import { boardCells, boardColumns, boardCounts, bulkProblem } from '../permit-board'
import { ok, done, code, read, walk } from './_helpers'

const TODAY = '2026-11-02'
const permit = { status: 'pending', issuing_authority: 'Lakewood Township', permit_type: 'Building', description: 'Lot 7 house' }
const round = (o: Partial<PermitRound>): PermitRound =>
  ({ id: o.id ?? 'r', permit_id: 'p', submitted_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z', ...o })

// ── who has it ──────────────────────────────────────────────────────────────
{
  const s = permitStanding(permit, [], [], TODAY)
  ok(s.court === 'none' && s.label === 'No submission logged',
    'no history is "not logged", never "not submitted" - it may be sitting at the township')
  ok(permitStanding({ ...permit, status: 'approved' }, [], [], TODAY).court === 'done',
    'a permit marked approved before rounds existed still reads as done')
}
{
  const s = permitStanding(permit, [round({ submitted_on: '2026-10-21' })], [], TODAY)
  ok(s.court === 'them' && s.label.startsWith('With Lakewood Township since Oct 21') && s.label.includes('12 days'),
    `an open round is with the reviewer, named, with the date and the age (got "${s.label}")`)
  ok(!s.chase && s.tone === 'info', '...and 12 days with no promised date is not yet a chase')
}
{
  const s = permitStanding(permit, [round({ submitted_on: '2026-10-08' })], [], TODAY)
  ok(s.chase && s.tone === 'warn', `25 days with no answer and no promised date is a chase (${s.label})`)
}
{
  // Promised for Oct 30, nothing by Nov 2: overdue even though only 10 days in.
  const s = permitStanding(permit, [round({ submitted_on: '2026-10-23', expected_by: '2026-10-30' })], [], TODAY)
  ok(s.chase && s.label.includes('answer was due Oct 30'), `past the promised date is a chase, and says so (${s.label})`)
  const early = permitStanding(permit, [round({ submitted_on: '2026-10-01', expected_by: '2026-11-20' })], [], TODAY)
  ok(!early.chase, '...and a promised date still ahead wins over the 21-day default')
}
{
  const rounds = [round({ outcome: 'corrections', outcome_on: '2026-10-15' })]
  const items = [{ done_at: null }, { done_at: null }, { done_at: '2026-10-20' }]
  const s = permitStanding(permit, rounds, items, TODAY)
  ok(s.court === 'us' && s.label === 'With us: 2 items to fix', `corrections with open items is with us, counted (${s.label})`)
  const all = permitStanding(permit, rounds, items.map(() => ({ done_at: 'x' })), TODAY)
  ok(all.court === 'us' && all.label === 'Ready to resubmit', 'every item ticked off reads "ready to resubmit"')
}
{
  const rounds = [
    round({ id: 'a', submitted_on: '2026-09-01', outcome: 'corrections', outcome_on: '2026-09-10' }),
    round({ id: 'b', submitted_on: '2026-09-15', outcome: 'approved', outcome_on: '2026-09-30' }),
    round({ id: 'c', submitted_on: '2026-10-05', outcome: 'rejected', outcome_on: '2026-10-12' }),
  ]
  const s = permitStanding(permit, rounds, [], TODAY)
  ok(s.court === 'done' && s.label === 'Approved Sep 30',
    'a REJECTED REVISION does not un-issue an approved permit')
  // Given in the wrong order on purpose: the route does not sort.
  const shuffled = permitStanding(permit, [rounds[2], rounds[0], rounds[1]], [], TODAY)
  ok(shuffled.label === s.label, '...whatever order the rows arrive in')
}

// ── what each door refuses ──────────────────────────────────────────────────
ok(!!submitProblem({ submitted_on: '2026-11-01' }, [round({})]),
  'a second submission while one is still with the reviewer is refused')
ok(!!submitProblem({ submitted_on: '2026-11-01', expected_by: '2026-10-01' }, []),
  'an answer expected before the submission is refused')
ok(submitProblem({ submitted_on: '2026-11-01' }, [round({ outcome: 'corrections', outcome_on: '2026-10-10' })]) === null,
  'resubmitting after corrections is allowed')
ok(!!submitProblem({ submitted_on: '' }, []), 'a submission with no date is refused')

const waiting = round({})
ok(!!outcomeProblem({ outcome: 'corrections', outcome_on: '2026-10-15', items: ['', '  '] }, waiting, permit),
  'corrections with no list is refused - the list is what makes it "with us"')
ok(outcomeProblem({ outcome: 'corrections', outcome_on: '2026-10-15', items: ['Energy calc'] }, waiting, permit) === null,
  '...and with one item it goes through')
ok(!!outcomeProblem({ outcome: 'approved', outcome_on: '2026-10-15' }, waiting, permit),
  'an approval with no permit number is refused (permitProblem: a status that claims something carries it)')
ok(outcomeProblem({ outcome: 'approved', outcome_on: '2026-10-15', permit_number: '26-0412', issued_date: '2026-10-15' }, waiting, permit) === null,
  '...and with the number and the issue date it goes through')
ok(!!outcomeProblem({ outcome: 'rejected', outcome_on: '2026-09-20' }, waiting, permit),
  'an answer dated before the submission is refused')
ok(!!outcomeProblem({ outcome: 'rejected', outcome_on: '2026-10-15' }, round({ outcome: 'rejected', outcome_on: '2026-10-10' }), permit),
  'a round that already has an answer cannot get a second one')
ok(!!outcomeProblem({ outcome: '', outcome_on: '2026-10-15' }, waiting, permit), 'no outcome picked is refused - no default answer')

const pasted = cleanItems(['- Revised site plan', '', '2) Energy calc', '• energy calc', '  HOA letter  '])
ok(pasted.join('|') === 'Revised site plan|Energy calc|HOA letter',
  `a list pasted from an email loses its bullets, blanks and repeats (got ${pasted.join('|')})`)

// ── the status column, once history exists ─────────────────────────────────
ok(allowedStatuses([]).length === 6, 'a permit with no history can still be set to anything, as before')
ok(!!statusMoveProblem('pending', 'approved', [round({})]),
  'the dropdown cannot say "approved" over a submission still with the township')
ok(statusMoveProblem('pending', 'expired', [round({})]) === null, '...but "expired" is a date, always allowed')
ok(statusMoveProblem('approved', 'active', [round({ outcome: 'approved', outcome_on: '2026-10-01' })]) === null,
  'after an approval, active / recorded is still a person\'s call')
ok(statusMoveProblem('pending', 'pending', [round({})]) === null, 'saving the Edit form unchanged is never refused')

ok(statusAfter('submitted', 'rejected', [round({ outcome: 'rejected', outcome_on: '2026-10-01' })]) === 'pending',
  'resubmitting a rejected permit makes it pending again')
ok(statusAfter('approved', 'pending', []) === 'approved', 'an approval sets approved')
ok(statusAfter('approved', 'active', []) === null, '...but never steps an active permit back to approved')
ok(statusAfter('submitted', 'active', [round({ outcome: 'approved', outcome_on: '2026-10-01' })]) === null,
  'a revision submitted on an issued permit does not make it pending')

// ── the board ───────────────────────────────────────────────────────────────
ok(!!bulkProblem({ action: 'answer', permit_type: 'Building', project_ids: ['a'], outcome: 'approved' }),
  'an approval is not a batch - every house has its own number')
ok(!!bulkProblem({ action: 'answer', permit_type: 'Building', project_ids: ['a'], outcome: 'corrections', items: [] }),
  'bulk corrections with no list is refused once, not twenty times')
ok(!!bulkProblem({ action: 'submit', permit_type: 'Building', project_ids: [] }), 'no houses picked is refused')

const boardPermits = [
  { id: 'p1', project_id: 'lot1', permit_type: 'Electrical' },
  { id: 'p2', project_id: 'lot1', permit_type: 'Building' },
  { id: 'p3', project_id: 'lot2', permit_type: 'Building' },
  { id: 'p4', project_id: 'lot2', permit_type: 'Building' },
]
ok(boardColumns(boardPermits).join() === 'Building,Electrical', 'the most common type is the first column')
const cells = boardCells(boardPermits, [round({ permit_id: 'p2', submitted_on: '2026-10-01' })], [], TODAY)
ok(cells.get('lot2')!.get('Building')!.others === 1, 'two permits of one type on one house are counted, not hidden')
ok(cells.get('lot1')!.get('Building')!.standing.chase, 'a board cell carries the same standing as the permit\'s own panel')
ok(boardCounts(cells).them === 1, 'the filter counts count permits')

// ── the doors ask ───────────────────────────────────────────────────────────
const routes = walk('app/api/projects/[id]').filter(f =>
  /permits\/\[permitId\]\/(rounds|items)|permit-board/.test(f) && f.endsWith('route.ts'))
ok(routes.length === 5, `found the five new routes (got ${routes.length})`)
for (const f of routes) {
  const src = code(f)
  const handlers = (src.match(/export async function (GET|POST|PATCH|DELETE)/g) ?? []).length
  ok(handlers > 0 && (src.match(/requirePermission\(/g) ?? []).length >= handlers,
    `${f}: every handler asks a permission`)
  ok(/ownedProject/.test(src), `${f}: the job must be the caller's own`)
}
const writes = code('lib/writes/permit-round.ts')
ok(/submitProblem\(/.test(writes) && /outcomeProblem\(/.test(writes), 'the writes ask the same rules the dialogs do')
ok(/\.is\('outcome', null\)/.test(writes), 'recording an answer is ONE conditional update - two people, one wins')
ok(/statusAfter\(/.test(writes), 'the status column moves only through statusAfter')
ok(/const moveProblem = statusMoveProblem\(/.test(code('lib/writes/permit.ts')) && /if \(moveProblem\) return \{ status: 400/.test(code('lib/writes/permit.ts')), 'the permit PATCH (the app and Claude) refuses a status the history contradicts')
ok(/permit_rounds_one_open[\s\S]*WHERE outcome IS NULL/.test(read('supabase/migrations/157_permit_rounds.sql')),
  'one open round per permit is an INDEX, not a check-then-insert')
const board = code('app/api/projects/[id]/permit-board/route.ts')
ok(/bulkProblem\(/.test(board) && /submitRound\(/.test(board) && /answerRound\(/.test(board) && /createPermit\(/.test(board),
  'a bulk action goes through the single-permit writes, house by house')
ok(/allowed\.has\(/.test(board), 'bulk ids are checked against this development\'s houses')
ok(/maxDuration = 60/.test(board), 'a bulk over twenty houses has time to finish')
ok(/history: ok/.test(code('app/api/projects/[id]/permits/route.ts')), 'a failed history read is reported, not handed back as empty')

done()
