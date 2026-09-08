// The bill form refusing corrections.
//
// Three findings, one theme: fixing a small mistake meant destroying the record
// and starting again.
//
//   #2  a sub in the Directory was not offered unless already on the project,
//       so entering a bill dead-ended and the only way on was to leave the form
//   #3  a wrong line meant deleting the whole bill and re-scanning the PDF -
//       and the card ADVERTISED the feature: "or you can add them with Edit"
//   #4  the scanner reads tax into its own field, nothing stopped a manual tax
//       line as well, and the result was "the lines add up to $62 more than the
//       total" on a bill that was correct

import {
  looksLikeTaxLine, taxLineConflicts, taxConflictNote,
  reconcile, reconciliationNote,
} from '../invoice-lines'
import { ok, done, code } from './_helpers'

// ── #4: the tester's bill, reconstructed ─────────────────────────────────────
// A $1,000 job with $62 of tax, where the tax was captured by the scan AND
// typed as a line. The lines then total $1,062 against a $1,062 bill, and
// reconcile reports the difference as tax counted twice.
const lines = [
  { description: 'Rough plumbing', amount: 1000 },
  { description: 'Sales tax', amount: 62 },
]
const conflicts = taxLineConflicts({ lines, tax: 62 })
ok(conflicts.length === 1, 'the duplicate tax line is found')
ok(conflicts[0].index === 1 && conflicts[0].amount === 62, '...by position and amount')
const note = taxConflictNote(conflicts, 62)
ok(!!note && /double/i.test(note), `the warning says what would go wrong: "${note}"`)
ok(!!note && note.includes('$62.00'), '...naming the amount, which is what makes it checkable')

// With no tax on the bill, a "Sales tax" line is simply where the tax lives.
// Nagging about that would be nagging about a perfectly good way to enter a bill.
ok(taxLineConflicts({ lines, tax: null }).length === 0, 'no tax recorded, no conflict')
ok(taxLineConflicts({ lines, tax: 0 }).length === 0, 'zero tax is the same as none')
ok(taxConflictNote([], 62) === null, 'no conflict, nothing said')

// ── the detector has to be narrow ────────────────────────────────────────────
ok(looksLikeTaxLine('Sales tax'), '"Sales tax" is a tax line')
ok(looksLikeTaxLine('NY sales tax 8.875%'), '...and so is one with a rate on it')
ok(looksLikeTaxLine('VAT'), 'VAT counts')
ok(looksLikeTaxLine('Tax'), 'so does the bare word')
// The false positive that would matter: an accountant's actual work.
ok(!looksLikeTaxLine('Tax preparation services for Q3 filing'),
  '"Tax preparation services" is WORK, not tax - a long description is describing a job')
ok(!looksLikeTaxLine('Install taxidermy display case'),
  'a word that merely contains "tax" is not tax')
ok(!looksLikeTaxLine(''), 'an empty description is not tax')
ok(!looksLikeTaxLine(null), 'nor is a missing one')

// ── the arithmetic the tester saw ────────────────────────────────────────────
const rec = reconcile({ lines, tax: 62, retainage: null, amount: 1062 })
ok(!rec.balanced, 'counting the tax twice does not balance')
ok(rec.difference === -62, `and the gap is exactly the tax: ${rec.difference}`)
ok(/62/.test(reconciliationNote(rec) ?? ''), 'the after-the-fact note names it too')
// Fixing it either way balances.
ok(reconcile({ lines: [lines[0]], tax: 62, retainage: null, amount: 1062 }).balanced,
  'dropping the line balances the bill')
ok(reconcile({ lines, tax: null, retainage: null, amount: 1062 }).balanced,
  'clearing the field balances it too - both are valid, which is why it asks')

// ── #4: tax finally has a field ──────────────────────────────────────────────
const editor = code('components/invoices/line-editor.tsx')
ok(/onTax\(/.test(editor), 'tax is editable')
ok(/type="number"[\s\S]{0,120}value=\{tax\}/.test(editor), '...as a real input')
ok(/taxLineConflicts\(/.test(editor), 'the conflict is detected as it is typed')
ok(/Fold /.test(editor) && /clear the tax field/.test(editor),
  'and the person is offered both ways out rather than having one chosen for them')
const page = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/tax: taxInput === '' \? null : Number\(taxInput\)/.test(page),
  'the create form sends what is in the field, not what the scan happened to read')

// ── #3: lines are editable ───────────────────────────────────────────────────
ok(/<LineEditor/.test(page), 'the bill form uses the shared editor')
ok((page.match(/<LineEditor/g) ?? []).length === 2,
  '...in BOTH the create form and Edit, which is the fix')
ok(/line_items: editLines/.test(page), 'Edit sends the lines it now shows')
ok(/tax: editTax === '' \? null : Number\(editTax\)/.test(page), '...and the tax with them')
ok(/setEditLines\(Array\.isArray\(invoice\.line_items\)/.test(page),
  'opening Edit loads the existing lines rather than starting blank')

// ── #2: a directory sub can be added mid-bill ────────────────────────────────
ok(/fetchDirectory/.test(page), 'the form knows what is in the Directory')
ok(/dir:\$\{c\.id\}/.test(page), 'directory subs are offered, marked apart from the ones on the job')
ok(/attachDirectorySub/.test(page), 'choosing one attaches them')
ok(/existing_company_id/.test(page), '...through the route that already did this')
ok(/onJob\.has\(c\.id\)/.test(page), 'a sub already on the job is not offered twice')

// The permission had to move, or the fix does nothing for the person who hit it.
const subs = code('app/api/projects/[id]/subcontracts/route.ts')
ok(/existingCompanyId \? 'invoices' : 'team'/.test(subs),
  "attaching needs invoices:edit; minting a new Directory company still needs team:edit")
// Scoped to POST. The first version searched the whole file and matched the
// GET handler's own gate, so it was measuring the wrong two positions.
const post = subs.slice(subs.indexOf('export async function POST('))
ok(post.indexOf('const form = await request.formData()') < post.indexOf('requirePermission('),
  'POST reads the form BEFORE its gate, because the gate depends on what is in it')
ok(post.indexOf('requirePermission(') > 0, '...and POST still has a gate at all')
ok(/reused: true/.test(subs),
  'attaching a sub already on the project reuses the subcontract instead of making a second')

done()
