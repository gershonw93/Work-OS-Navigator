'use client'

import { useEffect, useState } from 'react'
import { Plus, X, CheckSquare, Circle, Clock, AlertCircle, ChevronDown, Trash2, Building2, UserCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const PRIORITIES = [
  { value: 'low',    label: 'Low',    color: 'text-slate-400',  bg: 'bg-slate-100 text-slate-600 border-slate-200' },
  { value: 'medium', label: 'Medium', color: 'text-amber-500',  bg: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'high',   label: 'High',   color: 'text-red-500',    bg: 'bg-red-50 text-red-700 border-red-200' },
]

const STATUSES = [
  { value: 'open',        label: 'Open',        icon: Circle,       color: 'text-slate-400' },
  { value: 'in_progress', label: 'In Progress', icon: Clock,        color: 'text-blue-500'  },
  { value: 'completed',   label: 'Completed',   icon: CheckSquare,  color: 'text-green-500' },
]

interface Task {
  id: string
  title: string
  description: string | null
  due_date: string | null
  priority: string
  status: string
  assigned_to_member_id: string | null
  assigned_to_company_id: string | null
  assigned_to_name: string | null
  created_by: string
  completed_at: string | null
  created_at: string
}

interface Member { id: string; name: string; role: string }
interface Sub { id: string; scope: string; trade: string | null; companies: { id: string; name: string } | null }

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find(p => p.value === priority) ?? PRIORITIES[1]
  return <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', p.bg)}>{p.label}</span>
}

function StatusIcon({ status }: { status: string }) {
  const s = STATUSES.find(s => s.value === status) ?? STATUSES[0]
  const Icon = s.icon
  return <Icon className={cn('h-4 w-4', s.color)} />
}

function isOverdue(task: Task) {
  return task.status !== 'completed' && task.due_date && new Date(task.due_date + 'T00:00:00') < new Date()
}

function formatDue(due: string) {
  const d = new Date(due + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return `${Math.abs(diff)}d overdue`
  if (diff === 0) return 'Due today'
  if (diff === 1) return 'Due tomorrow'
  return `Due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export default function TasksPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('all')

  const [showAdd, setShowAdd] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [assigneeType, setAssigneeType] = useState<'member' | 'sub'>('member')
  const [assignedMemberId, setAssignedMemberId] = useState('')
  const [assignedSubId, setAssignedSubId] = useState('')
  const [saving, setSaving] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setTasks(data.tasks)
      setMembers(data.members)
      setSubs(data.subcontracts)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  function resetForm() {
    setTitle(''); setDescription(''); setDueDate(''); setPriority('medium')
    setAssigneeType('member'); setAssignedMemberId(''); setAssignedSubId('')
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const token = await getToken()

    let assigned_to_member_id = null
    let assigned_to_company_id = null
    let assigned_to_name = null

    if (assigneeType === 'member' && assignedMemberId) {
      const m = members.find(m => m.id === assignedMemberId)
      assigned_to_member_id = assignedMemberId
      assigned_to_name = m?.name ?? null
    } else if (assigneeType === 'sub' && assignedSubId) {
      const s = subs.find(s => s.id === assignedSubId)
      assigned_to_company_id = s?.companies?.id ?? null
      assigned_to_name = s?.companies?.name ?? null
    }

    await fetch(`/api/projects/${params.id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description, due_date: dueDate || null, priority, assigned_to_member_id, assigned_to_company_id, assigned_to_name }),
    })

    setShowAdd(false)
    resetForm()
    setSaving(false)
    load()
  }

  async function updateStatus(taskId: string, status: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
  }

  async function deleteTask(taskId: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  const filtered = tasks.filter(t => filter === 'all' || t.status === filter)
  const counts = {
    all: tasks.length,
    open: tasks.filter(t => t.status === 'open').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
  }

  return (
    <div className="space-y-6">

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">New Task</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createTask}>
              <div className="px-6 py-5 space-y-4">

                <div className="space-y-1.5">
                  <Label htmlFor="title">Task <span className="text-red-500">*</span></Label>
                  <Input id="title" placeholder="e.g. Inspect concrete pour on level 2" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="desc">Details <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea id="desc" rows={2} placeholder="Additional context..." value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="due">Due Date</Label>
                    <Input id="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="priority">Priority</Label>
                    <Select id="priority" value={priority} onChange={e => setPriority(e.target.value)}>
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Assign To</Label>
                  <div className="flex gap-2 mb-2">
                    <button type="button" onClick={() => setAssigneeType('member')}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        assigneeType === 'member' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                      <UserCircle2 className="h-3.5 w-3.5" /> GC Crew
                    </button>
                    <button type="button" onClick={() => setAssigneeType('sub')}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        assigneeType === 'sub' ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                      <Building2 className="h-3.5 w-3.5" /> Subcontractor
                    </button>
                  </div>

                  {assigneeType === 'member' && (
                    members.length === 0 ? (
                      <p className="text-xs text-slate-400">No crew members on this project yet. Add them in the Team tab.</p>
                    ) : (
                      <Select value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                      </Select>
                    )
                  )}

                  {assigneeType === 'sub' && (
                    subs.length === 0 ? (
                      <p className="text-xs text-slate-400">No awarded subcontractors yet. Award bids first.</p>
                    ) : (
                      <Select value={assignedSubId} onChange={e => setAssignedSubId(e.target.value)}>
                        <option value="">Unassigned</option>
                        {subs.map(s => <option key={s.id} value={s.id}>{s.companies?.name} — {s.scope}</option>)}
                      </Select>
                    )
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating...' : 'Create Task'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tasks</h1>
          <p className="text-sm text-slate-500 mt-0.5">Assign and track work across your crew and subcontractors.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />New Task</Button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['all', 'open', 'in_progress', 'completed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn('px-4 py-2 text-sm font-medium capitalize transition-colors',
              filter === f ? 'border-b-2 border-orange-500 text-orange-600' : 'text-slate-500 hover:text-slate-700')}>
            {f.replace('_', ' ')}
            <span className={cn('ml-1.5 text-xs px-1.5 py-0.5 rounded-full',
              filter === f ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500')}>
              {counts[f]}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-14 text-center">
          <CheckSquare className="h-9 w-9 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">{filter === 'all' ? 'No tasks yet' : `No ${filter.replace('_', ' ')} tasks`}</p>
          {filter === 'all' && <button onClick={() => setShowAdd(true)} className="mt-2 text-sm text-orange-500 hover:underline">Create your first task</button>}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => (
            <div key={task.id} className={cn('bg-white rounded-xl border px-5 py-4 flex items-start gap-4 group transition-colors',
              isOverdue(task) ? 'border-red-200 bg-red-50/30' : 'border-slate-200 hover:border-slate-300')}>

              {/* Status toggle */}
              <div className="mt-0.5 shrink-0">
                <div className="relative">
                  <button className="group/status" title="Change status">
                    <StatusIcon status={task.status} />
                  </button>
                  {/* Status quick-change dropdown */}
                  <div className="absolute left-0 top-6 z-10 hidden group-hover/status:block bg-white rounded-lg border border-slate-200 shadow-lg py-1 w-36">
                    {STATUSES.map(s => (
                      <button key={s.value} onClick={() => updateStatus(task.id, s.value)}
                        className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50',
                          task.status === s.value ? 'text-orange-600 font-medium' : 'text-slate-700')}>
                        <s.icon className={cn('h-3.5 w-3.5', s.color)} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2 flex-wrap">
                  <span className={cn('font-semibold text-slate-900', task.status === 'completed' && 'line-through text-slate-400')}>
                    {task.title}
                  </span>
                  <PriorityBadge priority={task.priority} />
                  {isOverdue(task) && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                      <AlertCircle className="h-3 w-3" /> Overdue
                    </span>
                  )}
                </div>

                {task.description && (
                  <p className="text-sm text-slate-500 mt-1">{task.description}</p>
                )}

                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {task.assigned_to_name && (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      {task.assigned_to_company_id
                        ? <Building2 className="h-3 w-3 text-slate-400" />
                        : <UserCircle2 className="h-3 w-3 text-slate-400" />}
                      {task.assigned_to_name}
                    </span>
                  )}
                  {task.due_date && (
                    <span className={cn('text-xs font-medium', isOverdue(task) ? 'text-red-500' : 'text-slate-400')}>
                      {formatDue(task.due_date)}
                    </span>
                  )}
                  <span className="text-xs text-slate-300">by {task.created_by}</span>
                </div>
              </div>

              {/* Status selector + delete */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <select
                  value={task.status}
                  onChange={e => updateStatus(task.id, e.target.value)}
                  className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-600 bg-white focus:outline-none focus:border-orange-400"
                >
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={() => deleteTask(task.id)} className="p-1.5 text-slate-300 hover:text-red-400 rounded transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
