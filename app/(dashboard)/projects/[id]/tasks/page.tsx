'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  Plus, X, CheckSquare, Circle, Clock, AlertCircle, Trash2,
  Building2, UserCircle2, Receipt, LayoutGrid, List, Users, Pencil,
  ChevronDown, MessageSquare, Loader2, ImagePlus, CalendarClock, FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// ─── constants ───────────────────────────────────────────────────────────────

const PRIORITIES = [
  { value: 'low',    label: 'Low',    dot: 'bg-faint',  bg: 'bg-muted text-muted-fg border-line' },
  { value: 'medium', label: 'Medium', dot: 'bg-warn-solid',  bg: 'bg-warn-tint text-warn border-warn/30' },
  { value: 'high',   label: 'High',   dot: 'bg-danger-solid',    bg: 'bg-danger-tint text-danger border-danger/30' },
]

const STATUSES = [
  { value: 'open',        label: 'Open',        icon: Circle,       color: 'text-faint',  colBg: 'bg-surface',   colBorder: 'border-line', headerBg: 'bg-muted',  headerText: 'text-muted-fg'  },
  { value: 'in_progress', label: 'In Progress', icon: Clock,        color: 'text-info',   colBg: 'bg-info-tint/40', colBorder: 'border-info/30',  headerBg: 'bg-info-tint',   headerText: 'text-info'   },
  { value: 'completed',   label: 'Completed',   icon: CheckSquare,  color: 'text-success',  colBg: 'bg-success-tint/40',colBorder: 'border-success/30', headerBg: 'bg-success-tint',  headerText: 'text-success'  },
]

type ViewMode = 'board' | 'list' | 'assignee'
type FilterMode = 'all' | 'open' | 'in_progress' | 'completed' | 'overdue'

// ─── interfaces ──────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description: string | null; due_date: string | null
  priority: string; status: string; assigned_to_member_id: string | null
  assigned_to_company_id: string | null; assigned_to_name: string | null
  created_by: string; completed_at: string | null; created_at: string
  image_url: string | null; follow_up_date: string | null; follow_up_note: string | null
  budget_line_item_id: string | null
}
interface Member { id: string; name: string; role: string }
interface Sub { id: string; scope: string; trade: string | null; companies: { id: string; name: string } | null }

interface TaskNote {
  id: string
  task_id: string
  content: string
  author_name: string
  created_at: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function isOverdue(task: Task) {
  return task.status !== 'completed' && task.due_date && new Date(task.due_date + 'T00:00:00') < new Date()
}

function dueSoon(task: Task) {
  if (!task.due_date || task.status === 'completed') return false
  const d = new Date(task.due_date + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  return diff >= 0 && diff <= 1
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

function nextStatus(current: string) {
  const idx = STATUSES.findIndex(s => s.value === current)
  return STATUSES[(idx + 1) % STATUSES.length].value
}

function timeAgo(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ─── small components ─────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find(x => x.value === priority) ?? PRIORITIES[1]
  return (
    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', p.bg)}>
      {p.label}
    </span>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const p = PRIORITIES.find(x => x.value === priority) ?? PRIORITIES[1]
  return <span title={p.label} className={cn('inline-block w-2 h-2 rounded-full shrink-0', p.dot)} />
}

function StatusIcon({ status }: { status: string }) {
  const s = STATUSES.find(x => x.value === status) ?? STATUSES[0]
  const Icon = s.icon
  return <Icon className={cn('h-4 w-4', s.color)} />
}

function DueChip({ due, task }: { due: string; task: Task }) {
  const overdue = isOverdue(task)
  const soon = dueSoon(task)
  return (
    <span className={cn(
      'text-xs font-medium',
      overdue ? 'text-danger' : soon ? 'text-warn' : 'text-faint'
    )}>
      {formatDue(due)}
    </span>
  )
}

function GroupProgressBar({ tasks }: { tasks: Task[] }) {
  const done = tasks.filter(t => t.status === 'completed').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-success font-medium">{done}/{tasks.length} done</span>
      <div className="w-16 h-1 rounded-full bg-muted2 overflow-hidden">
        <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ─── TaskDetailPanel ──────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  task: Task
  notes: TaskNote[]
  notesLoading: boolean
  currentUser: string
  onAddNote: (taskId: string, content: string) => Promise<void>
}

function TaskDetailPanel({ task, notes, notesLoading, onAddNote }: TaskDetailPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const statusObj = STATUSES.find(s => s.value === task.status) ?? STATUSES[0]

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim() || submitting) return
    setSubmitting(true)
    await onAddNote(task.id, noteText.trim())
    setNoteText('')
    setSubmitting(false)
  }

  return (
    <div className="border-t border-line-soft bg-surface/60 rounded-b-xl px-4 py-4">
      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Left: task details ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">
          <h2 className="text-base font-semibold text-ink leading-snug">{task.title}</h2>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
              statusObj.headerBg, statusObj.headerText, statusObj.colBorder,
            )}>
              <statusObj.icon className="h-3 w-3" />
              {statusObj.label}
            </span>
            <PriorityBadge priority={task.priority} />
          </div>

          {task.assigned_to_name && (
            <div className="flex items-center gap-1.5 text-sm text-muted-fg">
              {task.assigned_to_company_id
                ? <Building2 className="h-4 w-4 text-faint shrink-0" />
                : <UserCircle2 className="h-4 w-4 text-faint shrink-0" />}
              <span>{task.assigned_to_name}</span>
            </div>
          )}

          {task.due_date && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-faint shrink-0" />
              <DueChip due={task.due_date} task={task} />
            </div>
          )}

          {task.follow_up_date && (
            <div className="flex items-center gap-1.5 text-sm text-info">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>Follow up {new Date(task.follow_up_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          )}

          {task.description && (
            <p className="text-sm text-muted-fg leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}

          {task.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={task.image_url} target="_blank" rel="noreferrer">
              <img src={task.image_url} alt="Task" className="rounded-lg border border-line max-h-56 object-cover" />
            </a>
          )}

          <div className="text-xs text-faint">
            Created {new Date(task.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* ── Right: notes feed ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-faint" />
            <span className="text-sm font-semibold text-ink-soft">Notes &amp; Updates</span>
          </div>

          <div className="flex-1 space-y-2 max-h-48 overflow-y-auto">
            {notesLoading ? (
              <div className="flex items-center gap-2 py-4 text-faint text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading updates…
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-faint py-2 italic">No updates yet — add the first one</p>
            ) : (
              notes.map(note => (
                <div key={note.id} className="bg-panel rounded-lg border border-line-soft px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-ink-soft">{note.author_name}</span>
                    <span className="text-xs text-faint shrink-0">{timeAgo(note.created_at)}</span>
                  </div>
                  <p className="text-sm text-muted-fg leading-relaxed">{note.content}</p>
                </div>
              ))
            )}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <textarea
              rows={2}
              placeholder="Add an update…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="w-full rounded-md border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none bg-panel"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!noteText.trim() || submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-accent-ink rounded-lg hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add Update
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function TasksPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [tasks, setTasks]     = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [subs, setSubs]       = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)

  // view / filter
  const [viewMode, setViewMode]     = useState<ViewMode>('board')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

  // expand panel
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [notesCache, setNotesCache] = useState<Record<string, TaskNote[]>>({})
  const [notesLoading, setNotesLoading] = useState<Record<string, boolean>>({})

  // current user
  const [currentUser, setCurrentUser] = useState('')
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user?.email ?? '')
    })
  }, [])

  // add/edit form
  const [showAdd, setShowAdd]   = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [title, setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [priority, setPriority] = useState('medium')
  const [assigneeType, setAssigneeType] = useState<'member' | 'sub'>('member')
  const [assignedMemberId, setAssignedMemberId] = useState('')
  const [assignedSubId, setAssignedSubId]       = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const [taskImage, setTaskImage] = useState<File | null>(null)
  const [taskImagePreview, setTaskImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // invoice modal
  const [invoiceTask, setInvoiceTask]       = useState<Task | null>(null)
  const [invoiceAmount, setInvoiceAmount]   = useState('')
  const [invoiceDesc, setInvoiceDesc]       = useState('')
  const [invoiceDue, setInvoiceDue]         = useState('')
  const [creatingInvoice, setCreatingInvoice] = useState(false)

  // ── auth / load ────────────────────────────────────────────────────────────

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

  // ── expand / notes ─────────────────────────────────────────────────────────

  async function loadNotes(taskId: string) {
    if (notesCache[taskId] !== undefined) return // already loaded
    setNotesLoading(prev => ({ ...prev, [taskId]: true }))
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/tasks/${taskId}/notes`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setNotesCache(prev => ({ ...prev, [taskId]: data.notes ?? [] }))
    } else {
      setNotesCache(prev => ({ ...prev, [taskId]: [] }))
    }
    setNotesLoading(prev => ({ ...prev, [taskId]: false }))
  }

  function toggleExpand(taskId: string) {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null)
    } else {
      setExpandedTaskId(taskId)
      loadNotes(taskId)
    }
  }

  async function handleAddNote(taskId: string, content: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/tasks/${taskId}/notes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const data = await res.json()
      setNotesCache(prev => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? []), data.note],
      }))
    }
  }

  // ── form helpers ───────────────────────────────────────────────────────────

  function resetForm() {
    setTitle(''); setDescription(''); setDueDate(''); setPriority('medium')
    setAssigneeType('member'); setAssignedMemberId(''); setAssignedSubId('')
    setFollowUpDate(''); setTaskImage(null); setTaskImagePreview(null)
    setSaveError(null)
    setEditTask(null)
  }

  function openAddForm(defaultStatus?: string) {
    resetForm()
    if (defaultStatus) {
      // we'll pass it via a transient state — handled below via addDefaultStatus
    }
    setShowAdd(true)
  }

  function openEditForm(task: Task) {
    setEditTask(task)
    setTitle(task.title)
    setDescription(task.description ?? '')
    setDueDate(task.due_date ?? '')
    setPriority(task.priority)
    setFollowUpDate(task.follow_up_date ?? '')
    setTaskImage(null)
    setTaskImagePreview(task.image_url ?? null)
    if (task.assigned_to_member_id) {
      setAssigneeType('member')
      setAssignedMemberId(task.assigned_to_member_id)
      setAssignedSubId('')
    } else if (task.assigned_to_company_id) {
      setAssigneeType('sub')
      const s = subs.find(s => s.companies?.id === task.assigned_to_company_id)
      setAssignedSubId(s?.id ?? '')
      setAssignedMemberId('')
    } else {
      setAssigneeType('member')
      setAssignedMemberId('')
      setAssignedSubId('')
    }
    setShowAdd(true)
  }

  // ── API actions ────────────────────────────────────────────────────────────

  async function submitTask(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    try {
      const token = await getToken()

      let assigned_to_member_id: string | null = null
      let assigned_to_company_id: string | null = null
      let assigned_to_name: string | null = null

      if (assigneeType === 'member' && assignedMemberId) {
        const m = members.find(m => m.id === assignedMemberId)
        assigned_to_member_id = assignedMemberId
        assigned_to_name = m?.name ?? null
      } else if (assigneeType === 'sub' && assignedSubId) {
        const s = subs.find(s => s.id === assignedSubId)
        assigned_to_company_id = s?.companies?.id ?? null
        assigned_to_name = s?.companies?.name ?? null
      }

      // Upload a newly-selected image to storage; keep existing url otherwise
      let image_url: string | null = editTask?.image_url ?? null
      if (taskImage) {
        const path = `${params.id}/tasks/${Date.now()}-${taskImage.name.replace(/[^\w.-]/g, '_')}`
        const { error: upErr } = await supabase.storage.from('daily-log-photos').upload(path, taskImage)
        if (upErr) { setSaveError(`Image upload failed: ${upErr.message}`); setSaving(false); return }
        const { data: signed } = await supabase.storage.from('daily-log-photos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
        if (signed?.signedUrl) image_url = signed.signedUrl
      } else if (taskImagePreview === null) {
        image_url = null // image was removed
      }

      const body = JSON.stringify({
        title, description, due_date: dueDate || null, priority,
        assigned_to_member_id, assigned_to_company_id, assigned_to_name,
        image_url, follow_up_date: followUpDate || null,
      })

      const url = editTask
        ? `/api/projects/${params.id}/tasks/${editTask.id}`
        : `/api/projects/${params.id}/tasks`
      const res = await fetch(url, {
        method: editTask ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setSaveError(j.error || `Save failed (${res.status}). The task database migration (012) may not be applied yet.`)
        return
      }
      setShowAdd(false); resetForm(); load()
    } catch (err: any) {
      setSaveError(err?.message ? `Save failed: ${err.message}` : 'Save failed — check your connection and try again.')
    } finally {
      setSaving(false)
    }
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
    if (expandedTaskId === taskId) setExpandedTaskId(null)
  }

  function openInvoiceModal(task: Task) {
    setInvoiceTask(task)
    setInvoiceDesc(`Completed: ${task.title}`)
    setInvoiceAmount('')
    setInvoiceDue('')
  }

  async function createInvoiceFromTask(e: React.FormEvent) {
    e.preventDefault()
    if (!invoiceTask) return
    setCreatingInvoice(true)
    const token = await getToken()
    const sub = subs.find(s => s.companies?.id === invoiceTask.assigned_to_company_id)
    await fetch(`/api/projects/${params.id}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subcontract_id: sub?.id ?? null,
        company_id: invoiceTask.assigned_to_company_id,
        company_name: invoiceTask.assigned_to_name,
        amount: parseFloat(invoiceAmount),
        description: invoiceDesc,
        due_date: invoiceDue || null,
      }),
    })
    setInvoiceTask(null); setCreatingInvoice(false)
  }

  // ── derived data ───────────────────────────────────────────────────────────

  const visibleTasks = tasks.filter(t => !t.description?.startsWith('Category:'))

  const overdueCount = visibleTasks.filter(t => isOverdue(t)).length

  const filteredTasks = visibleTasks.filter(t => {
    if (filterMode === 'all') return true
    if (filterMode === 'overdue') return isOverdue(t)
    return t.status === filterMode
  })

  const totalCount     = visibleTasks.length
  const openCount      = visibleTasks.filter(t => t.status === 'open').length
  const inProgCount    = visibleTasks.filter(t => t.status === 'in_progress').length
  const completedCount = visibleTasks.filter(t => t.status === 'completed').length
  const pctDone        = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  const generalTasks = filteredTasks.filter(t => !t.assigned_to_company_id)
  const subTasks     = filteredTasks.filter(t => t.assigned_to_company_id)

  const subGroups: Record<string, { name: string; tasks: Task[] }> = {}
  for (const t of subTasks) {
    const key = t.assigned_to_company_id!
    if (!subGroups[key]) subGroups[key] = { name: t.assigned_to_name ?? 'Unknown', tasks: [] }
    subGroups[key].tasks.push(t)
  }

  // ── sub-components ─────────────────────────────────────────────────────────

  function BoardCard({ task }: { task: Task }) {
    const expanded = expandedTaskId === task.id
    return (
      <div
        className={cn(
          'group relative bg-panel rounded-lg border flex flex-col transition-all cursor-pointer',
          isOverdue(task) ? 'border-danger/30 bg-danger-tint/30' : 'border-line hover:border-muted2 hover:shadow-sm',
          expanded && 'ring-2 ring-accent/40',
        )}
        onClick={() => toggleExpand(task.id)}
      >
        <div className="p-3 flex flex-col gap-2">
          {/* title row */}
          <div className="flex items-start gap-1.5">
            <PriorityDot priority={task.priority} />
            <span className={cn('text-sm font-medium text-ink leading-snug flex-1', task.status === 'completed' && 'line-through text-faint')}>
              {task.title}
            </span>
            <ChevronDown className={cn('h-3.5 w-3.5 text-faint shrink-0 transition-transform', expanded && 'rotate-180')} />
          </div>

          {/* meta */}
          <div className="flex items-center gap-2 flex-wrap">
            {task.assigned_to_name && (
              <span className="flex items-center gap-1 text-xs text-muted-fg">
                {task.assigned_to_company_id
                  ? <Building2 className="h-3 w-3 text-faint" />
                  : <UserCircle2 className="h-3 w-3 text-faint" />}
                <span className="truncate max-w-[90px]">{task.assigned_to_name}</span>
              </span>
            )}
            {task.due_date && <DueChip due={task.due_date} task={task} />}
            {task.follow_up_date && (
              <span className="flex items-center gap-1 text-xs text-info" title={`Follow up ${task.follow_up_date}`}>
                <CalendarClock className="h-3 w-3" />
              </span>
            )}
            {task.image_url && <ImagePlus className="h-3 w-3 text-faint" />}
          </div>

          {/* hover actions */}
          <div className="absolute top-2 right-7 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              title={`Move to ${STATUSES.find(s => s.value === nextStatus(task.status))?.label}`}
              onClick={e => { e.stopPropagation(); updateStatus(task.id, nextStatus(task.status)) }}
              className="p-1 rounded text-faint hover:text-info hover:bg-info-tint transition-colors"
            >
              <StatusIcon status={task.status} />
            </button>
            <button
              onClick={e => { e.stopPropagation(); openEditForm(task) }}
              className="p-1 rounded text-faint hover:text-accent-fg hover:bg-accent-tint transition-colors">
              <Pencil className="h-3 w-3" />
            </button>
            {task.status === 'completed' && task.assigned_to_company_id && (
              <button
                onClick={e => { e.stopPropagation(); openInvoiceModal(task) }}
                className="p-1 rounded text-faint hover:text-accent-fg hover:bg-accent-tint transition-colors"
                title="Create invoice">
                <Receipt className="h-3 w-3" />
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
              className="p-1 rounded text-faint hover:text-danger hover:bg-danger-tint transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  function ListCard({ task }: { task: Task }) {
    const expanded = expandedTaskId === task.id
    return (
      <div className={cn(
        'bg-panel rounded-xl border transition-all',
        isOverdue(task) ? 'border-danger/30 bg-danger-tint/30' : 'border-line hover:border-muted2',
        expanded && 'ring-2 ring-accent/40',
      )}>
        <div
          className="group px-4 py-3 flex items-start gap-3 cursor-pointer"
          onClick={() => toggleExpand(task.id)}
        >
          <button
            title={`Move to ${STATUSES.find(s => s.value === nextStatus(task.status))?.label}`}
            onClick={e => { e.stopPropagation(); updateStatus(task.id, nextStatus(task.status)) }}
            className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
          >
            <StatusIcon status={task.status} />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('font-semibold text-ink', task.status === 'completed' && 'line-through text-faint')}>
                {task.title}
              </span>
              <PriorityBadge priority={task.priority} />
              {task.budget_line_item_id && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full bg-accent-tint text-accent-fg px-1.5 py-0.5" title="Created from a Quote progress line">
                  <FileText className="h-2.5 w-2.5" /> Quote line
                </span>
              )}
              {isOverdue(task) && (
                <span className="flex items-center gap-1 text-xs font-medium text-danger">
                  <AlertCircle className="h-3 w-3" /> Overdue
                </span>
              )}
            </div>
            {task.description && (
              <p className="text-sm text-muted-fg mt-0.5 truncate">{task.description}</p>
            )}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {task.assigned_to_name && (
                <span className="flex items-center gap-1.5 text-xs text-muted-fg">
                  {task.assigned_to_company_id ? <Building2 className="h-3 w-3 text-faint" /> : <UserCircle2 className="h-3 w-3 text-faint" />}
                  {task.assigned_to_name}
                </span>
              )}
              {task.due_date && <DueChip due={task.due_date} task={task} />}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {task.status === 'completed' && task.assigned_to_company_id && (
              <button
                onClick={e => { e.stopPropagation(); openInvoiceModal(task) }}
                className="flex items-center gap-1 px-2 py-1 text-xs text-accent-fg border border-accent/40 rounded-md hover:bg-accent-tint transition-colors font-medium">
                <Receipt className="h-3 w-3" /> Invoice
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); openEditForm(task) }}
              className="p-1.5 text-faint hover:text-accent-fg rounded transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <SearchableSelect
              value={task.status}
              onClick={e => e.stopPropagation()}
              onChange={e => updateStatus(task.id, e.target.value)}
              className="text-xs border border-line rounded-md px-2 py-1 text-muted-fg bg-panel focus:outline-none focus:border-accent">
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </SearchableSelect>
            <button
              onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
              className="p-1.5 text-faint hover:text-danger rounded transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <ChevronDown className={cn('h-4 w-4 text-faint transition-transform', expanded && 'rotate-180')} />
          </div>
        </div>

        {expanded && (
          <TaskDetailPanel
            task={task}
            notes={notesCache[task.id] ?? []}
            notesLoading={!!notesLoading[task.id]}
            currentUser={currentUser}
            onAddNote={handleAddNote}
          />
        )}
      </div>
    )
  }

  // ── board view ─────────────────────────────────────────────────────────────

  function BoardView() {
    const expandedTask = expandedTaskId ? tasks.find(t => t.id === expandedTaskId) : null

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {STATUSES.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.value)
            return (
              <div key={col.value} className={cn('rounded-xl border flex flex-col overflow-hidden', col.colBorder)}>
                {/* column header */}
                <div className={cn('flex items-center justify-between px-3 py-2.5', col.headerBg)}>
                  <div className="flex items-center gap-2">
                    <col.icon className={cn('h-4 w-4', col.color)} />
                    <span className={cn('text-sm font-semibold', col.headerText)}>{col.label}</span>
                    <span className={cn('text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center', col.headerBg, col.headerText, 'border', col.colBorder)}>
                      {colTasks.length}
                    </span>
                  </div>
                  <button
                    onClick={() => openAddForm(col.value)}
                    title={`Add ${col.label} task`}
                    className={cn('p-1 rounded hover:bg-black/5 transition-colors', col.headerText)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* cards */}
                <div className={cn('flex-1 p-2 space-y-2 min-h-[120px]', col.colBg)}>
                  {colTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-1">
                      <p className="text-xs text-faint">No tasks</p>
                      <button
                        onClick={() => openAddForm(col.value)}
                        className="text-xs text-faint hover:text-accent-fg transition-colors flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> Add one
                      </button>
                    </div>
                  ) : (
                    colTasks.map(task => <BoardCard key={task.id} task={task} />)
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Board expanded panel — drawer below the board */}
        {expandedTask && (
          <div className="rounded-xl border border-accent/40 bg-panel shadow-md overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-accent-tint border-b border-accent/20">
              <span className="text-sm font-semibold text-accent-fg">Task Detail</span>
              <button
                onClick={() => setExpandedTaskId(null)}
                className="text-accent-fg hover:text-accent-fg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <TaskDetailPanel
              task={expandedTask}
              notes={notesCache[expandedTask.id] ?? []}
              notesLoading={!!notesLoading[expandedTask.id]}
              currentUser={currentUser}
              onAddNote={handleAddNote}
            />
          </div>
        )}
      </div>
    )
  }

  // ── list view ──────────────────────────────────────────────────────────────

  function ListView() {
    return (
      <div className="space-y-6">
        {generalTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-1">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">General Tasks</p>
              <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{generalTasks.length}</span>
              <GroupProgressBar tasks={generalTasks} />
            </div>
            {generalTasks.map(task => <ListCard key={task.id} task={task} />)}
          </div>
        )}
        {Object.entries(subGroups).map(([companyId, group]) => (
          <div key={companyId} className="space-y-2">
            <div className="flex items-center gap-2 px-1 flex-wrap">
              <Building2 className="h-3.5 w-3.5 text-faint" />
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{group.name}</p>
              <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{group.tasks.length}</span>
              <GroupProgressBar tasks={group.tasks} />
            </div>
            {group.tasks.map(task => <ListCard key={task.id} task={task} />)}
          </div>
        ))}
        {filteredTasks.length === 0 && <EmptyState />}
      </div>
    )
  }

  // ── assignee view ──────────────────────────────────────────────────────────

  function AssigneeView() {
    // Group ALL filtered tasks by assignee name (or "Unassigned")
    const groups: Record<string, { name: string; tasks: Task[]; isCompany: boolean }> = {}

    for (const t of filteredTasks) {
      const key = t.assigned_to_name ?? '__unassigned__'
      if (!groups[key]) groups[key] = {
        name: t.assigned_to_name ?? 'Unassigned',
        tasks: [],
        isCompany: !!t.assigned_to_company_id,
      }
      groups[key].tasks.push(t)
    }

    return (
      <div className="space-y-6">
        {Object.entries(groups).length === 0 && <EmptyState />}
        {Object.entries(groups).map(([key, group]) => (
          <div key={key} className="space-y-2">
            <div className="flex items-center gap-2 px-1 flex-wrap">
              {group.isCompany
                ? <Building2 className="h-3.5 w-3.5 text-faint" />
                : <UserCircle2 className="h-3.5 w-3.5 text-faint" />}
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{group.name}</p>
              <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{group.tasks.length}</span>
              <GroupProgressBar tasks={group.tasks} />
            </div>
            {group.tasks.map(task => <ListCard key={task.id} task={task} />)}
          </div>
        ))}
      </div>
    )
  }

  // ── empty state ────────────────────────────────────────────────────────────

  function EmptyState() {
    return (
      <div className="rounded-xl border border-dashed border-line py-14 text-center">
        <CheckSquare className="h-9 w-9 text-faint mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-fg">
          {filterMode === 'all' ? 'No tasks yet' : `No ${filterMode.replace('_', ' ')} tasks`}
        </p>
        {filterMode === 'all' && (
          <button onClick={() => openAddForm()} className="mt-2 text-sm text-accent-fg hover:underline">
            Create your first task
          </button>
        )}
      </div>
    )
  }

  // ── form modal ─────────────────────────────────────────────────────────────

  const formTitle = editTask ? 'Edit Task' : 'New Task'
  const submitLabel = saving ? (editTask ? 'Saving…' : 'Creating…') : (editTask ? 'Save Changes' : 'Create Task')

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── New / Edit Task modal ──────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">{formTitle}</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Task <span className="text-danger">*</span></Label>
                  <Input id="title" placeholder="e.g. Inspect concrete pour on level 2" value={title} onChange={e => setTitle(e.target.value)} required autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Details <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea id="desc" rows={2} placeholder="Additional context…" value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        assigneeType === 'member' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:bg-surface')}>
                      <UserCircle2 className="h-3.5 w-3.5" /> GC Crew
                    </button>
                    <button type="button" onClick={() => setAssigneeType('sub')}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        assigneeType === 'sub' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:bg-surface')}>
                      <Building2 className="h-3.5 w-3.5" /> Subcontractor
                    </button>
                  </div>
                  {assigneeType === 'member' && (
                    members.length === 0
                      ? <p className="text-xs text-faint">No crew members on this project yet. Add them in the Team tab.</p>
                      : <Select value={assignedMemberId} onChange={e => setAssignedMemberId(e.target.value)}>
                          <option value="">Unassigned</option>
                          {members.map(m => <option key={m.id} value={m.id}>{m.name} — {m.role}</option>)}
                        </Select>
                  )}
                  {assigneeType === 'sub' && (
                    subs.length === 0
                      ? <p className="text-xs text-faint">No awarded subcontractors yet. Award bids first.</p>
                      : <Select value={assignedSubId} onChange={e => setAssignedSubId(e.target.value)}>
                          <option value="">Unassigned</option>
                          {subs.map(s => <option key={s.id} value={s.id}>{s.companies?.name} — {s.scope}</option>)}
                        </Select>
                  )}
                </div>

                {/* Follow-up (optional scheduled reminder) */}
                <div className="space-y-1.5">
                  <Label htmlFor="followup">Follow-up date <span className="text-faint font-normal">(optional)</span></Label>
                  <Input id="followup" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                  <p className="text-xs text-faint">Set a date to revisit this task — leave blank for none.</p>
                </div>

                {/* Image attachment */}
                <div className="space-y-1.5">
                  <Label>Photo <span className="text-faint font-normal">(optional)</span></Label>
                  {taskImagePreview ? (
                    <div className="relative inline-block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={taskImagePreview} alt="Task" className="h-28 w-28 object-cover rounded-lg border border-line" />
                      <button type="button" onClick={() => { setTaskImage(null); setTaskImagePreview(null) }}
                        className="absolute -top-2 -right-2 bg-danger-solid text-white rounded-full p-1 shadow">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-muted2 px-3 py-2.5 text-sm text-muted-fg hover:bg-surface w-fit">
                      <ImagePlus className="h-4 w-4" /> Add photo
                      <input type="file" accept="image/*" className="sr-only"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) { setTaskImage(f); setTaskImagePreview(URL.createObjectURL(f)) }
                        }} />
                    </label>
                  )}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft space-y-2">
                {saveError && <p className="text-sm text-danger">{saveError}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); resetForm() }}>Cancel</Button>
                  <Button type="submit" disabled={saving || !title.trim()}>{submitLabel}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Invoice modal ───────────────────────────────────────────── */}
      {invoiceTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">Create Invoice</h2>
                <p className="text-xs text-muted-fg mt-0.5">For {invoiceTask.assigned_to_name} · {invoiceTask.title}</p>
              </div>
              <button onClick={() => setInvoiceTask(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createInvoiceFromTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Amount <span className="text-danger">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                    <Input type="number" step="0.01" min="0" required value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} className="pl-7" placeholder="0.00" autoFocus />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input value={invoiceDesc} onChange={e => setInvoiceDesc(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Due Date <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="date" value={invoiceDue} onChange={e => setInvoiceDue(e.target.value)} />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setInvoiceTask(null)}>Cancel</Button>
                <Button type="submit" disabled={creatingInvoice || !invoiceAmount}>{creatingInvoice ? 'Creating…' : 'Create Invoice'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Tasks</h1>
          <p className="text-sm text-muted-fg mt-0.5">Assign and track work across your crew and subcontractors.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* view toggle */}
          <div className="flex items-center gap-0.5 p-1 bg-muted rounded-lg">
            <button
              title="Board view"
              onClick={() => setViewMode('board')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'board' ? 'bg-panel shadow-sm text-ink-soft' : 'text-faint hover:text-muted-fg')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              title="List view"
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'list' ? 'bg-panel shadow-sm text-ink-soft' : 'text-faint hover:text-muted-fg')}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              title="By Assignee view"
              onClick={() => setViewMode('assignee')}
              className={cn('p-1.5 rounded-md transition-colors', viewMode === 'assignee' ? 'bg-panel shadow-sm text-ink-soft' : 'text-faint hover:text-muted-fg')}
            >
              <Users className="h-4 w-4" />
            </button>
          </div>
          <Button onClick={() => openAddForm()}><Plus className="h-4 w-4" />New Task</Button>
        </div>
      </div>

      {/* ── Filter pills ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
        {([
          { key: 'all',         label: 'All' },
          { key: 'open',        label: 'Open' },
          { key: 'in_progress', label: 'In Progress' },
          { key: 'completed',   label: 'Completed' },
          { key: 'overdue',     label: 'Overdue', count: overdueCount },
        ] as { key: FilterMode; label: string; count?: number }[]).map(f => (
          <button
            key={f.key}
            onClick={() => setFilterMode(f.key)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border whitespace-nowrap transition-all shrink-0',
              filterMode === f.key
                ? f.key === 'overdue'
                  ? 'bg-danger-solid border-danger text-white'
                  : 'bg-accent border-accent text-accent-ink'
                : 'bg-panel border-line text-muted-fg hover:border-muted2 hover:bg-surface',
            )}
          >
            {f.label}
            {f.count !== undefined && f.count > 0 && (
              <span className={cn(
                'text-xs font-bold rounded-full px-1.5 py-0.5 leading-none',
                filterMode === f.key ? 'bg-panel/20 text-white' : 'bg-danger-tint text-danger',
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Stat chips ────────────────────────────────────────────────────── */}
      {!loading && totalCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs bg-muted text-muted-fg rounded-full px-2.5 py-1 font-medium border border-line">
            {totalCount} total
          </span>
          <span className="text-xs bg-surface text-muted-fg rounded-full px-2.5 py-1 font-medium border border-line">
            {openCount} open
          </span>
          <span className="text-xs bg-info-tint text-info rounded-full px-2.5 py-1 font-medium border border-info/30">
            {inProgCount} in progress
          </span>
          {overdueCount > 0 && (
            <span className="text-xs bg-danger-tint text-danger rounded-full px-2.5 py-1 font-medium border border-danger/30">
              {overdueCount} overdue
            </span>
          )}
          <span className="text-xs bg-success-tint text-success rounded-full px-2.5 py-1 font-medium border border-success/30">
            {completedCount} completed · {pctDone}%
          </span>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading…</div>
      ) : totalCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          {viewMode === 'board'    && <BoardView />}
          {viewMode === 'list'     && <ListView />}
          {viewMode === 'assignee' && <AssigneeView />}
        </>
      )}
    </div>
  )
}
