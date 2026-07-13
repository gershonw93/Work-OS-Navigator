'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConnectCalendarButton } from '@/components/calendar/connect-calendar'

interface Item {
  id: string; kind: 'schedule' | 'task' | 'inspection'; project_id: string; project_name: string
  title: string; start: string; end: string; color: string; done?: boolean; href: string
}

const COLOR: Record<string, string> = {
  blue: 'bg-info-tint text-info', green: 'bg-success-tint text-success',
  purple: 'bg-accent-tint text-accent-fg', red: 'bg-danger-tint text-danger',
  amber: 'bg-warn-tint text-warn',
}
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function MasterCalendarPage() {
  const supabase = createClient()
  const router = useRouter()
  const { realRole, loading: permLoading } = usePermissions()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const isAdmin = realRole === 'admin' || realRole === 'manager'

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

  if (!permLoading && !isAdmin) return <div className="p-8 text-sm text-muted-fg">This view is for admins only.</div>
  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const first = new Date(cursor.y, cursor.m, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.y, cursor.m, d))
  while (cells.length % 7 !== 0) cells.push(null)
  const todayIso = iso(new Date())
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const move = (delta: number) => setCursor(c => {
    const d = new Date(c.y, c.m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink flex items-center gap-2"><CalendarDays className="h-6 w-6 text-accent-fg" /> Master Calendar</h1>
          <p className="text-sm text-muted-fg mt-0.5">Every project's schedule and task due dates in one place. Click an item to jump to its project.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => move(-1)} className="p-2 rounded-lg border border-line text-muted-fg hover:bg-surface"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-semibold text-ink-soft w-36 text-center">{monthLabel}</span>
          <button onClick={() => move(1)} className="p-2 rounded-lg border border-line text-muted-fg hover:bg-surface"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }) }} className="ml-1 px-3 py-2 rounded-lg border border-line text-sm text-muted-fg hover:bg-surface">Today</button>
          <ConnectCalendarButton className="ml-1" />
        </div>
      </div>

      <div className="bg-panel rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line-soft">
          {DOW.map(d => <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const k = d ? iso(d) : ''
            const dayItems = d ? (byDay.get(k) ?? []) : []
            return (
              <div key={i}
                onClick={() => { if (d && dayItems.length) setSelectedDay(k) }}
                className={cn('min-h-[96px] border-b border-r border-line-soft p-1.5 align-top', !d && 'bg-surface/40', k === todayIso && 'bg-accent-tint/30', d && dayItems.length && 'cursor-pointer hover:bg-surface/60')}>
                {d && <div className={cn('text-xs mb-1', k === todayIso ? 'font-bold text-accent-fg' : 'text-faint')}>{d.getDate()}</div>}
                <div className="space-y-1">
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

      {/* Day detail - everything happening that day; click one to open it */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedDay(null)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-4">
              <h2 className="text-lg font-bold text-ink">
                {new Date(selectedDay + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              </h2>
              <button onClick={() => setSelectedDay(null)} className="text-faint hover:text-ink text-2xl leading-none">×</button>
            </div>
            <div className="space-y-2 px-5 py-4">
              {(byDay.get(selectedDay) ?? []).map(it => (
                <button key={it.id} onClick={() => { setSelectedDay(null); router.push(it.href) }}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-left hover:border-accent hover:bg-surface transition-colors">
                  <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', (COLOR[it.color] ?? COLOR.blue).split(' ')[0])} />
                  <span className="min-w-0 flex-1">
                    <span className={cn('block font-medium text-ink', it.done && 'line-through text-muted-fg')}>{it.title}</span>
                    <span className="block text-xs text-muted-fg">{it.project_name} · {it.kind === 'inspection' ? 'Inspection' : it.kind === 'task' ? 'Task' : 'Schedule'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </button>
              ))}
              {(byDay.get(selectedDay) ?? []).length === 0 && <p className="py-6 text-center text-sm text-muted-fg">Nothing scheduled.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
