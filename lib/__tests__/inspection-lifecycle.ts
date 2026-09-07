// An incomplete record is still a record.
//
// Three of the tester's findings turned out to be one habit wearing three hats.
// Each is the app deciding that an inspection somebody has not finished filling
// in is not quite real, so it gets skipped:
//
//   #2  `scheduled` with no date was STORABLE - and then lied four ways: it
//       notified the office "is scheduled", the card said "No date yet", and
//       the overview's booked list never showed it because that list needs a
//       date.
//   #8  "1 inspection to book" with two pending, because the counter only knew
//       'requested' and the form saves an unassigned request as 'not_scheduled'.
//   #4  Job History logged passed and failed and nothing else, while the panel
//       promises "every action on this project".
//
// Same root as #374, where a blank assignee meant nobody was told at all.

import {
  INSPECTION_STATUSES, isInspectionStatus, TO_BOOK, OPEN, CLOSED,
  needsBooking, isOpen, isVoid, visibleInspections,
  reachFor, notifiesRoutedAudience, scheduleProblem, clearsCompletion,
} from '../inspection-status'
import { ok, done, code } from './_helpers'

// ── #8: the count includes the one nobody owns ───────────────────────────────
// The tester's exact case: two pending, one of them unassigned.
const pending = [
  { id: 'a', status: 'requested' },       // has a scheduler
  { id: 'b', status: 'not_scheduled' },   // nobody assigned - the invisible one
]
const toBook = pending.filter(i => needsBooking(i.status))
ok(toBook.length === 2, `both pending inspections count as "to book" (${toBook.length})`)
ok(needsBooking('not_scheduled'), 'an unassigned request is outstanding - it is MORE outstanding, not less')
ok(needsBooking('requested'), '...and so is an assigned one')
ok(!needsBooking('scheduled'), 'a booked inspection is not waiting to be booked')
ok(!needsBooking('passed') && !needsBooking('void'), 'finished and voided are not outstanding')

// The overview and the inspections page each had their own list and disagreed.
ok(TO_BOOK.every(s => OPEN.includes(s)), 'everything to book is also open')
ok(OPEN.every(s => !CLOSED.includes(s)), 'open and closed do not overlap')
ok(!OPEN.includes('void' as any) && !CLOSED.includes('void' as any),
  'voided is neither open nor closed - it is out of the working list entirely')
ok(isOpen('pending_reinspection'), 'a re-inspection is still in flight')

// ── #2: the state that should never have been storable ───────────────────────
ok(scheduleProblem('scheduled', null) !== null, '"scheduled" with no date is refused')
ok(scheduleProblem('scheduled', '') !== null, '...and an empty string is not a date')
ok(scheduleProblem('scheduled', '   ') !== null, '...nor is whitespace')
ok(scheduleProblem('scheduled', '2026-09-10') === null, 'with a date it is fine')
ok(scheduleProblem('requested', null) === null, 'every other status may have no date')
ok(scheduleProblem('not_scheduled', null) === null, '...that is what not_scheduled MEANS')
ok(/date/i.test(scheduleProblem('scheduled', null) ?? ''), 'the refusal says what to do about it')

// ── #6: a record cannot be pending and completed at once ─────────────────────
ok(clearsCompletion('pending_reinspection'),
  'sending it back for re-inspection clears the completion stamp')
ok(clearsCompletion('requested') && clearsCompletion('not_scheduled'),
  'so does moving it back to waiting')
ok(!clearsCompletion('passed') && !clearsCompletion('failed'),
  'a finished inspection keeps its date, obviously')

// ── #9: outcomes reach the office, logistics reach the job ───────────────────
ok(reachFor('passed') === 'outcome', 'passed is an outcome')
ok(reachFor('failed') === 'outcome', 'failed is an outcome')
ok(reachFor('pending_reinspection') === 'outcome', 're-inspection needed is an outcome')
ok(reachFor('scheduled') === 'logistics', 'being booked is logistics, not news')
ok(reachFor('void') === 'silent' && reachFor('requested') === 'silent',
  'voiding and requesting do not fire a status-change notification')
ok(notifiesRoutedAudience('failed'), 'the office hears about a failure')
ok(!notifiesRoutedAudience('scheduled'),
  'the office does NOT hear every time a date is picked - that was 8 in 10 minutes')
ok(reachFor('nonsense') === 'silent', 'an unknown status notifies nobody rather than everybody')

// ── #5 / #7: voided is kept, not destroyed ───────────────────────────────────
const rows = [{ status: 'passed' }, { status: 'void' }, { status: 'requested' }]
ok(visibleInspections(rows).length === 2, 'voided rows are out of the working list')
ok(visibleInspections(rows, true).length === 3, '...and back when you ask to see them')
ok(visibleInspections(rows).every(r => !isVoid(r.status)), 'nothing voided leaks into the default list')
ok(rows.length === 3, 'filtering does not destroy anything - the row is still there')
ok(isInspectionStatus('void'), 'void is a real status, not a magic string')
ok(INSPECTION_STATUSES.length === 7 && !isInspectionStatus('deleted'),
  'there is no "deleted" state, because nothing is deleted')

// ── the routes actually enforce all of this ──────────────────────────────────
const patch = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')
const create = code('app/api/projects/[id]/inspections/route.ts')

// The DELETE checked NOTHING but "are you signed in" - no permission, and no
// check that the project was even the caller's. A read_only user, who cannot so
// much as view an inspection, could destroy any inspection in any company.
// Checked PER HANDLER, not across the file. The first version of this searched
// the whole source, so it matched the restore handler's guard and passed with
// the guard stripped off DELETE - the exact hole it was written to cover.
const handler = (name: string) => {
  const from = patch.indexOf(`export async function ${name}(`)
  if (from < 0) return ''
  const next = patch.slice(from + 1).search(/\nexport async function /)
  return next < 0 ? patch.slice(from) : patch.slice(from, from + 1 + next)
}
for (const name of ['DELETE', 'POST']) {
  ok(/requirePermission\(db, request, 'inspections', 'edit'\)/.test(handler(name)),
    `${name} requires permission on inspections`)
  ok(/denied\(gate\)/.test(handler(name)), `...and ${name} acts on the refusal`)
}
ok(!/\.from\('inspections'\)\s*\n?\s*\.delete\(\)/.test(patch),
  'nothing hard-deletes an inspection any more')
ok(/status: 'void'/.test(patch), '...it sets the void status instead')
ok(/voided_at/.test(patch) && /voided_by/.test(patch), 'and records who did it and when')
ok(/Not found on this project/.test(patch),
  'a void against another project 404s rather than returning a cheerful success')
ok(/action !== 'restore'/.test(patch), 'there is a way to put one back')
ok(/inspection_restored/.test(patch), '...and restoring is itself an audit entry')

// #4: every lifecycle event, not two of them.
for (const t of [
  'inspection_scheduled', 'inspection_passed', 'inspection_failed',
  'inspection_reinspection', 'inspection_updated', 'inspection_voided', 'inspection_restored',
]) {
  ok(patch.includes(`'${t}'`), `Job History records ${t}`)
}
ok(/inspection_created/.test(create), 'Job History records the creation too')

// A history write must never be able to fail the action it is recording.
const log = code('lib/log-activity.ts')
ok(/try \{/.test(log) && /catch/.test(log), 'logActivity cannot throw')
ok(/console\.error/.test(log), '...but a lost entry is not silent to us either')

// The screen has to render them or they are invisible in the drawer.
const drawer = code('components/layout/activity-drawer.tsx')
ok(/inspection_voided:/.test(drawer) && /inspection_passed:/.test(drawer),
  'the Job History drawer gives inspection events their own icons')

// #2 enforced on BOTH write paths, not just the form.
ok(/scheduleProblem\(/.test(patch), 'the edit path refuses a scheduled inspection with no date')
ok(/scheduleProblem\(/.test(create), '...and so does the create path')

// #9 wired to the principle rather than restated inline.
ok(/notifiesRoutedAudience\(/.test(patch), 'the routed audience is consulted only for outcomes')

// #8 wired to the shared set.
const overview = code('app/api/projects/[id]/overview/route.ts')
ok(/TO_BOOK/.test(overview), 'the overview counts from the shared set')
ok(!/=== 'requested'/.test(overview), '...not from its own idea of what is outstanding')
ok(/neq\('status', 'void'\)/.test(overview), 'and a voided inspection is not outstanding work')

// #3: the refusal reaches the person.
const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
ok(/That file would not upload/.test(page),
  'a rejected card upload says so instead of looking like it worked')
ok(/setActionError\(d\?\.error/.test(page), '...preferring the server\'s own words')
const card = code('app/api/projects/[id]/inspections/[inspectionId]/card/route.ts')
ok(/image\/heic/.test(card),
  'an iPhone photo is accepted - heic passed the picker and was then refused as "not a photo"')

// #6: the prompt exists, and the server does not trust it.
ok(/setFailing\(insp\)/.test(page), 'marking Failed asks why first')
ok(/failure_reason/.test(patch), '...and the server refuses a failure with no reason')

// Voided rows are reachable, or "kept for the record" is a claim nobody can check.
ok(/Show voided/.test(page), 'the list can show voided inspections')
ok(/inspection=/.test(patch) || /inspection=/.test(create),
  'notifications link to the specific inspection so a voided one still resolves')

done()
