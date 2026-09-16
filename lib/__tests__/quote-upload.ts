// "upload quote doesn't do anything"
//
// It did all of it. The reporter attached the file afterwards and the screen
// they sent back shows the extraction was perfect: Liberty Power & Lighting
// LLC, $317,750, valid until Oct 16, the scope, the exclusions, the permit
// allowance concern. Nothing failed.
//
// What appeared when they pressed the button was a COLLAPSED row labelled
// "Untitled comparison" - which is indistinguishable from nothing having
// happened, and is exactly what their first screenshot shows: a thin white
// strip with a delete icon on the end of it.
//
// Three things, and none of them is the upload:
//
//   1. The comparison is created BEFORE any file is read, so it is born
//      "Untitled comparison" - a placeholder the client hardcoded and nothing
//      ever wrote over, although the route pulls a vendor name out of the PDF
//      seconds later. A default nothing replaces is a claim: here, "we do not
//      know what this is", about a document we have just read in full.
//   2. `expanded` starts empty, so every comparison renders collapsed. The
//      result of pressing a button belongs on the screen.
//   3. The per-file upload was `await fetch(...)` with NO `res.ok`. A refused
//      file - wrong type, a 500, an expired token - left the comparison
//      created, empty and silent. Same shape as the report, and the case where
//      "nothing happened" would have been true.
//
// The tell that the placeholder had already leaked: `award/route.ts` carried
// `comp.title !== 'Untitled comparison'`, a special case for a string a third
// file happened to spell the same way.

import { comparisonTitle, isUntitled, UNTITLED_COMPARISON } from '../quote-comparison'
import { ok, done, code, read, walk } from './_helpers'

// ── the placeholder has ONE spelling ────────────────────────────────────────
ok(isUntitled(UNTITLED_COMPARISON), 'the placeholder is recognised as one')
ok(isUntitled(null) && isUntitled('') && isUntitled('   '),
  '...and so is nothing at all, which is the same fact')
ok(!isUntitled('Liberty Power & Lighting LLC'), 'a real name is not the placeholder')
ok(!isUntitled('Untitled comparison ideas'), '...and neither is a name that merely starts like one')

// ── what it gets called ─────────────────────────────────────────────────────
ok(comparisonTitle([{ vendor_name: 'Liberty Power & Lighting LLC' }]) === 'Liberty Power & Lighting LLC',
  'THE REPORT: one quote is named after who sent it, which is what the screenshot should have said')
ok(comparisonTitle([{ vendor_name: '  Liberty Power  ' }]) === 'Liberty Power',
  '...trimmed')
// REPORTED AGAIN, and the assertions below used to encode the bug rather than
// catch it: they passed `trade` on each QUOTE, which is the shape the code was
// reading and the shape the table has never had. A test written from the same
// misunderstanding as the code confirms the misunderstanding - it went green
// while every real bulk upload came out as "2 quotes".
ok(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }]) === 'A and B',
  'two quotes are named after BOTH vendors, not counted')
ok(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }, { vendor_name: 'C' }]) === 'A + 2 others',
  '...and three or more by the first plus a count')
ok(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }], 'Electrical') === 'A and B - Electrical',
  "...plus the COMPARISON's trade when it has one")
ok(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }], '  ') === 'A and B',
  '...and a blank trade adds nothing')
ok(!/2 quotes|3 quotes/.test(String(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }]))),
  'THE REPORT: a bulk upload never lands on a name that just counts the rows')

// The trade is an ARGUMENT off the comparison. Reading it per-quote is the bug.
{
  const src = code('lib/quote-comparison.ts')
  ok(!/\bq\.trade\b|quotes\.map\([^)]*trade/.test(src),
    '...because `quotes` has no `trade` column - a field that describes no table is checked by nothing')
  const route = code('app/api/projects/[id]/quotes/[compId]/upload/route.ts')
  ok(/select\('title, trade'\)/.test(route),
    '...and the route reads it off `quote_comparisons`, which does have it')
  // `[^)]*` cannot cross the `)` in `(all ?? [])`, so match on the argument.
  ok(/comparisonTitle\(.*comp as any\)\?\.trade\)/.test(route),
    '...and hands it in')
}

// Nothing to say is said by returning null, so a caller writes nothing rather
// than writing something worse over a name somebody typed.
ok(comparisonTitle([]) === null, 'no quotes yet means no name')
ok(comparisonTitle([{ vendor_name: null }, { vendor_name: '  ' }]) === null,
  '...and quotes the AI could not name do not produce "2 quotes" out of nothing')

// ── the route names it, so any caller gets it ───────────────────────────────
const upload = code('app/api/projects/[id]/quotes/[compId]/upload/route.ts')
ok(/isUntitled\(\(comp as any\)\?\.title\)/.test(upload),
  'THE FIX: the route names the comparison once the vendor is known')
{
  // The rename must sit INSIDE the isUntitled guard. The first version of this
  // check was an `||` over the comment text, which `code()` strips - it could
  // not fail for the thing it named.
  const guardAt = upload.indexOf('isUntitled(')
  const writeAt = upload.indexOf("update({ title: name })")
  ok(guardAt > -1 && writeAt > guardAt,
    '...and the write sits inside that guard, so a name somebody typed is never overwritten')
  ok(!/update\(\{ title: [^n]/.test(upload),
    '...with no second, unconditional title write anywhere in the route')
}
ok(/comparisonTitle\(/.test(upload), '...through the one function that decides the name')
ok(/friendlyDbError\(error\)/.test(upload),
  'and a database refusal is translated rather than handed over as Postgres prose')

// The third spelling is gone: the award route asks the shared helper.
const award = code('app/api/projects/[id]/quotes/[compId]/award/route.ts')
ok(/isUntitled\(comp\.title\)/.test(award), 'the award route asks instead of spelling the placeholder itself')
ok(!/'Untitled comparison'/.test(award), '...and no longer carries its own copy of the string')

// ── the screen says what happened ───────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')
ok(/setExpanded\(prev => new Set\(prev\)\.add\(comparison\.id\)\)/.test(page),
  'THE COLLAPSED ROW: the new comparison is opened, because the result of pressing a button belongs on screen')
ok(/if \(!up\.ok\)/.test(page),
  'THE SILENT ONE: every file\'s answer is read, so a refused file cannot leave an empty comparison and no message')
ok(/failed\.push\(/.test(page) && /could not be read/.test(page),
  '...and it says which file and why')
ok(/console\.error\(`\[quotes\] \$\{f\.name\}: \$\{why\}`\)/.test(page),
  '...in the log as well as on the screen')
ok(/d\?\.error \?\?/.test(page), "the route's own reason is preferred over a shrug")
ok(!/'Untitled comparison'/.test(page),
  'and the page no longer hardcodes the placeholder either')

// ── one batch is one card, and a batch that read nothing is no card ──────────
{
  const page = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')

  // REPORTED as "creates two separate Untitled comparison cards". The batch
  // does not split - the comparison must exist before files can be posted into
  // it, so a batch where everything failed left an empty one behind, and
  // pressing Upload Quotes again left a second beside it.
  const allFailed = page.indexOf('failed.length === list.length')
  ok(allFailed > -1, 'the page notices when NOTHING in the batch could be read')
  const after = page.slice(allFailed, allFailed + 600)
  ok(/method: 'DELETE'/.test(after),
    '...and removes the comparison it made, rather than leaving wreckage on the screen')
  ok(/no comparison was made/.test(read('app/(dashboard)/projects/[id]/request-quotes/page.tsx')),
    '...and says so, so the absence is a result rather than another silence')

  // Scoped to the batch function: the file also GETs the same collection, so
  // counting the URL across the whole page counts the read as a write.
  const fn = page.slice(page.indexOf('async function uploadNewSet'))
  const body = fn.slice(0, fn.indexOf('\n  const compFor'))
  ok(body.length > 200, 'found the batch upload function')
  ok((body.match(/\/quotes`, \{\n?\s*method: 'POST'/g) ?? []).length === 1,
    'ONE batch creates exactly ONE comparison')
  ok((body.match(/for \(const f of list\)/g) ?? []).length === 1,
    '...and every file in the batch goes into that one comparison')
}

// ── every write in the family asks ───────────────────────────────────────────
{
  // `middleware.ts` returns early for every `/api/` path, so a route with no
  // `requirePermission` answers anybody holding a login. The GET was gated and
  // the five writes beside it - upload, analyze, AWARD (which creates a
  // subcontract), patch and both deletes - were not.
  const ROUTES = walk('app/api/projects/[id]/quotes').filter((f: string) => /route\.ts$/.test(f))
  ok(ROUTES.length >= 5, `found the quote routes (${ROUTES.length})`)

  for (const f of ROUTES) {
    const src = code(f)
    const handlers = (src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [])
    const gates = (src.match(/requirePermission\(/g) ?? []).length
    ok(gates >= handlers.length,
      `${f.split('/quotes/')[1] ?? f}: all ${handlers.length} handler(s) ask permission`)
  }

  // And the gate must not lock out somebody the screen is FOR - the same check
  // `invoices-load.ts` makes: a page's own gate has to cover what it calls.
  const { ROLE_DEFAULTS } = require('../permissions') as any
  for (const [role, res] of Object.entries(ROLE_DEFAULTS)) {
    const q = (res as any).quotes ?? {}
    if (!q.view) continue
    ok(!!q.create && !!q.edit && !!q.delete,
      `${role} can see Compare Quotes, so it can also use it`)
  }
}

done()
