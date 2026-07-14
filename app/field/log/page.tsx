'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Loader2, X, MapPin, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Project { id: string; name: string }

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

export default function FieldLog() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/me/tasks', { headers: { Authorization: `Bearer ${await token()}` } })
    if (res.ok) {
      const data = await res.json()
      setProjects(data.projects ?? [])
      if ((data.openEntry?.project_id)) setProjectId(data.openEntry.project_id)
      else if ((data.projects ?? []).length === 1) setProjectId(data.projects[0].id)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setPhotos(p => [...p, ...files])
  }

  async function submit() {
    setError('')
    if (!projectId) return setError('Pick a job first.')
    if (photos.length === 0 && !note.trim()) return setError('Add a photo or a note.')
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('log_date', new Date().toISOString().slice(0, 10))
      fd.append('notes', note)
      photos.forEach(f => fd.append('photos', f))
      const res = await fetch(`/api/projects/${projectId}/daily-logs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setDone(true)
      setTimeout(() => router.push('/field'), 1200)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-fg" /></div>
  }

  if (done) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
          <Check className="h-9 w-9" />
        </span>
        <p className="text-lg font-semibold text-ink">Logged!</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-ink">
        <Camera className="h-6 w-6 text-accent" /> Photo / log
      </h1>

      <label className="mb-1.5 block text-sm font-medium text-ink">Job</label>
      <select
        value={projectId}
        onChange={e => setProjectId(e.target.value)}
        className="mb-4 w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink"
      >
        <option value="">Pick a job...</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhotos} />
      <button
        onClick={() => fileRef.current?.click()}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-6 font-semibold text-accent active:bg-faint"
      >
        <Camera className="h-6 w-6" /> Take / add photo
      </button>

      {photos.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((f, i) => (
            <div key={i} className="relative aspect-square overflow-hidden rounded-xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => setPhotos(p => p.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="mb-1.5 block text-sm font-medium text-ink">Quick note</label>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={4}
        placeholder="What happened on site?"
        className="mb-4 w-full rounded-xl border border-line bg-panel px-4 py-3 text-ink"
      />

      {error && <p className="mb-3 text-sm text-danger">{error}</p>}

      <button
        onClick={submit}
        disabled={saving}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-lg font-bold text-accent-ink shadow-sm transition active:scale-[.98] disabled:opacity-60',
        )}
      >
        {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
        {saving ? 'Saving...' : 'Save log'}
      </button>
    </div>
  )
}
