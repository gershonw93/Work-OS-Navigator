/**
 * "3d ago", for timestamps a person is scanning rather than reading.
 *
 * Lifted out of components/layout/activity-drawer.tsx, where it had been
 * living as a private helper. A second screen wanted the same wording, and two
 * copies of a date formatter drift - one of them starts saying "3 days ago"
 * while the other says "3d ago" and nobody notices for months.
 *
 * Falls back to an absolute date past a week, because "47d ago" is arithmetic
 * homework, not information.
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}
