// A DELIVERY DELAY LOGGED ON SITE REACHES THE SCHEDULE - without moving it.
//
// "when a daily log marks a delayed delivery - the reason is pulling from the
// weather, can it connect the dots here?"
//
// The dots connect through a HANDOFF, not a trigger. The people who watch a
// delivery fail to arrive are precisely the people without `schedule: edit`, so
// the log records the fact and somebody entitled acts on it. Everything pinned
// here is a way that could quietly stop being true.

import { ok, done, code, read, readCombined } from './_helpers'
import {
  DELAY_TYPES, logDelayProblem, cleanDelays, delaysWithALine,
  delayReasonFromLog, logSaysSomething, isDelayType,
} from '../daily-log-delays'

console.log('\ndaily-log-delays')

// ── migration 114: the table the app writes to is the table the file builds ──
{
  const sql = read('supabase/migrations/114_daily_log_catch_up.sql')
  const combined = readCombined()

  // NINE columns lived in production with no migration. A fresh environment
  // built from the combined file got a `daily_logs` the app writes to and
  // cannot - the single thing that file exists to prevent.
  for (const col of [
    'created_by_name', 'delays', 'has_issues', 'issue_description',
    'workers_on_site', 'photos', 'temp_f',
  ]) {
    ok(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`).test(sql),
      `114 adds ${col}, which only production had`)
    ok(new RegExp(`\\b${col}\\b`).test(combined),
      `...and the combined file carries ${col} too`)
  }

  // IF NOT EXISTS throughout, or this is a change rather than a reconciliation
  // and it fails against the database it was written from.
  const adds = sql.match(/ALTER TABLE daily_logs ADD COLUMN[^;]*/g) ?? []
  ok(adds.length > 0 && adds.every(a => /IF NOT EXISTS/.test(a)),
    'every add is IF NOT EXISTS - a no-op here, a repair everywhere else')

  // ONE FACT, ONE HOME. Both weather columns held data and the UI chained `??`
  // between them, which is the tell. The merge only writes where the live
  // column is EMPTY, so a real answer can never be overwritten by a replay.
  ok(/SET weather = weather_condition\s+WHERE weather IS NULL/.test(sql),
    'the weather merge never overwrites a real answer')
  ok(/temp_f = temperature::integer/.test(sql) && /temp_f IS NULL/.test(sql),
    '...and neither does the temperature merge')
  ok(/~ '\^\[0-9\]\+\$'/.test(sql),
    "...and a TEXT column is checked before it is cast - \"58F\" would take the whole migration down")
  ok(/DROP COLUMN IF EXISTS weather_condition/.test(sql)
    && /DROP COLUMN IF EXISTS temperature/.test(sql),
    'the dead columns are DROPPED - a second home nobody writes is the next reader\'s trap, not a backup')

  // The `??` chain is what the drop exists to make impossible. Anything still
  // reading the fossil is reading a column that is gone.
  const readers = [
    'app/(dashboard)/projects/[id]/daily-logs/page.tsx',
    'app/api/projects/[id]/daily-logs/route.ts',
    'app/api/my-jobs/[projectId]/route.ts',
  ]
  for (const f of readers) {
    ok(!/\?\? *\w*\.?weather_condition/.test(code(f)),
      `${f} no longer chains a fallback to the dropped column`)
  }
  ok(!/weather_condition/.test(code('app/api/my-jobs/[projectId]/route.ts')),
    'and my-jobs does not SELECT it - an unknown column refuses the ENTIRE query, which reads as "no logs"')
}

// ── the delay rows themselves ────────────────────────────────────────────────
{
  ok(logDelayProblem({ type: '', description: 'Truck never showed' }) !== null,
    'a delay with no type is refused - the picker starts empty on purpose')
  ok(logDelayProblem({ type: 'Sunspots', description: 'Truck never showed' }) !== null,
    '...and a type off the list is refused, or the list is decoration')
  ok(logDelayProblem({ type: 'Weather', description: '' }) !== null,
    'a delay with no description is refused')
  ok(logDelayProblem({ type: 'Weather', description: 'wet' }) !== null,
    '...and one too short to say more than the type already says')
  ok(logDelayProblem({ type: 'Weather', description: 'Rained out all morning' }) === null,
    'a real delay passes')
  ok(isDelayType('Material Delivery') && !isDelayType('material delivery'),
    'the type is matched against the list, not guessed at')

  // A HALF-TYPED ROW MUST NOT COST SOMEBODY THEIR WHOLE DAY'S LOG. The log is
  // filed from a phone at the end of a day on a site; refusing all of it over
  // one blank description is the wrong trade.
  const cleaned = cleanDelays([
    { type: 'Weather', description: 'Rained out all morning' },
    { type: '', description: '' },
    { type: 'Material Delivery', description: 'Lumber truck never showed', schedule_item_id: 'abc' },
  ])
  ok(cleaned.length === 2, 'a bad row is DROPPED, never a reason to refuse the whole log')
  ok(cleanDelays('not an array').length === 0 && cleanDelays(null).length === 0,
    'and a body that is not a list is not a crash')

  ok(delaysWithALine(cleaned).length === 1,
    'only a row naming a line can move one - the rest are recorded and nothing more')

  // THE LABEL TRAVELS WITH THE ID. A jsonb id carries no foreign key and so no
  // ON DELETE rule; the line can be deleted next March and this log still has
  // to read. Same shape as `subs_on_site`, which stores `{ company_id, name }`.
  const labelled = cleanDelays([{
    type: 'Material Delivery', description: 'Lumber truck never showed',
    schedule_item_id: 'abc', schedule_item_label: 'Delivery - ACME Supply',
  }])
  ok(labelled[0].schedule_item_label === 'Delivery - ACME Supply',
    'the line NAME is stored beside the id, so a deleted line cannot damage the record')
  // `read`, not `code`: the justification lives in a comment, and `code()`
  // strips those. A denormalised field with no stated reason reads as
  // sloppiness to the next person, who tidies it away.
  ok(/subs_on_site/.test(read('lib/daily-log-delays.ts')),
    '...and the comment says which existing column it copies, or the next reader calls it sloppiness')
}

// ── the drafted reason, and what it may not claim ────────────────────────────
{
  const log = { log_date: '2026-09-22', weather: 'rainy' }

  const weather = delayReasonFromLog({ type: 'Weather', description: 'Rained out' }, log)
  ok(/\(rainy\)/.test(weather), 'a WEATHER delay carries the day\'s condition')
  ok(/From the site log of/.test(weather),
    '...and NAMES THE LOG rather than stating the weather as a fact about the day')
  ok(/Tue Sep 22/.test(weather),
    '...with the WEEKDAY, which is how a day gets checked against a diary')

  // A DELIVERY HELD UP BY A MISSING DRIVER HAS NOTHING TO DO WITH THE WEATHER.
  // Putting the day's condition in that reason would invent a cause.
  const delivery = delayReasonFromLog(
    { type: 'Material Delivery', description: 'Lumber truck never showed' }, log)
  ok(!/rainy/.test(delivery), 'a non-weather delay does NOT borrow the weather as its cause')

  // `weatherOption` returns null for a value nobody chose, deliberately - the
  // same reason `weatherIcon` refuses a default sun. A condition quoted back as
  // why a crew was stood down is worse than no clause.
  const unknown = delayReasonFromLog(
    { type: 'Weather', description: 'Rained out' },
    { log_date: '2026-09-22', weather: 'drizzle-ish' })
  ok(!/drizzle-ish/.test(unknown),
    'an unrecognised condition DROPS the clause rather than printing itself')

  ok(!/From the site log/.test(
    delayReasonFromLog({ type: 'Weather', description: 'Rained out' }, { log_date: '' })),
    'and with no date there is no sentence claiming one')

  // `dateWords`, never toLocaleDateString: this string can reach a sub's inbox
  // through the shift email, and a server must not ask its own machine what day
  // it is. `.withWeekday` because dateWords returns an OBJECT - interpolating
  // it type-checks perfectly and prints "[object Object]".
  const src = code('lib/daily-log-delays.ts')
  ok(/dateWords\(/.test(src) && !/toLocaleDateString/.test(src),
    'the date is words from a fixed table, not the server\'s locale')
  ok(/when\.withWeekday/.test(src), '...read off the object, not interpolated whole')
}

// ── a log has to say something, and a delay IS something ─────────────────────
{
  ok(!logSaysSomething({}), 'an empty log is refused')
  ok(!logSaysSomething({ survey: { a: { answer: 'na', description: '' } } }),
    "an untouched survey is not a report - every question starts at 'na'")
  ok(logSaysSomething({ notes: 'Poured the slab' }), 'a note is a report')
  ok(logSaysSomething({ photos: 1 }), 'so is a photo')
  ok(logSaysSomething({ workers: 3 }), 'so is who was there')
  // THE BUG THIS FUNCTION EXISTS FOR: the rule was hand-copied into the page
  // and the route, and neither copy counted a delay - so the one log this
  // feature exists to collect was refused by both doors.
  ok(logSaysSomething({ delays: [{ type: 'Weather', description: 'Rained out' }] }),
    'AND SO IS A DELAY - the whole content of the log this feature collects')
}

// ── the picker's route is gated on the page's OWN permission ─────────────────
{
  const route = code('app/api/projects/[id]/daily-logs/lines/route.ts')
  ok(/requirePermission\(db, request, 'daily-logs', 'view'\)/.test(route),
    "the lines route asks for `daily-logs: view` - the page's own gate")
  ok(!/'schedule'/.test(route),
    '...never `schedule`, which a WORKER does not hold at all - and a worker is who watched the delivery not arrive')

  // A refused query returns null and the `?? []` swallows it, so an empty
  // picker reads as "this job has no schedule" rather than as a failure.
  ok(/console\.error/.test(route), 'a refused read is logged, never silently empty')

  const page = code('app/(dashboard)/projects/[id]/daily-logs/page.tsx')
  ok(/daily-logs\/lines/.test(page) && !/\/schedule`, \{ headers/.test(page),
    "the page loads the picker from the route its own gate covers")

  // AN EMPTY LIST IS A THIRD FACT. "Still asking", "there are none" and "the
  // request failed" must not share one sentence - a failed read rendering
  // "nothing is scheduled" tells somebody their schedule is gone.
  ok(/'loading' \| 'ready' \| 'failed'/.test(page), 'the picker reads three states, not a falsy value')
  ok(/linesState === 'failed'/.test(page), '...and says so when the read FAILED')
  ok(/-- Select --/.test(page),
    'the type picker starts EMPTY - a useState default on a required select is a claim')
}

// ── the handoff: it hands off, it does not fire ──────────────────────────────
{
  const page = code('app/(dashboard)/projects/[id]/daily-logs/page.tsx')
  ok(/const canEditSchedule = can\('schedule', 'edit'\)/.test(page),
    'the offer is hidden without the permission for the ACTION it asks for')
  ok(/canEditSchedule && d\.schedule_item_id/.test(page),
    '...AND nothing is offered without a line - guessing would move the wrong trade and email the wrong sub')
  ok(/delayReasonFromLog\(d, log\)/.test(page),
    'the reason is the one drafted sentence, not a second spelling of it')

  const sched = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/urlParams\?\.get\('delay'\)/.test(sched), 'the schedule page reads the link')
  ok(/openedFromUrl\.current === wanted/.test(sched),
    '...guarded by a REF, so it opens once and can still be closed')
  ok(/const item = items\.find\(i => i\.id === wanted\)\s*\n\s*if \(!item\) return/.test(sched),
    '...and a link naming a line this job does not have opens NOTHING')
  ok(/setDelayReason\(urlParams\.get\('reason'\) \?\? ''\)/.test(sched),
    'the reason arrives as a DRAFT in an editable box')
  ok(!/setDelayDaysInput\(urlParams/.test(sched),
    'THE DAYS BOX IS NEVER PREFILLED - a log says the delivery was late, not how late the JOB now is')
  ok(/openEdit\(item, 'delay'\)/.test(sched),
    'and it ends in the flow that already exists - same preview, same review, same apply')
}

done()
