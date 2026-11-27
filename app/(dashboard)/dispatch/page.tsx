'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotice } from '@/components/ui/notice'
import { NewCallDialog } from '@/components/service-calls/new-call-dialog'
import { colorFor, initials, CREW_COLORS, type CrewColor } from '@/components/service-calls/crew-colors'
import { callFetch, toLocalInput } from '@/lib/service-calls-client'
import { callLabel, clashesWith, slotWindow, STATUS_LABEL, DEFAULT_CALL_MINUTES, type CallStatus } from '@/lib/service-calls'
import {
  blockGeometry, lanes, timeAtOffset, hourLabel, weekStart, addDays, sameDay, startOfDay,
  DAY_START_HOUR, DAY_END_HOUR, HOUR_PX, BOARD_PX,
} from '@/lib/dispatch-layout'
import { cn } from '@/lib/utils'
import { isAssignedOnly } from '@/lib/permissions'
import { useScreenAccess, ScreenAccessNotice } from '@/components/ui/screen-access'
import { formatDate, formatDateShort } from '@/lib/dates'
import { fetchProblem } from '@/lib/fetch-error'
import { LabelChips } from '@/components/tasks/task-extras-ui'
import type { TaskLabel } from '@/lib/task-extras'

// THE DISPATCH BOARD, DRAWN LIKE A DESK CALENDAR. Reported over the first one:
// "the screens are so ugly it hurts my eyes ... make it look better maybe
// similar to google calendar". Time runs DOWN the side; in the Day view each
// crew member is a column, in the Week view each day is, and a call is a block
// as tall as it runs. The arithmetic is lib/dispatch-layout.ts, pure and
// tested.
//
// A call is DRAGGED to a new person or time (one PATCH of the call - who and
// when - and the crew member is told), and an empty slot is CLICKED to take a
// call there. A double booking is SHOWN in red and warned about, never
// refused: a dispatcher sometimes means it.
//
// On a phone there is no drag and no room for columns: the board is the day's
// list, time on the left, with a strip of days to move along.
//
// THE DRAG IS A REF (CLAUDE.md, tasks): a setState on drag start re-renders
// the block being dragged and the browser drops it.

type Call = {
  id: string; call_number: number; customer_name: string; site_address: string; issue: string
  status: string; priority: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null
  labels?: TaskLabel[] | null
}
type Crew = { id: string; name: string }

const timeOf = (d: Date) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)

function CallBlock({ call, color, clash, style, height, onGrab }: {
  call: Call; color: CrewColor; clash: boolean; style: React.CSSProperties; height: number
  onGrab: (id: string, grabOffsetY: number) => void
}) {
  const start = call.scheduled_start ? new Date(call.scheduled_start) : null
  const end = call.scheduled_end ? new Date(call.scheduled_end) : null
  const closed = call.status === 'done' || call.status === 'invoiced'
  // What fits, line by line, so a short block shows the customer and the time
  // rather than four lines cut off half way through the third.
  const showIssue = height >= HOUR_PX * 0.95 && !clash
  const showStatus = height >= HOUR_PX * 1.4 && call.status !== 'scheduled' && call.status !== 'new'
  return (
    <Link href={`/service-calls/${call.id}`} draggable
      onClick={e => e.stopPropagation()}
      onDragStart={e => {
        e.dataTransfer.setData('text/plain', call.id)
        e.dataTransfer.effectAllowed = 'move'
        onGrab(call.id, e.clientY - e.currentTarget.getBoundingClientRect().top)
      }}
      title={`${callLabel(call.call_number)} - ${call.customer_name}: ${call.issue}`}
      style={style}
      className={cn('absolute overflow-hidden rounded-lg border px-2 py-1 text-[11px] leading-tight text-ink cursor-grab active:cursor-grabbing',
        'hover:z-10 hover:shadow-md transition-shadow',
        // A CARD, like the ones on the boards: the person's colour is a bar
        // down the left edge rather than a wash over the whole block, a call
        // somebody is on site at is outlined, and a finished one is struck
        // through on a quieter ground instead of faded.
        closed ? 'border-line bg-surface' : call.status === 'on_site' ? 'border-accent-fg bg-panel' : 'border-line bg-panel',
        clash && 'ring-2 ring-danger ring-inset')}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', color.dot)} />
      <span className={cn('flex items-center gap-1 truncate pl-1', closed ? 'font-medium text-muted-fg line-through' : 'font-bold')}>
        {closed && <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden />}
        <span className="truncate">{call.customer_name}</span>
      </span>
      {start && <span className="block truncate pl-1 text-ink-soft">{timeOf(start)}{end ? ` - ${timeOf(end)}` : ''}</span>}
      {showIssue && <span className="block truncate pl-1 text-muted-fg">{call.issue}</span>}
      {showStatus && <span className={cn('block truncate pl-1 font-semibold', call.status === 'on_site' || closed ? 'text-success' : 'text-ink-soft')}>{STATUS_LABEL[call.status as CallStatus] ?? call.status}</span>}
      {clash && <span className="block truncate pl-1 font-semibold text-danger">Double-booked</span>}
    </Link>
  )
}

/** A small month to jump around in, like the one on the left of a desk calendar. */
function MiniMonth({ value, onPick }: { value: Date; onPick: (d: Date) => void }) {
  const [month, setMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1))
  useEffect(() => { setMonth(new Date(value.getFullYear(), value.getMonth(), 1)) }, [value])
  const first = weekStart(month)
  const today = new Date()
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{formatDate(month, { month: 'long', year: 'numeric' })}</p>
        <div className="flex">
          <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Previous month" title="Previous month" className="p-1 rounded-full text-muted-fg hover:bg-surface"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Next month" title="Next month" className="p-1 rounded-full text-muted-fg hover:bg-surface"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px]">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="py-1 font-medium text-faint">{d}</span>)}
        {Array.from({ length: 42 }, (_, i) => addDays(first, i)).map(d => {
          const other = d.getMonth() !== month.getMonth()
          const picked = sameDay(d, value)
          const isToday = sameDay(d, today)
          return (
            <button key={d.toISOString()} type="button" onClick={() => onPick(startOfDay(d))}
              className={cn('mx-auto h-7 w-7 rounded-full whitespace-nowrap text-xs',
                picked ? 'bg-ink text-panel font-semibold' : isToday ? 'text-accent-fg font-bold' : other ? 'text-faint' : 'text-ink-soft',
                !picked && 'hover:bg-surface')}>
              {d.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function DispatchPage() {
  const { access: permAccess, perms } = useScreenAccess('dispatch')
  // The board is the office's: refused to every crew role whatever a saved
  // role map says (the route does the same - app/api/dispatch/route.ts).
  const access = permAccess === 'yes' && isAssignedOnly(perms.role) ? 'no' : permAccess
  const canCreate = perms.can('service-calls', 'create')
  const notice = useNotice()
  const router = useRouter()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [problem, setProblem] = useState('')
  const [crew, setCrew] = useState<Crew[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [waiting, setWaiting] = useState<Call[]>([])
  const [clash, setClash] = useState<Record<string, string[]>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState<{ assigned_to?: string; start?: string; end?: string } | null>(null)
  const [now, setNow] = useState(() => new Date())
  const dragging = useRef<{ id: string; grabY: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const from = view === 'day' ? anchor : weekStart(anchor)
  const days = view === 'day' ? 1 : 7
  const to = addDays(from, days)
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => addDays(from, i)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from.getTime(), days])

  const load = useCallback(async () => {
    try {
      const res = await callFetch(`/api/dispatch?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not load the board.'); setState('failed'); return }
      setCrew(json.crew ?? [])
      setCalls(json.calls ?? [])
      setWaiting(json.waiting ?? [])
      setClash(json.conflicts ?? {})
      setState('ready')
    } catch {
      setProblem('Could not load the board.')
      setState('failed')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()])
  // Nothing is fetched until this person may see the board.
  useEffect(() => { if (access === 'yes') load() }, [load, access])

  // The red "now" line moves on its own.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // Open the board at the working morning, not at 6am with the day below the fold.
  useEffect(() => {
    if (state === 'ready' && scroller.current && scroller.current.scrollTop === 0) {
      scroller.current.scrollTop = Math.max(0, (7 - DAY_START_HOUR) * HOUR_PX - 12)
    }
  }, [state])

  const crewIds = useMemo(() => crew.map(c => c.id), [crew])
  const all = useMemo(() => [...calls, ...waiting], [calls, waiting])
  const shown = calls.filter(c => !c.assigned_to || !hidden.has(c.assigned_to))
  const clashCount = Object.keys(clash).length
  const nameOf = (id: string | null) => crew.find(p => p.id === id)?.name ?? null

  async function place(callId: string, personId: string | null, start: Date) {
    const call = all.find(c => c.id === callId)
    if (!call) return
    const who = personId ?? call.assigned_to ?? (crew.length === 1 ? crew[0].id : null)
    if (!who) {
      notice('Who is going? Drop it on a person in the Day view, or open the call to pick somebody.', { tone: 'info' })
      return
    }
    const w = slotWindow(call)
    const minutes = w ? Math.round((w[1] - w[0]) / 60_000) : DEFAULT_CALL_MINUTES
    const s = start.toISOString()
    const e = new Date(start.getTime() + minutes * 60_000).toISOString()
    // Asked BEFORE the save, by the same rule the board paints with.
    const hits = clashesWith({ id: call.id, assigned_to: who, scheduled_start: s, scheduled_end: e, status: 'scheduled' }, calls)
    try {
      const res = await callFetch(`/api/service-calls/${call.id}`, {
        method: 'PATCH', body: JSON.stringify({ assigned_to: who, scheduled_start: s, scheduled_end: e }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'Could not move the call.'); return }
      if (hits.length) {
        const names = hits.map(h => callLabel(all.find(c => c.id === h)?.call_number)).join(', ')
        notice(`Booked - and it overlaps ${names} for the same person.`, { tone: 'info', title: 'Double-booked' })
      }
    } catch (err) {
      notice(fetchProblem(err, 'moving the call'))
    } finally {
      load()
    }
  }

  /** A drop or a click on a column: which time it means, from where in the column. */
  function timeIn(e: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>, day: Date, grabY = 0) {
    const top = e.currentTarget.getBoundingClientRect().top
    return timeAtOffset(day, e.clientY - top - grabY)
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>, day: Date, personId: string | null) {
    e.preventDefault()
    const d = dragging.current
    dragging.current = null
    if (!d) return
    place(d.id, personId, timeIn(e, day, d.grabY))
  }

  function onSlotClick(e: React.MouseEvent<HTMLDivElement>, day: Date, personId: string | null) {
    const start = timeIn(e, day)
    const end = new Date(start.getTime() + DEFAULT_CALL_MINUTES * 60_000)
    const who = personId ?? (crew.length === 1 ? crew[0].id : undefined)
    setCreating({ assigned_to: who ?? undefined, start: toLocalInput(start.toISOString()), end: toLocalInput(end.toISOString()) })
  }

  /** The blocks for one column, laid out side by side where they overlap. */
  function column(day: Date, filter: (c: Call) => boolean) {
    const placed = shown.filter(filter).flatMap(c => {
      if (!c.scheduled_start) return []
      const g = blockGeometry(new Date(c.scheduled_start), c.scheduled_end ? new Date(c.scheduled_end) : null, day)
      return g ? [{ call: c, ...g }] : []
    })
    const lane = lanes(placed.map(p => ({ id: p.call.id, top: p.top, height: p.height })))
    return placed.map(p => {
      const l = lane.get(p.call.id) ?? { lane: 0, lanes: 1 }
      return (
        <CallBlock key={p.call.id} call={p.call} clash={!!clash[p.call.id]}
          color={colorFor(crewIds, p.call.assigned_to)}
          height={p.height}
          onGrab={(id, grabY) => { dragging.current = { id, grabY } }}
          style={{ top: p.top + 1, height: p.height - 2, left: `calc(${(l.lane / l.lanes) * 100}% + 2px)`, width: `calc(${100 / l.lanes}% - 4px)` }} />
      )
    })
  }

  const title = view === 'day'
    ? formatDate(anchor, { weekday: 'long', month: 'long', day: 'numeric' })
    : `${formatDateShort(from)} - ${formatDateShort(addDays(from, 6))}`

  // The columns: people on a day, or days for everybody.
  const cols: { key: string; day: Date; person: string | null; head: React.ReactNode }[] = view === 'day'
    ? crew.filter(p => !hidden.has(p.id)).map(p => {
      const color = colorFor(crewIds, p.id)
      return {
        key: p.id, day: anchor, person: p.id,
        head: (
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-panel', color.dot)}>{initials(p.name)}</span>
            <span className="truncate text-sm font-medium text-ink">{p.name}</span>
          </div>
        ),
      }
    })
    : dayList.map(d => {
      const isToday = sameDay(d, now)
      return {
        key: d.toISOString(), day: d, person: null,
        head: (
          <div className="flex flex-col items-center">
            <span className={cn('text-[11px] font-medium uppercase', isToday ? 'text-accent-fg' : 'text-faint')}>{formatDate(d, { weekday: 'short' })}</span>
            <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg', isToday ? 'bg-accent text-accent-ink font-semibold' : 'text-ink')}>{d.getDate()}</span>
          </div>
        ),
      }
    })

  const nowTop = ((now.getHours() * 60 + now.getMinutes() - DAY_START_HOUR * 60) / 60) * HOUR_PX
  const nowOnBoard = nowTop >= 0 && nowTop <= BOARD_PX

  // PHONE: the visible days as one list, time on the left.
  const phoneDays = view === 'day' ? [anchor] : dayList

  if (access !== 'yes') return <ScreenAccessNotice access={access} what="Dispatch" />

  return (
    <div className="p-6 space-y-4">
      {/* Header: where you are, and how to move. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Dispatch</h1>
          <span className="hidden lg:inline text-lg text-ink-soft truncate">{title}</span>
        </div>
        <p className="lg:hidden text-sm text-muted-fg -mt-2">{title}</p>
        <div className="row-even lg:flex lg:flex-wrap lg:items-center gap-2">
          <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <div className="flex justify-center">
            <button type="button" onClick={() => setAnchor(a => addDays(a, -days))} aria-label="Earlier" title="Earlier" className="h-11 w-11 lg:h-9 lg:w-9 flex items-center justify-center rounded-full text-ink-soft hover:bg-muted"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={() => setAnchor(a => addDays(a, days))} aria-label="Later" title="Later" className="h-11 w-11 lg:h-9 lg:w-9 flex items-center justify-center rounded-full text-ink-soft hover:bg-muted"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="flex rounded-xl bg-muted p-1" role="group" aria-label="View">
            {(['day', 'week'] as const).map(v => (
              <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v}
                className={cn('flex-1 h-10 lg:h-8 rounded-lg px-3.5 text-sm whitespace-nowrap', view === v ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft hover:text-ink')}>
                {v === 'day' ? 'Day' : 'Week'}
              </button>
            ))}
          </div>
          {canCreate && <Button onClick={() => setCreating({})}><Plus className="h-4 w-4" /> New call</Button>}
        </div>
      </div>

      {clashCount > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {clashCount} call{clashCount === 1 ? ' is' : 's are'} double-booked on this board.
        </p>
      )}

      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>{problem} The calls are unchanged - this screen just could not read them.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}

      {state === 'ready' && (
        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          {/* LEFT RAIL: a month, the crew (tap to hide), and the calls with nobody on them. */}
          <aside className="space-y-4 lg:self-start">
            <div className="hidden lg:block rounded-2xl border border-line bg-panel p-3">
              <MiniMonth value={anchor} onPick={d => setAnchor(d)} />
            </div>

            {crew.length > 0 && (
              <div className="hidden lg:block rounded-2xl border border-line bg-panel p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint pb-1">Crew</p>
                {crew.map(p => {
                  const off = hidden.has(p.id)
                  return (
                    <button key={p.id} type="button" aria-pressed={!off}
                      onClick={() => setHidden(h => { const n = new Set(h); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                      className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-surface">
                      <span className={cn('h-3.5 w-3.5 shrink-0 rounded-sm border-2', off ? 'border-muted2 bg-panel' : cn('border-transparent', colorFor(crewIds, p.id).dot))} />
                      <span className={cn('min-w-0 flex-1 truncate', off ? 'text-faint' : 'text-ink')}>{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-fg">{calls.filter(c => c.assigned_to === p.id).length}</span>
                    </button>
                  )
                })}
              </div>
            )}

            <div className="space-y-2" onDragOver={e => e.preventDefault()}>
              <div className="flex items-center gap-2 px-1">
                <p className="text-xs font-bold uppercase tracking-wider text-ink">Unscheduled</p>
                <span className="text-xs tabular-nums text-muted-fg">{waiting.length}</span>
              </div>
              {waiting.length ? waiting.map(c => (
                <div key={c.id} className="flex items-stretch gap-2 rounded-xl border border-line bg-panel">
                  <Link href={`/service-calls/${c.id}`} draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); dragging.current = { id: c.id, grabY: 0 } }}
                    className="flex min-w-0 flex-1 cursor-grab flex-col gap-1.5 p-3">
                    {(c.priority === 'urgent' || (c.labels?.length ?? 0) > 0) && (
                      <span className="flex flex-wrap gap-1.5">
                        {c.priority === 'urgent' && <span className="whitespace-nowrap rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-semibold text-danger">Urgent</span>}
                        <LabelChips labels={c.labels} />
                      </span>
                    )}
                    <span className="block break-words text-sm font-semibold leading-snug text-ink">{c.issue}</span>
                    <span className="block truncate text-xs text-ink-soft">{c.customer_name}</span>
                    <span className="block truncate text-[11px] text-muted-fg">{callLabel(c.call_number)}{c.scheduled_start ? ` - wants ${timeOf(new Date(c.scheduled_start))}` : ''}</span>
                  </Link>
                  {/* No drag on a phone, so the way to schedule one is a button:
                      it opens the call, where who and when are set. */}
                  <Link href={`/service-calls/${c.id}`}
                    className="m-2 inline-flex min-h-11 shrink-0 items-center self-center whitespace-nowrap rounded-xl border border-line px-3.5 text-sm font-semibold text-ink hover:bg-surface lg:hidden">
                    Schedule
                  </Link>
                </div>
              )) : <p className="rounded-xl border border-line bg-panel px-3 py-4 text-sm text-muted-fg">Every call has somebody on it.</p>}
              <p className="hidden px-1 text-xs text-muted-fg lg:block">Drag a call onto the board to give it a person and a time.</p>
            </div>
          </aside>

          {/* PHONE: the day as a list. */}
          <div className="lg:hidden space-y-4">
            {phoneDays.map(d => {
              const list = shown.filter(c => c.scheduled_start && sameDay(new Date(c.scheduled_start), d))
                .sort((a, b) => a.scheduled_start!.localeCompare(b.scheduled_start!))
              return (
                <div key={d.toISOString()} className="rounded-2xl border border-line bg-panel">
                  <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink">{formatDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  {list.length ? (
                    <div className="space-y-4 px-4 pb-4">
                      {/* By person, because that is the question on a phone:
                          who is where today. Somebody with nothing is not listed. */}
                      {[...crew.map(p => p.id as string | null), null].map(pid => {
                        const theirs = list.filter(c => (c.assigned_to ?? null) === pid)
                        if (!theirs.length) return null
                        const color = colorFor(crewIds, pid)
                        const who = nameOf(pid) ?? 'Nobody yet'
                        return (
                          <div key={pid ?? 'nobody'} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span aria-hidden className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-panel', color.dot)}>{pid ? initials(who) : '?'}</span>
                              <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-ink">{who}</p>
                              <span className="text-xs text-muted-fg">{theirs.length} {theirs.length === 1 ? 'call' : 'calls'}</span>
                            </div>
                            {theirs.map(c => {
                              const closed = c.status === 'done' || c.status === 'invoiced'
                              return (
                                <Link key={c.id} href={`/service-calls/${c.id}`}
                                  className={cn('relative flex gap-3 overflow-hidden rounded-xl border bg-panel py-3 pl-4 pr-3',
                                    c.status === 'on_site' ? 'border-accent-fg' : 'border-line')}>
                                  <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', color.dot)} />
                                  <span className="w-16 shrink-0 text-sm font-semibold text-ink">{timeOf(new Date(c.scheduled_start!))}</span>
                                  <span className="min-w-0 flex-1">
                                    <span className={cn('block break-words text-sm', closed ? 'font-medium text-muted-fg line-through' : 'font-semibold text-ink')}>{c.issue}</span>
                                    <span className="block truncate text-xs text-ink-soft">{c.customer_name}</span>
                                    <span className={cn('block truncate text-xs font-semibold', c.status === 'on_site' || closed ? 'text-success' : 'text-muted-fg')}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</span>
                                    {clash[c.id] && <span className="block text-xs font-semibold text-danger">Double-booked</span>}
                                  </span>
                                </Link>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ) : <p className="px-4 pb-4 text-sm text-muted-fg">Nothing booked.</p>}
                </div>
              )
            })}
          </div>

          {/* DESKTOP: the calendar. */}
          <div className="hidden lg:block rounded-2xl border border-line bg-panel overflow-hidden">
            {!cols.length ? (
              <p className="p-6 text-sm text-muted-fg">{crew.length ? 'Everybody is hidden. Tick somebody under Crew.' : 'Nobody on your team yet. Add people in Settings, Team.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 64 + cols.length * 140 }}>
                  {/* Column heads */}
                  <div className="grid border-b border-line" style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(0, 1fr))` }}>
                    <div />
                    {cols.map(c => <div key={c.key} className="px-2 py-2.5 border-l border-line-soft">{c.head}</div>)}
                  </div>
                  {/* The day, scrolling inside the card so the heads stay put. */}
                  <div ref={scroller} className="overflow-y-auto" style={{ maxHeight: 'calc(var(--vv-h, 100dvh) - 250px)', minHeight: 360 }}>
                    <div className="grid relative" style={{ gridTemplateColumns: `64px repeat(${cols.length}, minmax(0, 1fr))`, height: BOARD_PX }}>
                      {/* Hour labels */}
                      <div className="relative">
                        {HOURS.map(h => (
                          <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-faint" style={{ top: (h - DAY_START_HOUR) * HOUR_PX }}>
                            {h === DAY_START_HOUR ? '' : hourLabel(h)}
                          </span>
                        ))}
                      </div>
                      {cols.map(c => {
                        const isToday = sameDay(c.day, now)
                        return (
                          <div key={c.key} className={cn('relative border-l border-line-soft cursor-pointer', isToday && view === 'week' && 'bg-accent-tint/20')}
                            onClick={e => { if (canCreate) onSlotClick(e, c.day, c.person) }}
                            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                            onDrop={e => onDrop(e, c.day, c.person)}>
                            {HOURS.map(h => (
                              <div key={h} className="absolute inset-x-0 border-t border-line-soft" style={{ top: (h - DAY_START_HOUR) * HOUR_PX }} />
                            ))}
                            {HOURS.map(h => (
                              <div key={`half-${h}`} className="absolute inset-x-0 border-t border-dashed border-line-soft/60" style={{ top: (h - DAY_START_HOUR + 0.5) * HOUR_PX }} />
                            ))}
                            {column(c.day, call => c.person ? call.assigned_to === c.person : true)}
                            {isToday && nowOnBoard && (
                              <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                                <div className="relative h-0.5 bg-danger">
                                  <span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-danger" />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {state === 'ready' && (
        <p className="hidden lg:block text-xs text-faint">
          {canCreate ? 'Click an empty slot to take a call there. ' : ''}Drag a call to move it to another time{view === 'day' ? ' or person' : ' or day'}. {CREW_COLORS.length < crew.length ? 'Colours repeat after five people.' : ''}
        </p>
      )}

      {creating && (
        <NewCallDialog crew={crew} initial={creating} onClose={() => setCreating(null)}
          onCreated={(id, warning) => {
            setCreating(null)
            if (warning) notice(`Saved. ${warning}`, { tone: 'info' })
            load()
            router.prefetch(`/service-calls/${id}`)
          }} />
      )}
    </div>
  )
}
