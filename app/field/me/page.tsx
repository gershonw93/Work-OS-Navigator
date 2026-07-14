'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { User, MapPin, LogOut, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Data {
  projects: { id: string; name: string }[]
  openEntry: { project_name: string; clock_in_at: string } | null
  me?: { name: string; role: string | null }
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

const ROLE_LABEL: Record<string, string> = { worker: 'Field worker', member: 'Field worker' }

export default function FieldMe() {
  const router = useRouter()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/me/tasks', { headers: { Authorization: `Bearer ${await token()}` } })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function signOut() {
    await createClient().auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-fg" /></div>
  }

  const name = data?.me?.name ?? 'Worker'
  const role = data?.me?.role ?? ''

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <div className="mb-6 flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
          <User className="h-8 w-8" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-ink">{name}</h1>
          <p className="text-sm text-muted-fg">{ROLE_LABEL[role] ?? role}</p>
        </div>
      </div>

      {data?.openEntry && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-line bg-panel p-4 text-sm">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-success" />
          <span className="font-semibold text-ink">On the clock</span>
          <span className="text-muted-fg">at {data.openEntry.project_name}</span>
        </div>
      )}

      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-fg">
        <MapPin className="h-4 w-4" /> My jobs
      </h2>
      {(data?.projects ?? []).length === 0 ? (
        <p className="mb-6 rounded-2xl border border-line bg-panel p-4 text-sm text-muted-fg">No jobs assigned yet.</p>
      ) : (
        <div className="mb-6 space-y-2">
          {data!.projects.map(p => (
            <div key={p.id} className="flex items-center gap-2 rounded-2xl border border-line bg-panel p-4">
              <MapPin className="h-5 w-5 shrink-0 text-muted-fg" />
              <span className="truncate font-medium text-ink">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={signOut}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-panel py-4 font-semibold text-danger active:bg-faint"
      >
        <LogOut className="h-5 w-5" /> Sign out
      </button>
    </div>
  )
}
