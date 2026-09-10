// Eight reports from one afternoon of using the app on a real job.
//
// Expiry - two of the eight - has its own suite. These are the rest, and what
// they have in common is that every one of them was SILENT: a status that
// claimed a decision nobody made, a negative allowance printed to a client, a
// feed of thirty links that all went to the same page, a form that cleared
// itself whether or not it saved, and $70,725 of approved change orders that
// reached no budget line and were simply dropped.
//
// The ones that turned out to be already fixed are pinned rather than changed,
// so they cannot come back quietly.

import { ACCEPTED_STATUSES, SELECTION_STATUSES } from '../selections'
import { activityHref, ACTIVITY_TAB } from '../activity-href'
import { materialByFor } from '../trade-scopes'
import { approvedChangesByLine, budgetTotals, rollupBudgetLines } from '../invoice-budget'
import { money as checkMoney } from '../validate'
import { ok, done, code, read } from './_helpers'

// ─────────────────────────────────────────────────────────────────────────────
// 1. "Chosen" with nothing chosen
//
// Reported: with a budget line linked and What they chose empty, setting the
// status to Chosen broke the page and never saved. The order route had refused
// this since it was written; the status dropdown beside it did not, and the
// PATCH behind the dropdown did not either.
// ─────────────────────────────────────────────────────────────────────────────
ok(ACCEPTED_STATUSES.has('chosen') && ACCEPTED_STATUSES.has('ordered') && ACCEPTED_STATUSES.has('installed'),
  'the three statuses that assert a decision are named in one place')
ok(!ACCEPTED_STATUSES.has('pending' as never) && !ACCEPTED_STATUSES.has('waiting' as never),
  '...and chasing statuses are not among them - those are exactly when nothing is chosen yet')
ok(SELECTION_STATUSES.every(s => typeof s.hint === 'string' && s.hint.length > 0),
  'every status still explains itself')

const selRoute = code('app/api/projects/[id]/selections/[selId]/route.ts')
ok(/needs_selected_name: true/.test(selRoute),
  'the PATCH route refuses an accepted status with no choice named')
ok(/ACCEPTED_STATUSES/.test(selRoute), '...using the shared set, not a second copy of the list')
ok(/'selected_name' in patch \? patch\.selected_name : current\?\.selected_name/.test(selRoute),
  '...reading the name being SET if one is, and the stored one otherwise - naming it and choosing it in one request must pass')
ok(/needs_budget_line: true/.test(selRoute), '...and the budget-line rule it already had still stands')

const selPage = code('app/(dashboard)/projects/[id]/selections/page.tsx')
ok(/ACCEPTED_STATUSES\.has\(next\)/.test(selPage),
  'the page asks the same question the route does, from the shared set')
ok(/Name what they chose/.test(selPage),
  '...and says what is missing where the field is, rather than in a dialog')

// ─────────────────────────────────────────────────────────────────────────────
// 1b. THE FOLLOW-UP: the name that never saved.
//
// The guard above was right and the field beside it was not. "What they chose"
// sent the name and `status: 'chosen'` in ONE request, and the route refuses an
// accepted status on a row with no budget line - BEFORE the update runs. So on
// every such row, typing a choice threw the choice away with the status.
// Confirmed in the database: the row they tested had budget_line_item_id NULL.
//
// Recording what somebody picked is information. The budget line is a condition
// on the STATUS. One request must not carry both when either can be refused.
// ─────────────────────────────────────────────────────────────────────────────
ok(/function missingFor\(/.test(selPage),
  'one function says what an accepted status is still missing')
ok(/if \(!sel\.selected_name\?\.trim\(\)\) return 'choice'/.test(selPage)
  && /if \(!sel\.budget_line_item_id\) return 'line'/.test(selPage),
  '...both reasons the route would refuse, asked BEFORE the request')
ok(/const why = missingFor\(sel, next\)/.test(selPage),
  'the status dropdown asks it')
ok(/if \(name && !missingFor\(\{ \.\.\.sel, selected_name: name \}, 'chosen'\)\) body\.status = 'chosen'/.test(selPage),
  '...and the name field asks it too, so the status only rides along when it can be taken')
ok(/const body: Record<string, unknown> = \{ selected_name: name \|\| null \}/.test(selPage),
  'the name is its own request - it saves whether or not the row can be Chosen yet')
ok(!/patch\(sel\.id, \{ selected_name: [^)]*status: e\.target\.value \? 'chosen'/.test(selPage),
  '...not coupled to a status change that takes it down with it')
ok(/Saved\. Link this to a budget line below/.test(selPage),
  'and the row says why it is not Chosen yet, where the field is')

// ─────────────────────────────────────────────────────────────────────────────
// 4. "Budgeted at $-500"
//
// Both save paths have refused a negative allowance for a while. Rows written
// before they did are still here, and the page they show up on is the CLIENT's.
// ─────────────────────────────────────────────────────────────────────────────
ok(/allowZero: true, label: 'allowance'/.test(code('app/api/projects/[id]/selections/route.ts')),
  'creating a selection validates the allowance')
ok(/\['allowance_amount', 'allowance'\]/.test(selRoute), '...and so does editing one')
const portal = code('app/portal/[token]/selections/page.tsx')
ok(/sel\.allowance_amount != null && Number\(sel\.allowance_amount\) > 0 && \(/.test(portal),
  'and a nonsense allowance already in the data is not printed to the client')
ok(/Number\(sel\.allowance_amount\) > 0 && o\.price != null/.test(portal),
  '...nor used to work out what an option is "over" by')

// THE FOLLOW-UP: refusing it server-side was correct and the way it was
// REPORTED was a blocking native dialog, which took the page with it. The rule
// is pure, so the field can ask it before anything is sent.
ok(checkMoney('-500', { allowZero: true, label: 'allowance' }).ok === false,
  'the shared rule refuses a negative allowance')
ok(checkMoney('250', { allowZero: true }).ok === true && checkMoney('', { allowZero: true }).ok === false,
  '...accepts a positive one, and blank is handled by the caller as "not set"')
ok(/import \{ money as checkMoney \} from '@\/lib\/validate'/.test(selPage),
  'the Selections page runs the SAME rule as the route, not a second copy')
ok(/if \(!checked\.ok\) \{ setAllowanceError\(\{ id: 'add', msg: checked\.error! \}\); return \}/.test(selPage),
  'the Add form checks before it posts')
ok(/<Field label="Allowance \(\$\)" error=/.test(selPage),
  '...and the message lands in the field, through the component that exists for it')
ok(/setAllowanceError\(\{ id: sel\.id, msg: checked\.error! \}\); return/.test(selPage),
  'the inline Allowance on an expanded row does the same')

// ─────────────────────────────────────────────────────────────────────────────
// 6. Recent Activity: thirty links to the same page
// ─────────────────────────────────────────────────────────────────────────────
ok(activityHref('invoice_updated', 'p1') === '/projects/p1/invoices',
  'an invoice event opens Invoices')
ok(activityHref('rfi_responded', 'p1') === '/projects/p1/rfis', 'an RFI event opens RFIs')
ok(activityHref('client_payment_received', 'p1') === '/projects/p1/payments',
  'a payment opens Payments, which the type string does not say')
ok(activityHref('material_purchased', 'p1') === '/projects/p1/materials', 'a receipt opens Materials')
ok(activityHref('time_clock_in', 'p1') === '/projects/p1/time', 'a clock-in opens Time')
ok(activityHref('something_new', 'p1') === '/projects/p1/overview',
  'a type nobody has mapped yet lands on the project, not on a 404')
ok(activityHref('plan_uploaded', null) === null,
  'an event with no project has no link - a link to nowhere is worse than plain text')

// Every icon the dashboard knows about has a destination. The two tables sit
// beside each other precisely so one cannot grow past the other.
const dash = code('app/(dashboard)/dashboard/page.tsx')
const iconTypes = [...(dash.match(/^\s{2}(\w+): [A-Z]\w+,$/gm) ?? [])]
  .map(l => l.trim().split(':')[0])
const missing = iconTypes.filter(t => !(t in ACTIVITY_TAB))
ok(missing.length === 0, `every activity type has a tab to open${missing.length ? ` - missing ${missing.join(', ')}` : ''}`)
ok(iconTypes.length > 20, `...and there are ${iconTypes.length} of them, so this is worth checking`)

ok(/const href = activityHref\(item\.type, item\.project_id\)/.test(dash),
  'the feed row is a link to its own record')
ok(!/href=\{`\/projects\/\$\{item\.project_id\}\/plans`\}/.test(dash),
  '...not to /plans regardless of what happened')

// ─────────────────────────────────────────────────────────────────────────────
// 7. Add Submittal did nothing, silently
//
// The file field was not marked required anywhere, and - the half that made it
// silent - the POST's response was thrown away, so a refused save cleared the
// form and closed the dialog exactly like a successful one.
// ─────────────────────────────────────────────────────────────────────────────
const subPage = code('app/(dashboard)/projects/[id]/submittals/page.tsx')
ok(/File <span className="text-danger">\*<\/span>/.test(subPage),
  'the File field is marked required where a person can see it')
ok(/required=\{!file\}/.test(subPage),
  '...and only while nothing is attached, so a file picked by the AI scan still counts')
ok(/if \(!file\) \{[\s\S]{0,200}setFormError/.test(subPage), 'submitting without one says so')
ok(/if \(!res\.ok\) \{[\s\S]{0,160}setFormError/.test(subPage),
  'a refused save is shown, not swallowed')
ok(/\} finally \{/.test(subPage) && /setSubmitting\(false\)/.test(subPage),
  '...and the button stops spinning on every path, not only the happy one')
ok(/Attach the document/.test(code('app/api/projects/[id]/submittals/route.ts')),
  'the server refuses one with no document too - the rule cannot live only in the form')

// ─────────────────────────────────────────────────────────────────────────────
// 8. A client pick through the portal
//
// Reported as leaving the GC side on "Not started". It does not: the portal
// route has set the status and stamped the name for a while, and no row in the
// database is in the state described. Pinned so it stays that way.
// ─────────────────────────────────────────────────────────────────────────────
const portalRoute = code('app/api/portal/[token]/selections/route.ts')
ok(/status: 'chosen'/.test(portalRoute), 'a pick through the client link moves the status to Chosen')
ok(/patch\.selected_name = opt\.name/.test(portalRoute), '...naming the option they picked')
ok(/patch\.selected_name = written\.slice\(0, 300\)/.test(portalRoute), '...or what they wrote in')
ok(/selected_at/.test(portalRoute), '...and stamping when, so "when did they decide" has an answer')

// ─────────────────────────────────────────────────────────────────────────────
// 9. An approved change order that lands nowhere
//
// Reported as "approving a change order never moves the Budget page". It moves
// it for every change order that names a line, or a subcontract a line points
// at. The four on this job that named neither were dropped on the floor -
// $70,725 approved, and invisible on the one screen that exists to see it.
// ─────────────────────────────────────────────────────────────────────────────
const LINES = [
  { id: 'L1', budgeted_amount: 100_000, subcontract_id: 'S1' },
  { id: 'L2', budgeted_amount: 50_000, subcontract_id: null },
]
const COS = [
  { amount: 10_000, status: 'approved', budget_line_item_id: 'L2', subcontract_id: null },
  { amount: 5_000, status: 'approved', budget_line_item_id: null, subcontract_id: 'S1' },
  { amount: 70_725, status: 'approved', budget_line_item_id: null, subcontract_id: null },
  { amount: 99_999, status: 'pending', budget_line_item_id: null, subcontract_id: null },
]

const { byLine, unmapped } = approvedChangesByLine(LINES, COS as never)
ok(byLine.get('L2') === 10_000, 'a change order naming a line raises that line')
ok(byLine.get('L1') === 5_000, '...and one naming a subcontract follows it to the line that holds it')
ok(unmapped === 70_725, `...and one that names neither is reported, not lost (${unmapped})`)

const rolled = rollupBudgetLines({ lines: LINES as never, invoices: [], materials: [], subs: [], changeOrders: COS as never })
const dropped = budgetTotals(rolled, [], [])
const counted = budgetTotals(rolled, [], [], unmapped)
ok(dropped.revised_budget === 165_000,
  `the old call drops it: $150,000 budgeted + $15,000 of changes = ${dropped.revised_budget}`)
ok(counted.revised_budget === 235_725,
  `passing the unmapped total puts the approved money back in (${counted.revised_budget})`)
ok(counted.changes_unlinked === 70_725,
  '...and names it, so the screen can say why the rows do not add up to the headline')
ok(counted.approved_changes === counted.revised_budget - counted.original_budget,
  'approved changes and the revised budget still agree with each other')

const budgetRoute = code('app/api/projects/[id]/budget/route.ts')
ok(/approvedChangesByLine\(\(data \?\? \[\]\) as any, \(changeOrders \?\? \[\]\) as any\)/.test(budgetRoute),
  'the Budget route works out which approved changes reach no line')
ok(/changeRollup\.unmapped,/.test(budgetRoute), '...and hands the total to budgetTotals')
ok(/unlinked_change_orders: unlinkedChangeOrders/.test(budgetRoute),
  '...and sends the change orders themselves, so each can be shown and filed')
ok(/\.select\('id, title, amount, status, budget_line_item_id, subcontract_id'\)/.test(budgetRoute),
  '...selecting only columns change_orders actually has - an unknown one reads as "no rows", not as an error')

const budgetPage = code('app/(dashboard)/projects/[id]/budget/page.tsx')
const tasksSrc = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
ok(/unlinkedChangeOrders\.length > 0/.test(budgetPage),
  'the Budget page shows them in the same panel as the other money that is on no row')
ok(/fileAgainstLine\('change_order', co\.id, e\.target\.value\)/.test(budgetPage),
  '...with a way to file each against a line')
ok(/budget_line_item_id: lineId/.test(budgetPage), '...which patches the change order, not the line')
ok(/if \(budget_line_item_id !== undefined\) updates\.budget_line_item_id/.test(
  code('app/api/projects/[id]/change-orders/[coId]/route.ts')),
  '...and the change-order route accepts that patch')

// ─────────────────────────────────────────────────────────────────────────────
// A LATER PASS, section by section. Overview, Field and Buyout came back clean
// apart from these.
// ─────────────────────────────────────────────────────────────────────────────

// A daily log with nothing on it.
//
// Opening the form and pressing Save filed a log carrying a date and nothing
// else. It landed in the list, in the count, and in the CLIENT-FACING PDF - a
// page of blank headings asserting that somebody was on site and reported this,
// which is worse than no entry at all.
const logRoute = code('app/api/projects/[id]/daily-logs/route.ts')
const logPage = code('app/(dashboard)/projects/[id]/daily-logs/page.tsx')
for (const [where, src] of [['the route', logRoute], ['the form', logPage]] as const) {
  ok(/An empty log says somebody was on site and reported nothing/.test(src),
    `${where} refuses a log with nothing on it`)
  ok(/const said = \[/.test(src) && /const showed = /.test(src),
    `...${where === 'the route' ? 'and it' : 'and the form'} counts words AND evidence - a photo or who was there is a report too`)
  ok(/v\.answer !== 'na' \|\| \(v\.description \?\? ''\)\.trim\(\) !== ''/.test(src),
    `...${where}: an UNTOUCHED survey is not an answer - every question starts at 'na'`)
}
ok(/const said = \[\s*notes, safety_observation, quality_observation,?\s*\]/.test(logRoute),
  'the field app posts to the same route, so the rule cannot live only in the office form')

// A disabled button explains nothing.
//
// The new-task and new-milestone dialogs disabled Save until their required
// fields were filled, so pressing it did literally nothing and neither form
// ever said which field it was waiting on.
ok(/<Button type="submit" disabled=\{saving\}>/.test(tasksSrc),
  'the task dialog lets its button fire')
ok(/Give the task a name/.test(tasksSrc), '...and answers with the field that is missing')
const sched = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
ok(/function missingMilestone\(/.test(sched),
  'one function says what a milestone still needs')
ok((sched.match(/missingMilestone\(\{/g) ?? []).length === 2,
  '...asked by BOTH the add and the edit dialog, so the two cannot disagree')
ok(/<Button type="submit" disabled=\{addSaving\}>/.test(sched),
  '...and Add fires rather than sitting there greyed out')

// A quote that has run out.
//
// "Valid until Jul 29" printed the same grey line in August as it did in June,
// so the compare page invited somebody to award a price nobody is holding.
const compare = code('components/quotes/comparison-block.tsx')
ok(/from '@\/lib\/expiry'/.test(compare),
  'the compare page asks the same expiry question as Compliance and Permits')
ok(/state === 'expired'/.test(compare) && /Expired \{gone\} day/.test(compare),
  '...and an expired quote wears a badge saying how long ago, the shape a lapsed COI wears')
ok(/bg-danger-tint/.test(compare) && /bg-warn-tint/.test(compare),
  '...red once it has run out, amber inside the window')

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2, BUYOUT. Quote requests, crew add/remove and directory came back
// clean; these are the rest.
// ─────────────────────────────────────────────────────────────────────────────

// A dropdown that stayed open after picking.
//
// `setOpen(false)` in commit() always ran. The TRIGGER undid it: it toggles,
// and on a phone the panel is a full-width sheet hard against it, so the tap
// that picks an option lands on the trigger the instant the panel unmounts from
// under the finger. A close that something else immediately reverses looks
// exactly like never closing.
const sel = code('components/ui/searchable-select.tsx')
ok(/pickedAt\.current = Date\.now\(\)/.test(sel), 'a pick is timestamped')
ok(/if \(Date\.now\(\) - pickedAt\.current < 400\) return/.test(sel),
  '...and the trigger ignores the tail of the tap that just picked')
ok(/setOpen\(false\)/.test(sel), '...while commit still closes it, which was never the broken half')

// Picking a sub out of the directory fills in the Trade.
//
// The option already SHOWS the trade in brackets, so leaving the field below it
// empty made somebody retype what they had just read - and a blank trade leaves
// the subcontract off the compliance requirements for its trade.
const team = code('app/(dashboard)/projects/[id]/team/page.tsx')
ok(/const picked = directorySubs\.find\(x => x\.id === e\.target\.value\)/.test(team)
  && /if \(picked\?\.trade\) setSubTrade\(picked\.trade\)/.test(team),
  'picking a saved sub fills in its trade')

// The written scope sits under the built one, and says it is optional.
const rq = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')
const builderAt = rq.indexOf('<ScopeBuilder')
const freeTextAt = rq.indexOf('Anything else')
ok(builderAt > 0 && freeTextAt > builderAt,
  'the free-text box comes AFTER the scope that fills itself in from the trade')
ok(/Anything else <span className="text-faint font-normal">\(optional\)<\/span>/.test(rq),
  '...and is marked optional, because the lists above are the scope')

// Package and "who supplies the material" were two free choices that overlap.
//
// Three of the four packages ARE the answer to the second question, and asking
// anyway let a request go out reading "Labor only" over "Subcontractor supplies
// material" - two different jobs on one page.
ok(materialByFor('turnkey') === 'sub', 'labour + material means the sub brings it')
ok(materialByFor('labor_only') === 'gc', 'labour only means we do')
ok(materialByFor('material_only') === 'sub', 'material only means the sub is the supplier')
ok(materialByFor('measure_quote') === null,
  'measure & quote is the ONLY one still worth asking about')
const builder = code('components/projects/scope-builder.tsx')
ok(/materialByFor\(value\.package_type\) \? \(/.test(builder),
  'the question is only shown where it is still a question')
ok(/set\(derived \? \{ package_type: p\.key, material_by: derived \} : \{ package_type: p\.key \}\)/.test(builder),
  '...and picking a package writes the answer rather than leaving the last one contradicting it')
ok(/material_by: materialByFor\(tpl\.package_type\) \?\? tpl\.material_by/.test(builder),
  '...including a stored template, which can disagree with itself')

// Compliance: the date decides, and Update is a dialog.
const compliance = code('app/(dashboard)/projects/[id]/compliance/page.tsx')
// The resolver moved to lib/compliance-report.ts so the printed report shares
// it; the assertions below follow it there.
const complianceResolver = code('lib/compliance-report.ts')
ok(/if \(state === 'ok'\) return 'approved'/.test(complianceResolver),
  "a live date IS active - a covered sub sitting at 'pending' because nobody clicked Approve reads as a problem")
ok(/The stored status only speaks for a document with NO date/.test(read('lib/compliance-report.ts')),
  '...and the stored status only speaks where there is no date to derive from')
ok(/\{openForm && \(\s*<div className="overlay items-center justify-center bg-black\/50" data-overlay/.test(compliance),
  'Update opens a dialog, not a panel below the whole list')
ok(!/Inline upload form \(below table\)/.test(read('app/(dashboard)/projects/[id]/compliance/page.tsx')),
  '...which is what made it read as a separate page on a phone')

// The pay-app schedule of values has surfaced `unmapped` all along, which is
// how the same money could be on one screen and not the other.
ok(/unmapped/.test(read('lib/pay-app-sov.ts')),
  'the pay-app schedule of values still surfaces the same figure it always did')

done()
