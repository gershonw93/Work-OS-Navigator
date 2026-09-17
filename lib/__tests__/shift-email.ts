// The letter a sub actually gets when their dates move.
//
// REPORTED, looking at a real one: the subject was clipped to "2026 moved to
// 2026-10-24"; the old date and the new one were the same weight, both ISO, so
// the eye had nowhere to land; and there was no delta and no weekday. "Field
// guys think in weekdays, not ISO dates."
//
// This is the only email in the app whose CONTENT somebody has to act on - the
// rest carry a link and the page does the work - so the wording is the feature.

import { ok, done, code } from './_helpers'
import { dateWords, dayDelta } from '../dates'
import { scheduleShiftEmail, type ShiftedLine } from '../email'

console.log('\nshift-email')

const line = (extra: Partial<ShiftedLine> = {}): ShiftedLine => ({
  trade: 'Electrical - finishing',
  oldStart: '2026-10-21',
  newStart: '2026-10-24',
  shiftDays: 3,
  ...extra,
})
// The semicolon is load-bearing, and this is the SECOND file to need it: a
// parenthesized arrow body followed by a bare `{` block is one expression to
// tsc and two statements to tsx, so `npm test` goes green while
// `npx tsc --noEmit` reports a syntax error inside the object above.
;

// ── dates in words, with no locale in the answer ─────────────────────────────
{
  ok(dateWords('2026-10-24')?.short === 'Oct 24', 'a bare date reads as Oct 24')
  ok(dateWords('2026-10-24')?.withWeekday === 'Sat Oct 24', '...and carries its weekday')
  ok(dateWords('2026-10-21')?.withWeekday === 'Wed Oct 21', 'and the day before it is a Wednesday')

  // THE TRAP THIS AVOIDS: `toLocaleDateString` on a server answers in whatever
  // region the function woke up in, so one sub could be told Friday and another
  // Saturday for the same date - and a test asserting it passes or fails on the
  // runner's TZ rather than on the code.
  const src = code('lib/dates.ts')
  const words = src.slice(src.indexOf('export function dateWords'))
  ok(!/toLocaleDateString/.test(words), 'dateWords does not ask the machine what day it is')
  ok(/T00:00:00Z/.test(words) && /getUTCDay/.test(words),
    '...it parses and reads in UTC, so the answer is the same everywhere')

  ok(dateWords('not a date') === null, 'anything that is not a calendar day gets no words')
  ok(dateWords(null) === null, '...and neither does nothing')

  ok(dayDelta(3) === '+3 days', 'a delta is signed')
  ok(dayDelta(-1) === '-1 day', '...singular when it is one')
  ok(dayDelta(0) === 'same day', '...and says so when nothing moved')
}

// ── the subject is the project and the new date, and nothing else ────────────
{
  const mail = scheduleShiftEmail({
    vendorName: 'Volt Electric Co', projectName: 'QA Ground-Up 2026', lines: [line()],
  })
  ok(mail.subject === 'Your start on QA Ground-Up 2026 moved to Oct 24',
    'THE REPORT: the exact subject asked for, with the date in words')
  ok(!/2026-10-24/.test(mail.subject), '...and no ISO date in it anywhere')
  // The day is the tail of the line, which is what survives a narrow inbox
  // column - the report was of a subject clipped to two meaningless numbers.
  ok(mail.subject.endsWith('Oct 24'), 'the new date is the last thing in the subject')

  const many = scheduleShiftEmail({
    vendorName: 'Volt', projectName: 'QA Ground-Up 2026',
    lines: [line(), line({ trade: 'Electrical - rough', oldStart: '2026-09-01', newStart: '2026-09-04' })],
  })
  ok(many.subject === '2 of your dates on QA Ground-Up 2026 moved',
    'two lines cannot name one date, so the subject counts them instead')
}

// ── the eye lands on the new date ────────────────────────────────────────────
{
  const mail = scheduleShiftEmail({
    vendorName: 'Volt Electric Co', projectName: 'QA Ground-Up 2026', lines: [line()],
  })

  ok(/was <s[^>]*>Wed Oct 21<\/s>, now <strong[^>]*>Sat Oct 24<\/strong>/.test(mail.html),
    'THE REPORT: old date struck through, new date bold')
  ok(/<s style="color:#9A9C96">Wed Oct 21<\/s>/.test(mail.html),
    '...the old one greyed as well as struck')
  ok(/<strong style="color:#5F7A12;font-weight:800">Sat Oct 24<\/strong>/.test(mail.html),
    '...and the new one in the SyteNav green, which nothing else in the card wears')
  ok(/\(\+3 days\)/.test(mail.html), 'the delta is on the line')

  // <s> and <strong> are elements on purpose. Outlook renders through Word,
  // where a CSS-only line-through is unreliable and an element is not.
  ok(!/text-decoration:line-through/.test(mail.html),
    'the strike is the element, not a style Word may drop')

  // The plain-text half is not a stripped copy - some people genuinely read it.
  ok(/was Wed Oct 21, now Sat Oct 24 \(\+3 days\)/.test(mail.text),
    'and the text part says the same sentence, weekdays and delta included')
  ok(!/2026-10-21/.test(mail.text), '...with no ISO date left in it')
}

// ── a move backwards reads as a move backwards ───────────────────────────────
{
  const mail = scheduleShiftEmail({
    vendorName: 'Volt', projectName: 'QA',
    lines: [line({ oldStart: '2026-10-24', newStart: '2026-10-21', shiftDays: -3 })],
  })
  // A crew that turns up three days EARLY has the same wasted morning as one
  // that turns up three days late, so the sign is never dropped.
  ok(/\(-3 days\)/.test(mail.html), 'an earlier start is signed, not printed as 3 days')
  ok(mail.subject.endsWith('Oct 21'), '...and the subject still names where it landed')
}

// ── the route hands over what the template needs ─────────────────────────────
{
  const route = code('app/api/projects/[id]/schedule/[itemId]/cascade/route.ts')
  ok(/shiftDays: l\.shiftDays/.test(route),
    'the cascade passes the signed days, rather than making the template re-derive them')
  // One email per sub, not per line - the template takes a LIST and this is
  // the half that would quietly regress into a loop.
  ok(/lines: moved\.map/.test(route), 'and still one email covering every line of theirs')
}

done()
