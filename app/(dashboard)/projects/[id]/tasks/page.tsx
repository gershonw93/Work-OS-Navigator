'use client'

import { useEffect, useRef, useState } from 'react'
import { StatStrip } from '@/components/ui/stat-strip'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import {
  Plus, X, CheckSquare, Circle, Clock, AlertCircle, Trash2,
  Building2, UserCircle2, Receipt, LayoutGrid, List, Users, Pencil,
  MessageSquare, Loader2, ImagePlus, CalendarClock, FileText, Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { SignoffModal } from '@/components/ui/signoff-modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { formatDate } from '@/lib/dates'
import { dueLabel } from '@/lib/task-due'
import { timeAgo, absoluteTime } from '@/lib/time-ago'
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
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

type ViewMode = 'board' | 'list' | 'assignee'
type FilterMode = 'all' | 'open' | 'in_progress' | 'completed' | 'overdue'

// ─── interfaces ──────────────────────────────────────────────────────────────

interface Task {
  id: string; title: string; description: string | null; due_date: string | null
  priority: string; status: string
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
  return task.status !== 'completed' && task.due_date && new Date(task.due_date + 'T00:00:00') < new Date()
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
}

function TaskDetailPanel({ task, notes, notesLoading, onAddNote, projectId, onChanged }: TaskDetailPanelProps) {
  const [noteText, setNoteText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSignoff, setShowSignoff] = useState(false)
  const [signSaving, setSignSaving] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [planPin, setPlanPin] = useState<{ id: string; plan_id: string; page: number } | null>(null)

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
    <div className="border-t border-line-soft bg-surface/60 px-4 py-4 lg:rounded-b-xl">
      <div className="flex flex-col md:flex-row gap-6">
        {/* ── Left: task details ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">
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

          {planPin && (
            <a href={`/projects/${projectId}/plans/${planPin.plan_id}?pin=${planPin.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
              <FileText className="h-4 w-4" /> View pinned spot on the plan
            </a>
          )}

          {task.image_url && (
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

          <div className="flex-1 space-y-2 max-h-48 overflow-y-auto">
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
}: TaskDetailPanelProps & { onClose: () => void }) {
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
          <span className="text-sm font-semibold text-ink">Task detail</span>
          <button
            onClick={onClose}
            aria-label="Close" title="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <TaskDetailPanel
            projectId={projectId}
            onChanged={onChanged}
            task={task}
            notes={notes}
            notesLoading={notesLoading}
            currentUser={currentUser}
            onAddNote={onAddNote}
          />
        </div>
      </div>
    </div>
  )
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
  const { can } = usePermissions()
  const canCreateTask = can('tasks', 'create')
  const supabase = createClient()
  const [tasks, setTasks]     = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [subs, setSubs]       = useState<Sub[]>([])
  const [loading, setLoading] = useState(true)

  // view / filter
  const [viewMode, setViewMode]     = useState<ViewMode>('board')
  const [filterMode, setFilterMode] = useState<FilterMode>('all')

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
  const [assigneeType, setAssigneeType] = useState<'member' | 'sub'>('member')
  const [assignedMemberId, setAssignedMemberId] = useState('')
  const [assignedSubId, setAssignedSubId]       = useState('')
  /** Everyone picked for the task being added or edited. */
  const [picked, setPicked] = useState<TaskAssignee[]>([])
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

  function openTask(taskId: string) {
    setOpenTaskId(taskId)
    loadNotes(taskId)
  }

  // Escape closes it. A drawer over the whole screen with no keyboard way out
  // is a modal that only a mouse can leave.
  useEffect(() => {
    if (!openTaskId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenTaskId(null) }
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
    setTitle(''); setDescription(''); setDueDate(''); setPriority('medium')
    setAssigneeType('member'); setAssignedMemberId(''); setAssignedSubId('')
    setFollowUpDate(''); setTaskImage(null); setTaskImagePreview(null)
    setSaveError(null)
    setEditTask(null)
    setAddStatus(null)
  }

  function openAddForm(defaultStatus?: string) {
    resetForm()
    // resetForm() has just cleared this, so set it after, not before.
    if (defaultStatus && STATUSES.some(s => s.value === defaultStatus)) {
      setAddStatus(defaultStatus)
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
    if (!title.trim()) {
      setSaveError('Give the task a name - it is the line everybody reads on the board.')
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

      const body = JSON.stringify({
        title, description, due_date: dueDate || null, priority,
        assignees,
        image_url, follow_up_date: followUpDate || null,
        // Create only. On PATCH this stays out of the body on purpose: saving
        // an edit must not move the task to whichever column was last used.
        ...(editTask ? {} : addStatus ? { status: addStatus } : {}),
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

  async function deleteTask(taskId: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (openTaskId === taskId) setOpenTaskId(null)
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
  ]

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
          'group cursor-pointer px-4 py-3 transition-colors hover:bg-surface lg:relative lg:flex lg:flex-col lg:rounded-lg lg:border lg:border-line lg:bg-panel lg:p-3 lg:transition-all lg:hover:border-muted2 lg:hover:shadow-sm',
          selected && 'bg-surface lg:border-accent',
        )}
        onClick={() => openTask(task.id)}
      >
        <div className="flex items-start gap-2">
          <PriorityDot priority={task.priority} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className={cn('text-sm font-medium leading-snug text-ink', task.status === 'completed' && 'text-faint line-through')}>
              {task.title}
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
          </div>
          {/* Move it. The status icon IS the control - see StatusPicker. */}
          <StatusPicker status={task.status} onPick={next => updateStatus(task.id, next)} />
        </div>

        {/* THERE IS NO HOVER ON A PHONE. These were `opacity-0` until hover at
            every width, and positioned `absolute` against a parent that is
            only `lg:relative` - so on the phone board they were invisible AND
            in the wrong place. Edit and delete were reported as missing
            entirely, which is what invisible means. The desktop keeps exactly
            what it had. Each is icon-only, so each says what it is. */}
        <div className="mt-2 flex items-center justify-end gap-1 lg:absolute lg:bottom-2 lg:right-2 lg:mt-0 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
          <button
            onClick={e => { e.stopPropagation(); openEditForm(task) }}
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
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
            aria-label={`Delete "${task.title}"`} title="Delete task"
            className="p-1 rounded text-faint hover:text-danger hover:bg-danger-tint transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
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
            onClick={e => { e.stopPropagation(); openEditForm(task) }}
            aria-label={`Edit "${task.title}"`} title="Edit task"
            className="p-1.5 text-faint hover:text-accent-fg rounded transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
            aria-label={`Delete "${task.title}"`} title="Delete task"
            className="p-1.5 text-faint hover:text-danger rounded transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    )
  }

  // ── board view ─────────────────────────────────────────────────────────────

  function BoardView() {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STATUSES.map(col => {
            const colTasks = filteredTasks.filter(t => t.status === col.value)
            return (
              // Keyed on the status. Without it React reuses column DOM across
              // renders by position, so a card dragged between columns can land
              // in the wrong one - caught the first time rules-of-hooks lint ran.
              // NO TINT. Each column was a coloured box - tinted header, tinted
              // background, tinted count pill, tinted border - holding cards
              // that were boxes of their own. Three columns, three colours, a
              // box in a box. The status icon is the one thing in colour; the
              // rest is ink on panel, and the tasks are rows in a list.
              // NO `overflow-hidden` HERE, AND THAT IS THE FIX.
              //
              // It was on this div to keep the tinted header and body inside
              // the rounded corners, and it CLIPPED THE STATUS MENU: the
              // picker on the last card opens downward past the bottom of the
              // column, so "Completed" was painted outside the box and simply
              // not there. Reported as "the dropdown here gets cut off so i
              // cant complete a task" - the one thing the board exists to do.
              //
              // `overflow-hidden` establishes a clipping box on BOTH axes, and
              // clipping is a PAINT operation: the menu still reported its
              // full rectangle, so nothing in the DOM looked wrong. Same trap
              // as a RowMenu inside an `overflow-x-auto`, which this file's
              // working agreement already names - round the CHILDREN that
              // touch an edge instead, which is what the two below now do.
              <div key={col.value} className={cn('flex flex-col rounded-2xl border border-line bg-panel lg:rounded-xl', col.lg.border)}>
                <div className={cn('flex items-center justify-between rounded-t-2xl border-b border-line-soft px-4 py-3 lg:rounded-t-xl lg:border-b-0 lg:px-3 lg:py-2.5', col.lg.headerBg)}>
                  <div className="flex min-w-0 items-center gap-2">
                    <col.icon className={cn('h-4 w-4 shrink-0', col.color)} />
                    <span className={cn('truncate text-sm font-semibold text-ink', col.lg.headerText)}>{col.label}</span>
                    <span className={cn('whitespace-nowrap text-sm tabular-nums text-faint lg:min-w-[1.25rem] lg:rounded-full lg:border lg:px-1.5 lg:py-0.5 lg:text-center lg:text-xs lg:font-bold', col.lg.headerBg, col.lg.headerText, col.lg.border)}>{colTasks.length}</span>
                  </div>
                  <button
                    onClick={() => openAddForm(col.value)}
                    title={`Add ${col.label} task`}
                    className={cn('-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink lg:mr-0 lg:h-auto lg:w-auto lg:rounded lg:p-1 lg:hover:bg-black/5', col.lg.headerText)}
                  >
                    <Plus className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
                  </button>
                </div>

                {/* Rounded at the bottom for the same reason, and the LAST
                    CHILD is rounded too: rounding a box does not clip what is
                    painted inside it, so a selected last row would otherwise
                    square the corner off again. At `lg` the cards sit inside
                    `lg:p-2` and touch no edge, so it is turned back off. */}
                <div className={cn('flex-1 divide-y divide-line-soft min-h-[120px] rounded-b-2xl [&>*:last-child]:rounded-b-2xl lg:divide-y-0 lg:space-y-2 lg:rounded-b-xl lg:p-2 lg:[&>*:last-child]:rounded-b-none', col.lg.col)}>
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
    )
  }

  // ── list view ──────────────────────────────────────────────────────────────

  function ListView() {
    return (
      <div className="space-y-6">
        {generalTasks.length > 0 && (
          <div className="space-y-3 lg:space-y-2">
            <div className="flex items-center gap-3 px-1">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">General Tasks</p>
              <span className="whitespace-nowrap text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{generalTasks.length}</span>
              <GroupProgressBar tasks={generalTasks} />
            </div>
            {/* No `overflow-hidden`: the same status menu lives in these rows
                and the last row's opens below them. See the board column. */}
            <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel [&>*:first-child]:rounded-t-2xl [&>*:last-child]:rounded-b-2xl lg:rounded-xl lg:[&>*:first-child]:rounded-t-xl lg:[&>*:last-child]:rounded-b-xl">
              {generalTasks.map(task => <ListCard key={task.id} task={task} />)}
            </div>
          </div>
        )}
        {Object.entries(subGroups).map(([companyId, group]) => (
          <div key={companyId} className="space-y-3 lg:space-y-2">
            <div className="flex items-center gap-2 px-1 flex-wrap">
              <Building2 className="h-3.5 w-3.5 text-faint" />
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
        {filteredTasks.length === 0 && <EmptyState />}
      </div>
    )
  }

  // ── assignee view ──────────────────────────────────────────────────────────

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

  const formTitle = editTask ? 'Edit Task' : 'New Task'
  const submitLabel = saving ? (editTask ? 'Saving…' : 'Creating…') : (editTask ? 'Save Changes' : 'Create Task')

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* ── New / Edit Task modal ──────────────────────────────────────────── */}
      {showAdd && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">{formTitle}</h2>
                {/* Say where it will land BEFORE they save, not after. */}
                {!editTask && addStatus && (
                  <p className="text-xs text-muted-fg">
                    Adding to{' '}
                    <span className="font-semibold text-ink">
                      {STATUSES.find(s => s.value === addStatus)?.label}
                    </span>
                  </p>
                )}
              </div>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitTask}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="title">Task <span className="text-danger">*</span></Label>
                  <Input id="title" placeholder="e.g. Inspect concrete pour on level 2" value={title} onChange={e => setTitle(e.target.value)} required autoFocus={autoFocusOnDesktop()} />
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
                  </div>

                  {/* THE PICKER ADDS, it does not replace - and it goes back
                      to "-- Select --" after each pick, so the box is never
                      sitting on somebody who is already a chip above. It also
                      stops offering anybody already on the task: a picker must
                      not offer to add what it is already showing you. */}
                  {assigneeType === 'member' && (
                    members.length === 0
                      ? <p className="text-xs text-faint">No crew members on this project yet. Add them in the Team tab.</p>
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
                <div className="space-y-1.5">
                  <Label htmlFor="followup">Follow-up date <span className="text-faint font-normal">(optional)</span></Label>
                  <Input id="followup" type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
                  <p className="text-xs text-faint">Set a date to revisit this task - leave blank for none.</p>
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
                <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); resetForm() }}>Cancel</Button>
                  <Button type="submit" disabled={saving}>{submitLabel}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
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
          if (f.key === 'overdue' && f.count === 0 && !active) return null
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
          .filter(f => f.key !== 'overdue' || f.count > 0 || filterMode === 'overdue')
          .map(f => ({
            label: f.short,
            value: f.count,
            note: f.note,
            tone: f.danger ? ('danger' as const) : undefined,
            onClick: () => setFilterMode(f.key),
            active: filterMode === f.key,
          }))}
      />

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
          {/* ONE drawer for all three views, mounted outside them: a task
              opened from the list and a task opened from the board are the
              same panel, so they cannot drift. */}
          {openTask_ && (
            <TaskDrawer
              task={openTask_}
              projectId={params.id}
              notes={notesCache[openTask_.id] ?? []}
              notesLoading={!!notesLoading[openTask_.id]}
              currentUser={currentUser}
              onClose={() => setOpenTaskId(null)}
              onAddNote={handleAddNote}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  )
}
