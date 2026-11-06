// A permit was one status, so "pending" meant both "the township has had it
// three weeks" and "they sent it back and we have not fixed the energy calc".
// On a twenty-house development that history lived in ~250 emails. Rounds and
// items hold it now, and who has the permit is DERIVED from them - these pin
// the derivation, the rules each door asks, and that the doors ask them.

import {
  allowedStatuses, carryableFiles, cleanItems, finalFileAfter, unusedUploads, outcomeProblem, permitStage, permitStanding, statusAfter, statusMoveProblem,
  submitProblem, type PermitItem, type PermitRound,
} from '../permit-rounds'
import { JOB_FILE_KINDS } from '../job-files'
import { fitWithin } from '../shrink-image'
import { boardCells, boardColumns, boardCounts, bulkMisfit, bulkProblem } from '../permit-board'
import { ok, done, code, read, walk } from './_helpers'

const TODAY = '2026-11-02'
const permit = { status: 'pending', issuing_authority: 'Lakewood Township', permit_type: 'Building', description: 'Lot 7 house' }
const round = (o: Partial<PermitRound>): PermitRound =>
  ({ id: o.id ?? 'r', permit_id: 'p', submitted_on: '2026-10-01', created_at: '2026-10-01T10:00:00Z', ...o })

// ── where it stands: permitStage, the ONE answer the list, panel and board read ──
const item = (o: Partial<PermitItem>): PermitItem => ({ id: o.id ?? Math.random().toString(36), permit_id: 'p', label: o.label ?? 'x', ...o })
{
  const s = permitStage(permit, [], [], TODAY)
  ok(s.stage === 'draft' && s.group === 'you' && s.step === 0 && s.head === 'Apply for it',
    'a permit nothing has been logged on is "Apply for it", your move, step 1 of 4')
  ok(/This job needs a Building permit from Lakewood Township/.test(s.sub) && /Already applied\?/.test(s.sub),
    '...says what is needed and from whom, and that it may already have gone in')
  ok(permitStage({ ...permit, status: 'approved' }, [], [], TODAY).stage === 'issued',
    'a permit marked approved before rounds existed is issued')
}
{
  // The design's Building: with Test Township since Oct 30, round 3.
  const s = permitStage({ ...permit, issuing_authority: 'Test Township' }, [
    round({ id: 'a', submitted_on: '2026-10-11', outcome: 'corrections', outcome_on: '2026-10-19' }),
    round({ id: 'b', submitted_on: '2026-10-21', outcome: 'corrections', outcome_on: '2026-10-28' }),
    round({ id: 'c', submitted_on: '2026-10-30' }),
  ], [], TODAY)
  ok(s.stage === 'city' && s.group === 'city' && s.next === 'Waiting on round 3 answer', `with the city, on round 3 (got "${s.next}")`)
  ok(s.time === '3 days' && s.head === 'Waiting on Test Township' && /Round 3 sent Oct 30, 3 days ago/.test(s.sub),
    `the row says how long and the panel says since when (got "${s.time}" / "${s.sub}")`)
  ok(!s.chase, '...and 3 days is not a chase')
}
{
  const s = permitStage(permit, [round({ submitted_on: '2026-10-08' })], [], TODAY)
  ok(s.chase && s.time === '25 days, follow up' && s.timeTone === 'warn' && /Follow up/.test(s.head),
    `25 days with no answer and no promised date is a chase (${s.time})`)
  const promised = permitStage(permit, [round({ submitted_on: '2026-10-23', expected_by: '2026-10-30' })], [], TODAY)
  ok(promised.chase && /was due Oct 30/.test(promised.time), `past the promised date is a chase, and says so (${promised.time})`)
  const early = permitStage(permit, [round({ submitted_on: '2026-10-01', expected_by: '2026-11-20' })], [], TODAY)
  ok(!early.chase, '...and a promised date still ahead wins over the 21-day default')
}
{
  // The design's Mechanical: answered Oct 28, three asks, one done.
  const last = round({ id: 'r1', submitted_on: '2026-10-09', outcome: 'corrections', outcome_on: '2026-10-28', created_at: '2026-10-09T10:00:00Z' })
  const asks = [item({ round_id: 'r1', label: 'Duct layout' }), item({ round_id: 'r1', label: 'Cut sheets' }), item({ round_id: 'r1', label: 'Load calc', done_at: '2026-10-30' })]
  const s = permitStage(permit, [last], asks, TODAY)
  ok(s.stage === 'fix' && s.next === 'Fix 2 things and send it back' && s.head === 'Fix 2 things, then send it back',
    `corrections with open asks: your move, counted (${s.next})`)
  ok(s.time === 'Back 5 days', `...and how long it has been back with us (${s.time})`)
  const allDone = permitStage(permit, [last], asks.map(a => ({ ...a, done_at: 'x' })), TODAY)
  ok(allDone.next === 'All fixed, send it back', 'every ask ticked reads "all fixed, send it back"')
  const none = permitStage(permit, [last], [], TODAY)
  ok(none.stage === 'fix' && none.next === 'Add what they asked for',
    'an answer recorded before the list is typed says to add the list - the answer comes first, the list after reading it')
  // An ask from an OLDER round that is still open stays on the card.
  const older = item({ round_id: 'r0', label: 'Old open ask' })
  ok(permitStage(permit, [last], [older], TODAY).asks.some(a => a.label === 'Old open ask'),
    'an unfinished ask from an earlier round is never hidden by a new one')
}
{
  const rounds = [
    round({ id: 'a', submitted_on: '2026-09-01', outcome: 'corrections', outcome_on: '2026-09-10' }),
    round({ id: 'b', submitted_on: '2026-09-15', outcome: 'approved', outcome_on: '2026-09-30' }),
    round({ id: 'c', submitted_on: '2026-10-05', outcome: 'rejected', outcome_on: '2026-10-12' }),
  ]
  const s = permitStage(permit, rounds, [], TODAY)
  ok(s.stage === 'issued' && s.head === 'Issued Sep 30', `a REJECTED REVISION does not un-issue an approved permit (${s.head})`)
  const shuffled = permitStage(permit, [rounds[2], rounds[0], rounds[1]], [], TODAY)
  ok(shuffled.head === s.head, '...whatever order the rows arrive in')
}
{
  // The design's Street Occupancy: issued Jul 30, expired Oct 30.
  const s = permitStage({ ...permit, status: 'active', expiry_date: '2026-10-30' },
    [round({ outcome: 'approved', outcome_on: '2026-07-30' })], [], TODAY)
  ok(s.stage === 'renew' && s.group === 'you' && s.time === 'Expired 3 days ago' && s.timeTone === 'bad',
    `an issued permit past its date is YOUR MOVE, "Renew it", whatever the row still says (${s.time})`)
  const fix = permitStage(permit, [round({ outcome: 'corrections', outcome_on: '2026-10-01' })], [], TODAY)
  ok(s.sortKey < fix.sortKey, 'an expired permit sorts to the top of Your move')
  const soon = permitStage({ ...permit, status: 'approved', expiry_date: '2026-11-20' }, [], [], TODAY)
  ok(soon.stage === 'issued' && soon.timeTone === 'warn' && soon.time === 'Expires Nov 20',
    `inside the expiry window an issued permit warns, in the column that is coloured (${soon.time})`)
  const fine = permitStage({ ...permit, status: 'approved', expiry_date: '2027-10-09' }, [], [], TODAY)
  ok(fine.next === 'Expires Oct 9, 2027', `an expiry next year carries its year (${fine.next})`)
}
ok(permitStage({ ...permit, status: 'closed' }, [], [], TODAY).step === 3, 'closed out is the fourth step')
ok(permitStanding(permit, [round({ submitted_on: '2026-10-08' })], [], TODAY).chase,
  'the board\'s standing is derived from the same stage - never computed a second way')

// ── what each door refuses ──────────────────────────────────────────────────
ok(!!submitProblem({ submitted_on: '2026-11-01' }, [round({})]),
  'a second submission while one is still with the reviewer is refused')
ok(!!submitProblem({ submitted_on: '2026-11-01', expected_by: '2026-10-01' }, []),
  'an answer expected before the submission is refused')
ok(submitProblem({ submitted_on: '2026-11-01' }, [round({ outcome: 'corrections', outcome_on: '2026-10-10' })]) === null,
  'resubmitting after corrections is allowed')
ok(!!submitProblem({ submitted_on: '' }, []), 'a submission with no date is refused')

const waiting = round({})
ok(outcomeProblem({ outcome: 'corrections', outcome_on: '2026-10-15', items: [] }, waiting, permit) === null,
  'corrections can be recorded before the list - the permit then says "Add what they asked for"')
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
ok(allowedStatuses([]).length === 7, 'a permit with no history can still be set to anything, as before (closed included)')
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
ok(bulkProblem({ action: 'answer', permit_type: 'Building', project_ids: ['a'], outcome: 'corrections', items: [] }) === null,
  '...the same in bulk: one door does not refuse what the other allows')
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
ok(routes.length === 6, `found the six permit routes (got ${routes.length})`)
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


// ── files: the fixes, the final permit, what came back on a link ────────────
{
  const plan = { name: 'site-plan-rev2.pdf', url: 'u/plan2' }
  const calc = { name: 'rescheck.pdf', url: 'u/calc' }
  const items = [{ label: 'Revised site plan', files: [plan] }, { label: 'Energy calc', files: [calc] }, { label: 'HOA letter', files: [] }]
  const c = carryableFiles(items, [round({ sent_files: [{ name: 'full set', url: 'u/set' }] })])
  ok(c.map(f => f.url).join() === 'u/plan2,u/calc' && c[0].item === 'Revised site plan',
    'a resubmission carries every fix attached to an item, named by the item it closes')
  ok(carryableFiles(items, [round({ sent_files: [plan] })]).map(f => f.url).join() === 'u/calc',
    '...and never one that already went in with a round')

  const received = [{ name: 'letter.pdf', url: 'u/letter' }, { name: 'permit.pdf', url: 'u/permit' }]
  ok(finalFileAfter('approved', received) === 'u/permit', 'the LATEST approved file becomes the permit itself')
  ok(finalFileAfter('corrections', received) === null && finalFileAfter('approved', []) === null,
    '...a corrections letter never does, and an approval with no file leaves the permit\'s document alone')

  const share = { id: 's', permit_id: 'p', name: 'Permit set', created_at: '2026-10-01T00:00:00Z',
    uploads: [{ id: 'up1', name: 'approved.pdf', url: 'u/approved', created_at: '2026-10-20T00:00:00Z' }, { id: 'up2', name: 'old.pdf', url: 'u/old', created_at: '2026-10-02T00:00:00Z' }] }
  ok(unusedUploads([share], [round({ received_files: [{ name: 'old.pdf', url: 'u/old' }] })]).map(u => u.id).join() === 'up1',
    'what came back through a link is offered for the answer until it has been used in one')
}
ok(JOB_FILE_KINDS.some(k => k.kind === 'permit' && k.tab === 'permits' && k.resource === 'permits'),
  'Files has a Permits folder, behind the same permission as the Permits tab')
{
  const w = code('lib/writes/permit-round.ts')
  ok(/carryableFiles\(\(itemRows/.test(w) && /allowed\.has\(u\)/.test(w),
    'a carried fix comes off this permit\'s own items, never a URL from the body')
  ok(/\.eq\('file_shares\.permit_id', permitId\)/.test(w),
    'a link upload is looked up through the SHARE\'s permit - another job\'s upload cannot become this permit\'s paperwork')
  ok(/const final = finalFileAfter\(outcome, received_files\)\s*\n\s*if \(final\) permitPatch\.file_url = final/.test(w),
    'the approval writes the final file onto the permit')
  const shares = code('app/api/file-shares/route.ts')
  ok(/gc_company_id !== profile\.company_id/.test(shares) && /permit_id: permitId/.test(shares),
    'a share made from a permit is checked against the sender\'s own company before it is tied to it')
  const filesRoute = code('app/api/files/jobs/route.ts')
  ok(/permitHistory\(/.test(filesRoute) && /failed\.push\('permit'\)/.test(filesRoute),
    'Files reads permits through the one history reader, and a failed read says so')
  const itemFiles = code('app/api/projects/[id]/permits/[permitId]/items/[itemId]/files/route.ts')
  ok((itemFiles.match(/requirePermission\(/g) ?? []).length === 2 && (itemFiles.match(/ownedProject\(/g) ?? []).length === 2,
    'attaching or removing a fix asks the permission and the job, on both handlers')
}


// ── the redesigned screen asks the stage, and says no with words ────────────
{
  const page = code('app/(dashboard)/projects/[id]/permits/page.tsx')
  const panel = code('components/permits/permit-panel.tsx')
  const list = code('components/permits/permit-list.tsx')
  ok(/permitStage\(/.test(page) && /permitStage\(/.test(panel) && !/permitStage\(/.test(list),
    'the page and the panel ask permitStage; the list only lays out what it was given')
  ok(/st\.openAsks > 0/.test(panel) && /confirmLabel: 'Yes, I sent it'/.test(panel),
    'sending with asks unticked ASKS, it is not a greyed-out button that explains nothing')
  ok(!/disabled=\{[^}]*openAsks/.test(panel), '...and no button is disabled on the asks')
  ok(/docked \?/.test(panel) && /className="overlay-drawer[^"]*" data-overlay/.test(panel),
    'docked beside the list on a desktop; on a phone an overlay-drawer that freezes the page')
  ok(/lg:hidden/.test(panel) && /hidden flex-wrap items-center gap-2 lg:flex/.test(panel),
    'the card\'s buttons are pinned under the thumb on a phone and sit in the card on a desktop')
  ok(allowedStatuses([round({ outcome: 'approved', outcome_on: '2026-10-01' })]).includes('closed'),
    'an issued permit can be closed out')
  ok(/'closed'/.test(read('supabase/migrations/159_permit_closed_out.sql')), 'and the database allows it')
}


// ── a phone photo goes up small, once ───────────────────────────────────────
// "The save button took a while": a 4032x3024 camera picture went up twice at
// full size - for the AI read and again on Save.
{
  const f = fitWithin(4032, 3024)
  ok(f.width === 2000 && f.height === 1500, `a camera photo is drawn at 2000px on its long side, shape kept (got ${f.width}x${f.height})`)
  const portrait = fitWithin(3024, 4032)
  ok(portrait.width === 1500 && portrait.height === 2000, '...portrait too')
  ok(fitWithin(1200, 900).width === 1200, '...and a picture already small enough is left alone')
  const page = code('app/(dashboard)/projects/[id]/permits/page.tsx')
  ok(/const file = raw \? await shrinkImage\(raw\) : null[\s\S]{0,80}setPermitFile\(file\)[\s\S]{0,40}analyzePermitImage\(file\)/.test(page),
    'Add Permit shrinks the photo BEFORE the AI read, so the read and the save send the same small copy')
  const pnl = code('components/permits/permit-panel.tsx')
  ok((pnl.match(/shrinkImages?\(/g) ?? []).length >= 3, 'the panel shrinks what it attaches, what it sends and the approved permit')
  ok(/<span className="truncate">\{busy === 'send'/.test(pnl), 'a township\'s long name truncates on the Send button instead of running off the screen')
}


// ── a record, not a send ────────────────────────────────────────────────────
// "Send to Toms River Township" read as SyteNav filing the permit. It records.
{
  const pnl = code('components/permits/permit-panel.tsx')
  ok(!/`Send to \$\{st\.who\}`/.test(pnl) && /'I sent it'/.test(pnl) && /'I sent it back'/.test(pnl) && /'I sent the renewal'/.test(pnl),
    'the button says what it records - I sent it / I sent it back / I sent the renewal - never "Send to <township>"')
  ok(/SyteNav does not send it for you/.test(pnl), '...and the line under it says SyteNav does not send it')
  ok(/\{st\.stage === 'fix' && \(/.test(pnl) && /\{st\.stage === 'fix' && canEdit && \(/.test(pnl),
    'the list of what they asked for, and its "They also want..." box, appear only once they have answered')
}

{
  const list = code('components/permits/permit-list.tsx')
  ok(/className="col-start-1 row-start-1 min-w-0 text-left/.test(list) && /'col-start-2 row-start-1 self-start/.test(list),
    'on a phone the permit name is placed first and the time beside it - a row-start alone put the time in the name\'s cell')
}
{
  const css = read('app/globals.css')
  const pnl = code('components/permits/permit-panel.tsx')
  const pg = code('app/(dashboard)/projects/[id]/permits/page.tsx')
  ok(/@keyframes dock-in/.test(css) && /@keyframes dock-out/.test(css) && /\.dock-panel > \.dock-inner \{ width: var\(--dock-w\)/.test(css)
    && /'dock-panel /.test(pnl) && /closing && 'dock-closing'/.test(pnl) && /onClose=\{closePanel\}/.test(pg) && /window\.setTimeout\(/.test(pg),
    'the docked permit panel slides open and shut (its column grows, the text inside never re-wraps), and the close is a timer')
}
{
  const tabs = code('components/layout/project-tabs.tsx')
  const pageF = code('app/(dashboard)/projects/[id]/files/page.tsx')
  const api = code('app/api/files/jobs/route.ts')
  ok(/\{ label: 'Files', slug: 'files'/.test(tabs) && /'sharing', 'files'\]\)/.test(tabs),
    'a job has a Files tab under Docs, on a development too')
  ok(/\/api\/files\/jobs\?job=/.test(pageF) && /oneJob/.test(pageF) && /searchParams\.get\('job'\)/.test(api)
    && api.indexOf("searchParams.get('job')") > api.indexOf('RESTRICTED_ROLES.includes'),
    '...read through the same route as Files > Job Files, narrowed AFTER its fences - ?job= can only narrow')
}
{
  // "how am i able to select any - some i never said i need it, some i closed already"
  ok(bulkMisfit('answer', 'Building', { court: 'them' }) === null, 'an answer fits only a permit with the city')
  ok(/mark it as sent first/.test(bulkMisfit('answer', 'Building', { court: 'none' }) ?? '')
    && /issued or closed/.test(bulkMisfit('answer', 'Building', { court: 'done' }) ?? '')
    && /No Building permit/.test(bulkMisfit('answer', 'Building', null) ?? ''),
    '...and says why for one never sent, one closed, and a house with none')
  ok(bulkMisfit('submit', 'Building', { court: 'none' }) === null && bulkMisfit('submit', 'Building', { court: 'us' }) === null
    && !!bulkMisfit('submit', 'Building', { court: 'done' }) && !!bulkMisfit('submit', 'Building', { court: 'them' }),
    'mark as sent fits a permit not yet sent or back with you - never one with the city or finished')
  ok(bulkMisfit('add', 'Building', null) === null && !!bulkMisfit('add', 'Building', { court: 'none' }), 'add fits a house without one')
  const board = code('components/permits/permit-board.tsx')
  ok(/disabled=\{!!why && !picked\.has\(r\.id\)\}/.test(board) && /const fitsFor = \(a: BulkAction, t: string, adding: string\[\] = addTypes\) => rows\.filter\(r => !misfit\(/.test(board),
    'the dialog greys out a house that does not fit, says why, and "select the ones that fit" asks the same rule')
  ok(/role="alert" className="flex items-start gap-2 rounded-lg border border-danger\/30 bg-danger-tint px-3 py-2 text-sm/.test(board),
    'a refusal is a visible box, not a 12px line - "record an answer didn\'t do anything"')
  const route = code('app/api/projects/[id]/permit-board/route.ts')
  ok(/const why = bulkMisfit\('submit', permitType, permitStanding\([^\n]*\n\s*if \(why\) \{ say\(false, why\); continue \}/.test(route),'the route refuses the same houses the dialog greys out')
  ok(/function addCustom\(raw: string\)/.test(board) && /onCreate=\{addCustom\}/.test(board), 'a custom permit can be named and added in bulk, from the dropdown\'s search box')
  const pg = code('app/(dashboard)/projects/[id]/permits/page.tsx')
  ok((pg.match(/placeholder="Name the permit, e\.g\. Tree Removal"/g) ?? []).length === 2 && /Other - name it/.test(pg),
    '...and in Add Permit, both forms - "Other" asks for the name')
}
// "add asks makes sense to mark as sent?" - the label was jargon. Corrections
// recorded with no list read as what they are: it needs changes.
ok(!/'Add asks'/.test(code('lib/permit-rounds.ts')) && /: st\.rejected \? 'Rejected' : 'Needs changes'/.test(code('lib/permit-rounds.ts')),
  'corrections with no list yet read "Needs changes", not "Add asks"')
done()
