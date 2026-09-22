'use client'

import { useEffect, useRef, useState } from 'react'
import { CascadeReview, type CascadeMove, type CascadeSkip, type AffectedSub } from '@/components/schedule/cascade-review'
import type { ChangeWarning } from '@/lib/schedule-change-warning'
import { DependencyPicker, type PickableLine, type ExistingDependency, type PendingDependency } from '@/components/schedule/dependency-picker'
import type { LineKind } from '@/lib/schedule-link-words'
import { useRouter } from 'next/navigation'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { Plus, X, CalendarDays, Pencil, Trash2, Building2, Flag, ChevronLeft, ChevronRight, GanttChartSquare, List, CalendarRange, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  calendarEvents, eventsOn, isDelivery, scheduleLabel, scheduleSubLabel,
  type CalendarEvent, type ScheduleItemRow,
} from '@/lib/schedule-events'
import { useViewerContext } from '@/lib/use-viewer-context'
import { SubSchedule } from '@/components/projects/sub-schedule'
import { DayDetailSheet } from '@/components/calendar/day-detail-sheet'
import { useDeleteGuard } from '@/components/ui/delete-guard'

import { formatDate, formatDateShort, todayDateInput } from '@/lib/dates'
const MILESTONE_COLORS = [
  { label: 'Blue',   value: 'blue',   bg: 'bg-info-solid',   light: 'bg-info-tint text-info border-info/30' },
  { label: 'Green',  value: 'green',  bg: 'bg-success-solid',  light: 'bg-success-tint text-success border-success/30' },
  { label: 'Purple', value: 'purple', bg: 'bg-purple-500', light: 'bg-special-tint text-special border-special/30' },
  { label: 'Red',    value: 'red',    bg: 'bg-danger-solid',    light: 'bg-danger-tint text-danger border-danger/30' },
  { label: 'Amber',  value: 'amber',  bg: 'bg-warn-solid',  light: 'bg-warn-tint text-warn border-warn/30' },
]

const SUB_BAR = 'bg-accent'
const SUB_LIGHT = 'bg-accent-tint text-accent-fg border-accent/40'
// Supplier deliveries get their own (amber) treatment
const DELIVERY_BAR = 'bg-warn-solid'
const DELIVERY_LIGHT = 'bg-warn-tint text-warn border-warn/40'

// The NAME of a bar and what it is come from lib/schedule-events.ts, beside the
// day maths, so the calendar and the list cannot end up with two opinions about
// what a row is called. The COLOURS stay here, where MILESTONE_COLORS feeds the
// add and edit dialogs too.
type ScheduleItem = ScheduleItemRow
const getLabel = scheduleLabel
const getSubLabel = scheduleSubLabel

function barColor(item: ScheduleItem) {
  if (isDelivery(item)) return DELIVERY_BAR
  if (item.subcontract_id) return SUB_BAR
  const c = MILESTONE_COLORS.find(c => c.value === item.color)
  return c?.bg ?? 'bg-faint'
}

function lightColor(item: ScheduleItem) {
  if (isDelivery(item)) return DELIVERY_LIGHT
  if (item.subcontract_id) return SUB_LIGHT
  const c = MILESTONE_COLORS.find(c => c.value === item.color)
  return c?.light ?? 'bg-muted text-ink-soft border-line'
}

// ── what an event looks like away from its pill ─────────────────────────────
// The month grid on a phone is dots (see the cell below) and the day sheet is
// a list, so both need an event's colour and its second line without the pill
// markup around them.

function eventDot(e: CalendarEvent): string {
  if (e.kind === 'schedule' && e.item) return barColor(e.item)
  return e.kind === 'inspection' ? 'bg-info' : 'bg-faint'
}

function eventSubtitle(e: CalendarEvent): string {
  if (e.kind === 'schedule' && e.item) return getSubLabel(e.item) ?? 'Schedule'
  const what = e.kind === 'inspection' ? 'Inspection' : 'Task'
  return e.detail ? `${what} · ${e.detail}` : what
}

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000))
}

function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}



// Local YYYY-MM-DD (avoids UTC offset bugs)
function ymd(dt: Date) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

// 6-week grid (Sun→Sat) covering the given month
function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const weeks: Date[][] = []
  const d = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
  }
  return weeks
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * A save failure the user can actually see and act on.
 *
 * Replaces `alert()` (and, worse, the two handlers that reported nothing at
 * all). Every message it shows ends by saying whether anything was written,
 * because "did that save?" is the only question worth answering here.
 */
function ErrorNote({ message, className }: { message: string; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2', className)}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <p className="text-sm text-ink-soft">{message}</p>
    </div>
  )
}

export default function SchedulePage({ params }: { params: { id: string } }) {
  const { can } = usePermissions()
  const canEditSchedule = can('schedule', 'create') || can('schedule', 'edit')
  const supabase = createClient()
  const vc = useViewerContext(params.id)
  const [items, setItems] = useState<ScheduleItem[]>([])
  // The job's other dated things. The calendar draws them; Timeline and List
  // deliberately do not - see the comment above the month grid.
  const router = useRouter()
  const [inspections, setInspections] = useState<any[]>([])
  const [dueTasks, setDueTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'timeline' | 'list'>('calendar')
  const [calCursor, setCalCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const calInit = useState({ done: false })[0]

  const [showAdd, setShowAdd] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addColor, setAddColor] = useState('blue')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const [editItem, setEditItem] = useState<ScheduleItem | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editColor, setEditColor] = useState('blue')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // The dependency picker inside the edit dialog, and the review screen that
  // stands between a date change and a sub's inbox.
  const guardDelete = useDeleteGuard()
  // Stored WITHOUT `predecessorKind`; it is derived from the lines on screen
  // (see `depsWithKind`) so a saved link reads the way a staged one does.
  const [deps, setDeps] = useState<Omit<ExistingDependency, 'predecessorKind'>[]>([])
  // An empty list is not an answer until this says so - see the picker.
  const [depsState, setDepsState] = useState<'loading' | 'ready' | 'failed'>('loading')
  // Which line the in-flight request is FOR. Opening one row, closing it and
  // opening another lets the first response land last and paint the wrong
  // line's links - which is the same bug wearing different clothes.
  const depsFor = useRef<string | null>(null)
  // NOTHING in the dependency picker saves on its own. Links built there are
  // staged here and written by Save Changes, and a saved link somebody removes
  // is staged too - one dialog, one save, and Cancel really cancels.
  const [pendingDeps, setPendingDeps] = useState<PendingDependency[]>([])
  const [removingDeps, setRemovingDeps] = useState<string[]>([])
  const [pending, setPending] = useState<
    {
      moves: CascadeMove[]; skipped: CascadeSkip[]; affected: AffectedSub[]
      warning: ChangeWarning | null
      start: string; end: string; justLinked: boolean
    } | null
  >(null)

  const [unscheduled, setUnscheduled] = useState<{ id: string; scope: string; trade: string | null; companies: { id: string; name: string; type?: string } | null }[]>([])
  const [schedulingSubId, setSchedulingSubId] = useState<string | null>(null)
  // The dialog needs the vendor's NAME for its heading and whether this is a
  // delivery (one date) or a span (two) - neither is derivable from the id.
  const [schedSubName, setSchedSubName] = useState('')
  const [schedIsDelivery, setSchedIsDelivery] = useState(false)
  const [schedStart, setSchedStart] = useState('')
  const [schedEnd, setSchedEnd] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedError, setSchedError] = useState<string | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  /**
   * Returns the fresh list as well as setting it.
   *
   * A caller that has just created a line cannot read `items` for it - the
   * state update is not visible in the same closure - and the row the POST
   * hands back is the BARE row, with no `subcontracts` join. `scheduleLabel`
   * reads that join to name a sub's line, so opening the POST row directly
   * titles the dialog "Untitled". The loaded list is the shape the rest of
   * this page already uses.
   */
  async function load(): Promise<ScheduleItem[]> {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    let fresh: ScheduleItem[] = []
    if (res.ok) {
      const data = await res.json()
      fresh = data.items ?? []
      setItems(fresh)
      setInspections(data.inspections ?? [])
      setDueTasks(data.tasks ?? [])
    }
    setLoading(false)
    return fresh
  }

  async function loadUnscheduled() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule/unscheduled`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setUnscheduled(d.subs ?? [])
    }
  }

  /**
   * A request that always finishes, one way or another.
   *
   * Every save on this page did a bare `await fetch(...)` with no catch. When
   * the request threw or never resolved - which is exactly what happened while
   * middleware was timing out with a 504 - `setSaving(false)` never ran, so the
   * button sat on "Saving…" forever with no error, no retry, and no clue that
   * nothing had been written.
   *
   * AbortController gives it a ceiling. 20s is well past a healthy save and
   * well short of a person deciding the app is broken.
   */
  async function saveRequest(url: string, init: RequestInit): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 20_000)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      if (!res.ok) {
        const body = await res.json().catch(() => ({} as any))
        return { ok: false, error: body?.error ?? `Save failed (${res.status}). Nothing was saved.` }
      }
      // The created row comes back with it. Without this a caller that has
      // just made a line has no id for it, which is what left "depends on
      // another trade?" unreachable from both Add flows.
      return { ok: true, data: await res.json().catch(() => null) }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.name === 'AbortError'
          ? 'That took too long and was cancelled - nothing was saved. Check your connection and try again.'
          : 'Could not reach the server - nothing was saved. Check your connection and try again.',
      }
    } finally {
      // Runs on every path, which is the entire point.
      clearTimeout(timer)
    }
  }

  async function scheduleSubcontract(e: React.FormEvent) {
    e.preventDefault()
    if (!schedulingSubId) return
    // Asked at the field, with our own words. A server's answer can only ever
    // arrive as a message about a whole request that did not happen.
    const missing = missingSchedule({ start: schedStart, end: schedEnd, delivery: schedIsDelivery })
    if (missing) { setSchedError(missing); return }
    setSchedSaving(true)
    setSchedError(null)
    const token = await getToken()
    const r = await saveRequest(`/api/projects/${params.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subcontract_id: schedulingSubId, start_date: schedStart, end_date: schedEnd || schedStart }),
    })
    setSchedSaving(false)
    if (!r.ok) { setSchedError(r.error); return }
    setSchedulingSubId(null); setSchedStart(''); setSchedEnd('')
    // THE SPEC SAYS CREATING **OR** EDITING. The picker lived only in the edit
    // dialog, so on a job with nothing scheduled yet - which is exactly what
    // the "vendors not yet scheduled" strip means - there was no line to open
    // and the whole feature was unreachable. Dates first, then the prompt.
    const fresh = await load(); loadUnscheduled()
    const created = fresh.find(i => i.id === r.data?.item?.id)
    if (created) openEdit(created)
  }

  useEffect(() => { load(); loadUnscheduled() }, [params.id])

  /**
   * Where the calendar lands the first time data arrives.
   *
   * It used to jump to the EARLIEST scheduled item, always. On a job that has
   * not started that is right; on an active one it opened months in the past
   * (or, with a long lead item, the future) and the first thing you did every
   * time was navigate back to now.
   *
   * Today, clamped into the schedule's own span - which needs no extra
   * request, and answers all three cases correctly:
   *   * today inside the schedule  -> today, the month you are working in
   *   * schedule entirely ahead    -> its start, because there is nothing yet
   *   * schedule entirely behind   -> its end, the last month with any work
   */
  useEffect(() => {
    if (calInit.done || items.length === 0) return
    const first = items.reduce((m, i) => (i.start_date < m ? i.start_date : m), items[0].start_date)
    const last = items.reduce((m, i) => {
      const end = i.end_date ?? i.start_date
      return end > m ? end : m
    }, items[0].end_date ?? items[0].start_date)

    const today = new Date()
    const monthOf = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return new Date(d.getFullYear(), d.getMonth(), 1) }
    const todayMonth = new Date(today.getFullYear(), today.getMonth(), 1)

    const target =
      todayMonth < monthOf(first) ? monthOf(first)
      : todayMonth > monthOf(last) ? monthOf(last)
      : todayMonth

    setCalCursor(target)
    calInit.done = true
  }, [items, calInit])

  /**
   * What a milestone is still missing, in words, or null when it is complete.
   *
   * Shared by Add and Edit so the two dialogs cannot disagree about what a
   * milestone needs - and it names the FIELD, which is the whole complaint: a
   * greyed-out button is not a validation message.
   */
  function missingMilestone(m: { label: string; start: string; end: string }): string | null {
    if (!m.label.trim()) return 'Give the milestone a name - it is what shows on the schedule.'
    if (!m.start) return 'A milestone needs a start date.'
    if (!m.end) return 'A milestone needs an end date.'
    // Not asked for, but the pair is right here and a backwards milestone draws
    // a bar with no width.
    if (m.end < m.start) return 'The end date is before the start date.'
    return null
  }

  /**
   * What a vendor's dates are still missing, in words.
   *
   * Beside `missingMilestone` on purpose: the two ways of putting a line on the
   * schedule answer to the same shape, and a rule written into only one of them
   * is a rule half the app has never heard of.
   *
   * The inline row this replaces had NO validation of its own - it leaned on
   * `required`, so the answer was the browser's grey "Please fill out this
   * field" bubble, pointing at an unlabelled box. Our own sentence names the
   * field the way the form does.
   */
  function missingSchedule(m: { start: string; end: string; delivery: boolean }): string | null {
    if (!m.start) return m.delivery ? 'Pick the delivery date.' : 'Pick the start date.'
    if (!m.delivery) {
      if (!m.end) return 'Pick the end date.'
      if (m.end < m.start) return 'The end date is before the start date.'
    }
    return null
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    // A disabled button explains nothing - it used to be disabled until all
    // three were filled in, so pressing it did nothing and never said which
    // one it was waiting on.
    const missing = missingMilestone({ label: addLabel, start: addStart, end: addEnd })
    if (missing) { setAddError(missing); return }
    setAddSaving(true)
    const token = await getToken()
    // This used to ignore the response entirely: a failed add closed the modal
    // and cleared the fields, so it looked exactly like a success.
    const r = await saveRequest(`/api/projects/${params.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: addLabel, start_date: addStart, end_date: addEnd, color: addColor }),
    })
    setAddSaving(false)
    if (!r.ok) { setAddError(r.error); return }
    setShowAdd(false)
    setAddLabel(''); setAddStart(''); setAddEnd(''); setAddColor('blue')
    const fresh = await load(); loadUnscheduled()
    const created = fresh.find(i => i.id === r.data?.item?.id)
    if (created) openEdit(created)
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    const missing = missingMilestone({ label: editLabel, start: editStart, end: editEnd })
    if (missing) { setEditError(missing); return }
    setEditSaving(true)
    setEditError(null)
    const token = await getToken()

    // Links first: a cascade preview computed before they exist would show the
    // wrong set of lines moving, and the review screen is the whole point.
    // Read BEFORE committing - `commitDependencies` clears the staging lists.
    const justLinked = pendingDeps.length > 0
    const depProblem = await commitDependencies(editItem.id)
    if (depProblem) { setEditSaving(false); setEditError(depProblem); return }
    // A DATE CHANGE IS NOT A FIELD EDIT. If the dates moved, ask what else
    // moves with them and show it BEFORE anything is written - the review
    // screen is the only thing standing between a slipped trade and a batch of
    // emails, and it is worth nothing if the write has already happened.
    const datesMoved = editStart !== editItem.start_date || editEnd !== editItem.end_date
    if (datesMoved) {
      const preview = await fetch(`/api/projects/${params.id}/schedule/${editItem.id}/cascade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // LINKING IS THE LATER WORD. A save that creates a link is not a save
        // that drops this line out of a chain, so the warning must not say so.
        body: JSON.stringify({ start_date: editStart, end_date: editEnd, just_linked: justLinked }),
      })
      setEditSaving(false)
      if (!preview.ok) {
        const d = await preview.json().catch(() => null)
        setEditError(d?.error ?? `Could not work out what would move (${preview.status}).`)
        return
      }
      const p = await preview.json()
      // Save the label and colour now; the dates go through the review.
      await saveRequest(`/api/projects/${params.id}/schedule/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: editLabel, color: editColor }),
      })

      const moves = p.moves ?? []
      const skipped = p.skipped ?? []
      const warning: ChangeWarning | null = p.warning ?? null

      // NOTHING TO REVIEW IS NOT A REVIEW - but "no rows moved" was never the
      // right test for that, and using it was the bug.
      //
      // The rule stands: the review exists to stand between a cascade and a
      // sub's inbox, and with nobody to tell it must not ask whether to tell
      // them. What it got wrong is that a change which moves NOBODY is itself
      // the thing worth saying. On this database that is most jobs - 121
      // schedule lines carry five links between them - so the commonest
      // outcome of moving a date was a silent save, indistinguishable from a
      // feature that had not fired. Reported as exactly that.
      //
      // So the skip is now gated on `warning.silent`, which is false whenever
      // there is something to say: nothing is linked, a follower is pinned by
      // hand, the finish did not actually move, or THIS line is dropping out
      // of its own chain. When it is silent, notify is FALSE and not a guess -
      // there is nobody on the list.
      if (!moves.length && !skipped.length && (!warning || warning.silent)) {
        await applyCascade(false, { start: editStart, end: editEnd, justLinked })
        return
      }

      setPending({
        moves, skipped, affected: p.affected ?? [], warning,
        start: editStart, end: editEnd, justLinked,
      })
      return
    }

    const r = await saveRequest(`/api/projects/${params.id}/schedule/${editItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: editLabel, color: editColor }),
    })
    setEditSaving(false)
    if (!r.ok) { setEditError(r.error); return }
    setEditItem(null)
    load(); loadUnscheduled()
  }

  async function loadDeps(itemId: string) {
    depsFor.current = itemId
    setDepsState('loading')
    /** False once this request is no longer the one the dialog is waiting for. */
    const current = () => depsFor.current === itemId

    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/schedule/${itemId}/dependencies`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!current()) return
      if (!res.ok) {
        // A FAILED READ IS NOT AN EMPTY ONE. Saying "nothing" here is how a
        // stale token tells somebody their links are gone.
        console.error('[schedule/deps] could not load', itemId, res.status)
        setDeps([]); setDepsState('failed'); return
      }
      const d = await res.json()
      if (!current()) return
      setDeps((d.dependencies ?? []).map((x: any) => ({
        id: x.id,
        predecessor_task_id: x.predecessor_task_id,
        min_predecessor_progress: x.min_predecessor_progress,
        lag_days: x.lag_days ?? 0,
        predecessorName: x.predecessor?.trade || x.predecessor?.label || 'an unnamed line',
      })))
      setDepsState('ready')
    } catch (e) {
      // try/catch/finally, always - a throw here used to leave nothing at all.
      console.error('[schedule/deps] load threw', e)
      if (current()) { setDeps([]); setDepsState('failed') }
    }
  }

  /**
   * Write the staged links. Returns the first reason it could not, or null.
   *
   * Run from `saveEdit`, never from the picker - the picker is a form, not a
   * save button. Removals go first so freeing a pair cannot collide with the
   * unique index when somebody swaps one link for another in a single sitting.
   */
  async function commitDependencies(itemId: string): Promise<string | null> {
    if (!pendingDeps.length && !removingDeps.length) return null
    const token = await getToken()

    for (const id of removingDeps) {
      const res = await fetch(`/api/projects/${params.id}/schedule/${itemId}/dependencies?dependency_id=${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (!res || !res.ok) {
        console.error('[schedule/deps] could not unlink', id)
        return 'Could not remove one of the links. Nothing else was changed.'
      }
    }

    for (const d of pendingDeps) {
      const res = await fetch(`/api/projects/${params.id}/schedule/${itemId}/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          predecessor_task_id: d.predecessor_task_id,
          min_predecessor_progress: d.min_predecessor_progress,
          lag_days: d.lag_days,
        }),
      }).catch(() => null)
      if (!res || !res.ok) {
        // The route NAMES the loop when it refuses one - showing its own
        // sentence is the difference between "circular dependency" and knowing
        // which link to cut.
        const why = res ? (await res.json().catch(() => null))?.error : null
        const reason = why ?? `Could not link ${d.predecessorName}.`
        console.error('[schedule/deps]', reason)
        return reason
      }
    }

    setPendingDeps([]); setRemovingDeps([])
    await loadDeps(itemId)
    return null
  }

  /** A placeholder line: a trade and rough dates, nobody assigned yet. */
  async function addPlaceholder(trade: string): Promise<PickableLine | null> {
    const token = await getToken()
    const start = editStart || todayDateInput()
    const res = await fetch(`/api/projects/${params.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: trade, trade, start_date: start, end_date: start, color: 'slate' }),
    })
    if (!res.ok) {
      console.error('[schedule/placeholder]', (await res.json().catch(() => null))?.error ?? res.status)
      return null
    }
    const { item } = await res.json()
    await load()
    // A placeholder is work by definition - nobody adds a placeholder for a
    // delivery they have not booked.
    return { id: item.id, name: trade, start_date: item.start_date, end_date: item.end_date, hasSub: false, kind: 'work' as const }
  }

  /** Everything on this project that could be waited for. */
  const pickableLines: PickableLine[] = items.map(i => ({
    id: i.id,
    // A DELIVERY KEEPS ITS OWN NAME. `trade` wins for a work line, because
    // "Electrical" beats a scope paragraph - but on a supplier line it hides
    // "Delivery - ACME Supply" behind whatever trade was typed on the row, and
    // then the picker offers a delivery that does not say it is one.
    name: isDelivery(i) ? getLabel(i) : ((i as any).trade || getLabel(i)),
    start_date: i.start_date,
    end_date: i.end_date,
    hasSub: !!i.subcontract_id,
    kind: isDelivery(i) ? ('delivery' as const) : ('work' as const),
  }))

  /**
   * A SAVED LINK HAS TO READ THE WAY A STAGED ONE DOES.
   *
   * The kind is derived from the lines already on screen rather than carried
   * back by the dependencies route - one source for "is this a delivery". Read
   * it off the route instead and a link reads "Once the ACME delivery lands"
   * while you are building it and "After ACME" the moment you save, which is
   * the two-wordings-of-one-fact bug that made the review unusable.
   */
  const kindOf = (id: string): LineKind =>
    pickableLines.find(l => l.id === id)?.kind ?? 'work'

  const depsWithKind: ExistingDependency[] = deps.map(d => ({
    ...d,
    predecessorKind: kindOf(d.predecessor_task_id),
  }))

  /**
   * Apply the move the review screen was shown, and tell the subs or not.
   *
   * The screen and this call name the same dates, so what somebody approved is
   * what happens.
   */
  async function applyCascade(
    notify: boolean,
    dates?: { start: string; end: string; justLinked: boolean },
  ) {
    // `dates` is for the no-review path, which applies before `pending` is
    // ever set. Taking them as an argument rather than reading state keeps the
    // dates the screen showed and the dates that get written the same pair.
    const when = dates ?? (pending
      ? { start: pending.start, end: pending.end, justLinked: pending.justLinked }
      : null)
    if (!editItem || !when) return
    const token = await getToken()
    const r = await saveRequest(`/api/projects/${params.id}/schedule/${editItem.id}/cascade`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        start_date: when.start,
        end_date: when.end,
        notify,
        // A save that just linked this line is not a decision to ignore that
        // link. Without this the dialog writes both and the later one wins.
        dates_overridden: !when.justLinked,
      }),
    })
    if (!r.ok) { setEditError(r.error); setPending(null); return }
    setPending(null); setEditItem(null)
    load(); loadUnscheduled()
  }

  async function deleteItem(itemId: string) {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    // The route REFUSES while other lines wait on this one, and names them.
    // Confirming is a second, explicit request - not a flag on the first.
    if (res.status === 409) {
      const d = await res.json().catch(() => null)
      const dependents: { name: string }[] = d?.dependents ?? []
      guardDelete(async () => {
        const t2 = await getToken()
        await fetch(`/api/projects/${params.id}/schedule/${itemId}?confirm=1`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${t2}` },
        })
        load(); loadUnscheduled()
      }, {
        label: 'this schedule line',
        title: 'Other trades wait on this',
        body: d?.error ?? `${dependents.length} other lines wait on this one.`,
        confirmLabel: 'Delete and unlink',
      })
      return
    }
    load(); loadUnscheduled()
  }

  function openEdit(item: ScheduleItem) {
    setEditItem(item)
    setDeps([]); setDepsState('loading')
    // Clearing these is what makes Cancel mean cancel: staged links from the
    // last line opened would otherwise be written against this one.
    setPendingDeps([]); setRemovingDeps([])
    loadDeps(item.id)
    setEditLabel(getLabel(item))
    setEditStart(item.start_date)
    setEditEnd(item.end_date)
    setEditColor(item.color ?? 'blue')
  }

  const sorted = [...items].sort((a, b) => a.start_date.localeCompare(b.start_date))
  // Everything dated on this job, derived once. The calendar filters it per day.
  const events = calendarEvents({ projectId: params.id, items, inspections, tasks: dueTasks })
  const minDate = sorted.length > 0 ? sorted[0].start_date : new Date().toISOString().split('T')[0]
  const maxDate = sorted.length > 0
    ? sorted.reduce((max, i) => i.end_date > max ? i.end_date : max, sorted[0].end_date)
    : addDays(minDate, 30)
  const totalDays = Math.max(daysBetween(minDate, maxDate), 14)

  const months: { label: string; startDay: number; days: number }[] = []
  let cursor = new Date(minDate + 'T00:00:00')
  const endCursor = new Date(maxDate + 'T00:00:00')
  while (cursor <= endCursor) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const clampedStart = cursor > monthStart ? cursor : monthStart
    const clampedEnd = monthEnd < endCursor ? monthEnd : endCursor
    const startDay = daysBetween(minDate, clampedStart.toISOString().split('T')[0])
    const days = daysBetween(clampedStart.toISOString().split('T')[0], clampedEnd.toISOString().split('T')[0]) + 1
    months.push({ label: formatDate(cursor, { month: 'short', year: 'numeric' }), startDay, days })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  // Sub's own job → simple job-planning schedule (when, how long, crew) with overlap warnings.
  if (!vc.loading && vc.companyType === 'subcontractor' && vc.owns) {
    return <SubSchedule projectId={params.id} />
  }

  return (
    <div className="space-y-6">

      {schedulingSubId && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="flex max-h-full w-full max-w-md min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between gap-2">
              {/* min-w-0 on the title and only the CLOSE button beside it - a
                  dialog's exit is the one control that may never move. */}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold text-ink">{schedSubName}</h2>
                <p className="text-xs text-muted-fg">{schedIsDelivery ? 'When is it being delivered?' : 'When are they on site?'}</p>
              </div>
              <button onClick={() => { setSchedulingSubId(null); setSchedError(null) }}
                aria-label="Close" title="Close" className="shrink-0 text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={scheduleSubcontract} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-4">
                <div className={schedIsDelivery ? 'space-y-1.5' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'}>
                  <div className="space-y-1.5">
                    <Label htmlFor="sstart">
                      {schedIsDelivery ? 'Delivery Date' : 'Start Date'} <span className="text-danger">*</span>
                    </Label>
                    <Input id="sstart" type="date" value={schedStart}
                      onChange={e => setSchedStart(e.target.value)} autoFocus={autoFocusOnDesktop()} />
                  </div>
                  {!schedIsDelivery && (
                    <div className="space-y-1.5">
                      <Label htmlFor="send">End Date <span className="text-danger">*</span></Label>
                      <Input id="send" type="date" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-fg">
                  Once it is on the schedule you can say what it waits for.
                </p>
              </div>
              {schedError && <ErrorNote message={schedError} className="mx-4 sm:mx-6 mb-1" />}
              <div className="row-even shrink-0 px-4 sm:px-6 py-4 border-t border-line-soft lg:flex lg:flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary"
                  onClick={() => { setSchedulingSubId(null); setSchedError(null) }}>Cancel</Button>
                {/* Disabled ONLY for in-flight. Let it fire and answer with the
                    field that is missing. */}
                <Button type="submit" disabled={schedSaving}>
                  {schedSaving ? 'Saving…' : schedIsDelivery ? 'Set Delivery' : 'Set Dates'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          {/* A COLUMN, so the title and the buttons are pinned and only the
              fields between them scroll.
              MEASURED. As a plain block the whole panel scrolled, and at a
              420pt viewport - which is what is left when iOS opens its date
              wheel over the bottom of the screen - "Add Milestone" sat 54px
              BELOW the bottom edge. Reachable only by knowing to scroll inside
              a dialog while a picker covers it. */}
          <div className="flex max-h-full w-full max-w-md min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add Milestone</h2>
              <button onClick={() => setShowAdd(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={addItem} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="alabel">Label <span className="text-danger">*</span></Label>
                  <Input id="alabel" placeholder="e.g. Permits Approved" value={addLabel} onChange={e => setAddLabel(e.target.value)} required autoFocus={autoFocusOnDesktop()} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="astart">Start Date <span className="text-danger">*</span></Label>
                    <Input id="astart" type="date" value={addStart} onChange={e => setAddStart(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aend">End Date <span className="text-danger">*</span></Label>
                    <Input id="aend" type="date" value={addEnd} onChange={e => setAddEnd(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {MILESTONE_COLORS.map(c => (
                      <button key={c.value} type="button" onClick={() => setAddColor(c.value)}
                        className={cn('h-7 w-7 rounded-full transition-all', c.bg, addColor === c.value ? 'ring-2 ring-offset-2 ring-muted2 scale-110' : 'opacity-60 hover:opacity-100')} />
                    ))}
                  </div>
                </div>
              </div>
              {addError && <ErrorNote message={addError} className="mx-4 sm:mx-6 mb-1" />}
              <div className="row-even shrink-0 px-4 sm:px-6 py-4 border-t border-line-soft lg:flex lg:flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); setAddError(null) }}>Cancel</Button>
                <Button type="submit" disabled={addSaving}>
                  {addSaving ? 'Adding...' : 'Add Milestone'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* `!pending` because the review stacks OVER this one otherwise. Two
          overlays open at once left the edit dialog showing through the
          review's backdrop, and Cancel on the review dropped you back into a
          form whose dates had already been decided somewhere else. */}
      {editItem && !pending && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          {/* A COLUMN, so the title and the buttons are pinned and only the
              fields between them scroll.
              MEASURED. As a plain block the whole panel scrolled, and at a
              420pt viewport - which is what is left when iOS opens its date
              wheel over the bottom of the screen - "Add Milestone" sat 54px
              BELOW the bottom edge. Reachable only by knowing to scroll inside
              a dialog while a picker covers it. */}
          <div className="flex max-h-full w-full max-w-md min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl">
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Edit Item</h2>
              <button onClick={() => { setEditItem(null); setPendingDeps([]); setRemovingDeps([]) }} aria-label="Close" title="Close" className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEdit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="elabel">Label</Label>
                  <Input id="elabel" value={editLabel} onChange={e => setEditLabel(e.target.value)} required autoFocus={autoFocusOnDesktop()} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="estart">Start Date</Label>
                    <Input id="estart" type="date" value={editStart} onChange={e => setEditStart(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eend">End Date</Label>
                    <Input id="eend" type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} required />
                  </div>
                </div>

                {/* AFTER the dates, never before: the spec asks "depends on
                    another trade?" once somebody has said when this one is. */}
                <DependencyPicker
                  lines={pickableLines}
                  existing={depsWithKind}
                  existingState={depsState}
                  pending={pendingDeps}
                  removing={removingDeps}
                  selfId={editItem?.id ?? null}
                  onStage={d => setPendingDeps(p => [...p, d])}
                  onUnstage={id => setPendingDeps(p => p.filter(x => x.predecessor_task_id !== id))}
                  onStageRemoval={id => setRemovingDeps(r => [...r, id])}
                  onUndoRemoval={id => setRemovingDeps(r => r.filter(x => x !== id))}
                  onAddPlaceholder={addPlaceholder}
                />
                {!editItem.subcontract_id && (
                  <div className="space-y-1.5">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      {MILESTONE_COLORS.map(c => (
                        <button key={c.value} type="button" onClick={() => setEditColor(c.value)}
                          className={cn('h-7 w-7 rounded-full transition-all', c.bg, editColor === c.value ? 'ring-2 ring-offset-2 ring-muted2 scale-110' : 'opacity-60 hover:opacity-100')} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {editError && (
                <div className="shrink-0 px-4 sm:px-6 pb-2"><ErrorNote message={editError} /></div>
              )}
              {/* Three controls, and on a phone they do NOT all belong on one
                  row. Cancel and Save are the two choices and share a row; the
                  destructive one sits under them, on its own, where it cannot
                  be hit by accident. `col-reverse` so the choices stay nearest
                  the form. A desktop keeps Delete left, actions right. */}
              <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-line-soft flex flex-col-reverse gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between lg:gap-2">
                <button type="button" onClick={() => { deleteItem(editItem.id); setEditItem(null) }}
                  className="flex items-center gap-1.5 self-start text-sm text-danger hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                {/* THIS is the row of controls - the footer around it is a
                    layout. It used to carry the rule as well, so this grid sat
                    inside one cell of that grid: Cancel and Save got a quarter
                    of the dialog each and "Save Changes", which may not wrap,
                    ran out of both sides of its own button. */}
                <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => { setEditItem(null); setEditError(null); setPendingDeps([]); setRemovingDeps([]) }}>Cancel</Button>
                  <Button type="submit" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Schedule</h1>
          <p className="text-sm text-muted-fg mt-0.5">Auto-populated from awarded bids. Add milestones manually.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="inline-flex rounded-lg border border-line bg-panel p-0.5">
            {([
              { key: 'calendar', label: 'Calendar', icon: CalendarRange },
              { key: 'timeline', label: 'Timeline', icon: GanttChartSquare },
              { key: 'list', label: 'List', icon: List },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setView(v.key)}
                className={cn('flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  view === v.key ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:text-ink')}>
                <v.icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>
          {canEditSchedule && <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /><span className="hidden sm:inline">Add Milestone</span></Button>}
        </div>
      </div>

      {unscheduled.length > 0 && (
        <div className="bg-warn-tint border border-warn/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-warn" />
            <span className="text-sm font-semibold text-warn">
              {unscheduled.length} vendor{unscheduled.length > 1 ? 's' : ''} not yet scheduled
            </span>
          </div>
          <div className="space-y-2">
            {unscheduled.map(sub => {
              const isSupplier = sub.companies?.type === 'supplier'
              return (
              <div key={sub.id} className="flex flex-wrap items-center gap-3 bg-panel rounded-lg border border-amber-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-ink-soft">{sub.companies?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-faint truncate">
                    {isSupplier ? 'Supplier · schedule delivery' : (sub.trade ? `${sub.trade} · ` : '') + sub.scope}
                  </p>
                </div>
                {/* THE ROW IS A BUTTON, NOT A FORM. Two unlabelled `h-8 text-xs`
                    date boxes used to live here: 32px tall against the 44px
                    rule, no <Label> on either, "to" as the only hint which was
                    which, and `required` so the only validation anybody saw was
                    the browser's own grey bubble. It opens the same dialog as
                    every other way of putting a line on the schedule. */}
                <Button size="sm" variant="secondary" className="shrink-0" disabled={!canEditSchedule}
                  onClick={() => {
                    setSchedulingSubId(sub.id)
                    setSchedSubName(sub.companies?.name ?? sub.scope ?? 'this vendor')
                    setSchedIsDelivery(isSupplier)
                    setSchedStart(''); setSchedEnd(''); setSchedError(null)
                  }}>
                  <CalendarDays className="h-3.5 w-3.5" /> {isSupplier ? 'Set Delivery' : 'Set Dates'}
                </Button>
              </div>
            )})}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-16 text-center">
          <CalendarDays className="h-10 w-10 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No schedule yet</p>
          <p className="text-xs text-faint mt-1 mb-4">Add subcontractors with dates on the Team tab, or add milestones manually.</p>
          {canEditSchedule && <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Add Milestone</Button>}
        </div>
      ) : (
        <div className="space-y-5">

          {/* Calendar (month grid) */}
          {view === 'calendar' && (() => {
            const year = calCursor.getFullYear()
            const month = calCursor.getMonth()
            const weeks = monthGrid(year, month)
            const todayStr = ymd(new Date())
            return (
              <div className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-line-soft flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-faint" />
                    <span className="text-sm font-semibold text-ink-soft">
                      {formatDate(calCursor, { month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCalCursor(new Date(year, month - 1, 1))}
                      className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-ink"><ChevronLeft className="h-4 w-4" /></button>
                    <button onClick={() => { const d = new Date(); setCalCursor(new Date(d.getFullYear(), d.getMonth(), 1)) }}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-fg hover:bg-muted hover:text-ink">Today</button>
                    <button onClick={() => setCalCursor(new Date(year, month + 1, 1))}
                      className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-ink"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 border-b border-line-soft">
                  {WEEKDAYS.map(d => (
                    <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
                      <span className="sm:hidden">{d[0]}</span><span className="hidden sm:inline">{d}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {weeks.flat().map((day, idx) => {
                    const ds = ymd(day)
                    const inMonth = day.getMonth() === month
                    const isToday = ds === todayStr
                    const dayItems = eventsOn(events, ds)
                    // The whole square is the control when there is anything
                    // on it - the same rule the Master Calendar uses, which is
                    // where this was reported missing.
                    const open = dayItems.length ? () => setSelectedDay(ds) : undefined
                    return (
                      <div key={idx}
                        onClick={open}
                        role={open ? 'button' : undefined}
                        tabIndex={open ? 0 : undefined}
                        aria-label={open ? `${formatDate(day, { month: 'long', day: 'numeric' })}, ${dayItems.length} ${dayItems.length === 1 ? 'item' : 'items'}` : undefined}
                        onKeyDown={open ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open() } } : undefined}
                        className={cn('min-w-0 min-h-[60px] lg:min-h-[104px] border-b border-r border-line-soft p-1.5 align-top',
                          idx % 7 === 0 && 'border-l', !inMonth && 'bg-surface/60',
                          open && 'cursor-pointer hover:bg-surface/60')}>
                        <div className={cn('whitespace-nowrap flex items-center justify-center h-6 w-6 rounded-full text-xs mb-1',
                          isToday ? 'bg-accent text-accent-ink font-bold' : inMonth ? 'text-ink-soft' : 'text-faint')}>
                          {day.getDate()}
                        </div>

                        {/* PHONE: DOTS. Seven columns at 390px is a ~55px
                            square and text cannot live in one - every label
                            came out as "F…" while the times beside them
                            ("5-7pm", "08:00") were `shrink-0` and spilled
                            straight out of their own pill borders. Colour
                            only, which the legend under the grid already
                            explains, and the DAY is what you tap. */}
                        <div className="lg:hidden flex flex-wrap gap-1">
                          {dayItems.slice(0, 6).map(e => (
                            <span key={e.id} className={cn('h-1.5 w-1.5 rounded-full', eventDot(e), e.done && 'opacity-40')} />
                          ))}
                        </div>

                        <div className="hidden lg:block space-y-1">
                          {/* THE CLICK FOLLOWS THE KIND. A schedule bar opens
                              the edit dialog it always did; an inspection or a
                              task goes to its own tab, because nothing in that
                              dialog could save either of them and a control
                              that opens an editor which cannot write is a
                              control that lies. Each stops the event so the
                              pill still does its own thing rather than opening
                              the day sheet behind it. */}
                          {dayItems.slice(0, 3).map(e => (
                            e.kind === 'schedule' && e.item ? (
                              <button key={e.id} onClick={(ev) => { ev.stopPropagation(); openEdit(e.item as ScheduleItem) }}
                                className={cn('w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-left', lightColor(e.item as ScheduleItem))}>
                                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', barColor(e.item as ScheduleItem))} />
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">{e.label}</span>
                              </button>
                            ) : (
                              <Link key={e.id} href={e.href ?? '#'} onClick={(ev) => ev.stopPropagation()}
                                className={cn('w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-left',
                                  e.kind === 'inspection' ? 'bg-info-tint text-info border border-info/30' : 'bg-muted text-ink-soft border border-line',
                                  e.done && 'line-through opacity-60')}>
                                <span className={cn('h-1.5 w-1.5 rounded-full shrink-0',
                                  e.kind === 'inspection' ? 'bg-info' : 'bg-faint')} />
                                {/* ONE TRUNCATING BOX, not two children
                                    fighting over the width. The detail used to
                                    be a `shrink-0` sibling, which is a span
                                    that refuses to get smaller than its own
                                    text - so it did not shorten, it left the
                                    pill. */}
                                <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                                  {e.label}{e.detail && <span className="ml-1 font-normal opacity-70">{e.detail}</span>}
                                </span>
                              </Link>
                            )
                          ))}
                          {dayItems.length > 3 && (
                            <p className="text-[10px] text-faint pl-1">+{dayItems.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* WHAT THE SQUARES MEAN. The calendar is the only one of the
                    three views that draws more than the schedule: Timeline and
                    List are the schedule EDITOR, where every row opens the edit
                    dialog, and an inspection in a list of editable rows is a
                    row that cannot be saved. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line-soft px-4 py-2.5 text-[11px] text-muted-fg">
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Schedule &amp; deliveries</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-info" /> Booked inspections</span>
                  <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-faint" /> Tasks due</span>
                  <span className="text-faint">An inspection waiting to be booked is on the job&apos;s Overview, under Today.</span>
                </div>
              </div>
            )
          })()}

          {/* THE DAY, IN FULL. "When I tap a day it should show the days
              summary like master calendar" - so it is literally the Master
              Calendar's sheet, lifted into a component rather than copied.
              The click still follows the kind: a bar opens its edit dialog,
              an inspection or a task goes to its own tab. */}
          {selectedDay && (
            <DayDetailSheet
              date={selectedDay}
              onClose={() => setSelectedDay(null)}
              rows={eventsOn(events, selectedDay).map(e => ({
                id: e.id,
                title: e.label,
                subtitle: eventSubtitle(e),
                dot: eventDot(e),
                done: e.done,
                onOpen: () => {
                  if (e.kind === 'schedule' && e.item) openEdit(e.item as ScheduleItem)
                  else if (e.href) router.push(e.href)
                },
              }))}
            />
          )}

          {/* Gantt */}
          {view === 'timeline' && (
          <div className="bg-panel rounded-xl border border-line overflow-hidden min-w-0">
            <div className="px-5 py-3 border-b border-line-soft flex items-center gap-2 flex-wrap">
              <CalendarDays className="h-4 w-4 text-faint" />
              <span className="text-sm font-semibold text-ink-soft">Timeline</span>
              <span className="text-xs text-faint ml-1">{formatDateShort(minDate)} - {formatDateShort(maxDate)}</span>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(700, totalDays * 18) + 220 }}>
                <div className="flex border-b border-line-soft" style={{ paddingLeft: 220 }}>
                  {months.map((m, i) => (
                    <div key={i} className="text-xs font-medium text-faint px-2 py-2 border-r border-line-soft shrink-0" style={{ width: m.days * 18 }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-line-soft">
                  {sorted.map(item => {
                    const offsetDays = daysBetween(minDate, item.start_date)
                    const spanDays = daysBetween(item.start_date, item.end_date) + 1
                    return (
                      <div key={item.id} className="flex items-center hover:bg-surface group">
                        <div className="w-[220px] shrink-0 px-4 py-2.5 flex items-center gap-2.5">
                          <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', item.subcontract_id ? 'bg-accent-tint' : 'bg-muted')}>
                            {item.subcontract_id ? <Building2 className="h-3.5 w-3.5 text-accent-fg" /> : <Flag className="h-3.5 w-3.5 text-faint" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink-soft truncate">{getLabel(item)}</p>
                            {getSubLabel(item) && <p className="text-xs text-faint truncate">{getSubLabel(item)}</p>}
                          </div>
                        </div>
                        <div className="flex-1 relative py-2.5 pr-4" style={{ paddingLeft: Math.max(0, offsetDays - 1) * 18 }}>
                          <div
                            className={cn('h-7 rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-80', barColor(item))}
                            style={{ width: Math.max(spanDays * 18, 36) }}
                            onClick={() => openEdit(item)}
                          >
                            <span className="text-xs text-white font-medium truncate">{spanDays}d</span>
                          </div>
                        </div>
                        <div className="pr-3 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openEdit(item)} className="text-faint hover:text-muted-fg p-1 rounded">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* List */}
          {view === 'list' && (
          <div className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-5 py-3 border-b border-line-soft">
              <span className="text-sm font-semibold text-ink-soft">All Items</span>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-line-soft">
              {sorted.map(item => {
                const duration = daysBetween(item.start_date, item.end_date) + 1
                return (
                  <div key={item.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', barColor(item))} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink-soft truncate">{getLabel(item)}</p>
                          {getSubLabel(item) && <p className="text-xs text-faint truncate">{getSubLabel(item)}</p>}
                        </div>
                      </div>
                      <button onClick={() => openEdit(item)} className="text-faint hover:text-muted-fg p-1 rounded shrink-0">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-fg">
                      <span className={cn('whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full border', lightColor(item))}>
                        {item.subcontract_id ? 'Sub Work' : 'Milestone'}
                      </span>
                      <span>{formatDateShort(item.start_date)} - {formatDateShort(item.end_date)}</span>
                      <span className="text-faint">{duration} day{duration !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead className="bg-surface border-b border-line-soft">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-muted-fg">Item</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-fg">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-fg">Start</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-fg">End</th>
                  <th className="text-left px-5 py-3 font-medium text-muted-fg">Duration</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {sorted.map(item => {
                  const duration = daysBetween(item.start_date, item.end_date) + 1
                  return (
                    <tr key={item.id} className="hover:bg-surface">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', barColor(item))} />
                          <span className="font-medium text-ink-soft">{getLabel(item)}</span>
                        </div>
                        {getSubLabel(item) && <p className="text-xs text-faint ml-4 mt-0.5">{getSubLabel(item)}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn('whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full border', lightColor(item))}>
                          {item.subcontract_id ? 'Sub Work' : 'Milestone'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-muted-fg">{formatDateShort(item.start_date)}</td>
                      <td className="px-5 py-3 text-muted-fg">{formatDateShort(item.end_date)}</td>
                      <td className="px-5 py-3 text-muted-fg">{duration} day{duration !== 1 ? 's' : ''}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openEdit(item)} className="text-faint hover:text-muted-fg p-1 rounded">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          )}

        </div>
      )}
          {pending && editItem && (
        <CascadeReview
          moves={pending.moves}
          skipped={pending.skipped}
          affected={pending.affected}
          warning={pending.warning}
          editedName={(editItem as any).trade || getLabel(editItem)}
          onConfirm={applyCascade}
          onCancel={() => { setPending(null); load() }}
        />
      )}
</div>
  )
}
