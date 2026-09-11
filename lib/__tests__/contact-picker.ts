// The inspector picker: a phone number that was a surname, and an offer to add
// what was already on the list.
//
// Both reported off one screenshot. The dropdown showed "QA Test Inspector"
// with a tick beside it AND, underneath, `Quick add "QA Test Inspector"…`. And
// a Quick add had produced this row in `companies`:
//
//     name: "John"   type: "inspector"   phone: "Dohr"
//     contact_email: "noemail+1789135005920@placeholder.com"
//
// That `noemail+<timestamp>` is the form's own signature, so the two words went
// into the two boxes and it saved them without a word - it validated nothing,
// and its Save button was `disabled` until a name was typed, which is a rule
// nobody is ever told about.
//
// It did not stay an untidy row: the inspections card offers every inspector's
// number as a tap-to-call link, so it became `<a href="tel:Dohr">` on every
// inspection on that job.

import { quickAddProblem, alreadyListed } from '../contact-quick-add'
import { whoToCall } from '../inspection-contacts'
import { ok, done, code, read, readCombined } from './_helpers'

// ── a phone number has a digit in it ────────────────────────────────────────
ok(quickAddProblem('John', 'Dohr') !== null, 'THE BUG: a surname in the phone box is refused')
ok(/phone number/i.test(quickAddProblem('John', 'Dohr') ?? ''), '...saying what the box is for')
ok(/name box/i.test(quickAddProblem('John', 'Dohr') ?? ''),
  '...and where the word probably belongs, since that is what happened')
ok(/Dohr/.test(quickAddProblem('John', 'Dohr') ?? ''), '...quoting what it refused, so it is not a riddle')
ok(quickAddProblem('', '') !== null && /name/i.test(quickAddProblem('', '') ?? ''),
  'and a nameless contact is refused, naming the field')
ok(quickAddProblem('  ', '201') !== null, 'whitespace is not a name')

// THE TEST IS DELIBERATELY LOOSE. Anything stricter refuses numbers this app
// already holds, and the thing to catch was a WORD.
for (const real of [
  '(201) 555-0143', '386-756-1105', '314.434.1200', '+1 201 555 0143',
  '321-638-0808 x2231', '2015550143', '(212) 555-0199',
]) {
  ok(quickAddProblem('City Inspections', real) === null, `a real number goes through: ${real}`)
}
ok(quickAddProblem('City Inspections', '') === null, 'and the phone stays optional')
ok(quickAddProblem('City Inspections', null) === null, '...including when it is not sent at all')

// ── and one already stored never becomes a tel: link ────────────────────────
const targets = whoToCall({ contacts: [{ name: 'John', type: 'inspector', phone: 'Dohr' }] })
ok(targets.length === 1 && targets[0].phone === null,
  'THE DAMAGE: a stored word is listed by name but is not offered as callable')
ok(whoToCall({ inspection: { inspector_name: 'John', inspector_phone: 'Dohr' } })[0].phone === null,
  '...on the inspection itself too')

// ── offering to add what is already there ───────────────────────────────────
ok(alreadyListed('QA Test Inspector', ['QA Test Inspector', 'Other']),
  'THE BUG: a name already on the list counts as listed')
ok(alreadyListed('  qa test inspector ', ['QA Test Inspector']),
  '...whatever the case and spacing, or the check is one nobody can satisfy')
ok(!alreadyListed('QA Test', ['QA Test Inspector']),
  'a PARTIAL match is not the same name - you may well be adding a second one')
ok(!alreadyListed('', ['QA Test Inspector']), 'and an empty box has matched nothing')

// ── the picker asks both questions ──────────────────────────────────────────
const picker = code('components/contact-picker.tsx')
ok(/const offerQuickAdd = !alreadyListed\(query, filtered\.map\(c => c\.name\)\)/.test(picker),
  'the offer is decided against the OPTIONS IN FRONT OF YOU, not the whole address book')
ok(/\{!showQuickAdd \? \(offerQuickAdd &&/.test(picker), '...and it gates the row')
ok(/const problem = quickAddProblem\(quickName, quickPhone\)/.test(picker),
  'the form asks before it sends')
ok(/disabled=\{saving\}/.test(picker) && !/disabled=\{saving \|\| !quickName\.trim\(\)\}/.test(picker),
  'THE GREYED-OUT RULE: Save fires and answers, rather than doing nothing silently')
ok(/setQuickError\(/.test(picker) && /role="alert"/.test(picker),
  '...and the answer is on the screen')
ok(/if \(!res\.ok \|\| !json\.company\)/.test(picker),
  'a refusal from the route is read, not thrown away')

const route = code('app/api/directory/route.ts')
ok(/quickAddProblem\(name, phone\)/.test(route),
  'and the route asks the same function - a form is not where invalid records are prevented')

// ── the migration for the rows that got in ──────────────────────────────────
for (const [what, sql] of [
  ['102_a_phone_number_has_a_digit_in_it.sql', read('supabase/migrations/102_a_phone_number_has_a_digit_in_it.sql')],
  ['the combined fallback', readCombined()],
] as const) {
  ok(/UPDATE companies[\s\S]{0,80}SET phone = NULL/.test(sql), `${what}: the word is cleared off the phone`)
  ok(/phone !~ '\[0-9\]'/.test(sql), `${what}: ...and only where there is no digit in it`)
  // Every column the statement assigns, read out of it rather than guessed at:
  // `!/SET name/` passed happily against `SET phone = NULL, name = '…'`.
  const assigned = (sql.match(/UPDATE companies\s+SET([\s\S]*?)WHERE/) ?? [])[1] ?? ''
  const cols = Array.from(assigned.matchAll(/([a-z_]+)\s*=/g)).map(m => m[1])
  ok(cols.length === 1 && cols[0] === 'phone',
    `${what}: THE NAME IS LEFT ALONE - it touches phone and nothing else (saw ${cols.join(', ') || 'nothing'})`)
}

done()
