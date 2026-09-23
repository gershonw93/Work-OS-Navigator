/**
 * TWO THINGS ASKED FOR IN ONE BREATH, BOTH ABOUT THE SAME DEAD END.
 *
 * 1. "ADD AN IMPORTED TAG SO I CAN FILTER THEM." After a Google Contacts
 *    import there was nothing on a contact saying where it came from. With
 *    194 staged rows against 81 hand-added subs, "which of these did I import"
 *    had no answer on any screen - and it is the question somebody asks right
 *    after an import goes in wrong.
 *
 *    DERIVED, NOT STORED. The import already writes
 *    `google_contact_imports.company_record_id` pointing at the row it
 *    created, so the fact is on disk. A second column on `companies` would be
 *    one more thing to keep in step, and the rule here is one fact, one home.
 *
 * 2. "THE QUICK ADD DOESN'T LET ME ADD A SUB AS WELL." `JOB_ROLES` ran
 *    Project Manager, Site Manager, Superintendent, Foreman, Laborer, Safety
 *    Officer, Quality Control, Other - every one of them the GC's own staff.
 *    So the "Not on SyteNav" tab could add a foreman and not the electrician
 *    beside him, on a REQUIRED picker, which is a dialog with no right answer
 *    in it.
 */
import { ok, done, code } from './_helpers'
import { JOB_ROLES } from '../team-member'

console.log('\n\x1b[1mdirectory-imported-tag\x1b[0m')

// ── the role that was missing ───────────────────────────────────────────────
{
  const roles = JOB_ROLES as readonly string[]
  ok(roles.includes('Subcontractor'),
    'THE REPORT: a sub can be added to a job roster')
  for (const r of ['Supplier', 'Inspector']) {
    ok(roles.includes(r), `...and so can a ${r.toLowerCase()} - the same dead end one trade over`)
  }
  // The GC's own staff are still there. Replacing rather than extending would
  // have traded one missing answer for eight.
  for (const r of ['Project Manager', 'Superintendent', 'Foreman', 'Other']) {
    ok(roles.includes(r), `${r} is still offered`)
  }
  ok(roles[roles.length - 1] === 'Other', '"Other" stays last - it is the fallback, not a choice among equals')
  ok(new Set(roles).size === roles.length, 'no role is listed twice')
}

// ── the roster is not a subcontract ─────────────────────────────────────────
{
  // Adding somebody as "Subcontractor" here puts a name and a number on the
  // job's team list. It must not award work, create a subcontract or touch
  // money - that is Buyout, and this dialog has never written there.
  const dialog = code('components/projects/add-team-member-dialog.tsx')
  ok(!/subcontracts/.test(dialog),
    'the add-to-job dialog still writes no subcontract - a roster label is not an award')
}

// ── imported is derived, and reaches the screen ─────────────────────────────
{
  const route = code('app/api/directory/route.ts')
  ok(/google_contact_imports/.test(route) && /company_record_id/.test(route),
    'the directory route derives `imported` from the link the import already wrote')
  ok(/imported: companiesImported\.has\(c\.id\)/.test(route),
    '...and puts it on every company it returns')
  ok(!/\bimported\b[^\n]*column|ALTER TABLE companies/.test(route),
    'nothing stores it a second time on the contact')

  const page = code('app/(dashboard)/directory/page.tsx')
  ok(/importedOnly/.test(page), 'the Directory can filter down to them')
  ok(/c\.imported \? !!c\.imported/.test(page) || /importedOnly \? !!c\.imported : true/.test(page),
    '...and the filter actually reads the flag')
  ok(/company\.imported &&/.test(page),
    'and a contact that came from an import says so on its card')
}

// ── the toggle is not shown when it can only return nothing ─────────────────
{
  const page = code('app/(dashboard)/directory/page.tsx')
  ok(/companies\.some\(c => c\.imported\) && \(/.test(page),
    'the Imported filter only appears when something was imported - a control that can only ever return an empty list is noise on every other account')
}

done()
