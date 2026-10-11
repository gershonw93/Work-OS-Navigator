'use client'

// Delays subs have reported on this job, waiting on the GC.
//
// Review opens the SAME delay dialog the GC uses for any delay, pre-filled
// with the sub's days and reason - so the preview of what moves, the review of
// who is told and the apply are the ones every other delay goes through.
// Nothing here moves a date. Dismiss tells the sub the dates stand.

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface PendingDelayReport {
  id: string
  schedule_item_id: string
  days: number
  reason: string
  reported_by_name: string | null
  created_at: string
  companies: { name: string } | null
}

export function DelayReportBanner({ reports, lineName, onReview, onDismiss, busyId }: {
  reports: PendingDelayReport[]
  lineName: (itemId: string) => string | null
  onReview: (report: PendingDelayReport) => void
  onDismiss: (report: PendingDelayReport) => void
  busyId: string | null
}) {
  // A report for a line no longer on the board has nothing to open.
  const shown = reports.filter(r => lineName(r.schedule_item_id) != null)
  if (!shown.length) return null
  return (
    <div className="rounded-2xl border border-warn/30 bg-warn-tint">
      <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-ink">
        <AlertTriangle className="h-4 w-4 text-warn" />
        {shown.length === 1 ? 'A sub reported a delay' : `${shown.length} subs reported delays`}
      </div>
      <div className="divide-y divide-warn/20">
        {shown.map(r => (
          <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">
                <span className="font-semibold">{r.companies?.name || r.reported_by_name || 'A sub'}</span>
                {' '}says {lineName(r.schedule_item_id)} is {r.days} day{r.days === 1 ? '' : 's'} late
              </p>
              <p className="text-xs text-muted-fg [overflow-wrap:anywhere]">&ldquo;{r.reason}&rdquo; · nothing has moved yet</p>
            </div>
            <div className="row-even lg:flex shrink-0 gap-2">
              <Button size="sm" variant="ghost" onClick={() => onDismiss(r)} disabled={busyId === r.id}>Dismiss</Button>
              <Button size="sm" onClick={() => onReview(r)} disabled={busyId === r.id}>Review</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
