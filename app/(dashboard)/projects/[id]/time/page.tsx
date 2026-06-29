'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, MapPin, AlertTriangle, Camera, LogIn, LogOut, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CameraCapture } from '@/components/ui/camera-capture'

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

  const flaggedCount = entries.filter(e => e.clock_in_flagged || e.clock_out_flagged).length

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
                    </div>
                    <p className="text-xs text-faint">
                      {fmtDate(e.clock_in_at)} · {fmtTime(e.clock_in_at)}
                      {e.clock_out_at ? ` – ${fmtTime(e.clock_out_at)}` : ' – present'}
                      {e.clock_in_distance_m != null && ` · ${e.clock_in_distance_m}m from site`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {e.clock_out_at
                      ? <span className="text-sm font-semibold text-ink">{duration(e.clock_in_at, e.clock_out_at)}</span>
                      : <span className="text-xs font-medium text-success">Active</span>}
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
