/**
 * A SAME-DAY LINE IS ONE DAY, NOT TWO.
 *
 * REPORTED: "QA Placeholder Drywall", start = end = Sep 10, rendered
 * "2 days" in the List and "2d" on the Timeline bar. Durations are inclusive
 * everywhere else - Oct 27 to Oct 31 is 5 days - so a zero-length span is 1.
 *
 * THE OFF-BY-ONE WAS NOT IN THE `+ 1`. The schedule page declared its OWN
 * `daysBetween`, shadowing the tested one in `schedule-dependencies.ts`, and
 * that copy floored its answer:
 *
 *   Math.max(1, Math.round(...))
 *
 * So a same-day span measured 0, was forced up to 1, took the `+ 1` and came
 * out as 2. The floor existed to stop a zero-width Gantt bar vanishing - a
 * RENDERING concern that had leaked into the arithmetic and was no longer
 * needed either way, since the bar carries its own `Math.max(span * 18, 36)`.
 *
 * AND IT HAD A SECOND VICTIM, which is the reason this is a suite and not a
 * one-character change. The Timeline compensated for the floor with
 * `Math.max(0, offsetDays - 1)`, so every bar that did NOT start on the
 * earliest day was drawn one day to the LEFT of where it belonged. Two
 * mistakes cancelling on exactly one row - the first one - and wrong on all
 * the others. Removing either alone would have made the picture worse.
 */
import { ok, done, code, read } from './_helpers'
import { spanDays, spanLabel } from '../schedule-events'

console.log('\n\x1b[1mschedule-span\x1b[0m')

// ── the report, first ───────────────────────────────────────────────────────
{
  ok(spanDays('2026-09-10', '2026-09-10') === 1,
    'THE REPORT: Sep 10 -> Sep 10 is 1 day, not 2')
  ok(spanLabel('2026-09-10', '2026-09-10') === '1 day',
    '...and it reads "1 day", singular')
}

// ── the rule it has to match ────────────────────────────────────────────────
{
  ok(spanDays('2026-10-27', '2026-10-31') === 5,
    'THE RULE IT MATCHES: Oct 27 -> Oct 31 is 5 days, both ends counted')
  ok(spanLabel('2026-10-27', '2026-10-31') === '5 days', '...plural')
  ok(spanDays('2026-09-10', '2026-09-11') === 2, 'two consecutive days is 2')
  ok(spanDays('2026-09-01', '2026-09-30') === 30, 'a whole September is 30')
}

// ── a DST boundary is still whole days ──────────────────────────────────────
{
  // The old local copy parsed `T00:00:00` in the runner's zone. Across a US
  // spring-forward the difference is 0.958333 days, and `Math.round` hides
  // that until the day it does not.
  ok(spanDays('2026-03-07', '2026-03-09') === 3,
    'a span across spring-forward is 3 days, not 2.96 rounded')
  ok(spanDays('2026-11-01', '2026-11-02') === 2,
    '...and one across fall-back is 2')
}

// ── THE FLOOR IS GONE, at the source ────────────────────────────────────────
{
  const page = read('app/(dashboard)/projects/[id]/schedule/page.tsx')
  const src = code('app/(dashboard)/projects/[id]/schedule/page.tsx')

  ok(!/function\s+daysBetween\s*\(/.test(src),
    'THE SHADOW IS GONE: the page no longer declares its own `daysBetween` over the tested one')
  ok(!/Math\.max\(1,\s*Math\.round/.test(src),
    '...and the floor that made a 0-day span measure 1 is gone with it')

  // Every duration goes through the one function. `+ 1` written inline is how
  // three call sites came to share one bug.
  ok(!/daysBetween\([^)]*start_date[^)]*end_date[^)]*\)\s*\+\s*1/.test(src),
    'no duration is computed inline as `daysBetween(...) + 1` any more')
  ok((page.match(/spanDays\(/g) ?? []).length >= 4,
    'the List (both widths), the Timeline bar and the canvas all ask `spanDays`')
}

// ── THE COMPENSATION IS GONE TOO ────────────────────────────────────────────
{
  const src = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(!/offsetDays\s*-\s*1/.test(src),
    'THE SECOND VICTIM: the Timeline no longer subtracts 1 from the offset to undo the floor')
  ok(/paddingLeft:\s*Math\.max\(0,\s*offsetDays\)\s*\*\s*18/.test(src),
    '...so a bar starting n days in is drawn n days in')
}

// ── the bar keeps its own visible minimum ───────────────────────────────────
{
  const src = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
  ok(/Math\.max\(span\s*\*\s*18,\s*36\)/.test(src),
    'a one-day bar is still visible - the minimum lives on the WIDTH, where it belongs, not in the day maths')
}

done()
