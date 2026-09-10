// Add Subcontractor: the button at the bottom, the field it fills at the top,
// and nothing on the form saying what was actually needed.
//
// THE REPORT. The AI scan sat at the very end of the dialog and the Scope of
// Work it fills sat at the very start, with the whole form in between - so you
// scrolled past everything to scan, then scrolled back up to see what had
// changed, and the "AI filled the fields below" line pointed at nothing at all.
// And of eleven fields, one carried a red star, two said "(optional)" and the
// other eight said nothing - so payment terms and dates read as required when
// adding a sub should take a name and a trade.
//
// A THIRD SCOPE FIELD THAT HAD NO BOX. `subScope` is the plain-text summary the
// Schedule row, the Directory, the Tasks assignee dropdown, the team quick-view
// and the pay-app line all display as this sub's scope. The AI scan wrote it,
// the form submitted it, `openEditSub` loaded it back - and there was no input
// for it anywhere in the app. A wrong scan was uncorrectable by any route.
//
// (The same complaint was fixed on the QUOTE REQUEST form in #421. This is a
// different screen with the same fault, not a regression.)

import { ok, done, code } from './_helpers'

const src = code('app/(dashboard)/projects/[id]/team/page.tsx')
// The dialog only, so the team-member forms above it are not being measured.
const form = src.slice(src.indexOf('{showAddSub && ('), src.indexOf('{/* Header */}'))

// ── 1 + 2. the scan and the scope it fills are one block ────────────────────
const at = (needle: string) => {
  const i = form.indexOf(needle)
  ok(i > 0, `  (found: ${needle})`)
  return i
}
const scan = at('Attach proposal / contract')
const summary = at('Scope summary')
const items = at('Scope of Work - line items')
const trade = at('<Label>Trade')
const amount = at('Contract Amount')

ok(trade < scan, 'the form still opens with who they are and what they do')
ok(scan < summary && summary < items,
  'THE ASK: the scan comes first, then the scope it fills - one block, in the order the work happens')
ok(items < amount, '...and the money follows the scope, as it did')
ok(!/Attach proposal[\s\S]*Payment Schedule[\s\S]*Attach proposal/.test(form),
  'the scan is in one place, not left behind at the bottom as well')

// The scan is add-only. The SCOPE is not: editing a sub is the one time you
// most want to correct what the scan wrote, so it must not be swallowed by
// that guard.
const scanGuard = form.lastIndexOf('{!editingSubId && (', scan)
const scanGuardEnd = form.indexOf(')}', scan)
ok(scanGuard < scan && scan < scanGuardEnd, 'the scan itself is add-only, as it was')
ok(summary > scanGuardEnd && items > scanGuardEnd,
  'THE TRAP: neither scope field is inside that guard - they would vanish the moment you edit a sub')

// ── the field that had no box ───────────────────────────────────────────────
ok(/value=\{subScope\}/.test(form) && /onChange=\{e => setSubScope\(e\.target\.value\)\}/.test(form),
  'THE BUG: the scope summary is a real control - it is written, submitted and read back, and had no input at all')
ok(/fd\.append\('scope', subScope\)/.test(src) && /scope: subScope,/.test(src),
  '...on both doors, so an edit can fix what a scan got wrong')
ok(/if \(f2\.scope\) setSubScope\(f2\.scope\)/.test(src),
  '...and the scan still fills it, into a box you can now see')

// ── 3. every field says which it is ─────────────────────────────────────────
const labels = form.match(/<Label[^>]*>[\s\S]*?<\/Label>/g) ?? []
ok(labels.length >= 10, `the dialog has its fields (${labels.length} labels)`)
const unmarked = labels.filter(l => !/\(optional\)/.test(l) && !/text-danger">\*</.test(l))
ok(unmarked.length === 0,
  `THE ASK: every field is marked${unmarked.length ? ` - ${unmarked[0].slice(0, 70)}` : ''}`)
const required = labels.filter(l => /text-danger">\*</.test(l))
ok(required.length === 3,
  `and only the two things a sub needs are required (${required.length}: company name, `
  + 'the directory picker that stands in for it, and trade)')
ok(required.some(l => /Trade/.test(l)), '...trade among them')
ok(!/\(adds to schedule\)<\/span><\/Label>/.test(form) && /Adds this sub to the schedule\./.test(form),
  'a hint that was standing in for the marker is a hint under the field now, not a rival to it')
ok(/<Label>Contract Amount <span className="text-faint font-normal">\(optional\)<\/span><\/Label>/.test(form),
  'the one field that DID say optional no longer stops saying it when a line item is added')

// ── 4. and the button that explained nothing ────────────────────────────────
ok(/function missingSub\(f: \{ editing: boolean/.test(src), 'the form answers in words')
ok(/if \(missing\) \{ setSubError\(missing\); return \}/.test(src), '...on submit, into the panel that is already there')
ok(/Pick a trade\./.test(src), '...naming the trade, which is the new rule')
ok(/<Button type="submit" disabled=\{subSaving\}>/.test(form),
  'A DISABLED BUTTON EXPLAINS NOTHING: in flight only, never a missing field')
ok(!/disabled=\{subSaving \|\|/.test(form), '...with nothing else folded into it')

done()
