/**
 * "YOU'RE CLEAR TO START" - THE LETTER THAT HAD NEVER BEEN SENT.
 *
 * The route that sends this shipped with the percent gate. The email template,
 * the notification type (`status: 'live'`, so every user had a toggle for it),
 * the demo-board sample and the `unblocked` row in `schedule_shift_notices`
 * all existed. What did not exist was a CALLER: a repo-wide search for
 * `schedule/unblocked` outside the route's own file returned nothing at all.
 *
 * So the published release note - "when it clears, the sub gets a 'you are
 * clear to start' email" - and the public scheduling guide - "the sub who just
 * became unblocked is told" - both described something that could not happen.
 * A feature reachable from no door is indistinguishable from a deploy that
 * never went out, which is the failure this codebase has now paid for three
 * times.
 *
 * THE BUG THAT WOULD HAVE COST THE MOST is not the missing screen, though.
 * The old route mapped one row PER DEPENDENCY and called everything unblocked
 * `cleared`. A line waiting on two trades appeared there the moment EITHER
 * gate opened, so the first thing this feature would have done on reaching a
 * real job is tell a crew to turn up to a wall that is not there.
 */
import { ok, done, code, read, exists, migrationFiles } from './_helpers'
import { gatePicture, clearToTell } from '../schedule-unblocked'
import type { Dependency, Progress, ScheduleLine } from '../schedule-dependencies'

console.log('\n\x1b[1mschedule-unblocked\x1b[0m')

const line = (id: string, extra: Partial<ScheduleLine> = {}): ScheduleLine => ({
  id, trade: id, label: null,
  start_date: '2026-10-13', end_date: '2026-10-20',
  subcontract_id: `sub-${id}`,
  ...extra,
})

const LINES: ScheduleLine[] = [
  line('framing'),
  line('plumbing'),
  line('drywall'),
]

const dep = (task: string, pred: string, pct: number | string | null): Dependency =>
  ({ id: `${task}<-${pred}`, task_id: task, predecessor_task_id: pred, min_predecessor_progress: pct, lag_days: 0 })

/** A progress lookup built from a plain table. Missing means nobody has said. */
const at = (table: Record<string, number>) => (id: string): Progress =>
  id in table ? { pct: table[id], source: 'entered' } : { pct: null, source: 'unknown' }

const find = (rows: ReturnType<typeof gatePicture>, id: string) => rows.find(r => r.taskId === id)

// ── THE ONE THAT PUTS A CREW ON A SITE, pinned first ────────────────────────
{
  // Drywall waits on BOTH framing and plumbing, each at 80%. Framing is there;
  // plumbing is nowhere near.
  const deps = [dep('drywall', 'framing', 80), dep('drywall', 'plumbing', 80)]
  const rows = gatePicture(LINES, deps, at({ framing: 90, plumbing: 20 }))

  ok(rows.length === 1, 'a line with two gates is ONE row, not one row per link')

  const drywall = find(rows, 'drywall')
  ok(drywall?.blocked === true,
    'THE ONE THAT WOULD PUT A CREW ON A SITE: a line is blocked while ANY of its gates is shut')
  ok(clearToTell(rows).length === 0,
    '...and it is never offered for a "you are clear to start" letter')
  ok(drywall?.gates.length === 2, 'both gates are reported, not just the shut one')
  ok(/plumbing/i.test(drywall?.reason ?? ''),
    '...and the reason names the trade that is actually holding it, not the one that cleared')
}

// ── clear means every gate ──────────────────────────────────────────────────
{
  const deps = [dep('drywall', 'framing', 80), dep('drywall', 'plumbing', 80)]
  const rows = gatePicture(LINES, deps, at({ framing: 90, plumbing: 85 }))
  ok(find(rows, 'drywall')?.blocked === false, 'both gates open means the line is clear')
  ok(clearToTell(rows).length === 1, '...and it is offered once')
}

// ── a plain link is not a gate ──────────────────────────────────────────────
{
  // THE BLAST RADIUS. Every live row has a null percent. A plain "after them"
  // link has no moment at which it "clears" - it is a statement about order,
  // which the cascade already acts on. Counting it here would put every linked
  // line on a screen about gates and offer a letter for each one.
  const rows = gatePicture(LINES, [dep('drywall', 'framing', null)], at({ framing: 10 }))
  ok(rows.length === 0,
    'THE BLAST RADIUS: a link with NO percent is not a gate and never appears')
  ok(clearToTell(rows).length === 0, '...so nobody is ever told about one')
}

// ── a NUMERIC column comes back QUOTED ──────────────────────────────────────
{
  // PostgREST serialises numeric as a string. `Number.isFinite("80.00")` is
  // false, and a gate read that way is a gate that never fires while looking
  // exactly like one whose condition is met.
  const rows = gatePicture(LINES, [dep('drywall', 'framing', '80.00')], at({ framing: 90 }))
  ok(rows.length === 1, 'a quoted numeric percent is still a gate')
  ok(find(rows, 'drywall')?.blocked === false, '...and it is read as 80, not discarded')
  ok(find(rows, 'drywall')?.gates[0].need === 80, '...and reported as a number')
}

// ── unknown blocks, and says which kind of blocked it is ────────────────────
{
  const rows = gatePicture(LINES, [dep('drywall', 'framing', 80)], at({}))
  const r = find(rows, 'drywall')
  ok(r?.blocked === true, 'nobody has said how far along framing is, so the gate HOLDS')
  ok(r?.unknown === true, '...and says it is held because nobody has said')
  ok(clearToTell(rows).length === 0, '...and is never offered as clear')
}
{
  // One trade genuinely early, one unreported. The early one is what is
  // holding it, and "nobody has said" would send somebody to chase the wrong
  // question.
  const deps = [dep('drywall', 'framing', 80), dep('drywall', 'plumbing', 80)]
  const rows = gatePicture(LINES, deps, at({ framing: 10 }))
  ok(find(rows, 'drywall')?.blocked === true, 'early plus unreported is still blocked')
  ok(find(rows, 'drywall')?.unknown === false,
    '...but NOT reported as "nobody has said" while a trade is genuinely early')
}

// ── a link whose ends are not both on the board reports nothing ─────────────
{
  const rows = gatePicture(LINES, [dep('drywall', 'ghost', 80)], at({ ghost: 90 }))
  ok(rows.length === 0,
    'a link to a line that is not on the board reports NOTHING - a row the reader cannot find is worse than one left out')
}

// ── told once, and only once ────────────────────────────────────────────────
{
  const deps = [dep('drywall', 'framing', 80)]
  const told = gatePicture(LINES, deps, at({ framing: 90 }), id => (id === 'drywall' ? '2026-09-20T10:00:00Z' : null))
  ok(find(told, 'drywall')?.blocked === false, 'a told line is still shown as clear on the board')
  ok(clearToTell(told).length === 0,
    'THE DOUBLE PRESS: a line already told is never offered again - a second press is a second identical email')
}

// ── nobody to tell is not an offer ──────────────────────────────────────────
{
  const lines = [line('framing'), line('drywall', { subcontract_id: null })]
  const rows = gatePicture(lines, [dep('drywall', 'framing', 80)], at({ framing: 90 }))
  ok(find(rows, 'drywall')?.blocked === false, 'a milestone with no sub can still be clear')
  ok(clearToTell(rows).length === 0,
    '...but is never OFFERED, because a letter to nobody is the "two buttons about emailing nobody" failure again')
}

// ── the verdict is never re-worded ──────────────────────────────────────────
{
  const src = code('lib/schedule-unblocked.ts')
  ok(/blockedBy\(/.test(src),
    'the verdict comes from `blockedBy`, so the board and the cascade review cannot say different things about one gate')
  ok(!/Waiting on .*to reach/.test(src),
    '...and its sentence is not written a second time here')
}

// ── THE DOOR. The whole reason this feature did not exist ───────────────────
{
  ok(exists('components/schedule/unblocked-review.tsx'), 'there is a review screen')

  const page = read('app/(dashboard)/projects/[id]/schedule/page.tsx')
  // `<` ON PURPOSE. The first version of this line searched for the bare
  // name, which the IMPORT satisfies - so deleting the banner from the JSX
  // left the suite green. A scan that passes for the wrong reason is worse
  // than no scan.
  ok(/<UnblockedBanner/.test(page) && /<UnblockedReview/.test(page),
    'THE MISSING DOOR: the schedule page RENDERS the banner AND the review screen, not merely imports them')
  ok(/schedule\/unblocked/.test(page),
    '...and something on it actually posts to the route - which nothing in the repo did for two releases')
  ok(/clearToTell\(/.test(page),
    '...and the screen decides who to offer with the SAME function the route re-checks with')

  const route = code('app/api/projects/[id]/schedule/unblocked/route.ts')
  ok(/clearToTell\(/.test(route),
    'the route asks it again at send time - a stale tab must not be able to tell a crew they are clear')
  ok(!/from\s+'@supabase\/supabase-js'[\s\S]*budget_line_items/.test(route),
    'the route no longer carries its own copy of the budget roll-up')
  ok(/readGatePicture/.test(route), '...it reads through the one reader')
}

// ── ONE READER, which is the third of the three gaps ────────────────────────
{
  const reader = code('lib/schedule-unblocked-read.ts')
  ok(/progressReader\(/.test(reader),
    'the gate picture is built on `progressReader`, not a second inline budget query')

  const payload = code('app/api/projects/[id]/schedule/route.ts')
  ok(/readGatePicture/.test(payload),
    'the schedule payload serves the picture, so the board needs no extra round trip')
  // Against the `.select()` STRING, not the file. The route also declares a
  // type naming that column, which kept this green while the query had
  // stopped asking for it.
  const linkSelect = /\.select\('([^']*task_id[^']*)'\)/.exec(payload)?.[1] ?? ''
  ok(/min_predecessor_progress/.test(linkSelect),
    'THE GATE COLUMNS: the links SELECT asks for the percent, or the board cannot tell a gate from a plain link')
}

// ── EVERY COLUMN THE GATE READS EXISTS ──────────────────────────────────────
{
  // THE BUG THIS PINS, found by running the feature's own query against the
  // live database rather than against a fixture: `progressReader` selected
  // `amount` from `budget_line_items`, and that table has never had a column
  // by that name - the money is `budgeted_amount`. PostgREST refuses the
  // ENTIRE query for one unknown column, so the roll-up returned nothing, and
  // `lineProgress` answered `unknown` for every gate on every job. Unknown
  // BLOCKS, which is the safe direction and therefore the silent one: the
  // budget half of the percent gate had never worked once, and no suite could
  // see it because the fixtures were written with the same wrong key.
  //
  // So this reads the SELECT and checks each column against the migrations,
  // which is the only source that knows what the table is.
  const reader = read('lib/schedule-progress-read.ts')
  const select = /\.select\('([^']+)'\)/.exec(reader)?.[1] ?? ''
  ok(select.length > 0, 'the budget roll-up has a select to check')

  const sql = migrationFiles()
    .filter(f => f.endsWith('.sql'))
    .map(f => read(`supabase/migrations/${f}`))
    .join('\n')

  const columns = select.split(',').map(c => c.trim()).filter(Boolean)
  ok(columns.length >= 3, `...naming ${columns.length} columns`)
  for (const col of columns) {
    // The column has to appear in a statement about this table: either the
    // CREATE TABLE body or an ALTER TABLE ... ADD COLUMN.
    const declared = new RegExp(`\\b${col}\\b`).test(sql)
    ok(declared, `budget_line_items.${col} is a column that actually exists`)
  }
  ok(!/\bamount\b/.test(select.replace(/budgeted_amount/g, '')),
    'THE ONE THAT MADE EVERY GATE ANSWER "NOBODY HAS SAID": it does not select a bare `amount`')

  // And the pure side agrees with it, or the mapping just moves the bug.
  const deps = read('lib/schedule-dependencies.ts')
  ok(/budgeted_amount\?:/.test(deps),
    'BudgetProgressRow describes the real table, so the next reader is forced through the right key')
  ok(/toAmount\(r\.budgeted_amount\)/.test(code('lib/schedule-dependencies.ts')),
    '...and the weighting reads it')
}

// ── the letter says a date a human can check ────────────────────────────────
{
  const email = code('lib/email.ts')
  const fn = email.slice(email.indexOf('export function scheduleUnblockedEmail'))
  const body = fn.slice(0, fn.indexOf('\nexport '))
  ok(/dateWords\(/.test(body),
    'THE WEEKDAY IS LOAD-BEARING: the start date is words, not "2026-10-24"')
  ok(!/You are down for \$\{startDate\}/.test(body),
    '...and the raw column is not interpolated into the one sentence the sub acts on')
}

done()
