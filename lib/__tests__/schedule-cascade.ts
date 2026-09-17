// The wiring around the cascade engine: the registries, the gates, and the
// promise that no sub hears anything without somebody pressing a button.
//
// The arithmetic is pinned in `schedule-dependencies.ts`. This file pins the
// things that are true about the SYSTEM rather than about the maths - the ones
// that go wrong by omission, quietly, months later.

import { ok, done, code, read, walk, exists } from './_helpers'

console.log('\nschedule-cascade')

// ── the migration actually landed in the repo ────────────────────────────────
{
  ok(exists('supabase/migrations/108_schedule_dependencies.sql'), 'the migration is a numbered file in the repo')
  const sql = read('supabase/migrations/108_schedule_dependencies.sql')

  ok(/schedule_items ADD COLUMN IF NOT EXISTS trade/.test(sql),
    'a line carries its own trade, so a PLACEHOLDER can be depended on by name')

  // The whole progress gate rests on this being nullable.
  ok(/progress_pct NUMERIC\(5, 2\);/.test(sql) && !/progress_pct NUMERIC\(5, 2\) NOT NULL/.test(sql),
    'progress_pct is NULLABLE - "nobody has said" is not "not started"')

  ok(/CONSTRAINT schedule_dependencies_not_self CHECK \(task_id <> predecessor_task_id\)/.test(sql),
    'the database refuses a line that waits for itself, not just the route')
  ok(/CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_dependencies_pair/.test(sql),
    'one link per pair - without it a double press counts the same push twice')

  // A foreign key with no ON DELETE rule is a delete that fails on one row.
  const fks = sql.match(/REFERENCES [a-z_]+ \(id\)[^,\n]*/g) ?? []
  ok(fks.length > 0 && fks.every(f => /ON DELETE (CASCADE|SET NULL)/.test(f)),
    'every foreign key states its ON DELETE rule explicitly')

  // The fallback for a fresh environment has to carry it too.
  ok(exists('supabase/migrations/_combined_008-109.sql'), 'the combined file is bumped to 109')
  ok(/schedule_dependencies/.test(read('supabase/migrations/_combined_008-109.sql')),
    '...and contains the new tables')
  ok(!exists('supabase/migrations/_combined_008-107.sql'), '...and the old name is gone, not left beside it')
  ok(!exists('supabase/migrations/_combined_008-108.sql'),
    '...nor the one before this bump - a fresh environment built from a stale file is the whole risk')
  ok(/_combined_008-109\.sql/.test(read('CLAUDE.md')), '...and CLAUDE.md points at the new name')

  // 109 is a DATA REPAIR, not a schema change, and the combined file is
  // replayed whole on a fresh environment - so it has to be idempotent and it
  // has to be narrow.
  const repair = read('supabase/migrations/109_unstick_linked_schedule_rows.sql')
  ok(/dates_overridden_at = NULL/.test(repair), 'the repair clears the flag')
  ok(/INTERVAL '2 minutes'/.test(repair),
    '...only where ONE SAVE wrote both statements, never a deliberate override days later')
  ok(/109/.test(read('supabase/migrations/_combined_008-109.sql')),
    '...and it is in the combined file too, or a fresh environment is born with the bug')
}

// ── the notification catalog ─────────────────────────────────────────────────
{
  const cat = code('lib/notifications.ts')
  for (const key of ['schedule_shifted', 'schedule_unblocked']) {
    ok(new RegExp(`key: '${key}'`).test(cat),
      `${key} is IN the catalog - a type notify() has never heard of is refused outright`)
  }
  // An entry that is not 'live' never appears in Settings, so its audience is
  // not a setting and nobody can turn it off.
  const shifted = cat.slice(cat.indexOf("key: 'schedule_shifted'"))
  ok(/status: 'live'/.test(shifted.slice(0, 400)), "...and schedule_shifted is live, so it shows in Settings")
  ok(/email: true/.test(shifted.slice(0, 400)),
    '...with email ON by default: finding out at your next login is a crew already on site')
}

// ── every route asks ─────────────────────────────────────────────────────────
{
  const routes = walk('app/api/projects/[id]/schedule').filter((f: string) => /route\.ts$/.test(f))
  ok(routes.length >= 5, `found the schedule routes (${routes.length})`)

  for (const f of routes) {
    const src = code(f)
    const handlers = (src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? []).length
    const gates = (src.match(/requirePermission\(/g) ?? []).length
    ok(gates >= handlers,
      `${f.split('/schedule/')[1] ?? f}: all ${handlers} handler(s) ask permission`)
  }

  // The narrow power gets the narrow permission.
  const item = code('app/api/projects/[id]/schedule/[itemId]/route.ts')
  ok(/requirePermission\(admin\(\), request, 'schedule', 'delete'\)/.test(item),
    'deleting a line needs delete, not edit')

  // Every role that can see the schedule can use the parts the screen offers.
  const { ROLE_DEFAULTS } = require('../permissions') as any
  for (const [role, res] of Object.entries(ROLE_DEFAULTS)) {
    const s = (res as any).schedule ?? {}
    if (!s.view || !s.edit) continue
    ok(!!s.create || !!s.edit, `${role} can edit the schedule, so it can manage dependencies`)
  }
}

// ── the whitelist ────────────────────────────────────────────────────────────
{
  const item = code('app/api/projects/[id]/schedule/[itemId]/route.ts')
  // A whitelist with a field missing fails exactly like a rejection, and only
  // one of them says so - the route drops the field and answers 200.
  for (const field of ['trade', 'progress_pct']) {
    ok(new RegExp(`'${field}'`).test(item.slice(item.indexOf('const allowed'), item.indexOf('const allowed') + 200)),
      `${field} is on the PATCH whitelist, added in the same change as the column`)
  }
  ok(/dates_overridden_at = |dates_overridden_at:/.test(item),
    'editing dates by hand sets the override flag, whatever screen did it')
}

// ── the hand-edit flag, and the two ways it was wrong ────────────────────────
//
// REPORTED: "the cascade ignores linked rows - auto-created rows count as
// hand-set dates". Both halves are the same flag. `dates_overridden_at` takes
// a line OUT of the cascade for ever and nothing was clearing it, so a line
// that was dated and then linked never followed anything.
{
  const item = code('app/api/projects/[id]/schedule/[itemId]/route.ts')

  // Half one: a save that resubmits the same dates is not a decision about
  // them. Every dialog that touches a line posts both dates whether or not
  // they were edited.
  const flagBlock = item.slice(item.indexOf("if ('start_date' in update"))
  ok(/select\('start_date, end_date'\)/.test(flagBlock),
    'the PATCH reads the dates it is about to replace')
  ok(/const changed =/.test(flagBlock) && /if \(changed\) update\.dates_overridden_at/.test(flagBlock),
    '...and only flags the line when they ACTUALLY changed')

  // Half two: linking is the statement that this line follows from now on.
  const deps = code('app/api/projects/[id]/schedule/[itemId]/dependencies/route.ts')
  const afterInsert = deps.slice(deps.indexOf("from('schedule_dependencies').insert"))
  ok(/dates_overridden_at: null/.test(afterInsert),
    'LINKING CLEARS THE FLAG - the link is the decision, and a date typed before it was not')
  ok(/\.eq\('id', params\.itemId\)/.test(afterInsert),
    '...on the line that now waits, which is the one the cascade was skipping')
  // The link is written by this point. A 500 here would strand it.
  ok(/console\.error\(.*clear the hand-edit flag/.test(afterInsert),
    '...and a failure to clear is logged rather than failing the link that already landed')
}

// ── and clearing it at WRITE time was only ever half the fix ─────────────────
//
// SECOND REPORT: "a row with a saved explicit 80% link is excluded when the
// predecessor moves - the general-linked rows shift correctly." Clearing the
// flag as a link is written helps a link written after that code ships, and
// nothing else: every row already linked stayed stuck for ever, with no way out
// but to unlink and link again. So the rule is READ at cascade time.
{
  const pure = code('lib/schedule-dependencies.ts')
  ok(/export function handEditWins/.test(pure),
    'the cascade weighs the two statements rather than letting the flag always win')
  ok(/handEditWins\(child, dep\)/.test(pure),
    '...and pass one skips on that, not on the bare flag')
  ok(!/if \(child\.dates_overridden_at\) continue/.test(pure),
    '...with the bare test gone, so it cannot come back by being the shorter line')
  ok(/created_at/.test(pure), 'a link carries WHEN it was made, which is what decides it')

  // The two passes must agree about one row, or the screen explains a skip
  // that did not happen.
  ok(/const vetoed = /.test(pure) && /vetoed\) \{/.test(pure),
    'and the report asks the SAME question the skip asked')

  // The other contradiction: the dialog commits links and then saves dates, so
  // one save said "this follows Sheetrock" and "ignore Sheetrock" a second
  // apart, with the second winning.
  const cascade = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/body\?\.dates_overridden !== false/.test(cascade),
    'the apply takes an explicit "this is not a hand override", defaulting to the protective answer')
  ok(/markOverridden \?/.test(cascade),
    '...and only stamps the flag when it is true')
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/const justLinked = pendingDeps\.length > 0/.test(page),
    'the dialog knows whether it just linked this row')
  ok(/dates_overridden: !when\.justLinked/.test(page),
    '...and a save that just linked it does not also mark it hand-dated')
}

// ── a percent link never prints as a plain one ───────────────────────────────
//
// REPORTED in the same breath: the review "shortens its label to 'waits on
// Sheetrock', hiding that it's an 80% link". Two rows waiting on one trade
// under different conditions read identically, so the screen could not be used
// to check the thing it was showing.
{
  const pure = code('lib/schedule-dependencies.ts')
  ok(/export function gateOf/.test(pure), 'what a link SAYS is one function')
  ok(/gate: LinkGate \| null/.test(pure), '...and it travels on every reported row')

  const route = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/gate: m\.gate/.test(route) && /gate: s\.gate/.test(route),
    'the route carries it to the screen for both buckets')

  const review = code('components/schedule/cascade-review.tsx')
  ok(/at \$\{gate\.pct\}%/.test(review), 'the label names the percent')
  ok(/plus \$\{gate\.lagDays\}/.test(review), '...and the extra days')
  ok(/linkWords\(m\.link, editedName, m\.gate\)/.test(review)
    && /linkWords\(s\.link, editedName, s\.gate\)/.test(review),
    '...in both lists, from the one function')
}

// ── and the percent has to SURVIVE the trip out of the database ─────────────
//
// The nit that followed: "the review still says just 'waits on Sheetrock' for
// the 80% row - the threshold only shows in the edit panel." The columns are
// NUMERIC(5,2) and PostgREST returns those QUOTED, so every
// `Number.isFinite(value)` in the pure module was false for real data. The
// label was the only VISIBLE symptom; the progress gate silently never fired.
{
  const pure = code('lib/schedule-dependencies.ts')
  ok(/export function toPct/.test(pure), 'one reader coerces a percent off a NUMERIC column')

  // The ratchet that matters: nothing may go back to asking isFinite of a
  // value that came out of the database.
  const finite = pure.match(/Number\.isFinite\([^)]*\)/g) ?? []
  ok(finite.length === 2,
    `only toPct and toAmount ask Number.isFinite, and they ask it of a coerced number (${finite.length})`)
  ok(!/Number\.isFinite\((need|typed|pct|r\.progress_pct)/.test(pure),
    '...never of a column value straight off a row')

  // The picker prints it through the same reader, or a saved link reads
  // "hits 80.00%" - a trailing .00 nobody typed.
  const picker = code('components/schedule/dependency-picker.tsx')
  ok(/pctLabel\(d\.min_predecessor_progress\)/.test(picker),
    'the edit panel prints the percent through pctLabel')
  ok(/min_predecessor_progress: number \| string \| null/.test(picker),
    '...and its type admits the string, so the next reader is forced through it')
}

// ── an empty list is not an answer until it is one ──────────────────────────
//
// REPORTED: "open a linked row's Edit Item and the dependency section says
// 'Nothing - it can start whenever it is scheduled.' even though a link
// exists; clicking Add or reopening makes the link appear."
//
// The links are fetched when the dialog opens, and `existing` is `[]` until
// they land - so one empty array meant "still asking" AND "there are none",
// and the panel stated the second confidently. Add only appeared to fix it: it
// hides that sentence, and by then the fetch had landed.
{
  const picker = code('components/schedule/dependency-picker.tsx')
  ok(/existingState: 'loading' \| 'ready' \| 'failed'/.test(picker),
    'the panel is told which of the three it is looking at')
  ok(/existingState === 'ready' && !open && nothingLinked/.test(picker),
    'THE FIX: "nothing is linked" is only said once that is KNOWN')
  ok(/existingState === 'loading'/.test(picker), '...with something to see while it asks')
  // A failed read saying "nothing" is worse than the original bug: a stale
  // token would tell somebody their links were gone.
  ok(/existingState === 'failed'/.test(picker),
    '...and a FAILED read says so rather than reporting an empty list')

  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  // Read the !res.ok branch SPECIFICALLY. Asserting the string appears
  // anywhere passes on the catch block alone, which is the half that was
  // already there - a pin that cannot tell the two apart is not pinning this.
  // Anchored INSIDE loadDeps. `indexOf` from the top of the file finds another
  // route's `if (!res.ok)` first and slices an empty string, which passes
  // everything - the pin looked right and read nothing.
  const loadDepsSrc = page.slice(page.indexOf('async function loadDeps'))
  const notOk = loadDepsSrc.slice(loadDepsSrc.indexOf('if (!res.ok) {'), loadDepsSrc.indexOf('const d = await res.json()'))
  ok(notOk.length > 0, 'the !res.ok branch of loadDeps is actually being read')
  ok(/setDepsState\('failed'\)/.test(notOk),
    'a non-OK response is reported as FAILED, never as an empty list')
  ok(!/setDepsState\('ready'\)/.test(notOk), '...and never as a ready answer of none')
  ok(/setDeps\(\[\]\); setDepsState\('loading'\)/.test(page),
    '...and opening a row goes back to loading, not to "none"')
  ok(/catch \(e\)/.test(page.slice(page.indexOf('async function loadDeps'))),
    '...and a throw lands somewhere rather than leaving it loading for ever')

  // The other shape of the same bug: open one row, close it, open another, and
  // the first response lands last and paints the wrong line's links.
  ok(/depsFor\.current = itemId/.test(page) && /depsFor\.current === itemId/.test(page),
    'a response that is no longer the one being waited for is DROPPED')
}

// ── every linked line is in one bucket or the other ──────────────────────────
//
// REPORTED: "the review screen drops linked rows - every linked row should
// appear, in one bucket or the other, labeled with its link type." A linked
// line missing from the review reads as a line that was never linked, which is
// the single thing the screen exists to show.
{
  const pure = code('lib/schedule-dependencies.ts')
  for (const reason of ['manually_overridden', 'no_shift', 'chain_stopped']) {
    ok(new RegExp(`'${reason}'`).test(pure), `${reason} is one of the reasons a line is not moving`)
  }
  // Pass one walks only what it can compute; anything behind a hand-dated line
  // never appears in it, and reporting off pass one alone is how rows vanished.
  ok(/const walk: string\[\] = \[movedId\]/.test(pure) && /const queue: string\[\] = \[movedId\]/.test(pure),
    'the report is built by a SECOND walk over every line the links reach')
  ok(/linkOf|LinkKind/.test(pure), 'and each one is labelled direct or downstream')

  const route = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/link: s\.link/.test(route) && /link: m\.link/.test(route),
    'the route carries the link kind through to the screen for both buckets')

  const review = code('components/schedule/cascade-review.tsx')
  ok(/function whyStill/.test(review),
    'the screen has ONE place each reason is put into words')
  for (const reason of ['manually_overridden', 'no_shift', 'chain_stopped']) {
    ok(new RegExp(`case '${reason}'`).test(review), `...including ${reason}`)
  }
  ok(/function linkWords/.test(review), '...and one place the link kind is')
}

// ── a review with nothing to review is not a step ────────────────────────────
//
// REPORTED: the screen stopped on "Nothing else moves / Moving Electrical"
// with two buttons about emailing nobody, and the modal sat over the editor.
{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/if \(!moves\.length && !skipped\.length\)/.test(page),
    'with nothing else touched the review is SKIPPED, not shown empty')
  ok(/applyCascade\(false, \{ start: editStart, end: editEnd, justLinked \}\)/.test(page),
    '...and it applies with notify FALSE - there is nobody on the list, not a guess')
  ok(/\{editItem && !pending && \(/.test(page),
    'and the editor is not left open underneath the review - two overlays at once')
}

// ── no email without the review screen ───────────────────────────────────────
{
  const cascade = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')

  // THE SAFETY PROPERTY. `notify` has no default on purpose: false would make
  // an un-updated caller silently stop telling anybody, true would make one
  // silently start emailing. Neither is a thing to guess at.
  ok(/typeof body\?\.notify !== 'boolean'/.test(cascade),
    'the apply route REFUSES a body that does not say whether to notify')
  ok(!/notify\s*(=|\?\?)\s*(true|false)/.test(cascade),
    '...and there is no default anywhere for it to fall back to')

  // The preview must not write. A preview that wrote would make "Shift
  // silently" and "Cancel" the same button.
  const preview = cascade.slice(cascade.indexOf('export async function POST'), cascade.indexOf('export async function PUT'))
  ok(preview.length > 100, 'found the preview handler')
  ok(!/\.update\(|\.insert\(|\.delete\(/.test(preview),
    'THE PREVIEW CHANGES NOTHING - no update, insert or delete in it')
  ok(/sendEmail\(/.test(cascade) && !/sendEmail\(/.test(preview),
    '...and sends no email')

  // Both halves computed by ONE function, or the screen somebody approved and
  // the thing that happened can drift.
  ok((cascade.match(/await plan\(/g) ?? []).length === 2,
    'preview and apply both go through the same plan(), so they cannot disagree')

  // The bell is a different channel and is never the duplicate; a second
  // letter is.
  ok(/inAppOnly: true/.test(cascade), 'the in-app notification is inAppOnly, because the email already went')
}

// ── one email per sub, not per task ──────────────────────────────────────────
{
  const email = code('lib/email.ts')
  ok(/export function scheduleShiftEmail/.test(email), 'there is a shift template')
  ok(/lines: ShiftedLine\[\]/.test(email),
    'THE SPEC: it takes a LIST of lines, so one sub with two phases gets one letter')
  ok(/export function scheduleUnblockedEmail/.test(email), 'and an unblocked template')

  const cascade = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  // The loop is over SUBS, not over moves.
  ok(/for \(const sub of p\.affected\)/.test(cascade),
    '...and the route loops over subs, not over moved lines')
}

// ── every send is logged, and a row never claims one that did not happen ─────
{
  const sql = read('supabase/migrations/108_schedule_dependencies.sql')
  ok(/sent_at TIMESTAMPTZ,/.test(sql) && !/sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW\(\)/.test(sql),
    'sent_at has no default - a default would be the row claiming an email went out')

  const cascade = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/send_error/.test(cascade), 'a failed send is recorded as a failure, not as silence')
  ok(/schedule_shift_notices/.test(cascade), 'every send is logged against the line')
}

// ── the review screen is a real overlay ──────────────────────────────────────
{
  const review = code('components/schedule/cascade-review.tsx')
  ok(/className="overlay"/.test(review), 'the review screen uses .overlay, not a hand-rolled fixed inset-0')
  ok(/data-overlay/.test(review), '...and carries data-overlay, so the page behind it freezes')
  ok(!/max-h-\[90vh\]/.test(review), '...and does not re-add a vh cap, which knows nothing about the notch')
  ok(/row-even/.test(review), 'its controls reach both edges on a phone')
  ok(/finally \{ setBusy\(null\) \}/.test(review),
    'the busy state ends in finally - the happy path is not the only way out')

  // Both choices are real buttons. A single primary with a quiet checkbox is a
  // decision somebody makes by not noticing.
  ok(/Notify subs/.test(review) && /Shift silently/.test(review),
    'notify and silent are BOTH buttons, so the choice has to be made')
}

// ── every date field on this page is a real, labelled field ─────────────────
{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')

  // REPORTED: "still get this basic date picker". Setting a vendor's dates was
  // an inline form wedged into the amber strip - two `h-8 text-xs` date boxes
  // with NO <Label> on either, "to" as the only clue which was which, and
  // `required` doing the validating, so the only message anybody ever saw was
  // the browser's own grey bubble pointing at an unlabelled box.
  ok(!/type="date"[^>]*className="w-36 h-8/.test(page),
    'no 32px unlabelled date box - a form control is 44px on a phone')
  ok(!/className="w-36 h-8 text-xs"/.test(page),
    '...and nothing sets a 12px control, which makes iOS zoom the page on focus')

  // Every date input is now inside a dialog with a Label pointing at it.
  const ids = Array.from(page.matchAll(/<Input id="([a-z]+)" type="date"/g)).map(m => m[1])
  ok(ids.length >= 4, `found the date fields (${ids.length})`)
  for (const id of ids) {
    ok(new RegExp(`<Label htmlFor="${id}">`).test(page), `${id} has a Label pointing at it`)
  }

  // A field is MARKED or it is guessed at.
  const setDates = page.slice(page.indexOf('{schedulingSubId && ('))
  ok((setDates.match(/text-danger">\*<\/span>/g) ?? []).length >= 1,
    'the required fields carry their asterisk')

  // The guard is a shared function, not `required`, so the message is ours and
  // names the field - the same shape as missingMilestone beside it.
  ok(/function missingSchedule\(/.test(page),
    'there is a missingSchedule, beside missingMilestone so the two cannot drift')
  ok(/const missing = missingSchedule\(/.test(page),
    '...and the submit asks it at the FIELD before sending')
  ok(!/id="sstart"[^>]*required/.test(page) && !/id="send"[^>]*required/.test(page),
    '...rather than leaning on `required` and the browser\'s own bubble')
  ok(/disabled=\{schedSaving\}/.test(page),
    'the button is disabled only for in-flight')

  // And it is a real overlay, like every other dialog on this page.
  ok(/\{schedulingSubId && \(\s*<div className="overlay/.test(page),
    'setting dates opens .overlay, not an inline row')
  ok(setDates.slice(0, 400).includes('data-overlay'),
    '...carrying data-overlay so the page behind it freezes')
}

// ── the picker is reachable from EVERY way a line gets made ──────────────────
{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')

  // THE REPORT: "i just see this / nothing republished", with the "vendors not
  // yet scheduled" strip on screen. The deploy was fine. The picker rendered
  // only inside the EDIT dialog, so on a job with no schedule lines yet there
  // was nothing to open and the whole feature was unreachable - which looks
  // exactly like a deploy that did not happen. The spec says creating OR
  // editing, and only editing was wired.
  const creators = ['async function scheduleSubcontract', 'async function addItem']
  for (const fn of creators) {
    const at = page.indexOf(fn)
    ok(at > -1, `found ${fn.replace('async function ', '')}`)
    const body = page.slice(at, at + 1600)
    ok(/openEdit\(created\)/.test(body),
      `...and it hands straight to the dependency prompt after the dates`)
  }

  // It must open the LOADED row, not the one the POST hands back: that row
  // carries no `subcontracts` join, and `scheduleLabel` reads the join to name
  // a sub's line, so the dialog would say "Untitled".
  ok(/async function load\(\): Promise<ScheduleItem\[\]>/.test(page),
    'load() returns the fresh list, because state is not readable in the same closure')
  ok(!/openEdit\(r\.data/.test(page),
    '...and nothing opens the bare POST row')
}

// ── one dialog, one save ─────────────────────────────────────────────────────
{
  const picker = code('components/schedule/dependency-picker.tsx')
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')

  // REPORTED: "why is it a 2 step". Adding a link wrote itself immediately
  // through its own route while "Save Changes" saved the label and dates - two
  // buttons in one dialog each saving a different half, and Cancel after Link
  // left something written.
  ok(!/fetch\(/.test(picker),
    'THE REPORT: the picker makes NO request of its own - it is a form, not a save button')
  ok(/onStage/.test(picker) && /onStageRemoval/.test(picker),
    '...adding and removing are both STAGED, so the dialog is honest in both directions')
  ok(/async function commitDependencies/.test(page),
    '...and one function writes them, run from saveEdit')

  // Links before the cascade preview, or the review screen shows the wrong set.
  const save = page.slice(page.indexOf('async function saveEdit'))
  const commitAt = save.indexOf('commitDependencies')
  const previewAt = save.indexOf('/cascade')
  ok(commitAt > -1 && previewAt > commitAt,
    '...committed BEFORE the cascade preview, which would otherwise miss them')

  // Cancel has to actually cancel now that things are staged.
  ok((page.match(/setPendingDeps\(\[\]\); setRemovingDeps\(\[\]\)/g) ?? []).length >= 3,
    'Cancel, the close button and opening another line all discard the staging')
}

// ── the unit is on the screen, and the two options read as sentences ─────────
{
  const picker = read('components/schedule/dependency-picker.tsx')

  // REPORTED: "it doesnt say %". A number box labelled "How far along?" is a
  // number with no unit anywhere near the value.
  ok(/<span className="text-muted-fg">%<\/span>/.test(picker),
    'THE REPORT: the % sign is in the row, right after the field')

  // REPORTED: "how far along between needs a or between the 2 options". Two
  // bare boxes side by side state nothing about how they relate.
  ok(/Wait till they&apos;re/.test(picker) && /done/.test(picker),
    'the progress gate finishes its own sentence')
  ok(/>Plus</.test(picker) && /extra days/.test(picker),
    '...and the lag finishes a different one')
  ok(/Leave these blank and it starts when they&apos;re done/.test(picker),
    '...under a heading that says what leaving both blank means')

  // FIELD LANGUAGE, asked for by name. These are the words a GC uses; the
  // earlier set read like a form written by somebody who does not build.
  // The "not" half reads the COMMENT-STRIPPED source. A file that explains why
  // a phrase was replaced necessarily contains the old phrase, and a raw scan
  // finds its own explanation - this repo has paid for that twice already.
  const pickerCode = code('components/schedule/dependency-picker.tsx')
  for (const [was, now] of [
    ['Depends on another trade?', "Can&apos;t start till another trade finishes?"],
    ['Waits for', 'After:'],
    ['The trade I need is not in the list', 'My trade&apos;s not here'],
  ] as const) {
    ok(picker.includes(now), `says "${now}"`)
    ok(!pickerCode.includes(was), `...and not "${was}"`)
  }

  // THE ONE ANSWER MOST PEOPLE WANT IS "after the sheetrock guy". The percent
  // gate and the extra days are real and they were in everybody's way - two
  // boxes on the main path for a question almost nobody asks.
  ok(/const \[showMore, setShowMore\] = useState\(false\)/.test(code('components/schedule/dependency-picker.tsx')),
    'the extra options start COLLAPSED - the default path is a trade and nothing else')
  ok(/More options - wait for a %, or leave extra days/.test(picker),
    '...and the tap says what is behind it, so nobody opens it to find out')
  const progressAt = picker.indexOf('id="dep-progress"')
  const moreAt = picker.indexOf('showMore ? (')
  ok(progressAt > moreAt && moreAt > -1,
    '...with both fields INSIDE it, not merely styled as secondary')
  ok(!/How far along\? \(optional\)/.test(picker) && !/Days in between \(optional\)/.test(picker),
    '...and neither is a bare "(optional)" label with no unit and no sentence')

  // A saved link reads back as the same sentence rather than a field dump.
  ok(/function describe\(/.test(code('components/schedule/dependency-picker.tsx')),
    'a link in the list is described in words, not as its columns')

  // The dates in the select were raw ISO, truncated mid-string by the control.
  ok(/formatDateShort\(l\.start_date\)/.test(picker),
    'the predecessor options print friendly dates, not 2026-07-06')
}

// ── the picker ───────────────────────────────────────────────────────────────
{
  const picker = code('components/schedule/dependency-picker.tsx')
  ok(/-- Select --/.test(picker),
    'the predecessor select starts EMPTY - a useState default on a required select is a claim')
  ok(/onAddPlaceholder/.test(picker),
    'THE SPEC: a trade with no line yet can be added inline rather than blocking')
  // "Add this link" does no network work any more - it stages - so there is
  // nothing to be in flight for and it is never disabled. The one button that
  // DOES make a request (adding a placeholder line) still guards itself, and
  // nothing anywhere greys out over a field somebody has not filled in yet.
  ok(!/disabled=\{!predecessor/.test(picker) && !/disabled=\{!progress/.test(picker),
    'nothing is greyed out over an empty field - it fires and answers with what is missing')
  ok(/disabled=\{savingPlaceholder\}/.test(picker),
    '...and the one button that does make a request guards against a double press')
  ok(/aria-label=/.test(picker), 'the icon-only buttons are labelled')
  ok(!/opacity-0 group-hover/.test(picker), 'nothing is hover-revealed - there is no hover on a phone')
}

done()
