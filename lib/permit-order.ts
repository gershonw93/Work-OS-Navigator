// ─────────────────────────────────────────────────────────────────────────────
// Which permit goes first.
//
// THE BUG: the list came back `created_at desc` and was rendered as-is, so on a
// real job it read approved, pending, EXPIRED - the one row that needed anybody
// to do anything was the last thing on the page. The order is the first thing
// a list says, and it was saying "this one matters least".
//
// So the order is the question "what needs me", answered from the DATE
// (lib/expiry.ts), not from the stored status - a permit whose date has run out
// is expired whatever the row says:
//
//   0. expired      - date passed, or marked expired with no date to argue
//   1. expiring soon
//   2. pending / rejected - somebody still has to get it through
//   3. everything else (approved, active, recorded)
//
// Inside a bucket: the longest-lapsed first, then the soonest to lapse, then
// the order the rows arrived in (Array.prototype.sort is stable).
// ─────────────────────────────────────────────────────────────────────────────

import { expiryState } from './expiry'

export interface OrderablePermit {
  status: string | null
  expiry_date: string | null
}

export function permitRank(p: OrderablePermit, today?: Date): number {
  const state = expiryState(p.expiry_date, { today })
  if (state === 'expired') return 0
  if (state === 'none' && p.status === 'expired') return 0
  if (state === 'soon') return 1
  if (p.status === 'pending' || p.status === 'rejected') return 2
  return 3
}

/** A new, sorted array; the input is left alone. */
export function sortPermits<T extends OrderablePermit>(permits: T[], today?: Date): T[] {
  return [...permits].sort((a, b) => {
    const r = permitRank(a, today) - permitRank(b, today)
    if (r !== 0) return r
    const rank = permitRank(a, today)
    if (rank === 0 || rank === 1) {
      // An undated "expired" goes after the dated ones - an empty string would
      // otherwise sort before every real date.
      const da = a.expiry_date?.slice(0, 10) ?? ''
      const db = b.expiry_date?.slice(0, 10) ?? ''
      if (!da || !db) return da ? -1 : db ? 1 : 0
      return da.localeCompare(db)
    }
    return 0
  })
}
