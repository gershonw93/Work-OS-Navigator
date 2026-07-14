'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TaskRow, type FieldTask } from '../task-row'

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

export default function FieldTasks() {
  const [tasks, setTasks] = useState<FieldTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/me/tasks', { headers: { Authorization: `Bearer ${await token()}` } })
    if (res.ok) setTasks((await res.json()).tasks ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const open = tasks.filter(t => t.status !== 'completed')
  const done = tasks.filter(t => t.status === 'completed')

  return (
    <div className="mx-auto max-w-lg px-4 pt-6">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-ink">
        <CheckSquare className="h-6 w-6 text-accent" /> My tasks
      </h1>

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-fg" /></div>
      ) : (
        <>
          {open.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-6 text-center text-sm text-muted-fg">
              No open tasks. You're all caught up.
            </div>
          ) : (
            <div className="space-y-2">
              {open.map(t => <TaskRow key={t.id} task={t} onChange={load} />)}
            </div>
          )}

          {done.length > 0 && (
            <div className="mt-6">
              <button
                onClick={() => setShowDone(v => !v)}
                className="mb-2 text-sm font-medium text-muted-fg"
              >
                {showDone ? 'Hide' : 'Show'} completed ({done.length})
              </button>
              {showDone && (
                <div className="space-y-2">
                  {done.map(t => <TaskRow key={t.id} task={t} onChange={load} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
