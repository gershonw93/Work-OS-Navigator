// ─────────────────────────────────────────────────────────────────────────────
// A calendar date is not a moment in time.
//
// THE BUG. A job entered as Sep 1 - Dec 31 listed as Aug 31 - Dec 30, on the
// project list, where everybody sees it.
//
//     new Date('2026-09-01')            // midnight UTC
//     .toLocaleDateString()             // "8/31/2026" anywhere west of London
//
// A bare `YYYY-MM-DD` is parsed by JavaScript as UTC midnight, and every US
// timezone is behind UTC, so it renders as the evening before. Appending a
// time makes it parse in the LOCAL zone instead, which is what a date with no
// time attached actually means: a square on a calendar, not an instant.
//
// The codebase already knew this - `new Date(x + 'T00:00:00')` appears in 54
// places. It was missing from 23 others, and from `fmtDate` on the project
// list. Three separate copies of `fmtDate` existed, which is how one of them
// got it wrong without the other two noticing.
// ─────────────────────────────────────────────────────────────────────────────

/** A bare calendar date: 2026-09-01, no time, no zone. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parse a value into a Date that means what the user typed.
 *
 * A date-only string becomes local midnight. Anything already carrying a time
 * or a zone is left alone - a timestamp IS an instant and converting it would
 * be the opposite mistake.
 */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  const text = String(value).trim()
  if (!text) return null
  const d = new Date(DATE_ONLY.test(text) ? `${text}T00:00:00` : text)
  return isNaN(d.getTime()) ? null : d
}

const DEFAULT: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

/**
 * The one date formatter. Replaces three separate `fmtDate` implementations.
 *
 * `fallback` rather than throwing, because a missing date is normal - a job
 * with no end date is a job with no end date, not an error.
 */
export function formatDate(
  value: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = DEFAULT,
  fallback = '-',
): string {
  const d = parseDate(value)
  return d ? d.toLocaleDateString(undefined, opts) : fallback
}

/** Same day, without the year - for ranges where the year is already obvious. */
export function formatDateShort(value: string | Date | null | undefined, fallback = '-'): string {
  return formatDate(value, { month: 'short', day: 'numeric' }, fallback)
}

/**
 * "Sep 1 → Dec 31", collapsing whatever is absent.
 *
 * The project list built this by hand and got the same day-shift twice, once
 * per end of the range.
 */
export function formatDateRange(
  start: string | Date | null | undefined,
  end: string | Date | null | undefined,
): string {
  const a = parseDate(start)
  const b = parseDate(end)
  if (!a && !b) return '-'
  if (a && !b) return formatDate(a)
  if (!a && b) return `until ${formatDate(b)}`
  return `${formatDate(a)} → ${formatDate(b)}`
}

/** The YYYY-MM-DD a `<input type="date">` wants, in the LOCAL day. */
export function toDateInput(value: string | Date | null | undefined): string {
  const d = parseDate(value)
  if (!d) return ''
  // Deliberately not toISOString(), which converts to UTC and reintroduces the
  // exact off-by-one this file exists to prevent.
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Today as YYYY-MM-DD, in the user's own day rather than UTC's. */
export function todayDateInput(): string {
  return toDateInput(new Date())
}

// ── Dates in words, without a locale ─────────────────────────────────────────
//
// `formatDate` above asks `toLocaleDateString`, which is right in a browser -
// it is the reader's own machine answering. IT IS THE WRONG QUESTION ON A
// SERVER: an email is rendered in whatever region the function woke up in, so
// the same date could reach two subs spelled two ways, and a test asserting the
// output would pass or fail on the runner's environment variables.
//
// These are built from fixed tables and parsed as UTC, so the answer is the
// same everywhere and can be pinned exactly.

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export interface DateWords {
  /** "Oct 24" - for a subject line, where the weekday is noise. */
  short: string
  /** "Tue Oct 24" - FIELD GUYS THINK IN WEEKDAYS, not in ISO dates. */
  withWeekday: string
}

/** A bare `YYYY-MM-DD` in words. Null for anything that is not one. */
export function dateWords(value: string | null | undefined): DateWords | null {
  if (!value || !DATE_ONLY.test(String(value).trim())) return null
  const t = Date.parse(`${String(value).trim()}T00:00:00Z`)
  if (Number.isNaN(t)) return null
  const d = new Date(t)
  const short = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`
  return { short, withWeekday: `${WEEKDAY_NAMES[d.getUTCDay()]} ${short}` }
}

/**
 * "+3 days" / "-1 day" / "same day", for a move somebody has to act on.
 *
 * The sign is kept. "3 days" alone does not say which way, and a crew that
 * turns up three days early has the same wasted morning as one that turns up
 * three days late.
 */
export function dayDelta(days: number): string {
  if (!Number.isFinite(days) || days === 0) return 'same day'
  const n = Math.abs(Math.round(days))
  return `${days > 0 ? '+' : '-'}${n} ${n === 1 ? 'day' : 'days'}`
}
