import { formatDate } from './dates'
import type { Cell, CellKind } from './report-builder'

// How a report value is PRINTED. Kept apart from the builder so the snapshot
// a share link stores is plain numbers and dates, and formatting can improve
// without rewriting what somebody was sent.

export function money(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(n) % 1 ? 2 : 0 })
  // A sentence dash is ` - ` in this app; a minus sign is still a minus sign.
  return n < 0 ? `-$${abs}` : `$${abs}`
}

export function formatCell(kind: CellKind, v: Cell): string {
  if (v === null || v === undefined || v === '') return '-'
  switch (kind) {
    case 'money': return typeof v === 'number' ? money(v) : String(v)
    case 'pct': return typeof v === 'number' ? `${Math.round(v)}%` : String(v)
    case 'hours': return typeof v === 'number' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} h` : String(v)
    case 'number': return typeof v === 'number' ? v.toLocaleString('en-US') : String(v)
    case 'date': return formatDate(String(v))
    case 'status': {
      const s = String(v).replace(/_/g, ' ')
      return s.charAt(0).toUpperCase() + s.slice(1)
    }
    default: return String(v)
  }
}

export function formatStat(kind: 'money' | 'number' | 'hours', v: number): string {
  return kind === 'money' ? money(v) : kind === 'hours' ? `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} h` : v.toLocaleString('en-US')
}

/** Is a column right-aligned? Numbers are. */
export const numeric = (kind: CellKind) => kind === 'money' || kind === 'pct' || kind === 'hours' || kind === 'number'
