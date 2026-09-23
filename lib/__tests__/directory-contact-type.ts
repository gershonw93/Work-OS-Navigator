/**
 * THE LABEL DECIDES WHICH PICKERS OFFER A CONTACT, AND IT WAS NOT EDITABLE.
 *
 * REPORTED: "I imported contacts, now I want to add a sub from the directory
 * and it's not there. Do I need to refresh?"
 *
 * No. The import had worked perfectly. The contact was staged, labelled
 * "Other", and written to `companies` as `type: 'other'` - and the Add Sub
 * picker on the project Team page filters `c.type === 'subcontractor'`, so it
 * could never appear however many times the page was reloaded. Nothing was
 * broken, nothing errored, and nothing on screen said why: the row was simply
 * filed in a category no sub picker asks for. "It is not there" and "it is
 * there under a label you cannot see" look identical.
 *
 * THE TRAP WAS THAT THERE WAS NO WAY BACK. The ADD form has a Contact Type
 * control, and `PATCH /api/directory/[companyId]` has always carried `type` on
 * its whitelist - only the EDIT form was missing the box. So a label chosen
 * once, during a bulk import of forty contacts, was permanent, and the only
 * remaining move was to add the company again by hand and end up with two.
 *
 * A VALUE THE APP WRITES, SUBMITS AND READS BACK MUST HAVE A CONTROL
 * SOMEWHERE.
 */
import { ok, done, code } from './_helpers'

console.log('\n\x1b[1mdirectory-contact-type\x1b[0m')

const page = code('app/(dashboard)/directory/page.tsx')
const route = code('app/api/directory/[companyId]/route.ts')

// ── the route has always allowed it ─────────────────────────────────────────
{
  ok(/const allowed = \[[^\]]*'type'/.test(route),
    "the PATCH whitelist accepts `type` - the route was never the missing half")
}

// ── and now the form offers it ──────────────────────────────────────────────
{
  ok(/id="edit-type"/.test(page),
    'THE MISSING BOX: the EDIT form has a Contact Type control, not just the Add form')
  ok(/setEditType\(/.test(page) && /editType/.test(page),
    '...backed by state')
  ok(/setEditType\(\(company\.type as ContactType\) \?\? 'other'\)/.test(page),
    '...loaded from the row being edited, so it opens on what the contact actually is')
  ok(/type: editType/.test(page),
    '...and SENT on save - a control whose value never reaches the route is decoration')
}

// ── every label the Add form offers, the Edit form offers ───────────────────
{
  // A HALF-LIST IS THE SAME BUG ONE STEP ALONG. If Edit offered four of the
  // six, a contact could still be stuck in a category with no way out.
  const selects = page.split('<Select')
  const editSel = selects.find(s => s.includes('id="edit-type"')) ?? ''
  const addSel = selects.find(s => s.includes('id="form-type"')) ?? ''
  ok(editSel.length > 0 && addSel.length > 0, 'both type pickers are findable')

  const opts = (s: string) => (s.match(/<option value="([a-z]+)"/g) ?? []).sort().join(',')
  ok(opts(editSel) === opts(addSel) && opts(addSel).length > 0,
    `EVERY label Add offers, Edit offers too - a half-list strands a contact just as well (${opts(editSel)})`)
  ok(/value="subcontractor"/.test(editSel),
    '...including the one the report was about')
}

// ── the picker this was reported against is unchanged ───────────────────────
{
  // The fix is NOT to widen the sub picker. A sub list that also offered
  // inspectors and "other" would be a phone book, which is the exact thing the
  // import staging area exists to keep out of it.
  const team = code('app/(dashboard)/projects/[id]/team/page.tsx')
  ok(/c\.type === 'subcontractor'/.test(team),
    'the Add Sub picker still asks for subcontractors only - widening it would undo what the staging area is for')
}

done()
