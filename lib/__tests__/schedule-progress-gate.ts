/**
 * THE PERCENT GATE, WHICH UNTIL NOW DID NOTHING.
 *
 * `cascade()` read `min_predecessor_progress` exactly once, through `gateOf`,
 * and only to build a LABEL for the review screen. A line gated at 80% shifted
 * exactly like a plain link. And it could not have worked anyway: 121 of 121
 * schedule lines on the live database have a null `progress_pct`, because
 * NOTHING HAS EVER WRITTEN ONE - the column was on the PATCH whitelist and
 * validated 0-100, with no control on any screen to fill it in.
 *
 * THE ASYMMETRY IS THE WHOLE RULE, and having it backwards would be far worse
 * than not having it:
 *
 *   LATER IS ALWAYS SAFE. A trade that slips pushes everything behind it
 *   whatever percent they are at. Holding that back means a crew never hears
 *   their date moved, which is the thing this feature exists to prevent.
 *
 *   EARLIER IS NOT. Pulling Drywall forward because Sheetrock's dates moved,
 *   while Sheetrock sits at 40% against an 80% gate, is telling a crew to turn
 *   up to a wall that is not there.
 *
 * AND THE BLAST RADIUS. If the cascade asked about progress for links with NO
 * gate, every pull-forward in the app would have stopped working the day this
 * shipped, because every percent is null. `blockedBy` returning not-blocked
 * for a null gate is what contains it - so that is pinned first and hardest.
 */
import { ok, done, code } from './_helpers'
import { cascade, type ScheduleLine, type Dependency, type Progress } from '../schedule-dependencies'

console.log('\n\x1b[1mschedule-progress-gate\x1b[0m')

const line = (id: string, start: string, end: string): ScheduleLine =>
  ({ id, trade: id, label: null, start_date: start, end_date: end })

const LINES: ScheduleLine[] = [
  line('sheetrock', '2026-10-05', '2026-10-12'),
  line('drywall', '2026-10-13', '2026-10-20'),
]

const gated: Dependency[] = [
  { task_id: 'drywall', predecessor_task_id: 'sheetrock', min_predecessor_progress: 80, lag_days: 0 },
]
const plain: Dependency[] = [
  { task_id: 'drywall', predecessor_task_id: 'sheetrock', min_predecessor_progress: null, lag_days: 0 },
]

const at = (pct: number | null): (() => Progress) =>
  () => (pct == null ? { pct: null, source: 'unknown' } : { pct, source: 'entered' })

// ── THE BLAST RADIUS, pinned first ──────────────────────────────────────────
{
  // Every live row has a null percent. A plain link must be untouched by this.
  const r = cascade(LINES, plain, 'sheetrock', '2026-10-02', '2026-10-09', at(null))
  ok(r.moves.some(m => m.id === 'drywall'),
    'THE ONE THAT WOULD BREAK EVERYTHING: a link with NO gate is never held, whatever the progress says')
  ok(r.moves.find(m => m.id === 'drywall')?.shiftDays === -3,
    '...and still pulls forward by the predecessor\'s own delta')
}

// ── later is always safe ────────────────────────────────────────────────────
{
  const r = cascade(LINES, gated, 'sheetrock', '2026-10-08', '2026-10-15', at(10))
  ok(r.moves.some(m => m.id === 'drywall'),
    'A SLIP ALWAYS PROPAGATES, even at 10% against an 80% gate')
  ok(r.moves.find(m => m.id === 'drywall')?.shiftDays === 3,
    '...by the same three days - a gate is not a brake on a delay')
  ok(!r.skipped.some(s => s.reason === 'progress_gate'),
    '...and is not reported as held')
}

// ── earlier is not ──────────────────────────────────────────────────────────
{
  const r = cascade(LINES, gated, 'sheetrock', '2026-10-02', '2026-10-09', at(40))
  ok(!r.moves.some(m => m.id === 'drywall'),
    'THE BUG: a pull-forward past an unmet gate no longer drags the crew with it')
  const held = r.skipped.find(s => s.id === 'drywall')
  ok(held?.reason === 'progress_gate', '...it is REPORTED, not dropped - a missing row reads as an unlinked one')
  ok(!!held?.blockReason && /40/.test(held.blockReason) && /80/.test(held.blockReason),
    '...carrying blockedBy\'s own sentence, naming what it needs and what it has')
}
{
  const r = cascade(LINES, gated, 'sheetrock', '2026-10-02', '2026-10-09', at(90))
  ok(r.moves.some(m => m.id === 'drywall'),
    'a MET gate lets the pull-forward through - otherwise the gate is just a wall')
}
{
  // Unknown blocks, deliberately: a wrong "go" puts a crew on a site.
  const r = cascade(LINES, gated, 'sheetrock', '2026-10-02', '2026-10-09', at(null))
  const held = r.skipped.find(s => s.id === 'drywall')
  ok(held?.reason === 'progress_gate', 'an UNKNOWN percent holds a pull-forward')
  ok(!!held?.blockReason && /nobody has said/i.test(held.blockReason),
    '...and says it is holding because nobody has said, not because the work is early')
}
{
  // No reader supplied at all - every gate reads unknown, plain links unaffected.
  const r = cascade(LINES, plain, 'sheetrock', '2026-10-02', '2026-10-09')
  ok(r.moves.some(m => m.id === 'drywall'),
    'with NO progress reader a plain link still moves - the old behaviour, unchanged')
}

// ── THE NUMERIC FAMILY ──────────────────────────────────────────────────────
{
  // PostgREST hands a NUMERIC back QUOTED. A gate read with Number.isFinite is
  // false for every real row and true for every hand-written fixture.
  const quoted: Dependency[] = [
    { task_id: 'drywall', predecessor_task_id: 'sheetrock', min_predecessor_progress: '80.00', lag_days: 0 },
  ]
  const r = cascade(LINES, quoted, 'sheetrock', '2026-10-02', '2026-10-09',
    () => ({ pct: 40, source: 'entered' }))
  ok(r.skipped.some(s => s.id === 'drywall' && s.reason === 'progress_gate'),
    'A GATE STORED AS "80.00" STILL GATES - the shape every real row arrives in')

  const pure = code('lib/schedule-dependencies.ts')
  const finite = pure.match(/Number\.isFinite\(/g) ?? []
  ok(finite.length === 2,
    `the ratchet holds: only toPct and toAmount ask Number.isFinite (${finite.length})`)
}

// ── the wiring ──────────────────────────────────────────────────────────────
{
  const route = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/cascade\(lines, deps, itemId, newStart, newEnd, progressOf\)/.test(route),
    'the cascade route supplies real percentages - without it every gate reads unknown')
  ok(/progressReader\(db, lines\)/.test(route),
    '...through the shared reader, not a third copy of the budget roll-up')

  const reader = code('lib/schedule-progress-read.ts')
  ok(/lineProgress\(line,/.test(reader), 'the reader defers to lineProgress for the rule itself')
  ok(/console\.error\(.*budget roll-up unavailable/.test(reader),
    'a failed budget read is logged, and degrades to unknown - which BLOCKS, the safe side')

  // THE MISSING CONTROL. This is why 121 of 121 rows are null.
  const field = code('components/schedule/progress-field.tsx')
  ok(/value=\{value\}/.test(field) && /placeholder=\{rolledUp \?\? ''\}/.test(field),
    'THE BUG: the derived roll-up is a PLACEHOLDER, never seeded into the box')
  ok(!/value=\{value \|\| rolledUp/.test(field) && !/value=\{rolledUp/.test(field),
    '...because prefilling turns a derived fact into a typed claim on first save')
  ok(/Nobody has said/.test(field),
    'clearing it is offered as a visible act - null is not zero')

  const page = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/<ProgressField/.test(page), 'and the dialog actually renders it')
  ok(/progress_pct: progressForBody\(\)/.test(page),
    '...on BOTH save paths, or the field is decoration on one of them')
  ok((page.match(/progress_pct: progressForBody\(\)/g) ?? []).length === 2,
    '...literally both - the dates-moved path and the label-only path')
  ok(/if \(raw === ''\) return null/.test(page),
    'an empty box writes NULL, not 0 - "nobody has said" is not "not started"')

  // A component declared inside a component is a new type on every render.
  ok(/^export function ProgressField/m.test(field), 'the field is hoisted')

  // A type that describes no table is checked by nothing.
  const events = code('lib/schedule-events.ts')
  for (const col of ['trade', 'progress_pct', 'dates_overridden_at']) {
    ok(new RegExp(`${col}\\??:`).test(events),
      `ScheduleItemRow declares ${col}, which migration 108 added`)
  }
  ok(/progress_pct\?: number \| string \| null/.test(events),
    '...and progress_pct is typed `number | string` so the next reader must go through toPct')
}

done()
