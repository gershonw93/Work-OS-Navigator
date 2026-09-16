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
import { ok, done, code } from './_helpers'

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
ok(comparisonTitle([{ vendor_name: 'A' }, { vendor_name: 'B' }, { vendor_name: 'C' }]) === '3 quotes',
  'several are named by how many, because no one vendor speaks for the set')
ok(comparisonTitle([
  { vendor_name: 'A', trade: 'Electrical' },
  { vendor_name: 'B', trade: 'Electrical' },
]) === '2 quotes - Electrical', '...plus the trade when they agree on one')
ok(comparisonTitle([
  { vendor_name: 'A', trade: 'Electrical' },
  { vendor_name: 'B', trade: 'Plumbing' },
]) === '2 quotes', '...and NOT a trade they disagree about, which is not a fact about the set')

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

done()
