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
  scheduleProblem, clearsBooking, inspectionDate,
  CONFIRMED_LABEL, REQUESTED_LABEL,
} from '../inspection-status'
import { whoToCall, callLine } from '../inspection-contacts'
import { ok, done, code, read, readCombined } from './_helpers'

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
ok(callLine([]) === '', 'and with nothing on file the notification says nothing rather than inventing a contact')
ok(/\(973\) 555-0188/.test(callLine(dupes)), '...but with a number it hands it over in one line')

// ── the request never books itself ──────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
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

// ── the screen answers "now what?" ──────────────────────────────────────────
ok(/SyteNav does not contact the inspector/.test(page),
  'THE QUESTION: the card says outright that nobody here emails the inspector')
ok(/callTargets/.test(page) && /tel:\$\{t\.phone\}/.test(page),
  '...and hands over a number to call rather than a blank the requester was meant to fill in')
ok(/No number on file/.test(page),
  'and when there is no number it says where to put one, instead of showing nothing')

// ── the route is the door, not the form ─────────────────────────────────────
const patch = code('app/api/projects/[id]/inspections/[inspectionId]/route.ts')
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
