'use client'

import { X, Award } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ScopeItem {
  id: string
  item: string
  qty?: number | null
  unit_price?: number | null
  included?: boolean
}

interface ScopeCategory {
  id: string
  category: string
  items?: ScopeItem[]
}

interface LeveledBid {
  id: string
  company_id: string
  amount: number
  duration_days: number | null
  earliest_start_date: string | null
  crew_size: number | null
  notes: string | null
  payment_terms: string | null
  scope_categories: ScopeCategory[] | null
  companies: { name: string }
  status: string
}

interface BidLevelingModalProps {
  packageName: string
  packageTrade: string | null
  bids: LeveledBid[]
  onClose: () => void
  onAward: (bidId: string) => void
  awardingBid: string | null
  packageStatus: string
}

// Build a union of all line item labels across all bids' scope_categories
function buildLineItemRows(bids: LeveledBid[]): string[] {
  const seen = new Set<string>()
  const labels: string[] = []
  for (const bid of bids) {
    if (!bid.scope_categories) continue
    for (const cat of bid.scope_categories) {
      for (const item of cat.items ?? []) {
        const label = item.item?.trim()
        if (label && !seen.has(label)) {
          seen.add(label)
          labels.push(label)
        }
      }
    }
  }
  return labels
}

// Look up a line item value from a bid by label
function getLineItemAmount(bid: LeveledBid, label: string): number | null {
  if (!bid.scope_categories) return null
  for (const cat of bid.scope_categories) {
    for (const item of cat.items ?? []) {
      if (item.item?.trim() === label && item.included !== false) {
        if (item.qty != null && item.unit_price != null) {
          return item.qty * item.unit_price
        }
      }
    }
  }
  return null
}

// Returns indices of min and max among numeric values in an array
function minMaxIndices(values: (number | null)[]): { minIdx: number | null; maxIdx: number | null } {
  const nums = values.map((v, i) => (v != null ? { v, i } : null)).filter(Boolean) as { v: number; i: number }[]
  if (nums.length < 2) return { minIdx: null, maxIdx: null }
  const minV = Math.min(...nums.map(x => x.v))
  const maxV = Math.max(...nums.map(x => x.v))
  if (minV === maxV) return { minIdx: null, maxIdx: null }
  return {
    minIdx: nums.find(x => x.v === minV)?.i ?? null,
    maxIdx: nums.find(x => x.v === maxV)?.i ?? null,
  }
}

function fmt(n: number) {
  return '$' + n.toLocaleString()
}

export function BidLevelingModal({
  packageName,
  packageTrade,
  bids,
  onClose,
  onAward,
  awardingBid,
  packageStatus,
}: BidLevelingModalProps) {
  // Sort bids by amount ascending so lowest is first
  const sorted = [...bids].sort((a, b) => a.amount - b.amount)
  const lowestBidId = sorted[0]?.id

  const lineItemLabels = buildLineItemRows(sorted)

  // --- Row data arrays for highlight calculation ---
  const totalAmounts = sorted.map(b => b.amount)
  const durations = sorted.map(b => b.duration_days)
  const crewSizes = sorted.map(b => b.crew_size)

  const totalMM = minMaxIndices(totalAmounts)
  const durationMM = minMaxIndices(durations)
  const crewMM = minMaxIndices(crewSizes)

  const lineItemMMs = lineItemLabels.map(label => {
    const vals = sorted.map(b => getLineItemAmount(b, label))
    return minMaxIndices(vals)
  })

  function cellHighlight(colIdx: number, minIdx: number | null, maxIdx: number | null) {
    if (colIdx === minIdx) return 'bg-green-50 text-green-700 font-semibold'
    if (colIdx === maxIdx) return 'bg-amber-50 text-amber-700'
    return ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto">
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-6xl min-w-0 my-4">

        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-xl border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900">Bid Leveling Sheet</h2>
              {packageTrade && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{packageTrade}</span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{packageName}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable table area */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0" style={{ minWidth: `${Math.max(520, sorted.length * 200 + 160)}px` }}>

            {/* Column headers — one per bidding company */}
            <thead>
              <tr>
                {/* Row label column */}
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-200 w-44 sticky left-0 z-10">
                  Category
                </th>
                {sorted.map((bid, i) => {
                  const isLowest = bid.id === lowestBidId
                  return (
                    <th
                      key={bid.id}
                      className={cn(
                        'px-4 py-4 text-center border-b border-slate-200 min-w-[180px]',
                        isLowest ? 'bg-green-50' : 'bg-slate-50'
                      )}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        {/* Recommended badge on lowest */}
                        {isLowest && sorted.length > 1 && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2.5 py-0.5">
                            ★ Recommended
                          </span>
                        )}
                        <span className="font-semibold text-slate-900 text-sm leading-tight">
                          {bid.companies?.name}
                        </span>
                        <span className={cn('text-xl font-bold', isLowest ? 'text-green-700' : 'text-slate-900')}>
                          {fmt(bid.amount)}
                        </span>
                        {packageStatus !== 'awarded' && bid.status !== 'awarded' && bid.status !== 'rejected' && (
                          <Button
                            size="sm"
                            disabled={awardingBid === bid.id}
                            onClick={() => onAward(bid.id)}
                            className="mt-1"
                          >
                            <Award className="h-3.5 w-3.5" />
                            {awardingBid === bid.id ? 'Awarding…' : 'Award'}
                          </Button>
                        )}
                        {bid.status === 'awarded' && (
                          <span className="text-xs font-medium text-green-600 bg-green-50 rounded-full px-2.5 py-0.5 border border-green-200">
                            Awarded ✓
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">

              {/* Total Bid Amount */}
              <tr className="hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Total Amount
                </td>
                {sorted.map((bid, i) => (
                  <td
                    key={bid.id}
                    className={cn('px-4 py-3 text-center font-semibold', cellHighlight(i, totalMM.minIdx, totalMM.maxIdx))}
                  >
                    {fmt(bid.amount)}
                  </td>
                ))}
              </tr>

              {/* Duration */}
              <tr className="hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Duration (days)
                </td>
                {sorted.map((bid, i) => (
                  <td
                    key={bid.id}
                    className={cn('px-4 py-3 text-center', cellHighlight(i, durationMM.minIdx, durationMM.maxIdx))}
                  >
                    {bid.duration_days != null ? bid.duration_days : <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>

              {/* Start Date */}
              <tr className="hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Start Date
                </td>
                {sorted.map(bid => (
                  <td key={bid.id} className="px-4 py-3 text-center text-slate-700">
                    {bid.earliest_start_date
                      ? new Date(bid.earliest_start_date).toLocaleDateString()
                      : <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>

              {/* Crew Size */}
              <tr className="hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Crew Size
                </td>
                {sorted.map((bid, i) => (
                  <td
                    key={bid.id}
                    className={cn('px-4 py-3 text-center', cellHighlight(i, crewMM.minIdx, crewMM.maxIdx))}
                  >
                    {bid.crew_size != null ? bid.crew_size : <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>

              {/* Payment Terms */}
              <tr className="hover:bg-slate-50/50">
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Payment Terms
                </td>
                {sorted.map(bid => (
                  <td key={bid.id} className="px-4 py-3 text-center text-slate-700 text-xs leading-relaxed">
                    {bid.payment_terms ?? <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>

              {/* Line items section header (only shown if any bids have scope_categories) */}
              {lineItemLabels.length > 0 && (
                <tr>
                  <td
                    colSpan={sorted.length + 1}
                    className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200"
                  >
                    Scope Line Items
                  </td>
                </tr>
              )}

              {/* One row per line item label */}
              {lineItemLabels.map((label, rowIdx) => {
                const mm = lineItemMMs[rowIdx]
                return (
                  <tr key={label} className="hover:bg-slate-50/50">
                    <td className="px-5 py-3 text-sm text-slate-700 bg-white sticky left-0 border-r border-slate-100 leading-snug">
                      {label}
                    </td>
                    {sorted.map((bid, colIdx) => {
                      const val = getLineItemAmount(bid, label)
                      // Check if item exists but is excluded
                      let excluded = false
                      if (bid.scope_categories) {
                        for (const cat of bid.scope_categories) {
                          for (const item of cat.items ?? []) {
                            if (item.item?.trim() === label && item.included === false) {
                              excluded = true
                            }
                          }
                        }
                      }
                      return (
                        <td
                          key={bid.id}
                          className={cn(
                            'px-4 py-3 text-center',
                            excluded ? 'text-slate-300 line-through' : cellHighlight(colIdx, mm.minIdx, mm.maxIdx)
                          )}
                        >
                          {excluded
                            ? 'Excl.'
                            : val != null
                              ? fmt(val)
                              : <span className="text-slate-300">—</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Notes row */}
              <tr>
                <td
                  colSpan={sorted.length + 1}
                  className="px-5 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-50 border-y border-slate-200"
                >
                  Notes
                </td>
              </tr>
              <tr>
                <td className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide bg-white sticky left-0 border-r border-slate-100">
                  Bid Notes
                </td>
                {sorted.map(bid => (
                  <td key={bid.id} className="px-4 py-3 text-center text-slate-700 text-xs leading-relaxed align-top">
                    {bid.notes
                      ? <span className="whitespace-pre-wrap">{bid.notes}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                ))}
              </tr>

            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300 mr-1 align-middle" />Lowest value
            <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 ml-3 mr-1 align-middle" />Highest value
          </p>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

      </div>
    </div>
  )
}
