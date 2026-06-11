'use client'

import { useEffect, useState } from 'react'
import { CheckSquare, Circle, Clock, Building2, UserCircle2, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface Task {
  id: string
  title: string
  status: string
  priority: string
  due_date: string | null
  assigned_to_name: string | null
  assigned_to_company_id: string | null
  assigned_to_member_id: string | null
}

function ProgressBar({ pct, color = 'bg-orange-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

function groupByAssignee(tasks: Task[]) {
  const map: Record<string, { name: string; isSub: boolean; tasks: Task[] }> = {}
  for (const t of tasks) {
    const key = t.assigned_to_name ?? '__unassigned__'
    if (!map[key]) map[key] = { name: t.assigned_to_name ?? 'Unassigned', isSub: !!t.assigned_to_company_id, tasks: [] }
    map[key].tasks.push(t)
  }
  return Object.values(map).sort((a, b) => b.tasks.length - a.tasks.length)
}

export default function ProgressPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch(`/api/projects/${params.id}/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks)
      }
      setLoading(false)
    }
    load()
  }, [params.id])

  const total = tasks.length
  const completed = tasks.filter(t => t.status === 'completed').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const open = tasks.filter(t => t.status === 'open').length
  const overdue = tasks.filter(t => t.status !== 'completed' && t.due_date && new Date(t.due_date + 'T00:00:00') < new Date()).length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)

  const groups = groupByAssignee(tasks)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Progress</h1>
        <p className="text-sm text-slate-500 mt-0.5">Automatically calculated from task completion.</p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <TrendingUp className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No tasks yet</p>
          <p className="text-xs text-slate-400 mt-1">Create tasks in the Tasks tab — progress updates automatically as they get completed.</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Overall */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 mb-3">
              <div>
                <p className="text-sm font-medium text-slate-500">Overall Progress</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">{pct}<span className="text-xl text-slate-400">%</span></p>
              </div>
              <p className="text-sm text-slate-400 mb-1">{completed} of {total} tasks complete</p>
            </div>
            <ProgressBar pct={pct} color={pct === 100 ? 'bg-green-500' : 'bg-orange-500'} />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
              {[
                { label: 'Completed', value: completed, color: 'text-green-600', bg: 'bg-green-50 border-green-100' },
                { label: 'In Progress', value: inProgress, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                { label: 'Open', value: open, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-100' },
                { label: 'Overdue', value: overdue, color: 'text-red-600', bg: overdue > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-lg border p-3 text-center', s.bg)}>
                  <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* By assignee */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-700">Progress by Person / Company</p>
            </div>
            <div className="divide-y divide-slate-50">
              {groups.map(group => {
                const done = group.tasks.filter(t => t.status === 'completed').length
                const gpct = Math.round((done / group.tasks.length) * 100)
                const hasOverdue = group.tasks.some(t => t.status !== 'completed' && t.due_date && new Date(t.due_date + 'T00:00:00') < new Date())
                return (
                  <div key={group.name} className="px-4 sm:px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                          group.isSub ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-600')}>
                          {group.isSub
                            ? <Building2 className="h-3.5 w-3.5" />
                            : group.name === 'Unassigned'
                              ? <Circle className="h-3.5 w-3.5 text-slate-400" />
                              : group.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-slate-800 break-words">{group.name}</span>
                          {hasOverdue && <span className="ml-2 text-xs text-red-500 font-medium">· has overdue</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className="text-sm font-bold text-slate-700">{gpct}%</span>
                        <span className="text-xs text-slate-400 ml-1.5">{done}/{group.tasks.length}</span>
                      </div>
                    </div>
                    <ProgressBar pct={gpct} color={gpct === 100 ? 'bg-green-500' : group.isSub ? 'bg-slate-500' : 'bg-orange-500'} />

                    {/* Task breakdown */}
                    <div className="mt-2.5 space-y-1">
                      {group.tasks.map(t => {
                        const isOver = t.status !== 'completed' && t.due_date && new Date(t.due_date + 'T00:00:00') < new Date()
                        return (
                          <div key={t.id} className="flex items-center gap-2 text-xs text-slate-500">
                            {t.status === 'completed'
                              ? <CheckSquare className="h-3 w-3 text-green-500 shrink-0" />
                              : t.status === 'in_progress'
                                ? <Clock className="h-3 w-3 text-blue-400 shrink-0" />
                                : <Circle className="h-3 w-3 text-slate-300 shrink-0" />}
                            <span className={cn('truncate', t.status === 'completed' && 'line-through text-slate-300', isOver && 'text-red-500')}>
                              {t.title}
                            </span>
                            {isOver && <span className="shrink-0 text-red-400">overdue</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
