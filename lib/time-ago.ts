import { formatDate } from './dates'

/**
 * "3d ago", for timestamps a person is scanning rather than reading.
 *
 * Lifted out of components/layout/activity-drawer.tsx, where it had been
 * living as a private helper. A second screen wanted the same wording, and two
 * copies of a date formatter drift - one of them starts saying "3 days ago"
 * while the other says "3d ago" and nobody notices for months.
 *
 * IT DRIFTED ANYWAY. Three more private copies grew after this module was
 * written - the notification bell, the Tasks board and the dashboard - and the
 * drift the comment above predicted had already happened, quietly, in the ONE
 * branch nobody looks at: past a week they printed three different things
 * (`toLocaleDateString()`, `formatDate(d, {month, day})`, `formatDate(dateStr)`).
 * They all go through here now, and the fallback is `formatDate`, which is the
 * app's own date formatter rather than the browser's raw one.
 *
 * (`equipment/page.tsx` keeps its own, deliberately: a checkout log wants
 * "today" and "yesterday" and a 30-day window, which is different wording for a
 * different question - not a copy of this one.)
 *
 * Falls back to an absolute date past a week, because "47d ago" is arithmetic
 * homework, not information.
 */
export function timeAgo(dateStr: string): string {
  const when = new Date(dateStr).getTime()
  if (!Number.isFinite(when)) return ''

  const diff = Date.now() - when

  // A TIMESTAMP IN THE FUTURE IS NOT "just now". Negative arithmetic falls
  // through every branch below and lands on 'just now', so a row dated next
  // Tuesday read as having happened a moment ago. Whatever produced it - a
  // clock out of step between two machines, a date typed by hand - the honest
  // answer is the date itself rather than a relative one the number cannot
  // support. Same reasoning as the report of "6d ago" on a fresh notification:
  // where the two clocks disagree, print what is stored.
  if (diff < -60_000) return formatDate(dateStr)

  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}

/**
 * The full timestamp, for the `title` on whatever is showing the relative one.
 *
 * REPORTED: a notification read "6d ago" minutes after it was created. The
 * stored value is `timestamptz DEFAULT now()` and `notify()` never sets it, so
 * the database's own clock wrote it; the arithmetic above is the same
 * arithmetic everywhere else. That leaves the READER's clock, which nothing
 * server-side can see - and no amount of staring at this function would have
 * shown it either.
 *
 * So every relative time now carries the absolute one on hover. One hover on
 * the next "6d ago" says whether the stored value or the machine is wrong,
 * which is the whole of what was missing.
 */
export function absoluteTime(dateStr: string): string {
  const d = new Date(dateStr)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : ''
}
