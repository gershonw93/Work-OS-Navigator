// The Subcontractor picker that was empty for no stated reason.
//
// The invoices page loads from two routes at once - `/invoices` for the list,
// `/financials` for the subcontracts the create form picks from - and both were
// written the same way:
//
//   if (finRes.ok) { setSubcontracts(...) }
//   // no else
//
// So a financials fetch that failed left `subcontracts` at `[]`. The page looks
// fine. The Scan button works. The form opens. And the Subcontractor picker
// contains nothing but "Select subcontractor…", on a job with six subs on it,
// with nothing anywhere on the screen saying why. Identical in shape to the
// Upload button that vanished off the Plans tab on a bad minute of signal: a
// check that FAILED renders exactly like an answer of "none".
//
// The invoices half had its own version - a failed list fetch printed "No
// invoices yet", which is the app asserting a job has no bills on it when what
// it actually knows is that it could not ask.
//
// AND `setLoading(false)` WAS THE LAST STATEMENT of the function, outside any
// try. A fetch that THREW - the tab offline, DNS gone - never reached it, and
// the page said "Loading..." for as long as you left it open.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/invoices/page.tsx')

// ── two failures, because they are two different facts ──────────────────────
ok(/const \[loadError, setLoadError\]/.test(page) && /const \[subsError, setSubsError\]/.test(page),
  'THE TWO HALVES fail separately and are recorded separately - one flag could not say which list is missing')
ok(/if \(!invRes\.ok\) setLoadError\(/.test(page),
  'a failed invoices fetch is recorded rather than falling through to an empty list')
ok(/if \(!finRes\.ok\) setSubsError\(/.test(page),
  'THE BUG: a failed financials fetch is recorded rather than leaving the subcontractor picker silently empty')

// ── the loading state has a way to end ──────────────────────────────────────
ok(/\} finally \{\s*setLoading\(false\)/.test(page),
  'THE HANG: setLoading(false) is in a finally, so a thrown fetch cannot leave the page loading for ever')
ok(/catch \(e: any\) \{[\s\S]{0,400}setLoadError\(why\); setSubsError\(why\)/.test(page),
  '...and a throw says so on the screen rather than only in the console')

// ── the reason is the route's, and it exists in two places ──────────────────
ok(/d\?\.error \?\? `\$\{what\} could not be loaded \(\$\{res\.status\}\)\.`/.test(page),
  "the route's own reason is preferred over a generic shrug, with the status as the fallback")
ok(/console\.error\(`\[invoices\] \$\{what\}: \$\{why\}`\)/.test(page),
  '...and it is logged as well as shown - a reason that exists only on a screen somebody has closed is recoverable from nowhere')

// ── it has to SAY so, in both places that matter ────────────────────────────
ok(/\{\(loadError \|\| subsError\) && \(/.test(page),
  'the page says it once at the top, for whichever half failed')
ok(/Try again/.test(page), '...with a way to retry rather than only a diagnosis')

{
  // The form opens OVER the page banner, so the field itself has to carry it.
  // This is the whole point of the fix: the empty picker is where the user is
  // standing when they find out.
  const labelAt = page.indexOf('<Label>Subcontractor</Label>')
  const selectAt = page.indexOf('<SearchableSelect value={subId}')
  const inlineAt = page.indexOf('The subcontractors on this job did not load')
  ok(labelAt > -1 && selectAt > -1 && inlineAt > -1,
    'the Subcontractor field explains an empty list')
  ok(inlineAt > labelAt && inlineAt < selectAt,
    '...beside the picker itself, not only in a banner the open dialog covers')
}

// ── and the empty state stops claiming something it does not know ───────────
ok(/invoices\.length === 0 && loadError \? \(/.test(page),
  'THE CLAIM: "No invoices yet" is not printed over a failed load')
{
  // Order matters: a refresh that fails after a good load must not blank the
  // invoices already on screen.
  const guardAt = page.indexOf('invoices.length === 0 && loadError')
  const emptyAt = page.indexOf('No invoices yet')
  ok(guardAt > -1 && emptyAt > -1 && guardAt < emptyAt,
    '...and the guard sits in front of the empty state, so a list already loaded survives a failed refresh')
}

done()
