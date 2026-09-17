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

// ── the cascade: SAME DELTA, always ─────────────────────────────────────────
{
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
  ok(b.shiftDays === 3 && c.shiftDays === 3, 'THE GOAL: the same number of days all the way down')
  ok(b.becauseOf === 'A' && c.becauseOf === 'B', 'each move names what actually pushed it')
  ok(!r.moves.some(m => m.id === 'A'), 'the edited line is not reported as a consequence of itself')
  ok(daysBetween(b.to.start, b.to.end) === daysBetween('2026-01-06', '2026-01-10'),
    'a task keeps its length when it moves')
}

// ── THE REPORTED ARITHMETIC, with the reporter's own numbers ────────────────
{
  // "Sheetrock moved +3 days (Oct 12 -> Oct 15); the linked row moved +34 days
  // (Sep 16 -> Oct 20), landing at Sheetrock's end date."
  //
  // The dependent sits WEEKS BEFORE its predecessor - ordinary while a schedule
  // is being built. The old rule snapped it to predecessorEnd + 1. Every test
  // passed because every fixture had the dependent starting the day after its
  // predecessor ended, where the snap and the shift are the same number. A
  // fixture that only exercises the case where two rules agree cannot tell you
  // which one you implemented.
  const lines = [
    line('Sheetrock', '2026-10-12', '2026-10-19'),
    line('Volt', '2026-09-16', '2026-09-20'),
  ]
  const r = cascade(lines, [dep('Volt', 'Sheetrock')], 'Sheetrock', '2026-10-15', '2026-10-22')
  const volt = r.moves.find(m => m.id === 'Volt')!

  ok(!!volt, 'the linked row is in the review at all')
  ok(volt.shiftDays === 3, 'THE BUG: +3, not +34 - it moves by what the predecessor moved')
  ok(volt.to.start === '2026-09-19', '...so Sep 16 becomes Sep 19')
  ok(volt.to.end !== '2026-10-20', "...and it does NOT land on the predecessor's boundary")
  ok(daysBetween(volt.to.start, volt.to.end) === 4, '...keeping its own length')
}

// ── lag preserves the gap by doing nothing ──────────────────────────────────
{
  const lines = [line('A', '2026-01-01', '2026-01-05'), line('B', '2026-01-09', '2026-01-13')]
  const r = cascade(lines, [dep('B', 'A', { lag_days: 3 })], 'A', '2026-01-06', '2026-01-10')
  const b = r.moves.find(m => m.id === 'B')!
  ok(b.shiftDays === 5, 'B moves by the 5 days A moved, not to A-end-plus-lag')
  ok(daysBetween('2026-01-10', b.to.start) === 4,
    '...and the gap it had is exactly the gap it keeps')
}

// ── backwards too ───────────────────────────────────────────────────────────
{
  // "Shifts by the same number of days" has no direction in it, and a chain
  // that only ever moves later drifts every time something finishes early.
  const lines = [line('A', '2026-02-10', '2026-02-14'), line('B', '2026-02-15', '2026-02-19')]
  const r = cascade(lines, [dep('B', 'A')], 'A', '2026-02-07', '2026-02-11')
  const b = r.moves.find(m => m.id === 'B')!
  ok(b.shiftDays === -3, 'a predecessor pulled 3 days earlier pulls its dependent with it')
  ok(b.to.start === '2026-02-12', '...to Feb 12')
}

// ── nothing moved means nothing moves - AND SAYS SO ─────────────────────────
{
  const lines = [line('A', '2026-01-01', '2026-01-05'), line('B', '2026-01-06', '2026-01-10')]
  const r = cascade(lines, [dep('B', 'A')], 'A', '2026-01-01', '2026-01-05')
  ok(r.moves.length === 0, 'a save that changed no dates moves nothing')
  // THE REPORT: "the review screen drops linked rows". A linked line missing
  // from the review is indistinguishable from one that was never linked, and
  // that is the single thing the screen exists to show.
  ok(r.skipped.length === 1 && r.skipped[0].id === 'B',
    '...and the linked line is still ACCOUNTED FOR rather than absent')
  ok(r.skipped[0].reason === 'no_shift', '...with the reason being that nothing pushed it')
}

// ── the delta is the predecessor's FINISH, not its start ────────────────────
{
  // The screen says "can't start till another trade finishes". A line that
  // starts on the same day and runs three days longer HAS taken three days
  // longer, and everything behind it moves - measuring the start would report
  // "nothing else moves" for the most ordinary slip on a job.
  const lines = [line('A', '2026-03-02', '2026-03-06'), line('B', '2026-03-09', '2026-03-13')]
  const later = cascade(lines, [dep('B', 'A')], 'A', '2026-03-02', '2026-03-09')
  const b = later.moves.find(m => m.id === 'B')!
  ok(!!b && b.shiftDays === 3, 'A running 3 days longer pushes B 3 days, though its start never moved')

  // And the other way: starting sooner but finishing the same day changes
  // nothing for anybody waiting on the finish.
  const sooner = cascade(lines, [dep('B', 'A')], 'A', '2026-02-27', '2026-03-06')
  ok(sooner.moves.length === 0, 'starting earlier but finishing the same day moves nobody')
  ok(sooner.skipped.length === 1 && sooner.skipped[0].reason === 'no_shift',
    '...and the waiting line is on the screen saying exactly that')
}

// ── EVERY linked line lands in one bucket or the other ──────────────────────
{
  // Four dependents of A, one of each outcome, plus one behind a hand-dated
  // line. None of them may simply vanish.
  const lines = [
    line('A', '2026-04-01', '2026-04-05'),
    line('Moves', '2026-04-06', '2026-04-10'),
    line('ByHand', '2026-04-06', '2026-04-10', { dates_overridden_at: '2026-03-01T00:00:00Z' }),
    line('Behind', '2026-04-11', '2026-04-15'),
  ]
  const deps = [dep('Moves', 'A'), dep('ByHand', 'A'), dep('Behind', 'ByHand')]
  const r = cascade(lines, deps, 'A', '2026-04-03', '2026-04-07')

  const reported = new Set([...r.moves.map(m => m.id), ...r.skipped.map(s => s.id)])
  ok(reported.size === 3, 'all three linked lines are reported, none dropped')
  ok(!reported.has('A'), '...and the edited line is not reported as a consequence of itself')

  ok(r.moves.some(m => m.id === 'Moves'), 'the one that follows moves')
  const byHand = r.skipped.find(s => s.id === 'ByHand')!
  ok(byHand.reason === 'manually_overridden', 'the hand-dated one says it was set by hand')
  const behind = r.skipped.find(s => s.id === 'Behind')!
  // This is the row the old code lost entirely: pass one never reached it,
  // and reporting off pass one alone is why it was missing.
  ok(!!behind && behind.reason === 'chain_stopped',
    'and the line BEHIND the hand-dated one is reported too, saying the chain stopped')
}

// ── a linked line says whether it waits on the edit or on the chain ─────────
{
  const lines = [
    line('A', '2026-05-01', '2026-05-05'),
    line('B', '2026-05-06', '2026-05-10'),
    line('C', '2026-05-11', '2026-05-15'),
  ]
  const r = cascade(lines, [dep('B', 'A'), dep('C', 'B')], 'A', '2026-05-03', '2026-05-07')
  ok(r.moves.find(m => m.id === 'B')!.link === 'direct', "B waits on the line that was edited")
  ok(r.moves.find(m => m.id === 'C')!.link === 'downstream', '...and C is further down the chain')
}

// ── a link to a line that is not on this board is not reported ──────────────
{
  // Otherwise the review prints a row the reader cannot find anywhere, which
  // is worse than one it leaves out.
  const lines = [line('A', '2026-06-01', '2026-06-05')]
  const r = cascade(lines, [dep('Ghost', 'A')], 'A', '2026-06-03', '2026-06-07')
  ok(r.moves.length === 0 && r.skipped.length === 0, 'a link to a line that is not here reports nothing')
}

// ── a chain all takes the same delta ────────────────────────────────────────
{
  const lines = [
    line('A', '2026-01-01', '2026-01-05'),
    line('B', '2026-01-06', '2026-01-07'),
    line('C', '2026-01-06', '2026-01-20'),
    line('D', '2026-01-21', '2026-01-25'),
  ]
  const deps = [dep('B', 'A'), dep('C', 'A'), dep('D', 'B'), dep('D', 'C')]
  const r = cascade(lines, deps, 'A', '2026-01-11', '2026-01-15')
  const d = r.moves.find(m => m.id === 'D')!
  ok(r.moves.filter(m => m.id === 'D').length === 1, 'a diamond reports D once, not twice')
  ok(d.shiftDays === 10, 'every line in the chain takes the same delta')
  ok(daysBetween(d.to.start, d.to.end) === daysBetween('2026-01-21', '2026-01-25'), 'D keeps its length')
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
  const b = r.skipped.find(s => s.id === 'B')!
  ok(!!b, '...and is REPORTED rather than silently ignored')
  ok(b.reason === 'manually_overridden', '...with the reason')
  ok(!r.moves.some(m => m.id === 'C'),
    "...and the cascade stops there - C's dates cannot be computed from dates B no longer has")
  ok(r.skipped.some(s => s.id === 'C' && s.reason === 'chain_stopped'),
    '...but C is still on the screen, saying why it is not moving')
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
