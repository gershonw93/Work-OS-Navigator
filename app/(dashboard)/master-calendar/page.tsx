'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectCalendarButton } from '@/components/calendar/connect-calendar'
import { DayDetailSheet } from '@/components/calendar/day-detail-sheet'

import { formatDate } from '@/lib/dates'
interface Item {
  id: string; kind: 'schedule' | 'task' | 'inspection'; project_id: string; project_name: string
  title: string; start: string; end: string; color: string; done?: boolean; href: string
}

const COLOR: Record<string, string> = {
  blue: 'bg-info-tint text-info', green: 'bg-success-tint text-success',
  purple: 'bg-accent-tint text-accent-fg', red: 'bg-danger-tint text-danger',
  amber: 'bg-warn-tint text-warn',
}
// PHONE DOTS ARE COLOURED BY KIND, not by the item's own colour. A schedule
// line's colour is whatever somebody picked for it - blue, green, red, amber,
// purple - which is the same five a task and an inspection use for their
// state, so a legend by colour could not be true. Three kinds, three dots, and
// the legend under the grid says which is which.
const KIND_DOT: Record<Item['kind'], string> = {
  schedule: 'bg-info', task: 'bg-warn', inspection: 'bg-special',
}
const KIND_LABEL: Record<Item['kind'], string> = {
  schedule: 'Schedule', task: 'Task due', inspection: 'Inspection',
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function MasterCalendarPage() {
  const supabase = createClient()
  const router = useRouter()
  // `role`, not `realRole`, so previewing a role shows what that role sees.
  // The API behind this page checks the real role and 403s regardless.
  const { role, loading: permLoading } = usePermissions()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const isAdmin = role === 'admin' || role === 'manager'

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/master/calendar', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) setItems((await res.json()).items ?? [])
      setLoading(false)
    })()
  }, [])

  // Map each calendar day (ISO) to its items (an item shows on every day in its span).
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>()
    for (const it of items) {
      const s = new Date(it.start + 'T00:00:00'), e = new Date((it.end || it.start) + 'T00:00:00')
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const k = iso(d); if (!m.has(k)) m.set(k, []); m.get(k)!.push(it)
      }
    }
    return m
  }, [items])

  // Nothing renders until permissions are KNOWN. This used to read
  // `!permLoading && !isAdmin`, so while they were still loading the guard was
  // skipped and the page painted its admin layout - Office Staff saw the whole
  // Master Money screen. The data never leaked (the API refuses on the real
  // role, which is why it showed zeros), but the surface did, and "you may not
  // be here" arriving a second late is not a guard.
  if (permLoading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  if (!isAdmin) return <div className="p-8 text-sm text-muted-fg">This view is for admins only.</div>
  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const first = new Date(cursor.y, cursor.m, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.y, cursor.m, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const todayIso = iso(new Date())
  const monthLabel = formatDate(first, { month: 'long', year: 'numeric' })

  const move = (delta: number) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><CalendarDays className="h-6 w-6 text-accent-fg" /> Master Calendar</h1>
          <p className="text-sm text-muted-fg mt-0.5">Every project's schedule and task due dates in one place. Click an item to jump to its project.</p>
        </div>
        {/* Below lg the controls cannot share one 390px row: month nav and
            Today take the first line, Connect takes the second whole. It ran
            off the right edge of the screen as one row. */}
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:flex-nowrap">
          <button onClick={() => move(-1)} aria-label="Previous month" title="Previous month" className="shrink-0 p-2 rounded-lg border border-line text-muted-fg hover:bg-surface"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-soft text-center lg:w-36 lg:flex-none">{monthLabel}</span>
          <button onClick={() => move(1)} aria-label="Next month" title="Next month" className="shrink-0 p-2 rounded-lg border border-line text-muted-fg hover:bg-surface"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }} className="shrink-0 whitespace-nowrap px-3 py-2 rounded-lg border border-line text-sm text-muted-fg hover:bg-surface lg:ml-1">Today</button>
          <ConnectCalendarButton className="w-full justify-center lg:ml-1 lg:w-auto" />
        </div>
      </div>

      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line-soft">
          {DOW.map(d => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
              <span className="sm:hidden">{d[0]}</span><span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = d ? iso(d) : ''
            const dayItems = d ? (byDay.get(k) ?? []) : []
            // The whole square is the control when there is anything on it.
            const open = d && dayItems.length ? () => setSelectedDay(k) : undefined
            return (
              <div key={i}
                onClick={open}
                role={open ? 'button' : undefined}
                tabIndex={open ? 0 : undefined}
                aria-label={open && d ? `${formatDate(d, { month: 'long', day: 'numeric' })}, ${dayItems.length} ${dayItems.length === 1 ? 'item' : 'items'}` : undefined}
                onKeyDown={open ? (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open() } } : undefined}
                className={cn('min-w-0 min-h-[60px] lg:min-h-[96px] border-b border-r border-line-soft p-1.5 align-top', !d && 'bg-surface/40', k === todayIso && 'bg-accent-tint/30', open && 'cursor-pointer hover:bg-surface/60')}>
                {d && <div className={cn('text-xs mb-1', k === todayIso ? 'font-bold text-accent-fg' : 'text-faint')}>{d.getDate()}</div>}
                {/* PHONE: DOTS. Seven columns at 390px is a ~55px square, and
                    the chips that lived here came out as "Mar…" three letters
                    long, four deep, with "+1 more" under them. Colour by kind
                    only - the legend under the grid explains it - and the DAY
                    is what you tap: it opens the shared day sheet. */}
                <div className="lg:hidden flex flex-wrap gap-1">
                  {dayItems.slice(0, 6).map(it => (
                    <span key={it.id} className={cn('h-1.5 w-1.5 rounded-full', KIND_DOT[it.kind], it.done && 'opacity-40')} />
                  ))}
                </div>
                <div className="hidden lg:block space-y-1">
                  {dayItems.slice(0, 4).map(it => (
                    <button key={it.id} onClick={(e) => { e.stopPropagation(); router.push(it.href) }} title={`${it.project_name} · ${it.title}`}
                      className={cn('w-full text-left rounded px-1.5 py-0.5 text-[10px] leading-tight truncate hover:opacity-80', COLOR[it.color] ?? COLOR.blue, it.done && 'line-through opacity-60')}>
                      <span className="font-medium">{it.project_name}</span> · {it.title}
                    </button>
                  ))}
                  {dayItems.length > 4 && <p className="text-[10px] font-medium text-accent-fg px-1">+{dayItems.length - 4} more</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* PHONE: what the dots mean, and what to do with them. */}
      <div className="lg:hidden flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-fg" data-calendar-legend>
        {(Object.keys(KIND_DOT) as Item['kind'][]).map(kind => (
          <span key={kind} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={cn('h-2 w-2 rounded-full', KIND_DOT[kind])} />{KIND_LABEL[kind]}
          </span>
        ))}
        <span className="basis-full text-faint">Tap a day to see everything on it.</span>
      </div>

      {/* Day detail - everything happening that day; click one to open it.
          The sheet itself is shared with the job's Schedule calendar
          (components/calendar/day-detail-sheet.tsx) - it was reported missing
          there, and a second copy is how two screens start disagreeing about
          what a day contains. */}
      {selectedDay && (
        <DayDetailSheet
          date={selectedDay}
          onClose={() => setSelectedDay(null)}
          rows={(byDay.get(selectedDay) ?? []).map(it => ({
            id: it.id,
            title: it.title,
            subtitle: `${it.project_name} · ${it.kind === 'inspection' ? 'Inspection' : it.kind === 'task' ? 'Task' : 'Schedule'}`,
            // The same dot as the phone grid and its legend, so the sheet a
            // day opens agrees with the square that opened it.
            dot: KIND_DOT[it.kind],
            done: it.done,
            onOpen: () => router.push(it.href),
          }))}
        />
      )}

    </div>
  )
}
