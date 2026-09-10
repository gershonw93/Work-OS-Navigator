// "Add selection is broken. First click fires an insert without a status value
// and shows the user a raw Postgres error. Every click after does nothing - no
// dialog, no toast, even after reload."
//
// Three faults, and they are not equally certain.
//
//   1. THE BUTTON WAS A TOGGLE - `setShowAdd(v => !v)` over an INLINE panel
//      that rendered below the stats grid rather than over the screen. After a
//      failed save that panel is still open, which is exactly when somebody
//      presses the button again, and the press CLOSES it. A control whose
//      effect is immediately reversed by the next press is indistinguishable
//      from a dead one - the same lesson SearchableSelect taught, one screen
//      over. "Add a category" beside it was already a proper dialog.
//   2. RAW POSTGRES REACHED THE UI. The route ended `{ error: error.message }`
//      and the page put it on screen, so somebody adding a bathroom tile read
//      `null value in column "status" ... violates not-null constraint`.
//      `lib/db-error.ts` had existed for exactly this since the subcontracts
//      form hit the identical wall, and three routes used it. Not this one.
//   3. `status` WAS NOT ON THE INSERT. The seed path in the same route sets it;
//      the manual path left it to the column default.
//
// WHAT WAS NOT FOUND. Against the live schema `project_selections.status` is
// NOT NULL DEFAULT 'pending', there is no trigger on the table, and the only
// NOT NULL `status` with no default in the whole database belongs to
// `quickbooks_sync_log`, which this path never touches - so the insert should
// not have raised that message. What is fixed here is the mechanism that let
// any such sentence reach a user, and the dependence on a schema being right.

import { friendlyDbError } from '../db-error'
import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/selections/page.tsx')
const route = code('app/api/projects/[id]/selections/route.ts')

// ── 1. open, never toggle ───────────────────────────────────────────────────
ok(!/setShowAdd\(v => !v\)/.test(page), 'THE BUG: Add selection is not a toggle')
ok(/setAddError\(null\); setShowAdd\(true\)/.test(page), '...it opens, every time, cleanly')
ok(/\{showAdd && \(\s*<div className="overlay items-center justify-center bg-black\/40" data-overlay/.test(page),
  '...over the screen, the same dialog shape as "Add a category" beside it')
ok(/onClick=\{e => e\.stopPropagation\(\)\}/.test(page), '...with a panel a click inside does not dismiss')
// The seed dialog is the one it is copying; both are still there and both are
// overlays, so "add something" means one thing on this screen.
ok((page.match(/className="overlay items-center justify-center bg-black\/40" data-overlay/g) ?? []).length >= 2,
  'both add dialogs on this screen are the same thing')

// ── 2. no raw Postgres out of this route ────────────────────────────────────
ok(/import \{ friendlyDbError \} from '@\/lib\/db-error'/.test(route),
  'THE BUG: the route translates database failures')
ok(/function dbFailure\(/.test(route), '...through one helper, so no path can forget')
ok(!/NextResponse\.json\(\{ error: error\.message \}/.test(route),
  '...and no response hands a Postgres sentence straight to the screen')
ok((route.match(/return dbFailure\(/g) ?? []).length >= 3,
  'every database failure in the route goes through it')
ok(/console\.error\(`\[selections\]/.test(route),
  '...and the raw text is written down, so it is still recoverable from the logs')
// The message the report quoted, put through the translator.
const said = friendlyDbError({ message: 'null value in column "status" of relation "project_selections" violates not-null constraint' })
ok(!/violates|relation|constraint/.test(said), `the message names a field, not a constraint (${said})`)

// ── 3. the state is written by the code that means it ───────────────────────
ok((route.match(/status: 'pending'/g) ?? []).length === 2,
  'both insert paths say `pending` outright - the seed one always did')
ok(!/status: body\.status/.test(route), '...and neither takes it from the body')

// ── the button that explained nothing ───────────────────────────────────────
ok(/function missingSelection\(/.test(page), 'the form answers in words')
ok(/if \(missing\) \{ setAddError\(missing\); return \}/.test(page), '...before anything is sent')
ok(/<Button onClick=\{add\} disabled=\{saving\}>/.test(page),
  'A DISABLED BUTTON EXPLAINS NOTHING: in flight only, never a missing field')
ok(!/disabled=\{saving \|\| !form\.item\.trim\(\)\}/.test(page), '...with the empty-title check gone from it')
// A failure about this form belongs beside the fields, not in a dock the
// dialog is sitting on top of.
ok(/\{addError && \(/.test(page), 'and the answer appears inside the dialog it is about')

done()
