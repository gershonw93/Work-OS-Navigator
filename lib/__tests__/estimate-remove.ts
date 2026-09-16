// "Uploaded a appliance quote by finance. How do I remove it"
//
// You couldn't. Finance -> Estimate took the file, AI-scanned it into line
// items, and offered exactly one control afterwards: Replace. The route had
// GET, POST and PATCH and no DELETE; `projects.quote_file_url` was written in
// one place and cleared in none. A wrong upload was permanent - and the lines
// it produced feed Budget and Progress, so an appliance quote was sitting in
// the job's budget with no way to take it out.
//
// The repo already had the rule: a value the app writes, submits and reads
// back must have a control somewhere. This upload never had one.
//
// AND REPLACE WAS NOT AN UNDO EITHER. POST ran
// `budget_line_items.delete().eq('project_id', id)` - every budget line on the
// job - under a comment that says "Replace existing quote-derived line items".
// The comment described the intent and the code was wider, so the only
// available workaround destroyed hand-entered budget lines as well.

import { estimateRemovalProblem, estimateRemovalSummary, quoteLines, QUOTE_CATEGORY } from '../estimate-removal'
import { ok, done, code } from './_helpers'

const line = (over: Partial<Parameters<typeof estimateRemovalProblem>[0][number]> = {}) => ({
  description: 'Wolf 36" range', category: QUOTE_CATEGORY,
  committed_amount: 0, actual_amount: 0, allocation_count: 0, ...over,
})

// ── whose lines are these ───────────────────────────────────────────────────
ok(quoteLines([line(), line({ category: 'Labor' })]).length === 1,
  'only the rows the scan wrote are the estimate\'s')
ok(quoteLines([line({ category: null })]).length === 0,
  '...a hand-added line with no category is not one of them')

// ── the clean case ──────────────────────────────────────────────────────────
ok(estimateRemovalProblem([line(), line()]) === null,
  'THE FIX: an estimate nobody has spent against comes off the job')
ok(estimateRemovalProblem([]) === null, 'and so does one with no lines at all')

// A hand-added line carrying money is NOT a reason to refuse - it is not being
// deleted. Refusing on it would make the estimate unremovable on any real job.
ok(estimateRemovalProblem([line(), { ...line({ category: 'Labor' }), actual_amount: 9000 }]) === null,
  'money on a line the estimate does not own is not the estimate\'s problem')

// ── the one that is destroyed rather than detached ──────────────────────────
const allocated = estimateRemovalProblem([line({ allocation_count: 1 })])
ok(allocated !== null, 'an allocated bill stops the removal')
ok(/Wolf 36" range/.test(allocated!),
  '...and the refusal NAMES the line, because "cannot be removed" tells nobody which of forty rows to unpick')
ok(/delete that allocation/.test(allocated!),
  '...and says what would be destroyed - invoice_allocations is ON DELETE CASCADE')
ok(/Re-point it/.test(allocated!), '...and what to do about it')

// ── money recorded on the line itself ───────────────────────────────────────
const spent = estimateRemovalProblem([line({ actual_amount: 12500 })])
ok(spent !== null && /\$12,500/.test(spent), `actual cost is named with its amount (${spent})`)
const committed = estimateRemovalProblem([line({ committed_amount: 8000 })])
ok(committed !== null && /\$8,000/.test(committed), `and so is a commitment (${committed})`)

// ORDER: the allocation is the only one that takes somebody ELSE's record with
// it, so it is the one reported when a line carries more than one problem.
const both = estimateRemovalProblem([line({ allocation_count: 2, actual_amount: 500 })])
ok(/delete that allocation/.test(both!),
  'the destroyed-not-detached case is the one reported first')

// ── what the confirmation claims is about to happen ─────────────────────────
ok(estimateRemovalSummary([line(), line()], true) === 'the uploaded file, 2 line items and the payment schedule',
  'the confirmation counts what goes rather than waving at it')
ok(estimateRemovalSummary([line()], false) === 'the uploaded file and 1 line item',
  '...singular when there is one, and no schedule when there is none')
ok(estimateRemovalSummary([], false) === 'the uploaded file', '...and a bare file is just that')

// ── the route ───────────────────────────────────────────────────────────────
const route = code('app/api/projects/[id]/quote/route.ts')
ok(/export async function DELETE\(/.test(route),
  'THE GAP: the route can now be asked to remove one')
ok(/DELETE[\s\S]{0,400}requirePermission\(admin\(\), request, 'quotes', 'edit'\)/.test(route),
  '...on the same gate as POST and PATCH, which are already this destructive')
ok(route.indexOf('estimateRemovalProblem(') < route.indexOf('storage.from(\'submittals\').remove'),
  '...and the guard is asked BEFORE anything is destroyed')
ok(/quote_file_url: null[\s\S]{0,200}payment_stages: null/.test(route),
  'every column the upload wrote is cleared, not just the file')
ok(/storage\.from\('submittals'\)\.remove/.test(route),
  'and the stored file goes too - the URL is signed for ten years, so clearing the column leaves it readable')

// ── Replace stops taking the whole budget with it ───────────────────────────
ok(/budget_line_items'\)\.delete\(\)\.eq\('project_id', params\.id\)\.eq\('category', QUOTE_CATEGORY\)/.test(route),
  'THE SECOND BUG: Replace deletes only quote-derived lines now')
ok(!/budget_line_items'\)\.delete\(\)\.eq\('project_id', params\.id\)\s*$/m.test(route),
  '...the unscoped delete that wiped hand-entered budget lines is gone')

// ── the screen ──────────────────────────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/quote/page.tsx')
ok(/Remove<\/>|> Remove</.test(page), 'the Estimate screen has a Remove control')
ok(/guardDelete\(/.test(page), '...behind the delete guard, never window.confirm')
ok(/confirmLabel: 'Remove estimate'/.test(page), '...which names the act rather than saying "Delete"')
ok(/estimateRemovalProblem\(lines\)/.test(page),
  'the refusal is computed on the page, so it is known before the button is pressed')
ok(/removalProblem \? notify\(removalProblem\)/.test(page),
  '...and pressing it says why rather than doing nothing')
ok(!/disabled=\{[^}]*removalProblem/.test(page),
  'NOT disabled on the refusal: a greyed-out button is a rule nobody is ever told')
// Built rather than written: the ratchet in layout-overflow scans every file
// for this call, and a suite asserting its absence must not contain it.
ok(!new RegExp('alert' + '\\(').test(page), 'and nothing here opens a blocking native dialog')
ok(/Budget lines you added by hand are not touched/.test(page),
  'Replace says what it rewrites, which is the trap the reporter would have hit next')

done()
