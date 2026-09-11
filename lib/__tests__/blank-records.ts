// Two blank records, and they were blank for the same reason.
//
// Add Permit accepted a fully empty submit and filed "Building / pending". Add
// Inspection accepted one, filed "Foundation", and NOTIFIED THREE SCHEDULERS
// about it - "Inspection to book: Foundation at QA Ground-Up 2026".
//
// Neither of those names was typed by anybody. Both are `useState` defaults on
// a dropdown:
//
//     permits/page.tsx      useState('Building')
//     inspections/page.tsx  useState('Foundation')
//
// Which is why the records did not LOOK blank in a list, and why the `required`
// already sitting on both selects never fired: a select that starts on a value
// cannot fail constraint validation. A default on a required field is a claim
// nobody made - the same rule that caught `bid_invites.status DEFAULT 'invited'`
// asserting a sub had been told.
//
// The inspections route already had a guard of exactly this shape
// (`scheduleProblem` - "scheduled with no date") and it stood aside correctly:
// it fires on `scheduled`, and a request is `requested`.

import { permitProblem, GRANTED_STATUSES } from '../permit-rules'
import { requestProblem, scheduleProblem } from '../inspection-status'
import { ok, done, code } from './_helpers'

const FULL = {
  permit_type: 'Electrical', permit_number: '2024-EL-001234', description: 'Service upgrade',
  issuing_authority: 'Township', status: 'pending', issued_date: '', expiry_date: '',
}

// ── the blank one, named ────────────────────────────────────────────────────
ok(permitProblem({}) !== null, 'THE BUG: a blank permit is refused')
ok(/permit type/i.test(permitProblem({}) ?? ''), '...naming the field, not "invalid"')
ok(permitProblem({ permit_type: 'Building', status: 'pending' }) !== null,
  'a type and a status alone is still the blank record - both of those were defaults')
ok(/number|description|issuing/i.test(permitProblem({ permit_type: 'Building', status: 'pending' }) ?? ''),
  '...and it says which three things would fix it')

// ── but a permit you have APPLIED for still saves ───────────────────────────
ok(permitProblem({ permit_type: 'Building', status: 'pending', permit_number: '2024-B-99' }) === null,
  'a pending application with just a number saves - it has no issued date YET, which is what pending means')
ok(permitProblem({ permit_type: 'Building', status: 'pending', description: 'Rear addition' }) === null,
  '...and a description is enough on its own')
ok(permitProblem({ permit_type: 'Building', status: 'pending', issuing_authority: 'City of X' }) === null,
  '...so is who is issuing it')
ok(permitProblem(FULL) === null, 'a complete one saves')

// ── a status that CLAIMS something must carry it ────────────────────────────
for (const status of GRANTED_STATUSES) {
  const noNumber = permitProblem({ ...FULL, status, permit_number: '', issued_date: '2026-01-05' })
  ok(noNumber !== null, `"${status}" with no permit number is refused - it says the permit was issued`)
  ok(/permit number/i.test(noNumber ?? ''), `  ...naming it (${status})`)
  const noDate = permitProblem({ ...FULL, status, issued_date: '' })
  ok(noDate !== null && /issued/i.test(noDate), `"${status}" with no issued date is refused`)
  ok(permitProblem({ ...FULL, status, issued_date: '2026-01-05' }) === null, `  ...and a complete "${status}" saves`)
}
ok(permitProblem({ ...FULL, status: 'expired', expiry_date: '' }) !== null,
  '"expired" with no expiry date is refused - something expired, so there is a date')
ok(permitProblem({ ...FULL, status: 'expired', expiry_date: '2026-01-05' }) === null, '...and with one it saves')
ok(!/undefined|null/.test([permitProblem({}), permitProblem({ permit_type: 'Building' })].join(' ')),
  'and no message leaks an undefined into a sentence somebody reads')

// ── the request that reached three people ───────────────────────────────────
ok(requestProblem('', '2026-10-01') !== null, 'THE BUG: a request with no inspection type is refused')
ok(requestProblem('Foundation', '') !== null, '...and one with no date is refused')
ok(/date/i.test(requestProblem('Foundation', '') ?? ''),
  '...naming the date, which is the whole content of asking somebody to book something')
ok(requestProblem('Foundation', '2026-10-01') === null, 'a real request goes through')
ok(requestProblem(null, null) !== null && requestProblem('  ', '  ') !== null,
  'whitespace is not an answer')

// The guard that was already here is untouched - it answers a different
// question and both are asked.
ok(scheduleProblem('scheduled', '', 'Newark BD') !== null, 'scheduled with no date is still refused')
ok(scheduleProblem('requested', '') === null, '...and it still stands aside for a request, correctly')

// ── the defaults that made both records look filled in ──────────────────────
const permits = code('app/(dashboard)/projects/[id]/permits/page.tsx')
const inspections = code('app/(dashboard)/projects/[id]/inspections/page.tsx')
ok(/useState\('' as string\)|const \[permitType, setPermitType\] = useState\(''\)/.test(permits),
  'THE CAUSE: the permit type starts empty, so the `required` beside it can fire')
ok(/const \[inspType, setInspType\] = useState\(''\)/.test(inspections),
  '...and so does the inspection type')
ok(/<option value="">-- Select permit type --<\/option>/.test(permits)
  && /<option value="">-- Select inspection --<\/option>/.test(inspections),
  'both selects offer the empty choice, or an empty state has nothing to show')
for (const [what, src, reset] of [
  ['permits', permits, /setPermitType\(''\)/],
  ['inspections', inspections, /setInspType\(''\)/],
] as const) {
  ok(reset.test(src), `${what} resets to empty too, or the second record inherits the first`)
}

// ── asked at the field, AND at the door ─────────────────────────────────────
ok(/const problem = permitProblem\(\{/.test(permits), 'the permit form asks before it sends')
ok(/const problem = requestProblem\(inspType, requestedDate\)/.test(inspections),
  'the inspection form asks before it sends')

const permitRoute = code('app/api/projects/[id]/permits/route.ts')
const permitPatch = code('app/api/projects/[id]/permits/[permitId]/route.ts')
const inspRoute = code('app/api/projects/[id]/inspections/route.ts')
ok(/permitProblem\(/.test(permitRoute), 'and the route asks too - the form is not the only door')
ok(/permitProblem\(after\)/.test(permitPatch),
  '...including the EDIT route, against the row as it will be - clearing the number on an active permit was one keystroke')
ok(/requestProblem\(inspection_type, requested_date\)/.test(inspRoute), 'same for an inspection request')

// THE DAMAGE WAS THE NOTIFICATION, so the refusal has to come first.
ok(inspRoute.indexOf('requestProblem(') < inspRoute.indexOf('await notify('),
  'and it is refused BEFORE notify - or three people are told about a request that was rejected')

done()
