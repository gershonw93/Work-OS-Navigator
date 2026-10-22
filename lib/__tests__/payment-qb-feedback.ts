// Recording a payment: the dialog never waits for QuickBooks, and a refusal is
// said where the money was recorded.
//
// THE REPORTS (first real QuickBooks pilot, same afternoon):
//   * "this takes forever to load, after pressing send it should close the
//     pop up ... the user can scroll away. No need to stay stuck" - the POST
//     pushes to QuickBooks in the same request (up to 8s) and the dialog sat
//     on "Saving..." for all of it.
//   * "can this error show on the screen where the error is" - an inactive
//     customer's refusal (QuickBooks 6250) appeared only under Settings ->
//     Integrations, where the person recording money never looks.

import { ok, done, code } from './_helpers'

const page = code('app/(dashboard)/projects/[id]/payments/page.tsx')
const add = page.slice(page.indexOf('async function addPayment'), page.indexOf('async function retryQb'))
const closeAt = add.indexOf('closePaymentForm()')
const fetchAt = add.indexOf('await fetch(')
ok(closeAt > 0 && closeAt < fetchAt, 'the dialog closes BEFORE the request goes out - nobody waits on QuickBooks behind it')
ok(/setPendingPayment\(label\)/.test(add) && /setPendingPayment\(null\)/.test(add), 'the page shows the payment as saving, and clears it however the request ends')
ok(/Saving the \{pendingPayment\} payment/.test(page) && /role="status"/.test(page), '...as a visible status line, with a spinner, outside any overlay')
const refused = add.slice(add.indexOf('if (!res.ok)'), add.indexOf('created = await res.json()'))
ok(/setForm\(snap\.form\)/.test(refused) && /setAdding\(true\)/.test(refused), 'a refused save REOPENS the form with what was typed')
const caught = add.slice(add.indexOf('} catch (e)'), add.indexOf('} finally'))
ok(!/setAdding\(true\)/.test(caught), '...but a request that never came back does not - it may have saved, and reopening is how money gets entered twice')
ok(!/disabled=\{[^}]*form\.amount/.test(page), 'Add is never greyed out for a missing amount - the check answers in words')

ok(/created\.quickbooks\.pushed === false/.test(add) && /QuickBooks did not take it/.test(add), 'a QuickBooks refusal is told to the person who pressed Add')
ok(/p\.qb_error \? \(/.test(page) && /QB failed - retry/.test(page) && /onClick=\{\(\) => retryQb\(p\)\}/.test(page), 'the payment row says QB failed and is the retry')

// The chip fits its column: "QB failed - retry" needs ~7.5rem and the QB column
// was 5rem, so it hung out over the row (reported from the pilot). Header, rows
// and total share ONE template or the columns stop lining up.
const grids = page.match(/grid-cols-\[[^\]]+\]/g) ?? []
ok(grids.length === 3 && new Set(grids).size === 1, 'the ledger header, rows and total share one column template')
ok(/_7\.5rem_3rem\]/.test(grids[0] ?? ''), '...with a QB column wide enough for "QB failed - retry"')

const route = code('app/api/projects/[id]/payments/route.ts')
ok(/qb\.reason === 'failed'/.test(route), 'the route reports a REAL refusal only - not connected or already pushed are normal states')
ok(/qb_error: qbErrors\[p\.id\]/.test(route), 'the list carries each payment\'s standing QuickBooks failure')
ok(/order\('created_at', \{ ascending: false \}\)/.test(route) && /seen\.has\(r\.entity_id\)/.test(route), '...from the LATEST log row, so a failure a later push fixed says nothing')

const card = code('components/settings/quickbooks-card.tsx')
ok(/FAIL_WORD\[/.test(card) && !/'Pushed'\} failed/.test(card), 'the sync log says "Push failed", never "Pushed failed"')
done()
