// The cascade, the cycle check, and the progress gate.
//
// These are the parts that must be right before any screen is built on them: a
// wrong shift sends a crew to a site on the wrong day, and a missed cycle hangs
// a request. Every case below is a behaviour somebody would notice.

import { ok, done } from './_helpers'
import {
  addDays, daysBetween, findCycle, cascade, lineProgress, blockedBy, lineName,
  type ScheduleLine, type Dependency,
} from '../schedule-dependencies'

console.log('\nschedule-dependencies')

const line = (id: string, start: string, end: string, extra: Partial<ScheduleLine> = {}): ScheduleLine =>
  ({ id, start_date: start, end_date: end, trade: id, ...extra })
const dep = (task: string, pred: string, extra: Partial<Dependency> = {}): Dependency =>
  ({ task_id: task, predecessor_task_id: pred, lag_days: 0, ...extra })
// The semicolon is load-bearing. This file has no others, but the next
// statement is a BARE BLOCK, and `({...})` followed by `{` on the next line is
// not something ASI separates - tsc reads them as one expression and reports a
// syntax error inside the object literal above. tsx (esbuild) parses it
// happily, so `npm test` was green while `npx tsc --noEmit` was not.
;

// ── dates ────────────────────────────────────────────────────────────────────
{
  ok(addDays('2026-09-16', 3) === '2026-09-19', 'addDays walks forward')
  ok(addDays('2026-09-16', -3) === '2026-09-13', '...and backward')
  ok(addDays('2026-09-30', 1) === '2026-10-01', '...over a month end')
  ok(addDays('2026-12-31', 1) === '2027-01-01', '...over a year end')
  ok(addDays('2028-02-28', 1) === '2028-02-29', '...and into a leap day')
  ok(daysBetween('2026-09-16', '2026-09-19') === 3, 'daysBetween counts forward')
  ok(daysBetween('2026-09-19', '2026-09-16') === -3, '...and signs a move backward')

  // THE DST TRAP: parsed locally, these two are 0.958 days apart in a zone that
  // springs forward, and Math.round hides it right up until it does not.
  ok(daysBetween('2026-03-07', '2026-03-09') === 2, 'a spring-forward weekend is still two days')
  ok(daysBetween('2026-10-31', '2026-11-02') === 2, '...and a fall-back weekend too')
}

// ── cycles ───────────────────────────────────────────────────────────────────
{
  const lines = [line('A', '2026-01-01', '2026-01-05'), line('B', '2026-01-06', '2026-01-10'), line('C', '2026-01-11', '2026-01-15')]

  ok(findCycle([], 'A', 'A', lines)?.ids.length === 2, 'a line cannot wait for itself')
  ok(/cannot wait for itself/.test(findCycle([], 'A', 'A', lines)!.message), '...and it says so plainly')

  ok(findCycle([dep('B', 'A')], 'C', 'B', lines) === null, 'a straight chain is fine')

  // B waits for A. Making A wait for B closes the loop.
  const loop = findCycle([dep('B', 'A')], 'A', 'B', lines)
  ok(!!loop, 'a two-link loop is caught')
  ok(/A waits for B waits for A/.test(loop!.message),
    'THE SPEC: the error NAMES the loop, so somebody knows which link to cut')

  // A longer one: C waits for B waits for A; A waiting for C closes it.
  const long = findCycle([dep('B', 'A'), dep('C', 'B')], 'A', 'C', lines)
  ok(!!long && long.ids.length === 4, 'a three-link loop is caught')
  ok(/A waits for C waits for B waits for A/.test(long!.message), '...and named end to end')

  // A diamond is NOT a loop, and refusing it would be the bug.
  const diamond = [dep('B', 'A'), dep('C', 'A')]
  ok(findCycle(diamond, 'D', 'B', lines) === null, 'a diamond is not a cycle')
}

// ── the cascade ──────────────────────────────────────────────────────────────
{
  // A: Jan 1-5, B follows A, C follows B.
  const lines = [
    line('A', '2026-01-01', '2026-01-05'),
    line('B', '2026-01-06', '2026-01-10'),
    line('C', '2026-01-11', '2026-01-15'),
  ]
  const deps = [dep('B', 'A'), dep('C', 'B')]

  const r = cascade(lines, deps, 'A', '2026-01-04', '2026-01-08')
  ok(r.moves.length === 2, 'moving A moves B and C')
  const b = r.moves.find(m => m.id === 'B')!
  const c = r.moves.find(m => m.id === 'C')!
  ok(b.to.start === '2026-01-09' && b.to.end === '2026-01-13', 'B shifts by the same 3 days')
  ok(c.to.start === '2026-01-14' && c.to.end === '2026-01-18', '...and C follows recursively')
  ok(b.shiftDays === 3 && c.shiftDays === 3, 'THE GOAL: the shift is the same number of days all the way down')
  ok(b.becauseOf === 'A' && c.becauseOf === 'B', 'each move names what actually pushed it, not the origin')
  ok(!r.moves.some(m => m.id === 'A'), 'the edited line is not reported as a consequence of itself')

  // Duration is preserved - a 5-day task stays 5 days.
  ok(daysBetween(b.to.start, b.to.end) === daysBetween('2026-01-06', '2026-01-10'),
    'a task keeps its length when it moves')
}

// ── lag ──────────────────────────────────────────────────────────────────────
{
  const lines = [line('A', '2026-01-01', '2026-01-05'), line('B', '2026-01-09', '2026-01-13')]
  const r = cascade(lines, [dep('B', 'A', { lag_days: 3 })], 'A', '2026-01-06', '2026-01-10')
  const b = r.moves.find(m => m.id === 'B')!
  // A now ends the 10th; +3 days lag; earliest start is the 14th.
  ok(b.to.start === '2026-01-14', 'lag_days is honoured - B starts 3 clear days after A ends')
}

// ── a diamond takes the LARGEST push ─────────────────────────────────────────
{
  // D waits for both B and C. B pushes it a little, C pushes it a lot.
  const lines = [
    line('A', '2026-01-01', '2026-01-05'),
    line('B', '2026-01-06', '2026-01-07'),
    line('C', '2026-01-06', '2026-01-20'),
    // D starts right after B so B's push REACHES it - otherwise only C ever
    // moves D, the second push never happens, and the diamond is untested.
    line('D', '2026-01-08', '2026-01-12'),
  ]
  const deps = [dep('B', 'A'), dep('C', 'A'), dep('D', 'B'), dep('D', 'C')]
  const r = cascade(lines, deps, 'A', '2026-01-11', '2026-01-15')

  const d = r.moves.find(m => m.id === 'D')!
  const c = r.moves.find(m => m.id === 'C')!
  ok(c.to.end === '2026-01-30', 'C takes the 10-day push')
  ok(d.to.start === '2026-01-31',
    'D waits for the LAST thing it depends on, not whichever was walked first')
  ok(r.moves.filter(m => m.id === 'D').length === 1, '...and is reported once, not twice')

  // THE ASSERTION THE FIRST VERSION WAS MISSING. Both a right and a wrong
  // implementation land D's START on the same day here, so a start-only check
  // passes either way. What a second push computed off the ORIGINAL start
  // breaks is the LENGTH: the shift is measured from one base and applied to
  // another, and a 4-day task silently becomes a 18-day one.
  ok(daysBetween(d.to.start, d.to.end) === daysBetween('2026-01-08', '2026-01-12'),
    'D keeps its length after being pushed TWICE - the second push measures from where it already moved to')
  ok(daysBetween(c.to.start, c.to.end) === daysBetween('2026-01-06', '2026-01-20'),
    '...and so does C')
}

// ── a line already late enough is not dragged backwards ──────────────────────
{
  const lines = [line('A', '2026-01-01', '2026-01-05'), line('B', '2026-03-01', '2026-03-05')]
  const r = cascade(lines, [dep('B', 'A')], 'A', '2026-01-08', '2026-01-12')
  ok(r.moves.length === 0,
    "B sits two months later, so a push it already clears moves nothing - its dates were a decision")

  // But a push past it does move it.
  const r2 = cascade(lines, [dep('B', 'A')], 'A', '2026-03-01', '2026-03-10')
  ok(r2.moves.find(m => m.id === 'B')?.to.start === '2026-03-11', '...and a push past it still lands')
}

// ── manual override ──────────────────────────────────────────────────────────
{
  const lines = [
    line('A', '2026-01-01', '2026-01-05'),
    line('B', '2026-01-06', '2026-01-10', { dates_overridden_at: '2026-01-02T10:00:00Z' }),
    line('C', '2026-01-11', '2026-01-15'),
  ]
  const r = cascade(lines, [dep('B', 'A'), dep('C', 'B')], 'A', '2026-01-04', '2026-01-08')

  ok(r.moves.length === 0, 'a line somebody edited by hand does not move')
  ok(r.skipped.length === 1 && r.skipped[0].id === 'B', '...and is REPORTED rather than silently ignored')
  ok(r.skipped[0].reason === 'manually_overridden', '...with the reason')
  ok(!r.moves.some(m => m.id === 'C'),
    "...and the cascade stops there - C's dates cannot be computed from dates B no longer has")
}

// ── progress: typed, derived, or nobody knows ────────────────────────────────
{
  ok(lineProgress(line('A', '2026-01-01', '2026-01-05', { progress_pct: 40 })).pct === 40,
    'a typed percent is the answer')
  ok(lineProgress(line('A', '2026-01-01', '2026-01-05', { progress_pct: 40 })).source === 'entered',
    '...and says where it came from')

  // Typed wins over the budget, because somebody looked at the job.
  const both = lineProgress(line('A', '2026-01-01', '2026-01-05', { progress_pct: 40 }),
    [{ progress_pct: 90, amount: 1000 }])
  ok(both.pct === 40 && both.source === 'entered', 'a typed percent beats the budget roll-up')

  // Weighted by amount: $90k at 10% + $10k at 100% is 19%, not 55%.
  const weighted = lineProgress(line('A', '2026-01-01', '2026-01-05'),
    [{ progress_pct: 10, amount: 90_000 }, { progress_pct: 100, amount: 10_000 }])
  ok(weighted.pct === 19, 'the budget roll-up is weighted by money, not a plain average')
  ok(weighted.source === 'budget', '...and says so')

  const unweighted = lineProgress(line('A', '2026-01-01', '2026-01-05'),
    [{ progress_pct: 10 }, { progress_pct: 100 }])
  ok(unweighted.pct === 55, 'with no amounts a plain mean is the only honest answer')

  // THE ONE THAT MATTERS.
  const none = lineProgress(line('A', '2026-01-01', '2026-01-05'))
  ok(none.pct === null, 'NOBODY HAS SAID is null, never 0 - "not started" is a claim')
  ok(none.source === 'unknown', '...and the source says which')
}

// ── the gate ─────────────────────────────────────────────────────────────────
{
  const pred = line('rough-in', '2026-01-01', '2026-01-05', { trade: 'Electrical rough-in' })

  ok(blockedBy({ min_predecessor_progress: null }, pred, { pct: 0, source: 'entered' }).blocked === false,
    'no percent set means the gate is not in play')

  const early = blockedBy({ min_predecessor_progress: 80 }, pred, { pct: 40, source: 'entered' })
  ok(early.blocked, 'below the bar is blocked')
  ok(/Electrical rough-in/.test(early.reason!) && /40%/.test(early.reason!) && /80%/.test(early.reason!),
    '...and the reason names the trade, the bar and where it actually is')

  ok(blockedBy({ min_predecessor_progress: 80 }, pred, { pct: 80, source: 'entered' }).blocked === false,
    'AT the bar clears it - "80% along" means 80 is enough')

  const unknown = blockedBy({ min_predecessor_progress: 80 }, pred, { pct: null, source: 'unknown' })
  ok(unknown.blocked, 'an UNKNOWN predecessor blocks - a wrong "go" sends a crew to a site')
  ok(unknown.unknown, '...and is flagged as unknown rather than as "too early"')
  ok(/nobody has said/i.test(unknown.reason!), '...so the fix is obvious: somebody type a percent')
}

// ── names ────────────────────────────────────────────────────────────────────
{
  ok(lineName({ trade: 'Plumbing', label: 'x' }) === 'Plumbing', 'a line is called by its trade')
  ok(lineName({ trade: null, label: 'Sheetrock TBD' }) === 'Sheetrock TBD', '...else its label')
  ok(lineName({ trade: '  ', label: null }) === 'an unnamed line', '...and never an empty string')
}

done()
