'use client'

import { useRef, useState } from 'react'
import { Clock, MapPin, Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Project { id: string; name: string }
interface OpenEntry { id: string; project_id: string; project_name: string; clock_in_at: string }

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

function getPosition(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({ lat: null, lng: null })
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  })
}

// Big one-tap clock in / out. Takes a selfie (required by the punch API),
// grabs GPS, and posts to the per-project time endpoint.
export function ClockCard({
  projects, openEntry, onChange,
}: { projects: Project[]; openEntry: OpenEntry | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pickProject, setPickProject] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingProject = useRef<string | null>(null)

  const clockedIn = !!openEntry

  function start() {
    setError('')
    if (clockedIn) {
      pendingProject.current = openEntry!.project_id
      fileRef.current?.click()
      return
    }
    if (projects.length === 1) {
      pendingProject.current = projects[0].id
      fileRef.current?.click()
    } else if (projects.length > 1) {
      setPickProject(true)
    } else {
      setError('You are not assigned to any job yet.')
    }
  }

  function chooseProject(id: string) {
    setPickProject(false)
    pendingProject.current = id
    fileRef.current?.click()
  }

  async function onSelfie(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    const projectId = pendingProject.current
    if (!file || !projectId) return
    setBusy(true)
    setError('')
    try {
      const { lat, lng } = await getPosition()
      const fd = new FormData()
      fd.append('action', clockedIn ? 'out' : 'in')
      if (lat != null) fd.append('lat', String(lat))
      if (lng != null) fd.append('lng', String(lng))
      fd.append('selfie', file)
      const res = await fetch(`/api/projects/${projectId}/time/punch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Punch failed')
      onChange()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const since = openEntry
    ? new Date(openEntry.clock_in_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onSelfie} />

      {clockedIn ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          <span className="font-semibold text-ink">On the clock</span>
          <span className="text-muted-fg">since {since}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-fg">
          <Clock className="h-4 w-4" />
          Not clocked in
        </div>
      )}

      {clockedIn && (
        <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-fg">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="truncate">{openEntry!.project_name}</span>
        </div>
      )}

      <button
        onClick={start}
        disabled={busy}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl py-5 text-lg font-bold text-white shadow-sm transition active:scale-[.98] disabled:opacity-60',
          clockedIn ? 'bg-danger' : 'bg-success',
        )}
      >
        {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
        {busy ? 'One sec...' : clockedIn ? 'Clock out' : 'Clock in'}
      </button>
      <p className="mt-2 text-center text-xs text-muted-fg">A quick selfie confirms your punch.</p>

      {error && <p className="mt-3 text-center text-sm text-danger">{error}</p>}

      {pickProject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4" onClick={() => setPickProject(false)}>
          <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-4" onClick={e => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold text-ink">Which job?</h3>
            <div className="space-y-2">
              {projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => chooseProject(p.id)}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface px-4 py-4 text-left font-medium text-ink active:bg-faint"
                >
                  <MapPin className="h-5 w-5 shrink-0 text-muted-fg" />
                  <span className="truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
