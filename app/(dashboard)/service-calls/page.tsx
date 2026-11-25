'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, ListChecks, MapPin, Plus, Search, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useNotice } from '@/components/ui/notice'
import { NewCallDialog } from '@/components/service-calls/new-call-dialog'
import { colorFor, initials } from '@/components/service-calls/crew-colors'
import { callFetch, callTime } from '@/lib/service-calls-client'
import { callLabel, offeredMoves, punchWith, STATUS_LABEL, type CallStatus } from '@/lib/service-calls'
import { createClient } from '@/lib/supabase/client'
import { LabelChips } from '@/components/tasks/task-extras-ui'
import type { TaskLabel, TaskSubtask } from '@/lib/task-extras'
import { fetchProblem } from '@/lib/fetch-error'
import { sameDay } from '@/lib/dispatch-layout'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'

// Service calls: one card, a row per call. The filters across the top are the
// questions the office actually asks - what has nobody on it, what is on
// today, who is out on one right now - each with its count. A call opens on
// its own page (not inline under the list), so tapping the third row never
// scrolls you away from what you tapped.

type Row = {
  id: string; call_number: number; customer_name: string; site_address: string; issue: string
  status: string; priority: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null
  labels?: TaskLabel[] | null; steps?: TaskSubtask[] | null
}
type View = 'board' | 'list'
const VIEW_KEY = 'sytenav_calls_view'
// The board's columns. Invoiced is not one: a call the office has billed is
// finished business, and it is under List -> All.
const BOARD: CallStatus[] = ['new', 'scheduled', 'en_route', 'on_site', 'done']
// A phone shows one group at a time, and "Out now" is the two states that mean
// somebody is out on a call - the question the office asks from a phone.
const PHONE_GROUPS: { key: string; label: string; has: CallStatus[] }[] = [
  { key: 'new', label: 'New', has: ['new'] },
  { key: 'scheduled', label: 'Scheduled', has: ['scheduled'] },
  { key: 'out', label: 'Out now', has: ['en_route', 'on_site'] },
  { key: 'done', label: 'Done', has: ['done'] },
]

/**
 * One call as a card: what it is in bold, who it is for, when, and who has it.
 * Hoisted - a component declared inside the page is a new type every render.
 */
function CallCard({ c, who, dot }: { c: Row; who: string | null; dot: string }) {
  const steps = c.steps ?? []
  const closed = c.status === 'done' || c.status === 'invoiced'
  const when = callTime(c.scheduled_start)
  return (
    <>
      {(c.priority === 'urgent' || (c.labels?.length ?? 0) > 0) && (
        <span className="flex flex-wrap gap-1.5">
          {c.priority === 'urgent' && <span className="whitespace-nowrap rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-semibold text-danger">Urgent</span>}
          <LabelChips labels={c.labels} />
        </span>
      )}
      <span className={cn('block break-words text-sm leading-snug', closed ? 'font-medium text-muted-fg line-through' : 'font-semibold text-ink')}>{c.issue}</span>
      <span className="block truncate text-xs text-ink-soft">{c.customer_name}</span>
      <span className={cn('block text-xs', c.status === 'on_site' ? 'font-semibold text-success' : when ? 'font-semibold text-ink' : 'text-muted-fg')}>
        {c.status === 'on_site' ? 'On site now' : closed ? `Done${when ? ` - ${when}` : ''}` : when ?? 'No time yet'}
      </span>
      {steps.length > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-fg">
          <ListChecks className="h-3.5 w-3.5" aria-hidden />{steps.filter(x => x.done).length} of {steps.length} steps
        </span>
      )}
      <span className="flex items-center gap-2 text-[11px] text-muted-fg">
        {who
          ? <span aria-hidden className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-panel', dot)}>{initials(who)}</span>
          : null}
        <span className="truncate">{who ?? 'Nobody on it yet'} - {callLabel(c.call_number)}</span>
      </span>
    </>
  )
}

type Filter = 'open' | 'unscheduled' | 'today' | 'active' | 'all'

const STATUS_TONE: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted'> = {
  new: 'muted', scheduled: 'info', en_route: 'warning', on_site: 'warning', done: 'success', invoiced: 'default',
}
const OPEN = (c: Row) => c.status !== 'done' && c.status !== 'invoiced'
const FILTERS: { key: Filter; label: string; test: (c: Row, now: Date) => boolean }[] = [
  { key: 'open', label: 'Open', test: OPEN },
  { key: 'unscheduled', label: 'Nobody on it', test: c => c.status === 'new' },
  { key: 'today', label: 'Today', test: (c, now) => OPEN(c) && !!c.scheduled_start && sameDay(new Date(c.scheduled_start), now) },
  { key: 'active', label: 'Out on it now', test: c => c.status === 'en_route' || c.status === 'on_site' },
  { key: 'all', label: 'All', test: () => true },
]

const dayAndTime = (iso: string) => {
  const d = new Date(iso)
  return {
    day: formatDate(d, { weekday: 'short' }),
    date: formatDate(d, { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
}

export default function ServiceCallsPage() {
  const router = useRouter()
  const notice = useNotice()
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [problem, setProblem] = useState('')
  const [calls, setCalls] = useState<Row[]>([])
  const [crew, setCrew] = useState<{ id: string; name: string }[]>([])
  const [crewView, setCrewView] = useState(false)
  const [filter, setFilter] = useState<Filter>('open')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [view, setView] = useState<View>('board')
  const [phoneGroup, setPhoneGroup] = useState('new')
  const [me, setMe] = useState<string | null>(null)
  // A REF, NOT STATE: a setState on drag start re-renders the card being
  // dragged and the browser drops it.
  const drag = useRef<string | null>(null)

  // The view is a per-device convenience; the page works without it.
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === 'board' || v === 'list') setView(v) } catch { /* private window */ }
    createClient().auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null))
  }, [])
  function pickView(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private window */ }
  }

  // Every call, once: the counts on the filters are answers about the whole
  // list, so they cannot come from a list already narrowed to one of them.
  const load = useCallback(async () => {
    try {
      const res = await callFetch('/api/service-calls')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not load the calls.'); setState('failed'); return }
      setCalls(json.calls ?? [])
      setCrew(json.crew ?? [])
      setCrewView(!!json.crewView)
      setState('ready')
    } catch {
      setProblem('Could not load the calls.')
      setState('failed')
    }
  }, [])
  useEffect(() => { load() }, [load])

  const now = new Date()
  const crewIds = useMemo(() => crew.map(c => c.id), [crew])
  const name = (id: string | null) => crew.find(c => c.id === id)?.name ?? null
  const counts = Object.fromEntries(FILTERS.map(f => [f.key, calls.filter(c => f.test(c, now)).length])) as Record<Filter, number>
  const needle = q.trim().toLowerCase()
  const test = FILTERS.find(f => f.key === filter)!.test
  const rows = calls
    .filter(c => test(c, now))
    .filter(c => !needle || [c.customer_name, c.issue, c.site_address, callLabel(c.call_number)].some(v => v.toLowerCase().includes(needle)))
    // Booked ones by time, soonest first; nobody-on-it ones after, newest first.
    .sort((a, b) => {
      if (a.scheduled_start && b.scheduled_start) return a.scheduled_start.localeCompare(b.scheduled_start)
      if (a.scheduled_start) return -1
      if (b.scheduled_start) return 1
      return b.call_number - a.call_number
    })

  const found = calls.filter(c => !needle || [c.customer_name, c.issue, c.site_address, callLabel(c.call_number)].some(v => v.toLowerCase().includes(needle)))
  const inStage = (list: CallStatus[]) => found.filter(c => list.includes(c.status as CallStatus))
    .sort((a, b) => (a.scheduled_start ?? '9999').localeCompare(b.scheduled_start ?? '9999') || b.call_number - a.call_number)

  // A CARD DROPPED ON A COLUMN MOVES ONE STEP, AND ONLY A STEP THE CALL PAGE
  // WOULD OFFER. The rules are the call's own (`offeredMoves`): nothing skips,
  // Scheduled comes from a person and a time rather than from a drag, Done
  // needs what was done, and arriving clocks the assignee in - so those last
  // three are sent to the call itself instead of being half-done from here.
  async function dropOn(to: CallStatus) {
    const id = drag.current
    drag.current = null
    const call = calls.find(c => c.id === id)
    if (!call || call.status === to) return
    const from = call.status as CallStatus
    if (from === 'new' && to === 'scheduled') {
      notice('To schedule it, give it a person and a time: open the call, or drag it on the Dispatch board.', { tone: 'info' })
      return
    }
    if (!offeredMoves(from, crewView).includes(to)) {
      notice(`A call moves one step at a time, so ${STATUS_LABEL[from]} cannot go straight to ${STATUS_LABEL[to]}.`, { tone: 'info' })
      return
    }
    if (to === 'done' || (call.assigned_to === me && punchWith(from, to))) {
      notice(to === 'done' ? 'Say what was done to close the call.' : 'Arrive from the call itself, so it clocks you in.', { tone: 'info' })
      router.push(`/service-calls/${call.id}`)
      return
    }
    setCalls(prev => prev.map(c => c.id === call.id ? { ...c, status: to } : c))
    try {
      const res = await callFetch(`/api/service-calls/${call.id}/status`, { method: 'POST', body: JSON.stringify({ to }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) notice(json.error ?? 'That did not work. Try again.')
    } catch (e) {
      notice(fetchProblem(e, 'moving the call'))
    } finally {
      load()
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Service Calls</h1>
          <p className="mt-1 text-sm text-muted-fg">{crewView ? 'The calls you are on.' : 'Calls from your customers, and who is on each.'}</p>
        </div>
        {state === 'ready' && (
          <div className="flex flex-wrap items-center gap-2">
            {/* The same segmented switch Project Management has. Dispatch is a
                page of its own, so its segment is a link. */}
            <div role="group" aria-label="View" className="inline-flex rounded-xl bg-muted p-1">
              {(['board', 'list'] as const).map(v => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)}
                  className={cn('min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm', view === v ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft')}>
                  {v === 'board' ? 'Board' : 'List'}
                </button>
              ))}
              {!crewView && (
                <Link href="/dispatch" className="inline-flex min-h-9 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium text-ink-soft hover:text-ink">Dispatch</Link>
              )}
            </div>
            {!crewView && <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New call</Button>}
          </div>
        )}
      </div>

      {state === 'ready' && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className={cn('scroll-fade flex gap-2 overflow-x-auto pb-1', view === 'board' && 'hidden')}>
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={cn('shrink-0 inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium',
                  filter === f.key ? 'bg-ink border-ink text-panel' : 'bg-panel border-line text-muted-fg hover:text-ink-soft')}>
                {f.label}
                <span className={cn('rounded-full whitespace-nowrap px-1.5 text-xs', filter === f.key ? 'bg-panel/20' : 'bg-muted')}>{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customer, issue, address" className="pl-9" aria-label="Search calls" />
          </div>
        </div>
      )}

      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>{problem} The calls are unchanged - this screen just could not read them.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}
      {/* ── BOARD: a column per stage from lg up; one group at a time on a phone ── */}
      {state === 'ready' && view === 'board' && calls.length > 0 && (
        <>
          <div className="hidden items-start gap-4 lg:flex">
            {BOARD.map(stage => {
              const list = inStage([stage])
              return (
                <section key={stage} aria-label={STATUS_LABEL[stage]} className="flex min-w-0 flex-1 flex-col gap-2.5 rounded-xl p-1"
                  onDragOver={e => { if (drag.current) e.preventDefault() }}
                  onDrop={e => { e.preventDefault(); dropOn(stage) }}>
                  <div className="flex items-center gap-2 px-1">
                    <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-ink">{STATUS_LABEL[stage]}</h2>
                    <span className="text-xs tabular-nums text-muted-fg">{list.length}</span>
                  </div>
                  {list.length === 0 && (
                    <p className="rounded-xl border border-dashed border-muted2 px-3 py-6 text-center text-xs text-muted-fg">Nothing here</p>
                  )}
                  {list.map(c => (
                    <Link key={c.id} href={`/service-calls/${c.id}`} draggable
                      onDragStart={e => { drag.current = c.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
                      onDragEnd={() => { drag.current = null }}
                      className={cn('flex flex-col gap-2 rounded-xl border bg-panel p-3 hover:border-muted2',
                        c.status === 'on_site' ? 'border-accent-fg' : 'border-line')}>
                      <CallCard c={c} who={name(c.assigned_to)} dot={colorFor(crewIds, c.assigned_to).dot} />
                    </Link>
                  ))}
                </section>
              )
            })}
          </div>
          <p className="hidden text-xs text-muted-fg lg:block">
            Drag a card to the next column to move the call one step. Invoiced calls are under List, All.
          </p>

          <div className="space-y-4 lg:hidden">
            <div role="tablist" aria-label="Stages" className="scroll-fade flex gap-2 overflow-x-auto scrollbar-hide">
              {PHONE_GROUPS.map(g => {
                const on = g.key === phoneGroup
                return (
                  <button key={g.key} type="button" role="tab" aria-selected={on} onClick={() => setPhoneGroup(g.key)}
                    className={cn('min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm',
                      on ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink')}>
                    {g.label} {inStage(g.has).length}
                  </button>
                )
              })}
            </div>
            {(() => {
              const group = PHONE_GROUPS.find(g => g.key === phoneGroup) ?? PHONE_GROUPS[0]
              const list = inStage(group.has)
              if (!list.length) {
                return <p className="rounded-2xl border border-line bg-panel px-4 py-8 text-center text-sm text-muted-fg">Nothing in {group.label}.</p>
              }
              return (
                <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
                  {list.map(c => (
                    <Link key={c.id} href={`/service-calls/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3.5">
                      <CallCard c={c} who={name(c.assigned_to)} dot={colorFor(crewIds, c.assigned_to).dot} />
                    </Link>
                  ))}
                </div>
              )
            })()}
          </div>
        </>
      )}

      {state === 'ready' && (view === 'list' || !calls.length) && !rows.length && (
        <div className="rounded-2xl border border-line bg-panel p-10 text-center space-y-2">
          <Wrench className="h-8 w-8 text-faint mx-auto" aria-hidden />
          <p className="text-sm font-semibold text-ink">
            {needle ? 'Nothing matches that search' : !calls.length ? 'No calls yet' : 'Nothing here right now'}
          </p>
          <p className="text-sm text-muted-fg">
            {needle ? 'Try a customer name, a street or a call number.'
              : !calls.length ? (crewView ? 'When the office puts you on a call it shows up here.' : 'Take a call from a customer and it shows up here.')
              : 'Pick another filter above to see the rest.'}
          </p>
        </div>
      )}
      {state === 'ready' && view === 'list' && rows.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
          {rows.map(c => {
            const when = c.scheduled_start ? dayAndTime(c.scheduled_start) : null
            const who = name(c.assigned_to)
            const color = colorFor(crewIds, c.assigned_to)
            return (
              <Link key={c.id} href={`/service-calls/${c.id}`} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface transition-colors">
                {/* The date, the way a calendar shows it. */}
                <div className={cn('flex w-14 shrink-0 flex-col items-center rounded-xl py-1.5', when ? 'bg-surface' : 'border border-dashed border-line')}>
                  {when ? (
                    <>
                      <span className="text-[10px] font-semibold uppercase text-muted-fg">{when.day}</span>
                      <span className="text-sm font-bold text-ink leading-tight">{when.date.replace(/^\D+\s/, '')}</span>
                      <span className="text-[10px] text-muted-fg">{when.time}</span>
                    </>
                  ) : <span className="py-2 text-[10px] font-medium text-faint">No time</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm font-semibold text-ink">{c.customer_name}</span>
                    {c.priority === 'urgent' && <Badge variant="danger">Urgent</Badge>}
                    <LabelChips labels={c.labels} className="hidden sm:flex" />
                  </div>
                  <p className="truncate text-sm text-ink-soft">{c.issue}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-fg">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{c.site_address}</span>
                  </p>
                </div>
                <div className="hidden sm:flex flex-col items-end gap-1.5 shrink-0">
                  <Badge variant={STATUS_TONE[c.status] ?? 'default'}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</Badge>
                  <span className="text-xs text-faint">{callLabel(c.call_number)}</span>
                </div>
                {who ? (
                  <span title={who} className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-panel', color.dot)}>{initials(who)}</span>
                ) : (
                  <span title="Nobody on it yet" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-muted2 text-[11px] text-faint">?</span>
                )}
                <ChevronRight className="h-4 w-4 text-faint shrink-0" aria-hidden />
              </Link>
            )
          })}
        </div>
      )}

      {adding && (
        <NewCallDialog crew={crew} onClose={() => setAdding(false)}
          onCreated={(id, warning) => {
            setAdding(false)
            if (warning) notice(`Saved. ${warning}`, { tone: 'info' })
            router.push(`/service-calls/${id}`)
          }} />
      )}
    </div>
  )
}
