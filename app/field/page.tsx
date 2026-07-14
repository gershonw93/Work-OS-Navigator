'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { CheckSquare, Camera, ChevronRight, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ClockCard } from './clock-card'
import { TaskRow, type FieldTask } from './task-row'

interface FieldData {
  projects: { id: string; name: string }[]
  tasks: FieldTask[]
  openEntry: { id: string; project_id: string; project_name: string; clock_in_at: string } | null
  me?: { name: string }
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function FieldHome() {
  const [data, setData] = useState<FieldData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const res = await fetch('/api/me/tasks', { headers: { Authorization: `Bearer ${await token()}` } })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-fg" /></div>
  }

  const openTasks = (data?.tasks ?? []).filter(t => t.status !== 'completed')
  const firstName = (data?.me?.name ?? '').split(' ')[0]

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="text-2xl font-bold text-ink">
        {greeting()}{firstName ? `, ${firstName}` : ''}
      </h1>
      <p className="mb-5 text-sm text-muted-fg">
        {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
      </p>

      <ClockCard projects={data?.projects ?? []} openEntry={data?.openEntry ?? null} onChange={load} />

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <CheckSquare className="h-5 w-5 text-accent" /> My tasks
        </h2>
        {openTasks.length > 0 && (
          <Link href="/field/tasks" className="text-sm font-medium text-accent">See all</Link>
        )}
      </div>

      {openTasks.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-6 text-center text-sm text-muted-fg">
          Nothing assigned right now. Nice.
        </div>
      ) : (
        <div className="space-y-2">
          {openTasks.slice(0, 4).map(t => <TaskRow key={t.id} task={t} onChange={load} />)}
        </div>
      )}

      <Link
        href="/field/log"
        className="mt-6 flex items-center gap-3 rounded-2xl border border-line bg-panel p-5 active:bg-faint"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Camera className="h-6 w-6" />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-ink">Snap a photo / log</span>
          <span className="block text-sm text-muted-fg">Add a photo or quick note to a job</span>
        </span>
        <ChevronRight className="h-5 w-5 text-muted-fg" />
      </Link>
    </div>
  )
}
