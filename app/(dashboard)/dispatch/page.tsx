'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotice } from '@/components/ui/notice'
import { callFetch } from '@/lib/service-calls-client'
import { callLabel, clashesWith, slotWindow, STATUS_LABEL, DEFAULT_CALL_MINUTES } from '@/lib/service-calls'
import { cn } from '@/lib/utils'
import { formatDate, formatDateShort } from '@/lib/dates'
import { fetchProblem } from '@/lib/fetch-error'

// THE DISPATCH BOARD - crew down the side, the day (by hour) or the week (by
// day) across, the calls nobody has yet in a queue. On a computer a call is
// DRAGGED onto a crew member's slot: that is one PATCH of the call (who and
// when), and the crew member is told. A double booking is SHOWN, in red, and
// warned about before the drop lands - never silently refused, because a
// dispatcher sometimes means it (two techs on one job are two calls today).
//
// On a phone there is no drag: the board is a list per person, and a call is
// assigned from the call itself. It says so rather than offering a gesture a
// finger cannot make.
//
// THE DRAG IS A REF (CLAUDE.md, tasks): a setState on drag start re-renders
// the card being dragged and the browser drops it.

type Call = { id: string; call_number: number; customer_name: string; site_address: string; issue: string; status: string; priority: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null }
type Crew = { id: string; name: string }

const DAY_HOURS = Array.from({ length: 13 }, (_, i) => 7 + i) // 7am - 7pm

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
const hourLabel = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'a' : 'p'}`
const timeOf = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''

function CallChip({ call, clash, onDragStart }: { call: Call; clash: boolean; onDragStart: (id: string) => void }) {
  return (
    <Link href={`/service-calls/${call.id}`} draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', call.id); onDragStart(call.id) }}
      title={`${callLabel(call.call_number)} - ${call.issue}`}
      className={cn('block rounded-md border px-2 py-1 text-xs leading-tight cursor-grab',
        clash ? 'border-danger/50 bg-danger-tint text-danger' : 'border-line bg-panel text-ink')}>
      <span className="block truncate font-semibold">{timeOf(call.scheduled_start)} {callLabel(call.call_number)}</span>
      <span className="block truncate text-muted-fg">{call.issue}</span>
      {clash && <span className="block font-medium">Double-booked</span>}
    </Link>
  )
}

export default function DispatchPage() {
  const notice = useNotice()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()))
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [problem, setProblem] = useState('')
  const [crew, setCrew] = useState<Crew[]>([])
  const [calls, setCalls] = useState<Call[]>([])
  const [waiting, setWaiting] = useState<Call[]>([])
  const [clash, setClash] = useState<Record<string, string[]>>({})
  const dragging = useRef<string | null>(null)

  const from = view === 'day' ? anchor : addDays(anchor, -((anchor.getDay() + 6) % 7)) // weeks start Monday
  const days = view === 'day' ? 1 : 7
  const to = addDays(from, days)

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
  useEffect(() => { load() }, [load])

  const all = useMemo(() => [...calls, ...waiting], [calls, waiting])

  async function drop(personId: string, slotStart: Date) {
    const id = dragging.current
    dragging.current = null
    const call = all.find(c => c.id === id)
    if (!call) return
    const w = slotWindow(call)
    const minutes = w ? Math.round((w[1] - w[0]) / 60_000) : DEFAULT_CALL_MINUTES
    const start = slotStart.toISOString()
    const end = new Date(slotStart.getTime() + minutes * 60_000).toISOString()
    // Asked BEFORE the save, by the same rule the board paints with.
    const hits = clashesWith({ id: call.id, assigned_to: personId, scheduled_start: start, scheduled_end: end, status: 'scheduled' }, calls)
    try {
      const res = await callFetch(`/api/service-calls/${call.id}`, {
        method: 'PATCH', body: JSON.stringify({ assigned_to: personId, scheduled_start: start, scheduled_end: end }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'Could not move the call.'); return }
      if (hits.length) {
        const names = hits.map(h => callLabel(all.find(c => c.id === h)?.call_number)).join(', ')
        notice(`Booked - and it overlaps ${names} for the same person.`, { tone: 'info', title: 'Double-booked' })
      }
    } catch (e) {
      notice(fetchProblem(e, 'moving the call'))
    } finally {
      load()
    }
  }

  const callsFor = (personId: string, day: Date, hour?: number) => calls.filter(c => {
    if (c.assigned_to !== personId || !c.scheduled_start) return false
    const s = new Date(c.scheduled_start)
    if (!sameDay(s, day)) return false
    if (hour === undefined) return true
    const h = s.getHours()
    return hour === DAY_HOURS[0] ? h <= hour : hour === DAY_HOURS[DAY_HOURS.length - 1] ? h >= hour : h === hour
  })

  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i))
  const title = view === 'day'
    ? formatDate(anchor, { weekday: 'long', month: 'short', day: 'numeric' })
    : `${formatDateShort(from)} - ${formatDateShort(addDays(from, 6))}`
  const clashCount = Object.keys(clash).length

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Dispatch</h1>
          <p className="text-sm text-muted-fg mt-0.5">{title}</p>
        </div>
        <div className="row-even lg:flex lg:flex-wrap gap-2">
          <Button variant="outline" onClick={() => setAnchor(a => addDays(a, -days))} aria-label="Earlier" title="Earlier"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={() => setAnchor(startOfDay(new Date()))}>Today</Button>
          <Button variant="outline" onClick={() => setAnchor(a => addDays(a, days))} aria-label="Later" title="Later"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant={view === 'day' ? 'default' : 'outline'} onClick={() => setView('day')}>Day</Button>
          <Button variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>Week</Button>
        </div>
      </div>

      {clashCount > 0 && (
        <p className="flex items-center gap-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {clashCount} call{clashCount === 1 ? '' : 's'} double-booked on this board.
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
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* The queue: calls with nobody on them yet. */}
          <div className="rounded-2xl border border-line bg-panel p-3 space-y-2 self-start">
            <p className="text-sm font-semibold text-ink">Waiting ({waiting.length})</p>
            {waiting.length ? waiting.map(c => (
              <CallChip key={c.id} call={c} clash={false} onDragStart={id => { dragging.current = id }} />
            )) : <p className="text-sm text-muted-fg">Every call has somebody on it.</p>}
            <p className="text-xs text-faint lg:hidden">On a phone, open a call to put somebody on it. On a computer you can drag it onto the board.</p>
          </div>

          {/* PHONE: one list per person, no drag. */}
          <div className="lg:hidden rounded-2xl border border-line bg-panel divide-y divide-line-soft">
            {crew.map(p => (
              <div key={p.id} className="p-3 space-y-2">
                <p className="text-sm font-semibold text-ink">{p.name}</p>
                {dayList.flatMap(d => callsFor(p.id, d)).length
                  ? dayList.flatMap(d => callsFor(p.id, d)).map(c => <CallChip key={c.id} call={c} clash={!!clash[c.id]} onDragStart={() => {}} />)
                  : <p className="text-sm text-muted-fg">Nothing booked.</p>}
              </div>
            ))}
          </div>

          {/* DESKTOP: the grid. */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl border border-line bg-panel">
            <div className="min-w-[900px]">
              <div className="grid border-b border-line" style={{ gridTemplateColumns: `160px repeat(${view === 'day' ? DAY_HOURS.length : 7}, minmax(0, 1fr))` }}>
                <div className="p-2 text-xs font-medium text-faint">Crew</div>
                {view === 'day'
                  ? DAY_HOURS.map(h => <div key={h} className="p-2 text-xs font-medium text-faint border-l border-line-soft">{hourLabel(h)}</div>)
                  : dayList.map(d => <div key={d.toISOString()} className="p-2 text-xs font-medium text-faint border-l border-line-soft">{formatDate(d, { weekday: 'short', day: 'numeric' })}</div>)}
              </div>
              {crew.map(p => (
                <div key={p.id} className="grid border-b border-line-soft" style={{ gridTemplateColumns: `160px repeat(${view === 'day' ? DAY_HOURS.length : 7}, minmax(0, 1fr))` }}>
                  <div className="p-2 text-sm font-medium text-ink truncate">{p.name}</div>
                  {(view === 'day' ? DAY_HOURS.map(h => ({ key: `h${h}`, day: anchor, hour: h })) : dayList.map(d => ({ key: d.toISOString(), day: d, hour: undefined as number | undefined })))
                    .map(cell => {
                      const slot = new Date(cell.day)
                      slot.setHours(cell.hour ?? 8, 0, 0, 0)
                      return (
                        <div key={cell.key} className="min-h-[64px] p-1 space-y-1 border-l border-line-soft"
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => { e.preventDefault(); drop(p.id, slot) }}>
                          {callsFor(p.id, cell.day, cell.hour).map(c => (
                            <CallChip key={c.id} call={c} clash={!!clash[c.id]} onDragStart={id => { dragging.current = id }} />
                          ))}
                        </div>
                      )
                    })}
                </div>
              ))}
              {!crew.length && <p className="p-4 text-sm text-muted-fg">Nobody on your team yet. Add people in Settings, Team.</p>}
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-faint">Statuses: {Object.entries(STATUS_LABEL).filter(([k]) => k !== 'invoiced').map(([, v]) => v).join(', ')}. {`Week view drops a call at 8am on the day; open it to set the exact time.`}</p>
    </div>
  )
}
