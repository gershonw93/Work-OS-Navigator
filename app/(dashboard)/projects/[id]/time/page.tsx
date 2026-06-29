'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, MapPin, AlertTriangle, Camera, LogIn, LogOut, CheckCircle2, ChevronLeft, ChevronRight, Download, Check, X as XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CameraCapture } from '@/components/ui/camera-capture'
import { usePermissions } from '@/lib/use-permissions'
import { Button } from '@/components/ui/button'

interface TimeEntry {
  id: string
  profile_id: string | null
  worker_name: string | null
  clock_in_at: string
  clock_in_distance_m: number | null
  clock_in_flagged: boolean
  clock_in_selfie_url: string | null
  clock_out_at: string | null
  clock_out_distance_m: number | null
  clock_out_flagged: boolean
  clock_out_selfie_url: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  reviewed_by_name: string | null
}

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - x.getDay())
  return x
}
function hoursBetween(a: string, b: string | null) {
  if (!b) return 0
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600000
}

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function duration(a: string, b: string | null) {
  if (!b) return null
  const mins = Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
  const h = Math.floor(mins / 60), m = mins % 60
  return `${h}h ${m}m`
}

export default function TimeClockPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [myOpen, setMyOpen] = useState<TimeEntry | null>(null)
  const [myId, setMyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'error'; text: string } | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const { can } = usePermissions()
  const canManage = can('time', 'edit')
  const [weekCursor, setWeekCursor] = useState(() => startOfWeek(new Date()))

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/time`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setEntries(d.entries ?? [])
      setMyOpen(d.myOpen ?? null)
      setMyId(d.myId ?? '')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  function getPosition(): Promise<{ lat: number; lng: number } | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) return resolve(null)
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  // Step 1: tapping the button opens the LIVE camera (no upload allowed)
  function startPunch() {
    setMsg(null)
    setCameraOpen(true)
  }

  // Step 2: once a live selfie is captured, grab GPS and submit
  async function onSelfie(selfie: Blob) {
    setCameraOpen(false)
    setBusy(true)
    setMsg(null)
    try {
      const pos = await getPosition()
      const action = myOpen ? 'out' : 'in'
      const form = new FormData()
      form.append('action', action)
      form.append('selfie', new File([selfie], 'selfie.jpg', { type: 'image/jpeg' }))
      if (pos) { form.append('lat', String(pos.lat)); form.append('lng', String(pos.lng)) }
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/time/punch`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ kind: 'error', text: data.error || 'Punch failed.' }); return }
      if (data.flagged) {
        setMsg({ kind: 'warn', text: `Clocked ${action === 'in' ? 'in' : 'out'} — but your location is ${data.distance != null ? `${data.distance}m from the job site` : 'unavailable'}. Flagged for review.` })
      } else {
        setMsg({ kind: 'ok', text: `Clocked ${action === 'in' ? 'in' : 'out'} successfully${data.distance != null ? ` · ${data.distance}m from site` : ''}.` })
      }
      load()
    } catch (err: any) {
      setMsg({ kind: 'error', text: err?.message ? `Failed: ${err.message}` : 'Failed — check connection.' })
    } finally {
      setBusy(false)
    }
  }

  async function review(entryId: string, approval_status: 'approved' | 'rejected') {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/time/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approval_status }),
    })
    if (res.ok) load()
  }

  async function exportWeek() {
    const from = weekCursor.toISOString()
    const end = new Date(weekCursor); end.setDate(end.getDate() + 7)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/time/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(end.toISOString())}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `timesheet-${weekCursor.toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const flaggedCount = entries.filter(e => e.clock_in_flagged || e.clock_out_flagged).length

  // Needs-review: flagged and still pending
  const needsReview = entries.filter(e => (e.clock_in_flagged || e.clock_out_flagged) && e.approval_status === 'pending')

  // Weekly timesheet aggregation
  const weekEnd = new Date(weekCursor); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEntries = entries.filter(e => {
    const t = new Date(e.clock_in_at).getTime()
    return t >= weekCursor.getTime() && t < weekEnd.getTime()
  })
  const byWorker = new Map<string, { name: string; hours: number; entries: number; flagged: number; open: number }>()
  for (const e of weekEntries) {
    const key = e.profile_id ?? e.worker_name ?? 'unknown'
    const w = byWorker.get(key) ?? { name: e.worker_name ?? 'Worker', hours: 0, entries: 0, flagged: 0, open: 0 }
    w.hours += hoursBetween(e.clock_in_at, e.clock_out_at)
    w.entries += 1
    if (e.clock_in_flagged || e.clock_out_flagged) w.flagged += 1
    if (!e.clock_out_at) w.open += 1
    byWorker.set(key, w)
  }
  const timesheet = Array.from(byWorker.values()).sort((a, b) => b.hours - a.hours)
  const weekTotal = timesheet.reduce((t, w) => t + w.hours, 0)
  const weekLabel = `${weekCursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <div className="space-y-6">
      {cameraOpen && <CameraCapture facing="user" onCapture={onSelfie} onClose={() => setCameraOpen(false)} />}

      <div>
        <h1 className="text-2xl font-bold text-ink">Time Clock</h1>
        <p className="text-sm text-muted-fg mt-0.5">Punch in/out with an auto timestamp, GPS check, and a selfie.</p>
      </div>

      {/* Punch card */}
      <div className="bg-panel rounded-xl border border-line p-6 text-center">
        {myOpen ? (
          <>
            <div className="inline-flex items-center gap-2 text-success text-sm font-medium mb-1">
              <span className="h-2 w-2 rounded-full bg-success-solid animate-pulse" /> On the clock
            </div>
            <p className="text-sm text-muted-fg">Since {fmtTime(myOpen.clock_in_at)} · {duration(myOpen.clock_in_at, new Date().toISOString())}</p>
          </>
        ) : (
          <p className="text-sm text-muted-fg mb-1">You are clocked out</p>
        )}

        <button
          onClick={startPunch}
          disabled={busy}
          className={cn('mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-base font-bold transition-colors w-full sm:w-auto',
            myOpen ? 'bg-danger-solid text-white hover:bg-danger-solid/90' : 'bg-accent text-accent-ink hover:bg-accent/90',
            busy && 'opacity-60')}
        >
          {busy
            ? 'Working…'
            : myOpen
              ? <><LogOut className="h-5 w-5" /> Clock Out</>
              : <><LogIn className="h-5 w-5" /> Clock In</>}
        </button>
        <p className="text-xs text-faint mt-3 flex items-center justify-center gap-3">
          <span className="inline-flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> Live selfie required</span>
          <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Location checked</span>
        </p>

        {msg && (
          <div className={cn('mt-4 rounded-lg px-4 py-2.5 text-sm flex items-center gap-2 justify-center',
            msg.kind === 'ok' ? 'bg-success-tint text-success' : msg.kind === 'warn' ? 'bg-warn-tint text-warn' : 'bg-danger-tint text-danger')}>
            {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            {msg.text}
          </div>
        )}
      </div>

      {/* Needs review (supervisors) */}
      {canManage && needsReview.length > 0 && (
        <div className="bg-panel rounded-xl border border-warn/30 overflow-hidden">
          <div className="px-5 py-3 border-b border-line-soft flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warn" />
            <span className="text-sm font-semibold text-warn">Needs review ({needsReview.length})</span>
          </div>
          <div className="divide-y divide-line-soft">
            {needsReview.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                {e.clock_in_selfie_url
                  ? <img src={e.clock_in_selfie_url} alt="" className="h-10 w-10 rounded-full object-cover border border-line shrink-0" />
                  : <div className="h-10 w-10 rounded-full bg-muted shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-soft truncate">{e.worker_name ?? 'Worker'}</p>
                  <p className="text-xs text-faint">
                    {fmtDate(e.clock_in_at)} · {fmtTime(e.clock_in_at)}{e.clock_out_at ? ` – ${fmtTime(e.clock_out_at)}` : ''}
                    {e.clock_in_distance_m != null ? ` · ${e.clock_in_distance_m}m from site` : ' · no GPS'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => review(e.id, 'approved')} title="Approve"
                    className="inline-flex items-center gap-1 rounded-lg bg-success-tint text-success px-2.5 py-1.5 text-xs font-medium hover:opacity-80">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => review(e.id, 'rejected')} title="Reject"
                    className="inline-flex items-center gap-1 rounded-lg bg-danger-tint text-danger px-2.5 py-1.5 text-xs font-medium hover:opacity-80">
                    <XIcon className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly timesheet */}
      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-line-soft flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-soft">Timesheet</span>
          <div className="flex items-center gap-1">
            <button onClick={() => { const d = new Date(weekCursor); d.setDate(d.getDate() - 7); setWeekCursor(d) }}
              className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-ink"><ChevronLeft className="h-4 w-4" /></button>
            <span className="text-xs font-medium text-muted-fg px-1 min-w-[110px] text-center">{weekLabel}</span>
            <button onClick={() => { const d = new Date(weekCursor); d.setDate(d.getDate() + 7); setWeekCursor(d) }}
              className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-ink"><ChevronRight className="h-4 w-4" /></button>
            <Button size="sm" variant="outline" onClick={exportWeek} className="ml-1"><Download className="h-3.5 w-3.5" /> Export</Button>
          </div>
        </div>
        {timesheet.length === 0 ? (
          <div className="py-8 text-center text-sm text-faint">No hours logged this week.</div>
        ) : (
          <div className="divide-y divide-line-soft">
            {timesheet.map((w, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink-soft truncate">{w.name}</span>
                  <p className="text-xs text-faint">
                    {w.entries} punch{w.entries !== 1 ? 'es' : ''}
                    {w.flagged > 0 && <span className="text-warn"> · {w.flagged} flagged</span>}
                    {w.open > 0 && <span className="text-success"> · {w.open} active</span>}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink shrink-0">{w.hours.toFixed(1)} h</span>
              </div>
            ))}
            <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-surface">
              <span className="text-sm font-bold text-ink-soft">Week total</span>
              <span className="text-sm font-bold text-ink">{weekTotal.toFixed(1)} h</span>
            </div>
          </div>
        )}
      </div>

      {/* Entries */}
      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        <div className="px-5 py-3 border-b border-line-soft flex items-center justify-between">
          <span className="text-sm font-semibold text-ink-soft">Time Entries</span>
          {flaggedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
              <AlertTriangle className="h-3.5 w-3.5" /> {flaggedCount} flagged
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-faint">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center">
            <Clock className="h-8 w-8 text-faint mx-auto mb-3" />
            <p className="text-sm text-muted-fg">No punches yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {entries.map(e => {
              const flagged = e.clock_in_flagged || e.clock_out_flagged
              return (
                <div key={e.id} className={cn('flex items-center gap-3 px-4 sm:px-5 py-3', flagged && 'bg-warn-tint/40')}>
                  {e.clock_in_selfie_url
                    ? <img src={e.clock_in_selfie_url} alt="" className="h-10 w-10 rounded-full object-cover border border-line shrink-0" />
                    : <div className="h-10 w-10 rounded-full bg-muted shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink-soft truncate">{e.worker_name ?? 'Worker'}</span>
                      {e.profile_id === myId && <span className="text-[10px] rounded-full bg-muted text-muted-fg px-1.5 py-0.5">You</span>}
                      {flagged && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-warn-tint text-warn px-1.5 py-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" /> Location flagged
                        </span>
                      )}
                      {e.approval_status === 'approved' && <span className="text-[10px] font-medium rounded-full bg-success-tint text-success px-1.5 py-0.5">Approved</span>}
                      {e.approval_status === 'rejected' && <span className="text-[10px] font-medium rounded-full bg-danger-tint text-danger px-1.5 py-0.5">Rejected</span>}
                    </div>
                    <p className="text-xs text-faint">
                      {fmtDate(e.clock_in_at)} · {fmtTime(e.clock_in_at)}
                      {e.clock_out_at ? ` – ${fmtTime(e.clock_out_at)}` : ' – present'}
                      {e.clock_in_distance_m != null && ` · ${e.clock_in_distance_m}m from site`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {canManage && e.approval_status === 'pending' && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => review(e.id, 'approved')} title="Approve" className="p-1.5 rounded-lg text-success hover:bg-success-tint"><Check className="h-4 w-4" /></button>
                        <button onClick={() => review(e.id, 'rejected')} title="Reject" className="p-1.5 rounded-lg text-danger hover:bg-danger-tint"><XIcon className="h-4 w-4" /></button>
                      </div>
                    )}
                    <div className="text-right">
                      {e.clock_out_at
                        ? <span className="text-sm font-semibold text-ink">{duration(e.clock_in_at, e.clock_out_at)}</span>
                        : <span className="text-xs font-medium text-success">Active</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
