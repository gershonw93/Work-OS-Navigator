// The inspection nobody booked, on a date nobody confirmed.
//
// Reported as a product question rather than a bug: "inspector got the
// notification - now what? ... just click on past the scheduled date says when
// I want it to happen but not when it's gonna happen. It's the requested date."
//
// Three faults under it, and the third was the worst:
//
//  1. NOBODY EMAILS THE INSPECTOR. The notification goes to whoever books
//     inspections at the company. Nothing on the screen said so, so the answer
//     to "now what" was nowhere.
//  2. ONE COLUMN HELD TWO FACTS. The request form wrote the requester's
//     PREFERRED date into `scheduled_date`, and the card labelled it
//     "Scheduled Date". The one-click Scheduled pill was guarded by "is there a
//     date?" - and there always was one, because the requester had typed it.
//     So one tap turned a wish into a confirmed appointment.
//  3. AND IT WAS ALREADY ON EVERYONE'S CALENDAR. The master calendar and the
//     subscribed ICS feed include ANY inspection carrying a `scheduled_date`,
//     whatever its status. Fourteen merely-requested rows were sitting in
//     people's Outlook and Google feeds as booked appointments. Nobody reported
//     it because a calendar entry looks right until you ring the inspector.

import {
  scheduleProblem, clearsBooking, clearsCompletion, canCarryCompletion,
  inspectionDate, INSPECTION_STATUSES, CONFIRMED_LABEL, REQUESTED_LABEL,
} from '../inspection-status'
import { whoToCall, callLine, callTargetsFor } from '../inspection-contacts'
import { ok, done, code, read, readCombined } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
const patch = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')

// ── a booking is a thing somebody DID ───────────────────────────────────────
ok(scheduleProblem('scheduled', '', 'Newark BD') !== null,
  'scheduled with no date is refused, as it always was')
ok(scheduleProblem('scheduled', '2026-09-25', '') !== null,
  'THE BUG: scheduled WITH a date but nobody spoken to is refused - the date was the requester\'s own wish')
ok(/who you booked it with|booked it with/i.test(scheduleProblem('scheduled', '2026-09-25', '') ?? ''),
  '...and it names what is missing rather than saying "invalid"')
ok(scheduleProblem('scheduled', '2026-09-25', '  ') !== null, 'whitespace is not a phone call')
ok(scheduleProblem('scheduled', '2026-09-25', 'Newark Building Dept - Maria') === null,
  'a real booking goes through')
ok(scheduleProblem('requested', '2026-09-25') === null,
  'and it still stands aside for a request, which is a different question')

// ── moving back to unbooked takes the booking with it ───────────────────────
ok(clearsBooking('requested') && clearsBooking('not_scheduled'),
  'putting it back to requested clears the booking')
ok(!clearsBooking('scheduled') && !clearsBooking('passed') && !clearsBooking('failed'),
  '...and never touches one that is real')

// ── requested AND completed at the same time ────────────────────────────────
//
// Reported from a screenshot: a card reading "Requested" with "Completed
// Sep 24, 2026" beside it and a Book it button underneath. The inspector's-card
// scan wrote the date printed on the paperwork straight onto the row and asked
// about the RESULT separately, so declining "the card looks PASSED, mark it
// passed?" left a record asserting it was both unbooked and finished.
// `clearsCompletion` never saw it: that fires on a status MOVE, and no status
// moved.
ok(canCarryCompletion('passed') && canCarryCompletion('failed'),
  'a finished inspection carries a completion date')
for (const st of INSPECTION_STATUSES.filter(x => x !== 'passed' && x !== 'failed')) {
  ok(!canCarryCompletion(st), `THE BUG: "${st}" may not carry one - it is not finished`)
}
ok(!canCarryCompletion(undefined) && !canCarryCompletion('nonsense'),
  'and a status nobody recognises certainly may not')
for (const st of INSPECTION_STATUSES) {
  ok(!(clearsCompletion(st) && canCarryCompletion(st)),
    `"${st}" is never both cleared and allowed - the two halves of one rule cannot disagree`)
}

{
  const card = code('app/api/projects/[id]/inspections/[inspectionId]/card/route.ts')
  ok(/canCarryCompletion\(\(existing as any\)\?\.status\)/.test(card),
    'THE FIX: the scan only fills a completion date on a row that is already finished')
  const fills = card.split("fillIfEmpty('completed_date'")
  ok(fills.length === 2, 'the completion fill happens in exactly one place (fixture sanity)')
  const above = fills[0].split('\n').map(l => l.trim()).filter(Boolean).pop() ?? ''
  ok(/^if \(canCarryCompletion\(.*\) \{$/.test(above),
    `...and the line immediately above it is the guard, not nothing (saw: ${above.slice(0, 60)})`)
  ok(/suggested_completed_date: fields\?\.completed_date/.test(card),
    'and the date it read is handed back to be applied WITH the result')
}
ok(/completed_date: completedOn \|\| todayDateInput\(\)/.test(page),
  'THE SECOND HALF: accepting the suggestion stamps the date PRINTED ON THE CARD, not today')
ok(/updateStatus\(insp, data\.suggested_status, undefined, data\.suggested_completed_date\)/.test(page),
  '...which means reading it off the response rather than throwing it away')
ok(/if \('completed_date' in updates && updates\.completed_date\)/.test(patch)
  && /!canCarryCompletion\(effectiveStatus\)/.test(patch),
  'and the route refuses the pairing rather than dropping it - a silent drop answers 200')

// ── two dates, one label each ───────────────────────────────────────────────
const asked = inspectionDate({ requested_date: '2026-09-25', scheduled_date: null })
ok(asked.label === REQUESTED_LABEL && asked.value === '2026-09-25' && !asked.confirmed,
  'an unbooked inspection reads "Needed by", from its REQUESTED date')
const booked = inspectionDate({ requested_date: '2026-09-25', scheduled_date: '2026-09-30' })
ok(booked.label === CONFIRMED_LABEL && booked.value === '2026-09-30' && booked.confirmed,
  '...and a booked one reads "Confirmed for", from the date the jurisdiction gave')
ok(inspectionDate({ requested_date: null, scheduled_date: null }).value === null,
  'no dates at all is no date, not an empty string rendering as a blank line')
ok(inspectionDate({ requested_date: '2026-09-25', scheduled_date: '   ' }).confirmed === false,
  'a whitespace booked date is not a booking')

// ── who to call, gathered rather than retyped ───────────────────────────────
const targets = whoToCall({
  inspection: { scheduling_phone: '(973) 555-0100', inspector_name: 'Ray Diaz', inspector_phone: null },
  permits: [{ permit_type: 'Building', issuing_authority: 'City of Newark', inspector_name: 'M. Cole', inspector_phone: '(973) 555-0188' }],
  contacts: [{ name: 'County Fire Marshal', type: 'inspector', phone: '(973) 555-0222', extra: { jurisdiction: 'Essex County' } }],
})
ok(targets.length >= 3, 'the inspection, the permit and the Directory all contribute a number')
ok(targets[0].phone === '(973) 555-0100', 'what this inspection already carries comes first')
ok(targets.some(t => t.phone === '(973) 555-0188' && /Newark/.test(t.source)),
  'the permit\'s inspector is offered, and it says which permit it came from')
ok(targets.some(t => /Essex County/.test(t.source)), 'a Directory inspector says its jurisdiction')
ok(whoToCall({ contacts: [{ name: 'Bob', type: 'subcontractor', phone: '(973) 555-0333' }] }).length === 0,
  'a subcontractor in the Directory is not somebody to call about an inspection')
const dupes = whoToCall({
  inspection: { inspector_name: 'M. Cole', inspector_phone: '(973) 555-0188' },
  permits: [{ permit_type: 'Building', inspector_name: 'M. Cole', inspector_phone: '973-555-0188' }],
})
ok(dupes.length === 1, 'the same number written two ways is one person, not two')
// ONE LIST PER CARD. The route sends the project-level numbers; the card's own
// inspector and scheduling line used to be printed separately a band above them.
const merged = callTargetsFor(
  { scheduling_phone: '(973) 555-0100', inspector_name: 'Ray Diaz' },
  [{ name: 'M. Cole', phone: '(973) 555-0188', source: 'From the Building permit' },
   { name: 'Ray Diaz', phone: '973-555-0100', source: 'Directory' }],
)
ok(merged[0].phone === '(973) 555-0100', "the inspection's own number leads the merged list")
ok(merged.length === 2, 'THE DUPLICATE: the same line from the route and the inspection appears once, not twice')
ok(callTargetsFor(null, [{ name: 'M. Cole', phone: '1', source: 'permit' }]).length === 1,
  'a booked inspection contributes nothing of its own and still gets the shared list')

ok(callLine([]) === '', 'and with nothing on file the notification says nothing rather than inventing a contact')
ok(/\(973\) 555-0188/.test(callLine(dupes)), '...but with a number it hands it over in one line')

// ── the request never books itself ──────────────────────────────────────────
ok(!/form\.append\('status', scheduledDate \? 'scheduled'/.test(page),
  'THE BUG: filling in the date you wanted no longer files the inspection as already arranged')
ok(/form\.append\('status', schedulerId \? 'requested' : 'not_scheduled'\)/.test(page),
  '...a create is a request, every time')
ok(/form\.append\('requested_date', requestedDate\)/.test(page),
  'and the date it carries is posted as the REQUESTED one')

// ── booking is a dialog, not a pill ─────────────────────────────────────────
ok(/newStatus === 'scheduled' && !insp\.booked_with/.test(page) && /openBooking\(insp\)/.test(page),
  'tapping Scheduled opens the booking dialog instead of flipping the status')
ok(/scheduleProblem\('scheduled', bookDate, bookWith\)/.test(page),
  'the dialog asks the same module the route asks, at the field, before sending')
const dialog = page.slice(page.indexOf('{booking && ('), page.indexOf('{showForm && ('))
ok(dialog.length > 400, 'the booking dialog is really in the file (fixture sanity)')
ok(/data-overlay/.test(dialog), '...and it is an overlay, so the background freezes and the notch is padded')
ok(/row-even/.test(dialog), '...with a footer that reaches both edges on a phone')

// ── one action row, and one door into booking ───────────────────────────────
//
// Reported after #432 shipped: "the Scheduled pill is still sitting in the
// status row. If Book it is the real path now, that pill is a second door to
// the same room - and if it still one-taps, the old bug is still alive."
//
// It did not one-tap (it redirected into the dialog), and that is not good
// enough: a control that quietly redirects teaches the old habit and is one
// refactor away from being the bug again.
ok(!/\['requested', 'scheduled', 'passed', 'failed', 'pending_reinspection'\]\.map/.test(page),
  'THE BUG: the five-pill "Update status:" strip is gone')
ok(!/Update status:/.test(page), '...label and all')
{
  // Every status a CLICK can set from the card, read out of the handlers.
  const clickable = Array.from(page.matchAll(/updateStatus\(insp, '([a-z_]+)'\)/g)).map(m => m[1])
  ok(clickable.length > 0, 'the scan can see the status handlers at all (fixture sanity)')
  ok(!clickable.includes('scheduled'),
    'NO CONTROL SETS "scheduled" DIRECTLY - booking has exactly one door, and it is the dialog')
  ok(clickable.includes('passed') && clickable.includes('failed'),
    '...while a result is still one press')
}
ok(/<RowMenu label=\{`More for the \$\{insp\.type\} inspection`\}/.test(page),
  'the rest is behind RowMenu, the same cure client invoices and bid invites use')

// A RESULT NEEDS A VISIT SOMEBODY ARRANGED.
ok(/const booked = !!insp\.scheduled_date/.test(page), 'booked means it carries a confirmed date')
ok(/\{canRecordResult && \(/.test(page),
  'Passed and Failed only exist once it is booked - you cannot pass an inspection nobody arranged')

// THE CLIPPING TRAP, which is invisible until somebody opens the menu.
{
  const card = page.slice(page.indexOf("const cfg = STATUS_CONFIG"), page.indexOf('{isExpanded && ('))
  ok(card.length > 200, 'the card wrapper is really in the slice (fixture sanity)')
  ok(!/overflow-hidden/.test(card),
    'the card has no overflow-hidden - it clips on BOTH axes and would slice the menu off its bottom edge')
}

// ── the orphan line, and the band that did not belong ───────────────────────
ok(!/\{insp\.notes && <p className="text-sm text-muted-fg/.test(page),
  'THE BUG: notes is no longer a bare unlabelled paragraph floating mid-card')
ok(/<p className="text-xs text-faint">Notes<\/p>/.test(page), '...it carries a label like every other fact')
ok(/<p className="text-xs text-faint">Marked ready<\/p>/.test(page),
  'and "marked ready" is a fact in the grid, not a green band repeating the header badge')
ok(/const showCardBlock = /.test(page) && /\{showCardBlock && \(/.test(page),
  "the inspector's-card block is gated - a request has no card to upload yet")
ok(/Add inspector's card<\/MenuItem>|\{insp\.card_image_url \? "Replace inspector's card" : "Add inspector's card"\}/.test(page),
  '...and it stays reachable from the menu, so gating it hides nothing')
{
  // The input the menu item clicks must be mounted whatever the gate says.
  const gate = page.indexOf('{showCardBlock && (')
  const input = page.indexOf('ref={el => { cardInputRefs.current[insp.id] = el }}')
  ok(input > -1 && gate > -1 && input < gate,
    'the file input sits OUTSIDE the gate - inside it, the menu item does nothing on exactly the states the block is hidden for')
}

// ── the shape of the card on a wide screen ──────────────────────────────────
//
// Reported against a ~1550px card: "how can we move things around and align
// properly - too much dead space on the right." Every band was a strip of text
// with a quarter-mile of nothing beside it, and the attached card rendered as a
// ~200px slab with a SECOND band under it saying the same thing.
ok(/lg:grid-cols-\[minmax\(0,1fr\)_24rem\]/.test(page),
  'THE FIX: the body is two columns on a wide screen - facts left, what-to-do-next right')
ok(!/lg:grid-cols-\[1fr_24rem\]/.test(page),
  '...written minmax(0,1fr), never a bare 1fr - a grid child is min-width:auto, so a long '
  + 'unbroken value can push the COLUMN past its share. A convention, ratcheted as source: '
  + 'overflow-wrap:anywhere already covers prose, so it cannot be measured here')
ok(/hasAside && 'lg:grid/.test(page),
  'and the split only applies when the right column has something in it')
ok(/const hasAside = needsBookingCall \|\| showCardBlock/.test(page),
  '...which is what "something in it" means')
{
  // `space-y-*` is `> * + *` margins and survives into the grid, fighting the gap.
  const body = page.slice(page.indexOf("'border-t border-line-soft px-5 py-5"), page.indexOf('grid-cols-2 md:grid-cols-3'))
  ok(body.length > 40 && /flex flex-col gap-4/.test(body), 'the body lays out with gap, not space-y (fixture sanity)')
  ok(!/space-y-/.test(body), '...or the margins fight the grid gap')
}
ok(/lg:col-span-2 lg:flex lg:items-center/.test(page),
  'the action row runs under both columns')
ok(!/lg:ml-auto/.test(page),
  'THE STRANDED MENU: the actions are one cluster, not a button on one edge and a menu 1400px away')

// ONE BAND ABOUT THE DOCUMENT, not two.
ok(!/max-h-48/.test(page),
  'THE SLAB: the standalone card image is gone - a photo of a form is not read at a glance')
ok(!/<img src=\{insp\.card_image_url\}/.test(page), '...no image on the card at all')
{
  const block = page.slice(page.indexOf('{showCardBlock && ('), page.indexOf('row-even lg:col-span-2'))
  ok(block.length > 400, 'the attachment block is really in the slice (fixture sanity)')
  ok(/View full image/.test(block),
    'and the link the image block was carrying lives in the attachment band now - one band, not two')
  ok(/min-h-11[\s\S]{0,400}?lg:min-h-0/.test(block),
    '...with controls a thumb can hit; they were py-1.5 text-xs at every width')
}

// ── one list of numbers, not two ────────────────────────────────────────────
ok(/callTargetsFor\(needsBookingCall \? insp : null, callTargets\)/.test(page),
  "the card merges the inspection's own numbers into the shared list")
ok(/\{!needsBookingCall && insp\.scheduling_phone && \(/.test(page),
  '...and the details grid stops printing them a band above the call block')

// ── the screen answers "now what?" ──────────────────────────────────────────
ok(/SyteNav does not contact the inspector/.test(page),
  'THE QUESTION: the card says outright that nobody here emails the inspector')
ok(/calls\.slice\(0, 4\)/.test(page) && /tel:\$\{t\.phone\}/.test(page),
  '...and hands over a number to call rather than a blank the requester was meant to fill in')
ok(/No number on file/.test(page),
  'and when there is no number it says where to put one, instead of showing nothing')

// ── the route is the door, not the form ─────────────────────────────────────
ok(/scheduleProblem\('scheduled', effective, effectiveWith\)/.test(patch),
  'the PATCH route refuses a booking with nobody spoken to')
ok(/'booked_with',/.test(patch) && /'booking_reference',/.test(patch) && /'requested_date',/.test(patch),
  'and every column the form posts is on the whitelist - a missing one answers 200 and drops the write')
ok(!/'booked_at',\s*\n\s*'booked_by_name',/.test(patch),
  'booked_at/booked_by_name are NOT on it - they are derived, or a client could date a booking to last year')
ok(/updates\.booked_at = new Date\(\)\.toISOString\(\)/.test(patch), '...they are stamped by the route')
ok(/clearsBooking\(updates\.status\)/.test(patch) && /updates\.scheduled_date = null/.test(patch),
  'moving back to requested clears the booked date, or it stays in everyone\'s Outlook')

const post = code('app/api/projects/[id]/inspections/route.ts')
ok(/requested_date: requested_date \|\| null/.test(post), 'a created request stores its requested date')
ok(/const scheduled_date = booked_with \? /.test(post),
  'THE BUG: a create only books something when it says who it was booked with')
ok(/whoToCall\(/.test(post) && /callLine\(/.test(post),
  'the notification carries the number too, so the scheduler has it before opening anything')

// ── and it reads the table the app actually writes to ───────────────────────
//
// THE BUG I SHIPPED IN #432. This queried `contacts` for Directory inspectors,
// and `contacts` holds ZERO ROWS - every door that files an inspector (the
// picker's Quick add, the permits page, Add Contact) POSTs to /api/directory,
// which inserts into `companies`. So the Directory half of "who do I call" has
// never produced one line. Not an error and not an empty state anybody could
// see: a query against the wrong table comes back `[]`, which renders exactly
// like "you have not added any".
ok(!/from\('contacts'\)/.test(post),
  'THE BUG: the inspections route no longer reads `contacts`, which has no rows')
ok(/from\('companies'\)[\s\S]{0,120}?\.eq\('type', 'inspector'\)/.test(post),
  "...it reads `companies` where the app actually files them")
ok(/added_by_company_id\.eq\.\$\{owner\}/.test(post),
  'and it is scoped to the job\'s own company - an address book is not shared')
ok(!/from\('contacts'\)/.test(code('app/api/directory/route.ts')),
  'and the directory route stopped returning an always-empty contacts array beside it')

// ── the calendar and the feed only ever see booked rows ─────────────────────
for (const f of [
  'app/api/master/calendar/route.ts',
  'app/api/calendar/[token]/route.ts',
]) {
  const src = code(f)
  ok(/from\('inspections'\)[\s\S]{0,200}?\.not\('scheduled_date', 'is', null\)/.test(src),
    `${f.split('/').slice(-2)[0]} only shows inspections with a booked date`)
}
const seed = code('lib/seed-demo.ts')
ok(/scheduled_date: isBooked \? wanted : null/.test(seed),
  'and the demo seed cannot re-create the bug: a requested row gets no booked date')

// ── and the rows that got in before the guard existed ───────────────────────
for (const [what, sql] of [
  ['101_completion_belongs_to_a_finished_inspection.sql',
    read('supabase/migrations/101_completion_belongs_to_a_finished_inspection.sql')],
  ['the combined fallback', readCombined()],
] as const) {
  ok(/SET completed_date = NULL/.test(sql), `${what}: the false completion dates are cleared`)
  ok(/NOT IN \('passed', 'failed', 'void'\)/.test(sql),
    `${what}: ...and VOID is excluded - the restore path reads completed_date to decide `
    + 'whether an inspection comes back passed or unbooked, so clearing it changes what restore does')
}

// ── the migration, both steps, in that order ────────────────────────────────
for (const [what, sql] of [
  ['100_inspection_booking.sql', read('supabase/migrations/100_inspection_booking.sql')],
  ['the combined fallback', readCombined()],
] as const) {
  const copy = sql.indexOf('SET requested_date = scheduled_date')
  const clear = sql.indexOf('SET scheduled_date = NULL')
  ok(copy > -1, `${what}: the requested date is backfilled from the old column`)
  ok(clear > -1, `${what}: ...and the false booking is cleared`)
  ok(copy > -1 && clear > -1 && copy < clear,
    `${what}: COPY BEFORE CLEAR - the other order loses the date on every requested row`)
  ok(/ADD COLUMN IF NOT EXISTS booked_with text/.test(sql), `${what}: the record of the call is there`)
}

done()
