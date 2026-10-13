// "RFIs - no way for a GC to add one. Empty list, no add control."
//
// The page was answer-only: an RFI could only be written by a sub from their
// job page, so a GC with a question for the architect - the commonest RFI
// there is - had nowhere to put it, and the answer link on each card could
// only ever carry a sub's question.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/rfis/page.tsx')
// The route keeps the gate; the body moved to lib/writes/rfi.ts (shared with Claude).
const route = code('app/api/projects/[id]/rfis/route.ts') + code('lib/writes/rfi.ts')

ok(/> New RFI</.test(page), 'THE GAP: the GC RFI page has a New RFI control')
ok(/!\(!permsLoading && !permsError && !can\('rfis', 'create'\)\)/.test(page),
  '...hidden only when the permission is KNOWN to be denied')
ok(/function missingRfi\(/.test(page) && /if \(missing\) \{ setNewError\(missing\); return \}/.test(page),
  'a missing field is answered in words before anything is sent')
ok(/<Button type="submit" disabled=\{creating\}>/.test(page), '...and the button is disabled only in flight')
ok(/\{showNew && \(\s*<div className="overlay[^"]*" data-overlay/.test(page), 'it opens as an overlay dialog')

ok(/!subject\.trim\(\)/.test(route) && /status: 400/.test(route), 'the route refuses a blank subject too')
ok(/select\('full_name'\)\.eq\('id', user\.id\)/.test(route) && /submitted_by_name: askedBy/.test(route),
  "a GC's RFI is signed with their own name, not 'Someone'")

done()
