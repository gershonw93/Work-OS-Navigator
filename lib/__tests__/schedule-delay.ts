/**
 * DELAYING A SUB AS AN ACT, NOT AS A DATE EDIT.
 *
 * "How do I currently delay a sub?" - by opening the line and typing a later
 * end date. Nothing recorded that it WAS a delay, why, or what the dates were
 * before, so a slip, a correction and a pull-forward were one shape the moment
 * the dialog closed.
 *
 * WHAT THIS PINS, each of which is a way the change comes undone:
 *   - a delay carries a REASON, asked by the form AND the route AND the
 *     database - the whole point of the feature
 *   - the baseline is DERIVED from the oldest change, never stored, so a
 *     second delay does not overwrite the first
 *   - `slipDays` is SIGNED: a pull-forward is not a delay
 *   - the delay is a MODE of the edit dialog, so the date arithmetic exists
 *     once
 *   - the PATCH bypass is closed, and the rule it used to carry moved WITH the
 *     write rather than being dropped
 */
import { ok, done, code, read, exists } from './_helpers'
import {
  missingDelay, missingDelayDays, missingDelayReason, delayDays, delayedDates,
  MAX_DELAY_DAYS,
} from '../schedule-delay'
import {
  baselineOf, slipDays, wasDelayed, slipBadge, historySentence, inOrder,
  type DateChange,
} from '../schedule-history'

console.log('\n\x1b[1mschedule-delay\x1b[0m')

const LINE = { start_date: '2026-10-05', end_date: '2026-10-12' }

const change = (over: Partial<DateChange>): DateChange => ({
  id: Math.random().toString(36).slice(2),
  kind: 'replan',
  reason: null,
  from_start: '2026-10-05', from_end: '2026-10-12',
  to_start: '2026-10-08', to_end: '2026-10-15',
  caused_by_item_id: null,
  created_at: '2026-10-01T09:00:00Z',
  ...over,
})

// ── the rule ────────────────────────────────────────────────────────────────
ok(missingDelay({ days: 3, reason: 'concrete truck no-showed' }) === null,
  'a delay with days and a reason is fine')
ok(typeof missingDelay({ days: 3, reason: '' }) === 'string',
  'THE WHOLE POINT: a delay with no reason is refused')
ok(typeof missingDelay({ days: 3, reason: 'ok' }) === 'string',
  '...and a two-letter reason is not a reason')
ok(typeof missingDelay({ days: 0, reason: 'x y z' }) === 'string',
  'ZERO IS NOT A DELAY - it would record a move that did not happen')
ok(typeof missingDelay({ days: -2, reason: 'x y z' }) === 'string',
  'nor is a negative one - pulling earlier is an edit, not a delay')
ok(typeof missingDelay({ days: 1.5, reason: 'x y z' }) === 'string',
  'half a day is not a schedule')
ok(typeof missingDelay({ days: MAX_DELAY_DAYS + 1, reason: 'x y z' }) === 'string',
  'a typo guard: 300 from a stray key would push a whole job eleven months')
ok(missingDelay({ days: MAX_DELAY_DAYS, reason: 'x y z' }) === null,
  '...and the cap itself is allowed')
ok(typeof missingDelay({}) === 'string', 'an empty draft is refused rather than throwing')

// The two halves are split because two callers can only honestly ask one each.
ok(missingDelayDays(3) === null && typeof missingDelayDays('') === 'string',
  'the days half stands alone - the live preview asks it with the reason box empty')
ok(missingDelayReason('truck no-showed') === null && typeof missingDelayReason(null) === 'string',
  'the reason half stands alone - the apply route is handed DATES, not a day count')
ok(delayDays('3') === 3 && delayDays('nope') === null,
  'delayDays asks the days rule only, so a valid number with no reason yet still previews')

// BOTH DATES MOVE, so the line keeps its length.
{
  const moved = delayedDates(LINE, 3)
  ok(moved.start === '2026-10-08' && moved.end === '2026-10-15',
    'a delay moves BOTH dates by the same amount - the line keeps its length')
}

// ── the baseline is derived, never stored ───────────────────────────────────
ok(baselineOf(LINE, []).start === LINE.start_date,
  'a line that has never moved reads as its own baseline, not as "slipped from nothing"')
{
  const twice = [
    change({ created_at: '2026-10-01T09:00:00Z', from_start: '2026-10-05', to_start: '2026-10-08' }),
    change({ created_at: '2026-10-04T09:00:00Z', from_start: '2026-10-08', to_start: '2026-10-12' }),
  ]
  const line = { start_date: '2026-10-12', end_date: '2026-10-19' }
  ok(baselineOf(line, twice).start === '2026-10-05',
    'THE REASON IT IS A TABLE: the baseline is the OLDEST change, so a second delay does not overwrite the first')
  ok(slipDays(line, twice) === 7, '...and the slip is measured against that, not against the last move')

  // Reversed input - the rows arrive in whatever order the query returns.
  ok(baselineOf(line, [...twice].reverse()).start === '2026-10-05',
    'and the order the rows arrive in does not change the answer')
}
ok(slipDays({ start_date: '2026-10-01', end_date: '2026-10-08' },
  [change({ from_start: '2026-10-05', to_start: '2026-10-01' })]) === -4,
  'SIGNED: a line pulled forward reports a NEGATIVE slip, never a delay')

// ── a badge that means something ────────────────────────────────────────────
ok(slipBadge(LINE, []) === null,
  'NO BADGE on a line that has not moved - a badge on every row means nothing on any')
{
  const delayed = [change({ kind: 'delay', reason: 'truck no-showed' })]
  const line = { start_date: '2026-10-08', end_date: '2026-10-15' }
  ok(slipBadge(line, delayed)?.tone === 'warn', 'a line somebody called late is amber')
  ok(/late/.test(slipBadge(line, delayed)?.label ?? ''), '...and says so')

  const replanned = [change({ kind: 'replan' })]
  ok(slipBadge(line, replanned)?.tone === 'info',
    'AMBER ONLY IF SOMEBODY CALLED IT A DELAY - a re-plan is a fact, not a problem')
  ok(!wasDelayed(replanned) && wasDelayed(delayed),
    'and the two are different questions')
}

// ── the sentence ────────────────────────────────────────────────────────────
{
  const cascaded = change({ kind: 'cascade', caused_by_item_id: 'sheetrock' })
  ok(/Sheetrock/.test(historySentence(cascaded, () => 'Sheetrock')),
    'A CASCADE NAMES WHAT PUSHED IT - "moved 3 days" on a line nobody touched is the mystery')
  ok(/something upstream/.test(historySentence(cascaded, () => null)),
    '...and still answers when that line has since been deleted, rather than reading like somebody did it')
  ok(/truck/.test(historySentence(change({ kind: 'delay', reason: 'truck no-showed' }), () => null)),
    'a delay carries its reason into the sentence')
  ok(inOrder([change({ created_at: 'b' }), change({ created_at: 'a' })])[0].created_at === 'a',
    'the history reads oldest first, the order things happened')
}

// ── the migration ───────────────────────────────────────────────────────────
{
  const f = 'supabase/migrations/113_schedule_date_changes.sql'
  ok(exists(f), 'the migration is a numbered file in the repo')
  const sql = read(f)

  ok(/CONSTRAINT schedule_date_changes_delay_has_reason/.test(sql),
    'THE DATABASE REFUSES A REASONLESS DELAY TOO - the rule is not only in the form')
  ok(/kind <> 'delay' OR/.test(sql), '...while a replan needs none')
  // Read the DECLARATIONS, not the prose: the migration's own comment explains
  // why there is no such column, so a raw scan finds its own explanation - the
  // same trap the dependency picker's "does not say the old phrase" pin hit.
  const declarations = sql
    .split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .join('\n')
  ok(!/shift_days/.test(declarations),
    'NO stored shift_days - it is arithmetic, and a stored copy goes stale silently')

  // A foreign key with no ON DELETE rule is a delete that fails on one row.
  const fks = sql.match(/REFERENCES [a-z_]+ \(id\)[^,\n]*/g) ?? []
  ok(fks.length === 4 && fks.every(x => /ON DELETE (CASCADE|SET NULL)/.test(x)),
    `every foreign key states its ON DELETE rule (${fks.length})`)
  ok(/changed_by UUID REFERENCES profiles \(id\) ON DELETE SET NULL/.test(sql),
    'the record outlives the account that made it')

  ok(exists('supabase/migrations/_combined_008-113.sql')
    && /schedule_date_changes/.test(read('supabase/migrations/_combined_008-113.sql')),
    'and the combined file carries it, or a fresh environment is born without it')
}

// ── the wiring ──────────────────────────────────────────────────────────────
{
  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/editMode === 'delay'/.test(page), 'delay is a MODE of the edit dialog')
  ok(/missingDelay\(\{ days: delayDaysInput, reason: delayReason \}\)/.test(page),
    'the form asks the rule at the field, not after a refused request')
  ok(/delayedDates\(editItem, days\)/.test(page),
    'and the dates are DERIVED from the day count, so the arithmetic exists once')
  ok(/kind: editMode === 'delay' \? 'delay' : 'replan'/.test(page),
    'A PLAIN DATE EDIT IS A REPLAN - recording it as a slip puts an accusation nobody made in the record')
  ok(/Record the delay/.test(page),
    'the verb on the button names what pressing it does')
  ok(!/disabled=\{.*delayDaysInput/.test(page),
    'the button is never disabled on the delay fields - a disabled button explains nothing')

  const apply = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/missingDelayReason\(reason\)/.test(apply),
    'the ROUTE asks the same reason rule - the field app posts here too')
  ok(/schedule_date_changes/.test(apply), 'and the apply writes the history')
  ok(/kind: 'cascade' as const/.test(apply),
    '...one row per line the cascade carried, so "it moved and nobody touched it" has an answer')
  ok(/caused_by_item_id: m\.becauseOf/.test(apply), '...naming what pushed each one')
  ok(/filter\(m => !failed\.includes\(m\.id\)\)/.test(apply),
    'A FAILED UPDATE IS NOT RECORDED - a history claiming a move that did not happen is worse than a gap')
  ok(/console\.error\(.*history not recorded/.test(apply),
    'and a history write that fails is logged, never allowed to fail the change it records')

  // THE EASY-TO-MISS ONE: a delay pins the line out of its own chain exactly
  // like typing a date does, and the delay form has no date boxes to remind you.
  ok(/just_linked: justLinked/.test(page),
    'the delay path goes through the same preview, so the self-unlinking warning fires on it too')
}

done()
