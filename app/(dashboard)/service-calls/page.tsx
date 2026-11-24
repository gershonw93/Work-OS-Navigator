'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronRight, MapPin, Plus, Search, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useNotice } from '@/components/ui/notice'
import { NewCallDialog } from '@/components/service-calls/new-call-dialog'
import { colorFor, initials } from '@/components/service-calls/crew-colors'
import { callFetch } from '@/lib/service-calls-client'
import { callLabel, STATUS_LABEL, type CallStatus } from '@/lib/service-calls'
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

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Service Calls</h1>
          <p className="text-sm text-muted-fg mt-0.5">{crewView ? 'The calls you are on.' : 'Calls from your customers, and who is on each.'}</p>
        </div>
        {!crewView && state === 'ready' && (
          <div className="row-even sm:flex gap-2">
            <Link href="/dispatch" className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft whitespace-nowrap hover:bg-surface">
              <CalendarClock className="h-4 w-4" /> Dispatch board
            </Link>
            <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> New call</Button>
          </div>
        )}
      </div>

      {state === 'ready' && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="scroll-fade flex gap-2 overflow-x-auto pb-1">
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
      {state === 'ready' && !rows.length && (
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
      {state === 'ready' && rows.length > 0 && (
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
