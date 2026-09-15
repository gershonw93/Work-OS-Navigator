// The Subcontractor picker that was empty, and then said so, and was still empty.
//
// First report: the picker on the Invoices page held nothing but "Select
// subcontractor...". The page loaded from two routes - `/invoices` for the
// list, `/financials` for the subs - and both were written
//
//   if (finRes.ok) { setSubcontracts(...) }
//   // no else
//
// so a failed financials fetch left `subcontracts` at `[]` and nothing on the
// screen said why. #453 fixed that half: the failure is named, in the banner
// and beside the field, with a Try again.
//
// SECOND REPORT, and this is the real one. With the failure finally speaking,
// it said: "You do not have permission to view financials." HTTP 403, for
// qa.pm - a PROJECT MANAGER, reproduced 2/2. And that is correct: the role map
// says `invoices: VE, financials: N`, deliberately, the same split that took
// `margin` out of `budget`. A PM runs the job and files its bills; they are not
// shown the money overview.
//
// So the Invoices page was asking a permission that being on the Invoices page
// does not imply. The scan was never the bug - `setSubId(d.match.subcontract_id)`
// fired exactly as written, above a banner reading "Matched to QA Concrete
// Sub.", and the controlled picker had no option with that id to resolve
// against. A form whose gate is `invoices` must be loadable with `invoices`.
//
// AND ONE MORE, found on the way in: `/financials` ordered the payment schedule
// by `due_date`, a column `payment_schedule_items` has never had. PostgREST
// refuses the whole query for an unknown column, so `data` came back null, the
// `?? []` swallowed it, and every caller got an empty payment schedule while
// 211 rows sat in the table. `.order()` is a column name too.

import { RESOURCES, ROLE_DEFAULTS, getRoleDefaults, can } from '../permissions'
import { ok, done, code, exists } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
const route = code('app/api/projects/[id]/invoices/route.ts')
const financials = code('app/api/projects/[id]/financials/route.ts')

// ── THE PERMISSION SPLIT THIS PAGE WALKED INTO ──────────────────────────────
// Stated as a fact about the role map first, so that if anyone ever "fixes"
// this by handing a PM the financials resource, the reason it was wrong is
// still written down here.
ok(can(getRoleDefaults('project_manager'), 'invoices', 'view'),
  'a project manager is meant to be on the Invoices page')
ok(!can(getRoleDefaults('project_manager'), 'financials', 'view'),
  '...and is deliberately NOT shown the money overview - that split is the point, not the bug')

// ── the page loads from a route its own gate covers ─────────────────────────
ok(!/\/financials/.test(page),
  'THE BUG: the Invoices page no longer fetches /financials, which its own permission does not cover')
ok(/fetch\(`\/api\/projects\/\$\{params\.id\}\/invoices`/.test(page),
  '...the subs come from /invoices, gated on `invoices` - the thing this page IS')
ok(/setSubcontracts\(\(d\.subcontracts \?\? \[\]\)/.test(page)
  && /setPaymentItems\(d\.payment_schedule_items \?\? \[\]\)/.test(page),
  '...and both lists it needs are read off that one response')

// EVERY route this page calls, checked against the permission the page itself
// needs. This is the general form of the bug: a screen is only as usable as the
// narrowest permission it quietly depends on.
{
  const urls: string[] = []
  const re = /fetch\(\s*[`'"]\/api\/([^`'"]+)[`'"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(page))) {
    const u = m[1]
      .replace(/\$\{[^}]*\}/g, '[id]')   // template holes are path params
      .replace(/\/$/, '')
    if (!urls.includes(u)) urls.push(u)
  }
  ok(urls.length > 0, 'the page names at least one API route (the scan found some)')

  const holders = Object.keys(ROLE_DEFAULTS).filter(r => can(getRoleDefaults(r), 'invoices', 'view'))
  ok(holders.length > 0, 'somebody holds invoices:view, or this check proves nothing')

  // A route with NO requirePermission cannot cause the bug this file is about -
  // it lets everybody through rather than too few - so it is not a failure
  // here. It is still a permission that is decoration, so the list is
  // RATCHETED and may only go DOWN. `/api/directory` scopes its answer to the
  // caller's own company but never asks the `directory` resource; it is in
  // BACKLOG.md, not fixed here, because gating it touches screens this change
  // has no business touching.
  const ungated: string[] = []

  for (const url of urls.slice().sort()) {
    // `projects/[id]/invoices/[id]/document` -> that route's file.
    const file = `app/api/${url}/route.ts`
    // Path params are spelled differently per route ([invoiceId], [planId]),
    // so try the literal path and give up quietly rather than guessing wrong -
    // a test that fails for a filename is a test nobody acts on.
    if (!exists(file)) continue
    const src = code(file)
    // `[^)]` would stop at the `)` in `admin()`. It did, silently, and this
    // whole loop asserted nothing at all on its first run.
    const gate = src.match(/requirePermission\([\s\S]*?,\s*'([a-z-]+)',\s*'(view|create|edit|delete)'\)/)
    if (!gate) { ungated.push(`/${url}`); continue }
    const resource = gate[1]
    if (!RESOURCES.some(r => r.key === resource)) continue
    for (const role of holders) {
      ok(can(getRoleDefaults(role), resource, 'view'),
        `/${url} asks '${resource}', which ${role} holds - a page is only as usable as the narrowest permission it depends on`)
    }
  }

  ok(ungated.length <= 1 && ungated.every(u => u === '/directory'),
    `ungated routes this page calls may only go DOWN (${ungated.join(', ') || 'none'})`)
}

// ── the route hands back what the form picks from ───────────────────────────
ok(/\.from\('subcontracts'\)[\s\S]{0,200}companies\(id, name\)/.test(route),
  "the route selects the company id as well as the name - the picker keys its 'already on this job' check on it")
ok(/subcontracts: \(subs \?\? \[\]\)\.map/.test(route),
  'and returns the subs')
ok(/payment_schedule_items: \(scheduleItems \?\? \[\]\)\.map/.test(route),
  '...and the payment schedule, so a bill can be filed against the milestone it settles')
ok(/subcontracts!inner\(project_id\)/.test(route),
  'reached through the subcontract in ONE trip, not a second round after the sub ids come back')

// ── `.order()` IS A COLUMN NAME ─────────────────────────────────────────────
// `payment_schedule_items` has: id, subcontract_id, label, type, percentage,
// amount, milestone_description, status, order_index. No due_date.
for (const [src, name] of [[route, 'invoices'], [financials, 'financials']] as const) {
  ok(!/payment_schedule_items'\)[\s\S]{0,400}order\('due_date'/.test(src),
    `THE SILENT EMPTY: ${name} does not order the payment schedule by a column that table has never had`)
}
ok(/\.order\('order_index', \{ ascending: true \}\)/.test(financials),
  'financials orders by order_index, the column that exists')
ok(/psiError/.test(financials),
  '...and a refused query is logged rather than swallowed by `?? []`, which reads exactly like "there are none"')

// ── ONE ROUTE, ONE FAILURE, ONE REASON ──────────────────────────────────────
ok(/const \[loadError, setLoadError\]/.test(page) && !/subsError/.test(page),
  'one request now, so one flag - two were only ever two because there were two routes')
ok(/if \(!res\.ok\) \{ setLoadError\(await whyFailed\(/.test(page),
  'a failed load is recorded rather than falling through to an empty list')
ok(/\} finally \{\s*setLoading\(false\)/.test(page),
  'THE HANG: setLoading(false) is in a finally, so a thrown fetch cannot leave the page loading for ever')
ok(/catch \(e: any\) \{[\s\S]{0,400}setLoadError\(why\)/.test(page),
  '...and a throw says so on the screen rather than only in the console')

// ── the reason is the route's, and it exists in two places ──────────────────
ok(/d\?\.error \?\? `\$\{what\} could not be loaded \(\$\{res\.status\}\)\.`/.test(page),
  "the route's own reason is preferred over a generic shrug, with the status as the fallback")
ok(/console\.error\(`\[invoices\] \$\{what\}: \$\{why\}`\)/.test(page),
  '...and it is logged as well as shown - a reason that exists only on a screen somebody has closed is recoverable from nowhere')

// ── it has to SAY so, in both places that matter ────────────────────────────
ok(/\{loadError && \(/.test(page), 'the page says it once at the top')
ok(/Try again/.test(page), '...with a way to retry rather than only a diagnosis')

{
  // The form opens OVER the page banner, so the field itself has to carry it.
  // This is where the user is standing when they find out.
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

// ── the scan was never the bug ──────────────────────────────────────────────
ok(/if \(d\.match\?\.subcontract_id\) \{[\s\S]{0,120}setSubId\(d\.match\.subcontract_id\)/.test(page),
  'the scan still fills the picker in - what was missing was an option with that id, not the assignment')

done()
