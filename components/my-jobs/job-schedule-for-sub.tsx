'use client'

// The job's schedule as a sub sees it: every line, theirs marked, and on
// theirs alone a way to say they are running late.
//
// A REPORT, NOT A MOVE. Moving a line pushes the trades linked after it and
// emails them, which is the GC's decision. So the dialog sends the number of
// days and the reason, the line says "waiting on the GC", and nothing moves
// until the GC applies it from their own schedule. The dialog asks the SAME
// rule the GC's delay screen asks (`missingDelay`), and shows where the line
// would land the same way (`delayedDates`).

import { useState } from 'react'
import { AlertTriangle, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate } from '@/lib/dates'
import { delayDays, delayedDates, missingDelay } from '@/lib/schedule-delay'
import { autoFocusOnDesktop } from '@/lib/auto-focus'

export interface SubScheduleLine {
  id: string
  name: string
  company: string | null
  start_date: string
  end_date: string
  mine: boolean
}

export interface DelayReport {
  id: string
  schedule_item_id: string
  days: number
  reason: string
  status: 'pending' | 'applied' | 'dismissed'
  created_at: string
  decided_at: string | null
}

const REPORT_SAYS: Record<DelayReport['status'], string> = {
  pending: 'waiting on the GC',
  applied: 'applied by the GC',
  dismissed: 'not applied by the GC',
}

function ReportDialog({ line, onClose, onSent, send }: {
  line: SubScheduleLine
  onClose: () => void
  onSent: () => void
  send: (days: string, reason: string) => Promise<string | null>
}) {
  const [days, setDays] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const n = delayDays(days)
  const lands = n == null ? null : delayedDates(line, n)

  async function submit() {
    const problem = missingDelay({ days, reason })
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      const e = await send(days, reason.trim())
      if (e) setErr(e)
      else onSent()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Report a delay</h2>
            <p className="truncate text-sm text-muted-fg">{line.name} · {formatDate(line.start_date)} to {formatDate(line.end_date)}</p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="shrink-0 text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label htmlFor="sd-days">How many days late? *</Label>
            <div className="flex items-center gap-2">
              <Input id="sd-days" type="number" min={1} inputMode="numeric" className="w-24"
                autoFocus={autoFocusOnDesktop()} value={days} onChange={e => { setDays(e.target.value); if (err) setErr('') }} />
              <span className="text-sm text-muted-fg">days</span>
            </div>
            {lands && (
              <p className="mt-1.5 text-xs text-muted-fg">
                If the GC applies it, your dates become <span className="font-semibold text-ink">{formatDate(lands.start)} to {formatDate(lands.end)}</span>.
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="sd-reason">What happened? *</Label>
            <Input id="sd-reason" placeholder="e.g. truss delivery pushed by the yard" value={reason}
              onChange={e => { setReason(e.target.value); if (err) setErr('') }} />
          </div>
          <p className="text-xs text-faint">
            Nothing moves yet. The GC sees your report, checks which trades after you it would push, and applies it - you hear back either way.
          </p>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Sending…' : 'Send to the GC'}</Button>
        </div>
      </div>
    </div>
  )
}

export function JobScheduleForSub({ lines, reports, onReport, onChanged }: {
  /** null when the read failed - never shown as "no schedule". */
  lines: SubScheduleLine[] | null
  reports: DelayReport[]
  onReport: (lineId: string, days: string, reason: string) => Promise<string | null>
  onChanged: () => void
}) {
  const [reporting, setReporting] = useState<SubScheduleLine | null>(null)

  if (lines === null) return <p className="py-8 text-center text-sm text-danger">Could not load the schedule. Reload to try again.</p>
  if (lines.length === 0) return <p className="py-8 text-center text-sm text-muted-fg">The GC has not scheduled this job yet.</p>

  // The latest report per line - a newer one replaces an older pending one.
  const latest = new Map<string, DelayReport>()
  for (const r of reports) if (!latest.has(r.schedule_item_id)) latest.set(r.schedule_item_id, r)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-fg">The whole job, in date order. Your work is marked; you can report a delay on it.</p>
      <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
        {lines.map(l => {
          const r = latest.get(l.id)
          return (
            <div key={l.id} className={cn('flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center', l.mine && 'bg-accent-tint/40')}>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <p className={cn('truncate text-sm', l.mine ? 'font-semibold text-ink' : 'text-ink-soft')}>{l.name}</p>
                  {l.mine && <span className="whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-fg">Yours</span>}
                </div>
                <p className="text-xs text-muted-fg">
                  {formatDate(l.start_date)} to {formatDate(l.end_date)}
                  {!l.mine && l.company ? ` · ${l.company}` : ''}
                </p>
                {l.mine && r && (
                  <p className={cn('mt-0.5 flex items-center gap-1 text-xs', r.status === 'pending' ? 'text-warn' : 'text-faint')}>
                    <Clock className="h-3 w-3 shrink-0" />
                    Delay reported: {r.days} day{r.days === 1 ? '' : 's'} - {REPORT_SAYS[r.status]}
                  </p>
                )}
              </div>
              {l.mine && (
                <Button size="sm" variant="outline" onClick={() => setReporting(l)} className="self-start sm:self-auto">
                  <AlertTriangle className="h-3.5 w-3.5" /> {r?.status === 'pending' ? 'Change report' : 'Report a delay'}
                </Button>
              )}
            </div>
          )
        })}
      </div>
      {reporting && (
        <ReportDialog
          line={reporting}
          onClose={() => setReporting(null)}
          send={(days, reason) => onReport(reporting.id, days, reason)}
          onSent={() => { setReporting(null); onChanged() }}
        />
      )}
    </div>
  )
}
