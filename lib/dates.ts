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
