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
  ok(exists('supabase/migrations/_combined_008-108.sql'), 'the combined file is bumped to 108')
  ok(/schedule_dependencies/.test(read('supabase/migrations/_combined_008-108.sql')),
    '...and contains the new tables')
  ok(!exists('supabase/migrations/_combined_008-107.sql'), '...and the old name is gone, not left beside it')
  ok(/_combined_008-108\.sql/.test(read('CLAUDE.md')), '...and CLAUDE.md points at the new name')
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
  ok(/Do not start until they are/.test(picker) && /done/.test(picker),
    'the progress gate finishes its own sentence')
  ok(/Then wait/.test(picker) && /days before starting/.test(picker),
    '...and the lag finishes a different one')
  ok(/Leave these alone and this line simply waits for that one to finish/.test(picker),
    '...under a heading that says what leaving both blank means')
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
