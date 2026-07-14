'use client'

import { useState } from 'react'
import { Check, Loader2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export interface FieldTask {
  id: string
  project_id: string
  project_name?: string
  title: string
  description?: string | null
  status: string
  priority?: string | null
  due_date?: string | null
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

function dueLabel(due?: string | null) {
  if (!due) return null
  const d = new Date(due + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { text: `${-diff}d overdue`, overdue: true }
  if (diff === 0) return { text: 'Today', overdue: false }
  if (diff === 1) return { text: 'Tomorrow', overdue: false }
  return { text: d.toLocaleDateString([], { month: 'short', day: 'numeric' }), overdue: false }
}

// A single task with a big check-off target. Optimistically hides on complete.
export function TaskRow({ task, onChange }: { task: FieldTask; onChange: () => void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(task.status === 'completed')
  const due = dueLabel(task.due_date)

  async function toggle() {
    setBusy(true)
    const next = done ? 'open' : 'completed'
    try {
      const res = await fetch(`/api/projects/${task.project_id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ status: next }),
      })
      if (res.ok) { setDone(!done); onChange() }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex items-start gap-3 rounded-2xl border border-line bg-panel p-4', done && 'opacity-60')}>
      <button
        onClick={toggle}
        disabled={busy}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90',
          done ? 'border-success bg-success text-white' : 'border-line text-transparent',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-fg" /> : <Check className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('font-medium text-ink', done && 'line-through')}>{task.title}</p>
        {task.description && <p className="mt-0.5 text-sm text-muted-fg line-clamp-2">{task.description}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-fg">
          {task.project_name && (
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{task.project_name}</span>
          )}
          {due && <span className={cn(due.overdue && 'font-semibold text-danger')}>{due.text}</span>}
          {task.priority === 'high' && <span className="font-semibold text-warn">High priority</span>}
        </div>
      </div>
    </div>
  )
}
