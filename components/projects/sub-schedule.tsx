'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CalendarDays, Users, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Job { id: string; name: string; sched_start: string | null; sched_days: number | null; sched_workers: number | null }

const DAY = 86400000
const parse = (d: string) => new Date(d + 'T00:00:00')
const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
// Inclusive end date given a start + working days.
const endOf = (start: string, days: number) => new Date(parse(start).getTime() + (Math.max(days, 1) - 1) * DAY)

export function SubSchedule({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [others, setOthers] = useState<Job[]>([])
  const [start, setStart] = useState('')
  const [days, setDays] = useState('')
  const [workers, setWorkers] = useState('')

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/job-schedule`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setStart(d.project?.sched_start ?? '')
      setDays(d.project?.sched_days != null ? String(d.project.sched_days) : '')
      setWorkers(d.project?.sched_workers != null ? String(d.project.sched_workers) : '')
      setOthers(d.others ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [projectId])

  const nDays = Number(days) || 0
  const nWorkers = Number(workers) || 0
  const end = start && nDays > 0 ? endOf(start, nDays) : null

  // Overlap check against the company's other scheduled jobs.
  const conflicts = useMemo(() => {
    if (!start || nDays <= 0) return [] as { name: string; from: string; to: string; workers: number }[]
    const aStart = parse(start).getTime()
    const aEnd = end!.getTime()
    const out: { name: string; from: string; to: string; workers: number }[] = []
    for (const j of others) {
      if (!j.sched_start || !j.sched_days) continue
      const bStart = parse(j.sched_start).getTime()
      const bEnd = endOf(j.sched_start, j.sched_days).getTime()
      if (aStart <= bEnd && bStart <= aEnd) {
        out.push({
          name: j.name,
          from: fmt(new Date(Math.max(aStart, bStart))),
          to: fmt(new Date(Math.min(aEnd, bEnd))),
          workers: j.sched_workers ?? 0,
        })
      }
    }
    return out
  }, [start, nDays, others, end])

  const overlapWorkers = nWorkers + conflicts.reduce((s, c) => s + c.workers, 0)

  async function save() {
    setSaving(true)
    const t = await token()
    await fetch(`/api/projects/${projectId}/job-schedule`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ sched_start: start || null, sched_days: days ? Number(days) : null, sched_workers: workers ? Number(workers) : null }),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1500)
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-ink">Schedule</h1>
        <p className="text-sm text-muted-fg mt-0.5">Plan when you'll do this job, how long it takes, and your crew size. We'll flag any overlap with your other open jobs.</p>
      </div>

      <div className="bg-panel rounded-xl border border-line p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-accent-fg" /> Start date</Label><Input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-accent-fg" /> How long (days)</Label><Input type="number" min={1} value={days} onChange={e => setDays(e.target.value)} placeholder="e.g. 5" /></div>
          <div className="space-y-1.5"><Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-accent-fg" /> Workers needed</Label><Input type="number" min={1} value={workers} onChange={e => setWorkers(e.target.value)} placeholder="e.g. 3" /></div>
        </div>

        {end && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-fg">
            <span>Runs <span className="font-semibold text-ink-soft">{fmt(parse(start))} to {fmt(end)}</span></span>
            {nWorkers > 0 && <span>· {nWorkers} worker{nWorkers !== 1 ? 's' : ''}</span>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          {saved && <span className="text-xs text-success inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Saved</span>}
          <Button onClick={save} disabled={saving || !start || nDays <= 0}>{saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : 'Save schedule'}</Button>
        </div>
      </div>

      {/* Overlap warning */}
      {conflicts.length > 0 ? (
        <div className="rounded-xl border border-warn/40 bg-warn-tint/40 p-4">
          <p className="text-sm font-semibold text-warn flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Overlaps {conflicts.length} other job{conflicts.length > 1 ? 's' : ''}</p>
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c, i) => (
              <li key={i} className="text-sm text-ink-soft">
                <span className="font-medium">{c.name}</span> <span className="text-muted-fg">overlaps {c.from} to {c.to}{c.workers ? ` · needs ${c.workers} worker${c.workers !== 1 ? 's' : ''}` : ''}</span>
              </li>
            ))}
          </ul>
          {overlapWorkers > 0 && (
            <p className="text-xs text-muted-fg mt-2">During the overlap you'd need about <span className="font-semibold text-warn">{overlapWorkers} workers</span> across jobs. Make sure you have the crew, or move a start date.</p>
          )}
        </div>
      ) : start && nDays > 0 ? (
        <div className="rounded-xl border border-success/30 bg-success-tint/40 p-4 text-sm text-success flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> No overlap with your other open jobs. You're clear.
        </div>
      ) : null}

      {/* Other scheduled jobs, for context */}
      {others.length > 0 && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft"><p className="text-xs font-semibold uppercase tracking-wide text-faint">Your other scheduled jobs</p></div>
          <div className="divide-y divide-line-soft">
            {others.filter(j => j.sched_start && j.sched_days).map(j => (
              <div key={j.id} className="px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
                <span className="text-ink-soft truncate">{j.name}</span>
                <span className="text-muted-fg shrink-0">{fmt(parse(j.sched_start!))} to {fmt(endOf(j.sched_start!, j.sched_days!))}{j.sched_workers ? ` · ${j.sched_workers}w` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
