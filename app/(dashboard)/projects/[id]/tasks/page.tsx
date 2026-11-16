'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StatStrip } from '@/components/ui/stat-strip'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import {
  Plus, X, CheckSquare, Circle, Clock, AlertCircle, Trash2,
  Building2, UserCircle2, Receipt, LayoutGrid, List, Users, Pencil,
  MessageSquare, Loader2, ImagePlus, CalendarClock, FileText, Check, ChevronDown, ListChecks, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { SignoffModal } from '@/components/ui/signoff-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useNotice } from '@/components/ui/notice'
import { cn } from '@/lib/utils'
import { fetchProblem } from '@/lib/fetch-error'
import { punchLines, MAX_PUNCH_LINES } from '@/lib/punch-lines'

import { formatDate, todayDateInput } from '@/lib/dates'
import { LabelChips, LabelPicker, SubtaskEditor, SubtaskList, MonthCalendar, type SubtaskPerson } from '@/components/tasks/task-extras-ui'
import {
  openTaskSubtasks, subtaskCount, taskCalendarEntries, taskIsOverdue, taskMatches,
  type TaskLabel, type TaskSubtask,
} from '@/lib/task-extras'
import { subtaskDue } from '@/lib/project-management'
import { dueLabel } from '@/lib/task-due'
import { timeAgo, absoluteTime } from '@/lib/time-ago'
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
import { useLandOnParam } from '@/lib/use-land-on'
import {
  assigneeLabel, assigneeName, normalizeAssignees, completedByLabel,
  type TaskAssignee,
} from '@/lib/task-assignees'
// ─── constants ───────────────────────────────────────────────────────────────

const PRIORITIES = [
  { value: 'low',    label: 'Low',    dot: 'bg-faint',  bg: 'bg-muted text-muted-fg border-line' },
  { value: 'medium', label: 'Medium', dot: 'bg-warn-solid',  bg: 'bg-warn-tint text-warn border-warn/30' },
  { value: 'high',   label: 'High',   dot: 'bg-danger-solid',    bg: 'bg-danger-tint text-danger border-danger/30' },
]

const STATUSES = [
  { value: 'open',        label: 'Open',        icon: Circle,       color: 'text-faint',  colBorder: 'border-line', headerBg: 'bg-muted',  headerText: 'text-muted-fg',
    lg: { col: 'lg:bg-surface', border: 'lg:border-line', headerBg: 'lg:bg-muted', headerText: 'lg:text-muted-fg' } },
  { value: 'in_progress', label: 'In Progress', icon: Clock,        color: 'text-info',   colBorder: 'border-info/30',  headerBg: 'bg-info-tint',   headerText: 'text-info',
    lg: { col: 'lg:bg-info-tint/40', border: 'lg:border-info/30', headerBg: 'lg:bg-info-tint', headerText: 'lg:text-info' } },
  { value: 'completed',   label: 'Completed',   icon: CheckSquare,  color: 'text-success',  colBorder: 'border-success/30', headerBg: 'bg-success-tint',  headerText: 'text-success',
    lg: { col: 'lg:bg-success-tint/40', border: 'lg:border-success/30', headerBg: 'lg:bg-success-tint', headerText: 'lg:text-success' } },
]
// `lg` is the DESKTOP look - the tinted columns the board always had. The
// phone gets none of it (see the board below); the desktop was not asked to
// change, so under `lg:` it does not.

// `list` is the Table view - the key is kept so a saved link still lands on it.
type ViewMode = 'board' | 'list' | 'assignee' | 'calendar'
type FilterMode = 'all' | 'open' | 'in_progress' | 'completed' | 'overdue' | 'punch'

// ─── interfaces ──────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description: string | null; due_date: string | null
  priority: string; status: string
  /** 'punch' for a punch-list item (migration 133), 'task' for everything else. */
  kind?: string | null
  /**
   * EVERYONE on this task. `project_task_assignees` is the home for that now;
   * the three `assigned_to_*` fields above are the old single-assignee shape,
   * backfilled into this list by migration 116 and no longer read here.
   */
  assignees?: TaskAssignee[]
  completed_by_name?: string | null
  created_by: string; completed_at: string | null; created_at: string
  image_url: string | null; follow_up_date: string | null; follow_up_note: string | null
  budget_line_item_id: string | null
  /** Migration 167. Shapes and rules: lib/task-extras.ts. */
  labels?: TaskLabel[] | null
  subtasks?: TaskSubtask[] | null
  signoff_requested_at?: string | null; signoff_requested_by?: string | null
  signoff_signed_at?: string | null; signoff_signed_by?: string | null; signoff_signature_url?: string | null
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
  // Late on its own date OR on a subtask's - one answer, lib/task-extras.ts.
  return taskIsOverdue(task, todayDateInput())
}

function dueSoon(task: Task) {
  if (!task.due_date || task.status === 'completed') return false
  const d = new Date(task.due_date + 'T00:00:00')
  const today = new Date(); today.setHours(0,0,0,0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  return diff >= 0 && diff <= 1
}

/**
 * Move a task, from the card, without the card being three buttons.
 *
 * WHAT WAS HERE. `StageButtons` - Open / In Progress / Completed, rendered on
 * every card. On a board of fifteen that is forty-five controls, forty of them
 * saying something the COLUMN already says, and they were most of what a card
 * looked like. The status is the column; a card needs a way to leave it, not a
 * readout of where it is.
 *
 * NOT DRAG. Drag was here once and was removed twice over: BoardCard is
 * declared inside the page component, so every render makes a new component
 * TYPE - the setState on drag start remounted the card, the browser lost the
 * node it was dragging and onDragEnd never fired. And HTML5 drag does not exist
 * on a touch screen, which is the screen this is used on.
 *
 * NOT CLICK-TO-ADVANCE either. That was the version before StageButtons: one
 * stray tap on a finished task quietly reopened it, no confirm and no undo.
 *
 * So: the status icon IS the button, and it opens a menu of the three. Same
 * arrangement as RowMenu - `absolute` inside a `relative` parent, which is why
 * it carries NO `data-overlay`: it travels with the page and must not freeze
 * it. Icon-only, so it says what it is.
 */
function StatusPicker({
  status, onPick, className, align = 'right',
}: {
  status: string
  onPick: (next: string) => void
  className?: string
  /**
   * Which edge the panel hangs from. The board puts this trigger at the RIGHT
   * of a card, so the menu hangs right and opens leftward into the card. The
   * LIST puts it at the far left of the row, where that same `right-0` walks
   * the menu off the left edge of the screen. The trigger's side decides it.
   */
  align?: 'left' | 'right'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = STATUSES.find(s => s.value === status) ?? STATUSES[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={cn('relative shrink-0', className)} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Status: ${current.label}. Move this task`}
        title={`${current.label} - tap to move`}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:bg-surface lg:h-7 lg:w-7"
      >
        <current.icon className={cn('h-4 w-4', current.color)} />
      </button>
      {open && (
        <div role="menu"
          className={cn(
            'absolute z-20 mt-1 min-w-[10rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-lg lg:rounded-lg',
            align === 'left' ? 'left-0' : 'right-0',
          )}>
          {STATUSES.map(st => {
            const isCurrent = st.value === status
            return (
              <button
                key={st.value}
                role="menuitem"
                type="button"
                onClick={e => { e.stopPropagation(); setOpen(false); if (!isCurrent) onPick(st.value) }}
                className={cn(
                  'flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-surface lg:min-h-0 lg:text-xs',
                  isCurrent ? 'text-ink' : 'text-muted-fg',
                )}
              >
                <st.icon className={cn('h-3.5 w-3.5 shrink-0', st.color)} />
                <span className="flex-1 whitespace-nowrap">{st.label}</span>
                {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-faint" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── small components ─────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITIES.find(x => x.value === priority) ?? PRIORITIES[1]
  return (
    <span className={cn('whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full border', p.bg)}>
      {p.label}
    </span>
  )
}

function PriorityDot({ priority }: { priority: string }) {
  const p = PRIORITIES.find(x => x.value === priority) ?? PRIORITIES[1]
  // 6px, and it is the only thing on a card that is not a word. Kept because
  // high-priority work is otherwise invisible until the task is opened.
  return <span title={p.label} className={cn('mt-1.5 inline-block w-1.5 h-1.5 rounded-full shrink-0', p.dot)} />
}

function DueChip({ task }: { task: Task }) {
  const label = dueLabel(task)
  if (!label) return null
  const overdue = isOverdue(task)
  const soon = dueSoon(task)
  return (
    <span className={cn(
      'text-xs font-medium',
      overdue ? 'text-danger' : soon ? 'text-warn' : 'text-faint'
    )}>
      {label}
    </span>
  )
}

/** "2 of 5", and the next subtask that needs somebody - on a card and in a row. */
function SubtaskLine({ task }: { task: Task }) {
  const count = subtaskCount(task)
  if (!count) return null
  const next = openTaskSubtasks(task)[0]
  const says = next ? subtaskDue(next, todayDateInput()) : null
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-fg">
      <span className="inline-flex items-center gap-1 whitespace-nowrap"><ListChecks className="h-3.5 w-3.5" />{count.done} of {count.total}</span>
      {next && says && (
        <span className={cn('min-w-0 break-words', says.tone === 'overdue' && 'font-semibold text-danger', says.tone === 'today' && 'font-semibold text-ink')}>
          {says.text}: {next.text}
        </span>
      )}
    </div>
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
  projectId: string
  onChanged: () => void
  onAddNote: (taskId: string, content: string) => Promise<void>
  /**
   * Under the edit form: only what the form does not already hold - the plan
   * pin, who finished it, sign-off, and the notes thread - in one column.
   */
  activityOnly?: boolean
}

function TaskDetailPanel({ task, notes, notesLoading, onAddNote, projectId, onChanged, activityOnly }: TaskDetailPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSignoff, setShowSignoff] = useState(false)
  const [signSaving, setSignSaving] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [planPin, setPlanPin] = useState<{ id: string; plan_id: string; page: number } | null>(null)
  const panelNotice = useNotice()

  // Ticking a subtask here saves straight away - it is a report of work done,
  // like moving the stage. The route stamps who and when.
  async function toggleSubtask(id: string) {
    const subtasks = (task.subtasks ?? []).map(s => s.id === id ? { ...s, done: !s.done } : s)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ subtasks }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `That did not save (${res.status}).`)
      }
    } catch (e) {
      panelNotice(fetchProblem(e, 'ticking the subtask'))
    } finally {
      onChanged()
    }
  }

  // If this task came from a plan pin, offer a link back to the exact spot.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/pin`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok && alive) setPlanPin((await res.json()).pin)
    })()
    return () => { alive = false }
  }, [task.id])

  const statusObj = STATUSES.find(s => s.value === task.status) ?? STATUSES[0]

  async function signoffToken() {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? ''
  }
  async function requestSignoff() {
    setRequesting(true)
    await fetch(`/api/projects/${projectId}/tasks/${task.id}/signoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await signoffToken()}` },
      body: JSON.stringify({ action: 'request' }),
    })
    setRequesting(false)
    onChanged()
  }
  async function sign(blob: Blob, name: string) {
    setSignSaving(true)
    const form = new FormData()
    form.append('signature', new File([blob], 'signature.png', { type: 'image/png' }))
    form.append('name', name)
    await fetch(`/api/projects/${projectId}/tasks/${task.id}/signoff`, {
      method: 'POST', headers: { Authorization: `Bearer ${await signoffToken()}` }, body: form,
    })
    setSignSaving(false)
    setShowSignoff(false)
    onChanged()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!noteText.trim() || submitting) return
    setSubmitting(true)
    await onAddNote(task.id, noteText.trim())
    setNoteText('')
    setSubmitting(false)
  }

  return (
    <div className={cn('px-4 py-4', activityOnly ? 'lg:px-5' : 'border-t border-line-soft bg-surface/60 lg:rounded-b-xl')}>
      <div className={cn('flex flex-col gap-6', !activityOnly && 'md:flex-row')}>
        {/* ── Left: task details ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">
          {!activityOnly && (<>
          <h2 className="text-base font-semibold text-ink leading-snug">{task.title}</h2>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'whitespace-nowrap inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border',
              statusObj.headerBg, statusObj.headerText, statusObj.colBorder,
            )}>
              <statusObj.icon className="h-3 w-3" />
              {statusObj.label}
            </span>
            <PriorityBadge priority={task.priority} />
          </div>

          <LabelChips labels={task.labels} />

          {(task.subtasks?.length ?? 0) > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                Subtasks <span className="font-medium normal-case tracking-normal text-muted-fg">{subtaskCount(task)?.done} of {subtaskCount(task)?.total} done</span>
              </p>
              <SubtaskList items={task.subtasks ?? []} today={todayDateInput()} onToggle={toggleSubtask} />
            </div>
          )}

          {(task.assignees?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-muted-fg">
              {taskCompanyId(task)
                ? <Building2 className="h-4 w-4 text-faint shrink-0" />
                : <UserCircle2 className="h-4 w-4 text-faint shrink-0" />}
              <span>{assigneeLabel(task.assignees, 2)}</span>
            </div>
          )}

          {dueLabel(task) && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-faint shrink-0" />
              <DueChip task={task} />
            </div>
          )}

          {task.follow_up_date && (
            <div className="flex items-center gap-1.5 text-sm text-info">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" />
              <span>Follow up {formatDate(task.follow_up_date, { month: 'short', day: 'numeric' })}</span>
            </div>
          )}

          {task.description && (
            <p className="text-sm text-muted-fg leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}

          </>)}

          {planPin && (
            <a href={`/projects/${projectId}/plans/${planPin.plan_id}?pin=${planPin.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
              <FileText className="h-4 w-4" /> View pinned spot on the plan
            </a>
          )}

          {!activityOnly && task.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <a href={task.image_url} target="_blank" rel="noreferrer">
              <img src={task.image_url} alt="Task" className="rounded-lg border border-line max-h-56 object-cover" />
            </a>
          )}

          {/* WHO TICKED IT OFF, and when.
              Distinct from the signoff below it: signing off is a formal act
              somebody is ASKED to do, while this is simply the record of who
              moved the card. With several people on a task it is the only way
              to know which of them did it. Null for every task finished
              before migration 116 - `completedByLabel` says nothing rather
              than inventing a name, because "completed by somebody" is a
              claim. */}
          {completedByLabel(task) && (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-fg">
              <span className="inline-flex items-center gap-1.5 font-medium text-ink-soft">
                <CheckSquare className="h-3.5 w-3.5 text-success" />
                {completedByLabel(task)}
              </span>
              {task.completed_at && (
                <span className="text-faint" title={absoluteTime(task.completed_at)}>
                  {timeAgo(task.completed_at)}
                </span>
              )}
            </p>
          )}

          {/* Work signoff - signature approval once the work is done */}
          {task.status === 'completed' && (
            <div className="rounded-lg border border-line-soft bg-panel px-3 py-2.5">
              {task.signoff_signed_at ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckSquare className="h-4 w-4" /> Signed off by {task.signoff_signed_by}
                  </span>
                  <span className="text-xs text-faint">{formatDate(task.signoff_signed_at)}</span>
                  {task.signoff_signature_url && (
                    <a href={task.signoff_signature_url} target="_blank" rel="noreferrer" className="text-xs text-accent-fg hover:underline">View signature</a>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-ink-soft">Work signoff</p>
                    <p className="text-xs text-faint">
                      {task.signoff_requested_at
                        ? `Signoff requested by ${task.signoff_requested_by ?? 'someone'} · awaiting signature`
                        : 'Get a signature confirming this work is done and accepted.'}
                    </p>
                  </div>
                  <div className="row-even lg:flex items-center gap-1.5">
                    {!task.signoff_requested_at && (
                      <Button size="sm" variant="outline" disabled={requesting} onClick={requestSignoff}>
                        {requesting ? 'Requesting…' : 'Request signoff'}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setShowSignoff(true)}>Sign off</Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-faint">
            Created {formatDate(task.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          </div>

          {showSignoff && (
            <SignoffModal title={task.title} saving={signSaving} onClose={() => setShowSignoff(false)} onSign={sign} />
          )}
        </div>

        {/* ── Right: notes feed ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-faint" />
            <span className="text-sm font-semibold text-ink-soft">Notes &amp; Updates</span>
          </div>

          <div className={cn('flex-1 space-y-2', !activityOnly && 'max-h-48 overflow-y-auto')}>
            {notesLoading ? (
              <div className="flex items-center gap-2 py-4 text-faint text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading updates…
              </div>
            ) : notes.length === 0 ? (
              <p className="text-xs text-faint py-2 italic">No updates yet - add the first one</p>
            ) : (
              notes.map(note => (
                <div key={note.id} className="bg-panel rounded-lg border border-line-soft px-3 py-2">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-ink-soft">{note.author_name}</span>
                    <span className="text-xs text-faint shrink-0" title={absoluteTime(note.created_at)}>{timeAgo(note.created_at)}</span>
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

/**
 * The open task, over the screen rather than inside the list.
 *
 * WHAT THIS REPLACES. The detail was rendered INLINE, in two different places:
 * docked under the whole board on a desktop, and under the tapped card on a
 * phone (because a phone stacks the three columns, so "under the board" is
 * under every other column too - tapping something in Open put its detail
 * below Completed, off the screen). The desktop one was the real complaint: it
 * sat in the layout permanently, so the board was squeezed to half the height
 * whether or not anything was open.
 *
 * A drawer answers both. `.overlay-drawer` (globals.css) is `.overlay-sheet`
 * one axis over - sized off the VISIBLE viewport, so its footer is above the
 * keyboard and its close button is below the notch - and it is full-bleed
 * below `sm`, which is the "never a bottom strip under the list" half.
 *
 * ONE definition, opened the same way from the board, the list and the
 * assignee view. There is nothing left that opens a task inline.
 *
 * ── AND IT LIVES OUT HERE, WHICH IS THE WHOLE POINT OF THIS COMMENT ─────────
 *
 * It used to be declared INSIDE `TasksPage`. A function declared inside a
 * component is a NEW FUNCTION on every render, and React reconciles by element
 * TYPE - so a new type means the old one is not updated, it is unmounted and a
 * fresh one is mounted in its place. The DOM is thrown away and rebuilt every
 * single time the page re-renders.
 *
 * Reported as "it blinks/slides out twice when I open a task", and that is
 * exactly what you see: opening a task renders the drawer (it slides in), the
 * notes for that task then arrive and set state on the page, the page
 * re-renders, the drawer is a different type, React deletes it and builds it
 * again - and `overlay-drawer-in` plays a second time on the new element.
 *
 * The animation is the visible half. The invisible half is worse: a remount
 * resets the state inside `TaskDetailPanel`, so anything half-typed into "Add
 * an update" is gone the moment anything else on the page changes, and the
 * scroll position with it. Props instead of closures; nothing else changed.
 */
function TaskDrawer({
  task, notes, notesLoading, currentUser, projectId, onClose, onAddNote, onChanged,
  heading, footer, children, isNew,
}: TaskDetailPanelProps & { onClose: () => void } & {
  /** What the panel is called. */
  heading?: string
  /** Pinned under the scrolling body - Cancel, Save, Delete. */
  footer?: ReactNode
  /** The edit form. With it, the panel below shows only the task's activity. */
  children?: ReactNode
  /** A task being created has no notes, sign-off or history to show yet. */
  isNew?: boolean
}) {
  // Slide it back off the right edge to close it - the way it came in.
  const swipe = useSwipeDismiss(onClose)

  return (
    <div className="overlay-drawer bg-black/40" data-overlay onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        {...swipe.handlers}
        style={swipe.style}
        className="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
          <span className="text-sm font-semibold text-ink">{heading ?? 'Task detail'}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close" title="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
          {!isNew && (
            <div className={cn(children && 'border-t border-line')}>
              <TaskDetailPanel
                projectId={projectId}
                onChanged={onChanged}
                task={task}
                notes={notes}
                notesLoading={notesLoading}
                currentUser={currentUser}
                onAddNote={onAddNote}
                activityOnly={!!children}
              />
            </div>
          )}
        </div>
        {footer && <div className="shrink-0 space-y-2 border-t border-line px-4 py-3 lg:px-5">{footer}</div>}
      </div>
    </div>
  )
}

/** What the panel holds while a task is being created - it has no row yet. */
const NEW_TASK: Task = {
  id: '', title: '', description: null, due_date: null, priority: 'medium', status: 'open',
  created_by: '', completed_at: null, created_at: '', image_url: null,
  follow_up_date: null, follow_up_note: null, budget_line_item_id: null,
}



/**
 * THE SUB ON A TASK, derived from the assignee list.
 *
 * The board groups by subcontractor and the invoice flow bills one, both of
 * which used to read `assigned_to_company_id`. With several people on a task
 * the question becomes "which company is on this", and the answer is the
 * first one - a task carrying two subs is possible and rare, and the group it
 * files under has to be ONE bucket or the row appears twice.
 */
function taskCompanyId(t: { assignees?: TaskAssignee[] }): string | null {
  return (t.assignees ?? []).find(a => a.company_id)?.company_id ?? null
}

function taskCompanyName(t: { assignees?: TaskAssignee[] }): string | null {
  const a = (t.assignees ?? []).find(x => x.company_id)
  return a ? assigneeName(a) : null
}

export default function TasksPage({ params }: { params: { id: string } }) {
  const perms = usePermissions()
  const { can } = perms
  const canCreateTask = can('tasks', 'create')
  // Hidden only when we KNOW the answer is no - a failed or pending check
  // leaves it on screen and the route still refuses.
  const hideDelete = !perms.loading && !perms.error && !can('tasks', 'delete')
  const guardDelete = useDeleteGuard()
  const notice = useNotice()
  const supabase = createClient()
  const [tasks, setTasks]     = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [subs, setSubs]       = useState<Sub[]>([])
  /** The signed-in person's own crew row on this job, when there is one - "Me" in the picker. */
  const [meMemberId, setMeMemberId] = useState<string | null>(null)
  const [addingMe, setAddingMe] = useState(false)
  const [loading, setLoading] = useState(true)

  // view / filter
  const [viewMode, setViewMode]     = useState<ViewMode>('board')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [query, setQuery] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  /** Which stage a phone is looking at - the board is one column at a time there. */
  const [phoneStage, setPhoneStage] = useState('open')
  /** Tasks whose subtasks are listed under them in the Table view. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  // A REF, NOT STATE. BoardCard is declared inside this component, so a
  // setState on drag start would remount the card being dragged and the
  // browser would lose it - which is why drag was taken out of this board
  // twice. Nothing re-renders until the drop.
  const dragTask = useRef<string | null>(null)
  const today = todayDateInput()

  // The open task. It used to be `expandedTaskId` and it opened INLINE - a
  // panel docked under the whole board on a desktop, and under the tapped card
  // on a phone. Two placements, one of which permanently squeezed the board to
  // about half its height whether or not anything was open. It is a slide-over
  // now, so there is one placement and the board keeps its width.
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
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
  // Which column's "+" opened the form. The board's three + buttons used to
  // pass this in and drop it on the floor, so all three created an Open task.
  const [addStatus, setAddStatus] = useState<string | null>(null)
  const [title, setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate]   = useState('')
  const [priority, setPriority] = useState('medium')
  // A punch item is a task with a kind - same assignees, dates and photos.
  const [isPunch, setIsPunch] = useState(false)
  const [assigneeType, setAssigneeType] = useState<'member' | 'sub'>('member')
  const [assignedMemberId, setAssignedMemberId] = useState('')
  const [assignedSubId, setAssignedSubId]       = useState('')
  /** Everyone picked for the task being added or edited. */
  const [picked, setPicked] = useState<TaskAssignee[]>([])
  const [followUpDate, setFollowUpDate] = useState('')
  const [formLabels, setFormLabels] = useState<TaskLabel[]>([])
  /** The stage picked in the panel. Sent on an edit only when it changed - a status in the body restamps who finished the task. */
  const [formStatus, setFormStatus] = useState('open')
  const [formSubtasks, setFormSubtasks] = useState<TaskSubtask[]>([])
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
      setMeMemberId(data.meMemberId ?? null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  // Arriving from a link that named something: the Overview's "4 tasks
  // overdue" lands on the overdue filter, and a line naming one task opens it.
  useLandOnParam('filter', true, f => {
    if ((['all', 'open', 'in_progress', 'completed', 'overdue', 'punch'] as string[]).includes(f)) setFilterMode(f as FilterMode)
  })
  useLandOnParam('open', !loading, id => { if (tasks.some(t => t.id === id)) openTask(id) })

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

  // A TASK OPENS IN ITS EDITOR. One panel, the same one a Project Management
  // card opens in: the fields on top, then the task's notes and sign-off.
  function openTask(taskId: string) {
    setOpenTaskId(taskId)
    loadNotes(taskId)
    const t = tasks.find(x => x.id === taskId)
    if (t) openEditForm(t)
  }
  function closeForm() {
    setShowAdd(false); resetForm(); setOpenTaskId(null)
  }

  // Escape closes it. A drawer over the whole screen with no keyboard way out
  // is a modal that only a mouse can leave.
  useEffect(() => {
    if (!openTaskId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeForm() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [openTaskId])

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
    setTitle(''); setDescription(''); setDueDate(''); setPriority('medium'); setIsPunch(false)
    setAssigneeType('member'); setAssignedMemberId(''); setAssignedSubId('')
    setFollowUpDate(''); setTaskImage(null); setTaskImagePreview(null)
    setFormLabels([]); setFormSubtasks([]); setFormStatus('open')
    setSaveError(null)
    setEditTask(null)
    setAddStatus(null)
  }

  /**
   * Put yourself on the task. Whoever opened a job was never on its crew, so
   * the picker offered everybody but you; the first press puts you on this
   * job's crew (or finds the row your email is already on) and every press
   * after that is just a pick.
   */
  async function assignMe() {
    if (meMemberId) {
      const m = members.find(x => x.id === meMemberId)
      if (m) setPicked(prev => normalizeAssignees([...prev, { member_id: m.id, name: m.name }]))
      return
    }
    setAddingMe(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/team/me`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.member) {
        setSaveError(res.status === 403
          ? 'Only somebody who can edit this job\'s team can put you on its crew - ask your admin to add you under Subs & Team.'
          : (j.error ?? 'Could not put you on this job\'s crew.'))
        return
      }
      const m = j.member as Member
      setMembers(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m].sort((a, b) => a.name.localeCompare(b.name)))
      setMeMemberId(m.id)
      setPicked(prev => normalizeAssignees([...prev, { member_id: m.id, name: m.name }]))
    } catch (e) {
      setSaveError(fetchProblem(e, 'adding you to the crew'))
    } finally {
      setAddingMe(false)
    }
  }

  function openAddForm(defaultStatus?: string) {
    resetForm()
    // resetForm() has just cleared this, so set it after, not before.
    if (defaultStatus && STATUSES.some(s => s.value === defaultStatus)) {
      setAddStatus(defaultStatus)
      setFormStatus(defaultStatus)
    }
    setShowAdd(true)
  }

  function openEditForm(task: Task) {
    setEditTask(task)
    setTitle(task.title)
    setDescription(task.description ?? '')
    setDueDate(task.due_date ?? '')
    setPriority(task.priority)
    setIsPunch(task.kind === 'punch')
    setFollowUpDate(task.follow_up_date ?? '')
    setFormLabels(task.labels ?? []); setFormSubtasks(task.subtasks ?? []); setFormStatus(task.status)
    setTaskImage(null)
    setTaskImagePreview(task.image_url ?? null)
    setPicked(task.assignees ?? [])
    // THE TAB IS A VIEW CHOICE, NOT AN ASSIGNMENT. It used to be seeded from
    // the single `assigned_to_*` columns, which were also what was assigned;
    // now the chips hold that and this only decides which picker opens first.
    // Opening on Subcontractor when the only person on the task is a sub
    // saves a tap; anything else opens on the crew.
    if ((task.assignees ?? []).some(a => a.company_id) && !(task.assignees ?? []).some(a => a.member_id)) {
      setAssigneeType('sub')
      setAssignedSubId(''); setAssignedMemberId('')
    } else if ((task.assignees ?? []).length) {
      setAssigneeType('member')
      setAssignedMemberId(''); setAssignedSubId('')
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
    setSaveError(null)
    // A DISABLED BUTTON EXPLAINS NOTHING. It used to be disabled while the
    // title was empty, so pressing it did literally nothing and the form never
    // said which field it was waiting on. Let it fire and answer.
    // SEVERAL PUNCH ITEMS AT ONCE: a new punch item takes a box where every
    // line is its own item (lib/punch-lines.ts). Everything else on the form -
    // who, when, priority - applies to each of them.
    const bulk = !editTask && isPunch
    const lines = bulk ? punchLines(title) : [title.trim()].filter(Boolean)
    if (!lines.length) {
      setSaveError(bulk
        ? 'Type at least one punch item - one per line.'
        : 'Give the task a name - it is the line everybody reads on the board.')
      return
    }
    if (lines.length > MAX_PUNCH_LINES) {
      setSaveError(`That is ${lines.length} lines - add up to ${MAX_PUNCH_LINES} at a time.`)
      return
    }
    setSaving(true)
    try {
      const token = await getToken()

      // THE WHOLE SET, every time. The route replaces rather than diffs, and
      // an empty array is a real answer - it is how a task gets unassigned.
      const assignees = normalizeAssignees(picked)

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

      if (bulk && lines.length > 1) {
        // One request per item, IN ORDER, and every answer collected: a loop
        // that throws on the third line abandons the rest in silence. What
        // did not land stays in the box so it can be sent again.
        const failed: string[] = []
        let firstError = ''
        for (const line of lines) {
          try {
            const res = await fetch(`/api/projects/${params.id}/tasks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                title: line, description, due_date: dueDate || null, priority,
                kind: 'punch', assignees, image_url: null, follow_up_date: followUpDate || null,
                labels: formLabels,
                status: formStatus,
              }),
            })
            if (!res.ok) {
              failed.push(line)
              const j = await res.json().catch(() => ({}))
              firstError ||= j.error || `Save failed (${res.status})`
              console.error('[tasks] punch item not added:', line, res.status, j.error)
            }
          } catch (err) {
            failed.push(line)
            firstError ||= fetchProblem(err, 'adding that punch item')
            console.error('[tasks] punch item not added:', line, err)
          }
        }
        load()
        if (failed.length) {
          setTitle(failed.join('\n'))
          setSaveError(failed.length === lines.length
            ? `None of the ${lines.length} items were added: ${firstError}`
            : `${lines.length - failed.length} of ${lines.length} added. The ${failed.length} still in the box were not: ${firstError}`)
          return
        }
        closeForm()
        return
      }

      const body = JSON.stringify({
        title: lines[0], description, due_date: dueDate || null, priority,
        kind: isPunch ? 'punch' : 'task',
        assignees,
        image_url, follow_up_date: followUpDate || null,
        labels: formLabels, subtasks: formSubtasks,
        // Create only. On PATCH this stays out of the body on purpose: saving
        // an edit must not move the task to whichever column was last used.
        ...(editTask ? (formStatus !== editTask.status ? { status: formStatus } : {}) : { status: formStatus }),
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
      closeForm(); load()
    } catch (err: any) {
      setSaveError(err?.message ? `Save failed: ${err.message}` : 'Save failed - check your connection and try again.')
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

  /**
   * ASKS FIRST. The trash can sat beside Edit on every card and row and
   * deleted on one tap - "way too easy" - with its notes and plan pins
   * going with it. And it only leaves the list once the server says it is
   * gone: it used to vanish whatever the answer, so a refused delete looked
   * like a done one until the next reload put it back.
   */
  function deleteTask(taskId: string) {
    const task = tasks.find(t => t.id === taskId)
    guardDelete(async () => {
      try {
        const token = await getToken()
        const res = await fetch(`/api/projects/${params.id}/tasks/${taskId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          notice(d.error ?? 'Could not delete that task.')
          return
        }
        setTasks(prev => prev.filter(t => t.id !== taskId))
        if (openTaskId === taskId || editTask?.id === taskId) closeForm()
      } catch (e) {
        notice(fetchProblem(e, 'deleting that task'))
      }
    }, {
      title: 'Delete this task?',
      label: task ? `"${task.title}"` : 'this task',
      body: <>{task ? <>&ldquo;{task.title}&rdquo;</> : 'This task'} and its notes and plan pins will be deleted. This cannot be undone.</>,
      confirmLabel: 'Delete task',
    })
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
    const sub = subs.find(s => s.companies?.id === taskCompanyId(invoiceTask))
    await fetch(`/api/projects/${params.id}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subcontract_id: sub?.id ?? null,
        company_id: taskCompanyId(invoiceTask),
        company_name: taskCompanyName(invoiceTask),
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
  const punchCount = visibleTasks.filter(t => t.kind === 'punch').length

  const filteredTasks = visibleTasks.filter(t => {
    if (!taskMatches(t, query, labelFilter)) return false
    if (filterMode === 'all') return true
    if (filterMode === 'overdue') return isOverdue(t)
    if (filterMode === 'punch') return t.kind === 'punch'
    return t.status === filterMode
  })

  const totalCount     = visibleTasks.length
  const openCount      = visibleTasks.filter(t => t.status === 'open').length
  const inProgCount    = visibleTasks.filter(t => t.status === 'in_progress').length
  const completedCount = visibleTasks.filter(t => t.status === 'completed').length
  const pctDone        = totalCount ? Math.round((completedCount / totalCount) * 100) : 0

  // THE COUNTS ARE THE FILTERS.
  //
  // There were two rows saying the same thing: a strip of filter pills
  // (All / Open / In Progress / Completed / Overdue) and, under it, a strip of
  // stat pills (15 total, 9 open, 4 in progress...). Same five facts, twice,
  // one of them clickable. They are one list now, so the desktop's row and the
  // phone's card are two renderings of a single set and cannot disagree about
  // a number.
  //
  // Colour only on Overdue, which is the only one where the colour means
  // something - a total is just a number.
  const FILTERS: { key: FilterMode; label: string; short: string; count: number; danger?: boolean; note?: string }[] = [
    { key: 'all',         label: 'All',         short: 'All',      count: totalCount },
    { key: 'open',        label: 'Open',        short: 'Open',     count: openCount },
    { key: 'in_progress', label: 'In Progress', short: 'Doing',    count: inProgCount },
    { key: 'completed',   label: 'Completed',   short: 'Done',     count: completedCount, note: `${pctDone}% of the job` },
    { key: 'overdue',     label: 'Overdue',     short: 'Overdue',  count: overdueCount, danger: true },
    { key: 'punch',       label: 'Punch list',  short: 'Punch',    count: punchCount, note: `${visibleTasks.filter(t => t.kind === 'punch' && t.status !== 'completed').length} still open` },
  ]

  // Every label in use on this job, for the filter.
  const labelsInUse = Array.from(new Set(visibleTasks.flatMap(t => (t.labels ?? []).map(l => l.name)))).sort()
  // Who a subtask can be given to: the crew and the subs already on this job.
  const subtaskPeople: SubtaskPerson[] = [
    ...members.map(m => ({ key: `m:${m.id}`, name: m.name, member_id: m.id })),
    ...subs.filter(sc => sc.companies?.id).map(sc => ({ key: `c:${sc.companies!.id}`, name: sc.companies!.name, company_id: sc.companies!.id })),
  ].filter((p, i, all) => all.findIndex(x => x.key === p.key) === i)

  // Ticking a subtask from the table. The whole list goes; the route cleans it
  // and stamps who ticked it. A refusal puts the screen back as the server has it.
  async function toggleSubtask(task: Task, subtaskId: string) {
    const subtasks = (task.subtasks ?? []).map(x => x.id === subtaskId ? { ...x, done: !x.done } : x)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks } : t))
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subtasks }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `That did not save (${res.status}).`)
      }
    } catch (e) {
      notice(fetchProblem(e, 'ticking the subtask'))
    } finally {
      load()
    }
  }

  const openTask_ = openTaskId ? tasks.find(t => t.id === openTaskId) ?? null : null

  const generalTasks = filteredTasks.filter(t => !taskCompanyId(t))
  const subTasks     = filteredTasks.filter(t => taskCompanyId(t))

  const subGroups: Record<string, { name: string; tasks: Task[] }> = {}
  for (const t of subTasks) {
    const key = taskCompanyId(t)!
    if (!subGroups[key]) subGroups[key] = { name: taskCompanyName(t) ?? 'Unknown', tasks: [] }
    subGroups[key].tasks.push(t)
  }

  // ── sub-components ─────────────────────────────────────────────────────────

  /**
   * What a task tag says, and where it comes from.
   *
   * DERIVED, NEVER STORED. A sub's trade lives on the SUBCONTRACT, a crew
   * member's role lives on the team row - neither is a column on the task, and
   * copying one there would be a second place for it to be wrong. Both lists
   * are already in hand from the page's one load().
   */
  function taskTag(task: Task): string | null {
    if (taskCompanyId(task)) {
      return subs.find(s => s.companies?.id === taskCompanyId(task))?.trade ?? null
    }
    const firstMember = (task.assignees ?? []).find(a => a.member_id)?.member_id
    if (firstMember) {
      return members.find(m => m.id === firstMember)?.role ?? null
    }
    return null
  }

  function TaskTag({ task }: { task: Task }) {
    const tag = taskTag(task)
    if (!tag) return null
    return (
      <span className="whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-fg">
        {tag}
      </span>
    )
  }

  /**
   * FOUR THINGS AT A GLANCE: title, due date, assignee, tag.
   *
   * What came off it, and why each was noise rather than information:
   *   * the three status buttons - the column already says the status, and
   *     forty-five of them was most of what the board looked like;
   *   * the red tint - an overdue card said so in red text AND in a red border
   *     AND in a red wash over the whole card, three times for one fact;
   *   * the chevron - nothing expands inline any more, the card opens a panel;
   *   * the follow-up and image icons - two more glyphs for facts the panel
   *     states in words.
   * The priority dot stays, at 6px: it is not a word to read, and high-priority
   * work is otherwise invisible until the task is opened.
   */
  function BoardCard({ task }: { task: Task }) {
    const selected = openTaskId === task.id
    return (
      <div
        className={cn(
          // Phone: a row. Desktop (lg+): the bordered card it always was.
          'group cursor-pointer px-4 py-3 transition-colors hover:bg-surface lg:relative lg:flex lg:flex-col lg:rounded-xl lg:border lg:border-line lg:bg-panel lg:p-3 lg:transition-all lg:hover:border-muted2 lg:hover:shadow-sm',
          selected && 'bg-surface lg:border-accent',
        )}
        onClick={() => openTask(task.id)}
        draggable
        onDragStart={e => { dragTask.current = task.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id) }}
        onDragEnd={() => { dragTask.current = null }}
      >
        <div className="flex items-start gap-2">
          <PriorityDot priority={task.priority} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <LabelChips labels={task.labels} />
            <p className={cn('break-words text-sm font-semibold leading-snug text-ink', task.status === 'completed' && 'font-medium text-muted-fg line-through')}>
              {task.kind === 'punch' && <PunchTag />}{task.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <DueChip task={task} />
              {(task.assignees?.length ?? 0) > 0 && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-muted-fg">
                  {taskCompanyId(task)
                    ? <Building2 className="h-3 w-3 shrink-0 text-faint" />
                    : <UserCircle2 className="h-3 w-3 shrink-0 text-faint" />}
                  <span className="truncate">{assigneeLabel(task.assignees, 2)}</span>
                </span>
              )}
              <TaskTag task={task} />
            </div>
            <SubtaskLine task={task} />
          </div>
          {/* IN THE TOP ROW, NOT A ROW OF THEIR OWN. As a second row they held
              the card open for buttons nobody could see - every card ended in
              a band of nothing. From lg up they appear on hover beside the
              status; on a phone they are not here at all, because tapping the
              card opens its panel, which has Save and Delete at the bottom. */}
          <div data-card-actions className="hidden shrink-0 items-center gap-0.5 lg:flex lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
            <button
              onClick={e => { e.stopPropagation(); openTask(task.id) }}
              aria-label={`Edit "${task.title}"`} title="Edit task"
              className="p-1 rounded text-faint hover:text-accent-fg hover:bg-accent-tint transition-colors">
              <Pencil className="h-3 w-3" />
            </button>
            {task.status === 'completed' && taskCompanyId(task) && (
              <button
                onClick={e => { e.stopPropagation(); openInvoiceModal(task) }}
                className="p-1 rounded text-faint hover:text-accent-fg hover:bg-accent-tint transition-colors"
                aria-label={`Create an invoice from "${task.title}"`} title="Create invoice">
                <Receipt className="h-3 w-3" />
              </button>
            )}
            {!hideDelete && (
            <button
              onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
              aria-label={`Delete "${task.title}"`} title="Delete task"
              className="p-1 rounded text-faint hover:text-danger hover:bg-danger-tint transition-colors">
              <Trash2 className="h-3 w-3" />
            </button>
            )}
          </div>
          {/* Move it. The status icon IS the control - see StatusPicker. */}
          <StatusPicker status={task.status} onPick={next => updateStatus(task.id, next)} />
        </div>

      </div>
    )
  }

  function ListCard({ task }: { task: Task }) {
    const selected = openTaskId === task.id
    return (
      <div
        className={cn(
          'group flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors',
          selected ? 'bg-surface' : 'hover:bg-surface',
        )}
        onClick={() => openTask(task.id)}
      >
        {/* Was a state readout. It is the control now - one tiny status icon,
            the same one the board card has, from one definition. */}
        <StatusPicker status={task.status} onPick={next => updateStatus(task.id, next)} className="mt-0.5" align="left" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('font-semibold text-ink', task.status === 'completed' && 'line-through text-faint')}>
              {task.title}
            </span>
            <PriorityBadge priority={task.priority} />
            {task.kind === 'punch' && <PunchTag />}
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
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {(task.assignees?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-muted-fg">
                {taskCompanyId(task) ? <Building2 className="h-3 w-3 text-faint" /> : <UserCircle2 className="h-3 w-3 text-faint" />}
                {assigneeLabel(task.assignees, 2)}
              </span>
            )}
            <DueChip task={task} />
            <TaskTag task={task} />
          </div>
          <LabelChips labels={task.labels} className="mt-1.5" />
          <div className="mt-1.5 empty:hidden"><SubtaskLine task={task} /></div>
        </div>

        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
          {task.status === 'completed' && taskCompanyId(task) && (
            <button
              onClick={e => { e.stopPropagation(); openInvoiceModal(task) }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-accent-fg border border-accent/40 rounded-md hover:bg-accent-tint transition-colors font-medium">
              <Receipt className="h-3 w-3" /> Invoice
            </button>
          )}
          <button
            onClick={e => { e.stopPropagation(); openTask(task.id) }}
            aria-label={`Edit "${task.title}"`} title="Edit task"
            className="p-1.5 text-faint hover:text-accent-fg rounded transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {!hideDelete && (
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
            aria-label={`Delete "${task.title}"`} title="Delete task"
            className="p-1.5 text-faint hover:text-danger rounded transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          )}
        </div>
      </div>
    )
  }

  // ── board view ─────────────────────────────────────────────────────────────

  // ── THE BOARD ─────────────────────────────────────────────────────────────
  // The look is Project Management's: quiet columns, a card per task. The
  // STAGES are fixed at three - notifications, sign-off, Field Mode and the
  // reports all read them, so nobody renames "Completed" here.
  //
  // From lg up the three sit side by side and a card is DRAGGED between them.
  // Below lg it is one stage at a time, chosen from the pills, and a card
  // moves from its status icon - there is no drag on a touch screen.
  function BoardView() {
    return (
      <div className="space-y-4">
        <div role="tablist" aria-label="Stages" className="scroll-fade flex gap-2 overflow-x-auto scrollbar-hide lg:hidden">
          {STATUSES.map(col => {
            const on = col.value === phoneStage
            return (
              <button key={col.value} type="button" role="tab" aria-selected={on} onClick={() => setPhoneStage(col.value)}
                className={cn('min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm',
                  on ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink')}>
                {col.label} {filteredTasks.filter(t => t.status === col.value).length}
              </button>
            )
          })}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:flex lg:flex-wrap lg:items-start">
          {STATUSES.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.value)
            return (
              <section key={col.value} aria-label={col.label}
                className={cn('flex-col gap-2.5 rounded-xl lg:flex lg:w-72 lg:shrink-0 lg:p-1', col.value === phoneStage ? 'flex' : 'hidden')}
                onDragOver={e => { if (dragTask.current) e.preventDefault() }}
                onDrop={e => {
                  e.preventDefault()
                  const id = dragTask.current
                  dragTask.current = null
                  const moved = tasks.find(t => t.id === id)
                  if (moved && moved.status !== col.value) updateStatus(moved.id, col.value)
                }}>
                <div className="flex items-center gap-2 px-1">
                  <col.icon className={cn('h-4 w-4 shrink-0', col.color)} />
                  <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-ink">{col.label}</h2>
                  <span className="text-xs tabular-nums text-muted-fg">{colTasks.length}</span>
                  <span className="flex-1" />
                  {canCreateTask && (
                    <button
                      onClick={() => openAddForm(col.value)}
                      aria-label={`Add a task to ${col.label}`} title={`Add ${col.label} task`}
                      className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink lg:mr-0 lg:h-8 lg:w-8"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {colTasks.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-muted2 px-3 py-8 text-center lg:rounded-xl">
                    <p className="text-xs text-muted-fg">No tasks</p>
                  </div>
                ) : (
                  /* One divided card on a phone; separate cards from lg up.
                     No `overflow-hidden`: the status menu on the last row
                     opens below it, so the ROWS that touch an edge are rounded
                     instead of the box clipping them. */
                  <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl lg:space-y-2.5 lg:divide-y-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:[&>*:first-child]:rounded-t-xl lg:[&>*:last-child]:rounded-b-xl">
                    {colTasks.map(task => <BoardCard key={task.id} task={task} />)}
                  </div>
                )}

                {canCreateTask && (
                  <button type="button" onClick={() => openAddForm(col.value)}
                    className="rounded-xl border border-dashed border-muted2 px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-panel">
                    + Add task
                  </button>
                )}
              </section>
            )
          })}
        </div>
      </div>
    )
  }

  // ── THE TABLE ─────────────────────────────────────────────────────────────
  // Grouped by stage. From lg up it is a real table, and a task's subtask
  // count opens its subtasks under it, each tickable. A phone gets the same
  // groups as lists of rows - a six-column table is not a phone layout.
  function ListView() {
    if (filteredTasks.length === 0) return <EmptyState />
    const groups = STATUSES.map(col => ({ col, list: filteredTasks.filter(t => t.status === col.value) })).filter(g => g.list.length)
    return (
      <>
        <div className="hidden lg:block overflow-x-auto rounded-2xl border border-line bg-panel">
          <table className="w-full min-w-[920px] border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-fg">
                {['Task', 'Assigned to', 'Labels', 'Priority', 'Due', 'Subtasks'].map(h => (
                  <th key={h} scope="col" className="border-b border-line px-4 py-3 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(({ col, list }) => [
                <tr key={col.value}>
                  <th scope="colgroup" colSpan={6} className="border-b border-line bg-surface px-4 pb-2 pt-3.5 text-left text-xs font-bold uppercase tracking-wider text-ink">
                    {col.label} <span className="font-medium text-muted-fg">{list.length}</span>
                  </th>
                </tr>,
                ...list.flatMap(task => {
                  const count = subtaskCount(task)
                  const isOpen = expanded.has(task.id)
                  return [
                    <tr key={task.id} onClick={() => openTask(task.id)} className="cursor-pointer border-b border-line-soft hover:bg-surface">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left" onClick={e => { e.stopPropagation(); openTask(task.id) }}>
                          <span className={cn('block break-words font-semibold', task.status === 'completed' ? 'text-muted-fg line-through' : 'text-ink')}>
                            {task.kind === 'punch' && <PunchTag />}{task.title}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{(task.assignees?.length ?? 0) > 0 ? assigneeLabel(task.assignees, 2) : '-'}</td>
                      <td className="px-4 py-3">{task.labels?.length ? <LabelChips labels={task.labels} /> : '-'}</td>
                      <td className={cn('whitespace-nowrap px-4 py-3', task.priority === 'high' && 'font-semibold text-danger')}>
                        {PRIORITIES.find(x => x.value === task.priority)?.label ?? '-'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">{dueLabel(task) ? <DueChip task={task} /> : '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {count ? (
                          <button type="button" aria-expanded={isOpen}
                            onClick={e => {
                              e.stopPropagation()
                              setExpanded(prev => { const next = new Set(prev); if (next.has(task.id)) next.delete(task.id); else next.add(task.id); return next })
                            }}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-ink-soft hover:bg-muted">
                            {count.done} of {count.total}
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')} />
                          </button>
                        ) : '-'}
                      </td>
                    </tr>,
                    ...(isOpen ? [
                      <tr key={`${task.id}:subtasks`} className="border-b border-line-soft bg-surface">
                        <td colSpan={6} className="py-3 pl-10 pr-4">
                          <SubtaskList items={task.subtasks ?? []} today={today} onToggle={id => toggleSubtask(task, id)} className="bg-panel" />
                        </td>
                      </tr>,
                    ] : []),
                  ]
                }),
              ])}
            </tbody>
          </table>
        </div>

        <div className="space-y-6 lg:hidden">
          {groups.map(({ col, list }) => (
            <div key={col.value} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <p className="text-xs font-bold uppercase tracking-wider text-ink">{col.label}</p>
                <span className="text-xs text-muted-fg">{list.length}</span>
              </div>
              <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl">
                {list.map(task => <ListCard key={task.id} task={task} />)}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  // ── THE CALENDAR ──────────────────────────────────────────────────────────
  // A task on its due date and each open dated subtask on its own. Plain
  // values, not a component: one more component declared in here is one more
  // that remounts on every render.
  const calendarEntries = taskCalendarEntries(filteredTasks).map(e => ({
    key: e.task.id + (e.subtask?.id ?? ''),
    date: e.date,
    label: e.subtask?.text ?? e.task.title,
    sub: e.subtask ? `Subtask of ${e.task.title}` : assigneeLabel(e.task.assignees, 2),
    done: e.done,
    onOpen: () => openTask(e.task.id),
  }))
  const offCalendar = filteredTasks.filter(t => !t.due_date && openTaskSubtasks(t).length === 0).length

  function AssigneeView() {
    // Group ALL filtered tasks by assignee name (or "Unassigned")
    const groups: Record<string, { name: string; tasks: Task[]; isCompany: boolean }> = {}

    for (const t of filteredTasks) {
      const key = assigneeLabel(t.assignees, 3)
      if (!groups[key]) groups[key] = {
        name: assigneeLabel(t.assignees, 3),
        tasks: [],
        isCompany: !!taskCompanyId(t),
      }
      groups[key].tasks.push(t)
    }

    return (
      <div className="space-y-6">
        {Object.entries(groups).length === 0 && <EmptyState />}
        {Object.entries(groups).map(([key, group]) => (
          <div key={key} className="space-y-3 lg:space-y-2">
            <div className="flex items-center gap-2 px-1 flex-wrap">
              {group.isCompany
                ? <Building2 className="h-3.5 w-3.5 text-faint" />
                : <UserCircle2 className="h-3.5 w-3.5 text-faint" />}
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{group.name}</p>
              <span className="whitespace-nowrap text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{group.tasks.length}</span>
              <GroupProgressBar tasks={group.tasks} />
            </div>
            {/* No `overflow-hidden`: the same status menu lives in these rows
                and the last row's opens below them. See the board column. */}
            <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl lg:rounded-xl lg:[&>*:first-child]:rounded-t-xl lg:[&>*:last-child]:rounded-b-xl">
              {group.tasks.map(task => <ListCard key={task.id} task={task} />)}
            </div>
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
        {filterMode === 'all' && canCreateTask && (
          <button onClick={() => openAddForm()} className="mt-2 text-sm text-accent-fg hover:underline">
            Create your first task
          </button>
        )}
      </div>
    )
  }

  // ── form modal ─────────────────────────────────────────────────────────────

  // A new punch item is a box of them, one per line.
  const bulkPunch = !editTask && isPunch
  const punchLineCount = bulkPunch ? punchLines(title).length : 0
  const formTitle = editTask ? 'Edit Task' : bulkPunch ? 'Add punch list items' : 'New Task'
  const submitLabel = saving
    ? (editTask ? 'Saving…' : 'Adding…')
    : editTask ? 'Save Changes'
    : bulkPunch ? (punchLineCount > 1 ? `Add ${punchLineCount} items` : 'Add item')
    : 'Create Task'

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 p-0 lg:p-6">

      {/* ── The task panel: New and Edit, and a task's activity under it ────
          It was a centred dialog for the form and a separate two-column
          drawer for the detail. It is ONE panel now, the same shape a Project
          Management card opens in: fields, then notes and sign-off, with
          Cancel / Save / Delete pinned at the bottom. */}
      {showAdd && (
        <TaskDrawer
          task={(editTask && tasks.find(t => t.id === editTask.id)) || editTask || NEW_TASK}
          isNew={!editTask}
          heading={formTitle}
          projectId={params.id}
          notes={editTask ? notesCache[editTask.id] ?? [] : []}
          notesLoading={editTask ? !!notesLoading[editTask.id] : false}
          currentUser={currentUser}
          onClose={closeForm}
          onAddNote={handleAddNote}
          onChanged={load}
          footer={
            <>
              {saveError && <p role="alert" className="text-sm text-danger">{saveError}</p>}
              {/* Two choices share a row on a phone; the destructive one sits under them. */}
              <div className="row-even gap-2 lg:flex lg:items-center lg:justify-end">
                <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
                <Button type="submit" form="task-form" disabled={saving}>
                  <Check className="mr-1.5 h-4 w-4" />{submitLabel}
                </Button>
                {editTask && !hideDelete && (
                  <Button type="button" variant="ghost" onClick={() => deleteTask(editTask.id)} className="text-danger lg:order-first lg:mr-auto">
                    <Trash2 className="mr-1.5 h-4 w-4" />Delete
                  </Button>
                )}
              </div>
            </>
          }
        >
            <form id="task-form" onSubmit={submitTask}>
              <div className="space-y-5 p-4 lg:p-5">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium text-ink-soft">Stage <span className="text-danger">*</span></span>
                  <div role="group" aria-label="Stage" className="flex flex-wrap gap-2">
                    {STATUSES.map(st => (
                      <button key={st.value} type="button" aria-pressed={formStatus === st.value}
                        onClick={() => setFormStatus(st.value)}
                        className={cn(
                          'min-h-11 whitespace-nowrap rounded-xl border px-3.5 text-sm lg:min-h-9',
                          formStatus === st.value ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink-soft hover:bg-surface',
                        )}>
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>
                {bulkPunch ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Punch list items <span className="text-danger">*</span></Label>
                    <textarea id="title" rows={7} value={title} onChange={e => setTitle(e.target.value)}
                      placeholder={'Touch up paint in the hallway\nReplace cracked outlet cover - kitchen\nCaulk around the master tub'}
                      autoFocus={autoFocusOnDesktop()}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
                    <p className="text-xs text-faint">One item per line - each line becomes its own punch item.</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="title">Task <span className="text-danger">*</span></Label>
                    <Input id="title" placeholder="e.g. Inspect concrete pour on level 2" value={title} onChange={e => setTitle(e.target.value)} required autoFocus={autoFocusOnDesktop()} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="desc">Details <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea id="desc" rows={2} placeholder="Additional context…" value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="due">Due date <span className="font-normal text-faint">(optional)</span></Label>
                    <Input id="due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="priority">Priority <span className="font-normal text-faint">(optional)</span></Label>
                    <Select id="priority" value={priority} onChange={e => setPriority(e.target.value)}>
                      {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </Select>
                  </div>
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-ink">
                  <input type="checkbox" className="h-4 w-4 accent-[#C9F24A]" checked={isPunch}
                    onChange={e => {
                      const on = e.target.checked
                      setIsPunch(on)
                      if (on && !editTask) { setTaskImage(null); setTaskImagePreview(null) }
                      // Back to one task: the box's lines become one line
                      // rather than vanishing.
                      if (!on && !editTask) setTitle(t => punchLines(t).join('; '))
                    }} />
                  {editTask ? 'Punch item' : isPunch ? 'Punch list' : 'Punch item'}
                  <span className="text-xs text-muted-fg">
                    {editTask ? '- shows under Punch list' : isPunch ? '- add several, one per line' : '- tick to add punch list items'}
                  </span>
                </label>
                <div className="space-y-2">
                  <Label>Assign To <span className="text-faint font-normal">(optional - you can pick more than one)</span></Label>

                  {/* WHO IS ON IT, as chips. A task is one thing to be done
                      and any of them can finish it; the list is not an order
                      of precedence, so nobody is marked "primary". */}
                  {picked.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {picked.map((a, i) => (
                        <span
                          key={`${a.member_id ?? a.company_id ?? a.name}-${i}`}
                          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-2.5 pr-1.5 text-xs font-medium text-ink-soft"
                        >
                          {a.company_id
                            ? <Building2 className="h-3 w-3 shrink-0 text-faint" />
                            : <UserCircle2 className="h-3 w-3 shrink-0 text-faint" />}
                          {assigneeName(a)}
                          <button
                            type="button"
                            onClick={() => setPicked(prev => prev.filter((_, j) => j !== i))}
                            aria-label={`Take ${assigneeName(a)} off this task`}
                            title="Remove"
                            className="rounded-full p-0.5 text-faint hover:bg-muted hover:text-ink"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
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
                    {!(meMemberId && picked.some(a => a.member_id === meMemberId)) && (
                      <button type="button" onClick={assignMe} disabled={addingMe}
                        className="ml-auto flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium border border-line text-muted-fg hover:bg-surface">
                        {addingMe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Me
                      </button>
                    )}
                  </div>

                  {/* THE PICKER ADDS, it does not replace - and it goes back
                      to "-- Select --" after each pick, so the box is never
                      sitting on somebody who is already a chip above. It also
                      stops offering anybody already on the task: a picker must
                      not offer to add what it is already showing you. */}
                  {assigneeType === 'member' && (
                    members.length === 0
                      ? <p className="text-xs text-faint">No crew members on this project yet. Press Me to take it yourself, or add people in the Team tab.</p>
                      : <Select
                          value=""
                          onChange={e => {
                            const m = members.find(x => x.id === e.target.value)
                            if (m) setPicked(prev => normalizeAssignees([...prev, { member_id: m.id, name: m.name }]))
                            e.target.value = ''
                          }}
                        >
                          <option value="">-- Add someone --</option>
                          {members
                            .filter(m => !picked.some(a => a.member_id === m.id))
                            .map(m => <option key={m.id} value={m.id}>{m.name} - {m.role}</option>)}
                        </Select>
                  )}
                  {assigneeType === 'sub' && (
                    subs.length === 0
                      ? <p className="text-xs text-faint">No awarded subcontractors yet. Award bids first.</p>
                      : <Select
                          value=""
                          onChange={e => {
                            const sub = subs.find(x => x.id === e.target.value)
                            const cid = sub?.companies?.id
                            if (cid) setPicked(prev => normalizeAssignees([...prev, { company_id: cid, name: sub?.companies?.name ?? null }]))
                            e.target.value = ''
                          }}
                        >
                          <option value="">-- Add a sub --</option>
                          {subs
                            .filter(sc => !picked.some(a => a.company_id === sc.companies?.id))
                            .map(sc => <option key={sc.id} value={sc.id}>{sc.companies?.name} - {sc.scope}</option>)}
                        </Select>
                  )}
                  {picked.length === 0 && (
                    <p className="text-xs text-faint">Nobody on it yet - it will show as Unassigned.</p>
                  )}
                </div>

                {/* Follow-up (optional scheduled reminder) */}
                <LabelPicker value={formLabels} onChange={setFormLabels} />

                {/* One task, its steps under it. Not offered while pasting a
                    punch list - each line there becomes its own task. */}
                {!bulkPunch && (
                  <SubtaskEditor value={formSubtasks} onChange={setFormSubtasks} people={subtaskPeople} today={today} />
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="followup">Follow-up date <span className="text-faint font-normal">(optional)</span></Label>
                  <Input id="followup" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                  <p className="text-xs text-faint">Set a date to revisit this task - leave blank for none.</p>
                </div>

                {/* Image attachment - one photo belongs to one item, so not
                    while adding a box of punch items. */}
                {!bulkPunch && (
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
                )}
                {editTask && editTask.status === 'completed' && taskCompanyId(editTask) && (
                  <Button type="button" variant="outline" onClick={() => openInvoiceModal(editTask)}>
                    <Receipt className="mr-1.5 h-4 w-4" />Create an invoice from this task
                  </Button>
                )}
              </div>
            </form>
        </TaskDrawer>
      )}

      {/* ── Create Invoice modal ───────────────────────────────────────────── */}
      {invoiceTask && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink">Create Invoice</h2>
                <p className="text-xs text-muted-fg mt-0.5">For {taskCompanyName(invoiceTask) ?? assigneeLabel(invoiceTask.assignees)} · {invoiceTask.title}</p>
              </div>
              <button onClick={() => setInvoiceTask(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createInvoiceFromTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Amount <span className="text-danger">*</span></Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                    <Input type="number" step="0.01" min="0" required value={invoiceAmount} onChange={e => setInvoiceAmount(e.target.value)} className="pl-7" placeholder="0.00" autoFocus={autoFocusOnDesktop()} />
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
              <div className="row-even px-4 sm:px-6 py-4 border-t border-line-soft lg:flex lg:flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setInvoiceTask(null)}>Cancel</Button>
                <Button type="submit" disabled={creatingInvoice || !invoiceAmount}>{creatingInvoice ? 'Creating…' : 'Create Invoice'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Tasks</h1>
          <p className="mt-1 text-sm text-muted-fg">Assign and track work across your crew and subcontractors.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* The same segmented switch Project Management has. */}
          <div role="group" aria-label="View" className="inline-flex rounded-xl bg-muted p-1">
            {([['board', 'Board'], ['list', 'Table'], ['assignee', 'By assignee'], ['calendar', 'Calendar']] as [ViewMode, string][]).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={viewMode === key} onClick={() => setViewMode(key)}
                className={cn('min-h-9 whitespace-nowrap rounded-lg px-3 text-sm', viewMode === key ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft')}>
                {label}
              </button>
            ))}
          </div>
          {canCreateTask && <Button onClick={() => openAddForm()}><Plus className="h-4 w-4" />New Task</Button>}
        </div>
      </div>

      {/* ── The filters, which ARE the counts ─────────────────────────────
          One row instead of two. `scroll-fade` stays: with the scrollbar
          hidden, the fade on the right edge is the only sign to a phone that
          the strip keeps going. */}
      <div className="scroll-fade hidden lg:flex -mb-1 items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {FILTERS.map(f => {
          const active = filterMode === f.key
          if ((f.key === 'overdue' || f.key === 'punch') && f.count === 0 && !active) return null
          return (
            <button
              key={f.key}
              onClick={() => setFilterMode(f.key)}
              title={f.note}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                active
                  ? f.danger
                    ? 'border-danger bg-danger-solid text-white'
                    : 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-panel text-muted-fg hover:border-muted2 hover:bg-surface',
              )}
            >
              {f.label}
              <span className={cn(
                'whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-bold leading-none tabular-nums',
                active ? 'bg-panel/20 text-white' : f.danger ? 'bg-danger-tint text-danger' : 'bg-muted text-muted-fg',
              )}>
                {f.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Same five, as the one card with hairline dividers a phone gets for
          related numbers. A StatStrip cell can be a filter (onClick + active) -
          the Projects list already uses them that way. */}
      <StatStrip
        className="lg:hidden"
        items={FILTERS
          .filter(f => (f.key !== 'overdue' && f.key !== 'punch') || f.count > 0 || filterMode === f.key)
          .map(f => ({
            label: f.short,
            value: f.count,
            note: f.note,
            tone: f.danger ? ('danger' as const) : undefined,
            onClick: () => setFilterMode(f.key),
            active: filterMode === f.key,
          }))}
      />

      {/* ── Search and the label filter ──────────────────────────────────── */}
      {totalCount > 0 && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="relative min-w-0 flex-1 lg:max-w-xs">
            <Label htmlFor="task-search" className="sr-only">Search tasks</Label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input id="task-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search tasks, subtasks and people" className="pl-9" />
          </div>
          {labelsInUse.length > 0 && (
            <div className="lg:w-48">
              <Label htmlFor="task-label-filter" className="sr-only">Label</Label>
              <Select id="task-label-filter" value={labelFilter} onChange={e => setLabelFilter(e.target.value)}>
                <option value="">Every label</option>
                {labelsInUse.map(name => <option key={name} value={name}>{name}</option>)}
              </Select>
            </div>
          )}
          {(query || labelFilter) && (
            <p className="text-xs text-muted-fg lg:pb-2">
              Showing {filteredTasks.length} of {totalCount}.{' '}
              <button type="button" className="font-medium text-accent-fg hover:underline" onClick={() => { setQuery(''); setLabelFilter('') }}>Show all</button>
            </p>
          )}
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
          {viewMode === 'calendar' && (
            <MonthCalendar entries={calendarEntries} today={today}
              footnote={offCalendar ? `${offCalendar} ${offCalendar === 1 ? 'task has' : 'tasks have'} no due date and no dated subtask, so ${offCalendar === 1 ? 'it is' : 'they are'} not on the calendar.` : undefined} />
          )}
        </>
      )}
    </div>
  )
}

/** The small mark a punch item carries on the board and in the list. */
function PunchTag() {
  return (
    <span className="mr-1.5 inline-flex items-center whitespace-nowrap rounded-full bg-warn-tint px-1.5 py-0.5 align-middle text-[10px] font-semibold text-warn">
      Punch
    </span>
  )
}
