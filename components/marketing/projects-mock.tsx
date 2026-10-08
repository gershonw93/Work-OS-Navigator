'use client'

import {
  Search, Plus, MapPin, User, Calendar, Pencil, Trash2, LayoutGrid, List, Map as MapIcon,
  LayoutDashboard, FolderKanban, Users, BookUser, Folder, Wrench, ShoppingCart, CheckSquare,
  CalendarDays, DollarSign, Bell, Building2, SlidersHorizontal, ArrowUpDown, ChevronsUpDown,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SyteNavLogo } from '@/components/ui/logo'

// The Projects screen, the star of the scroll hero. It is drawn to look like
// the REAL screen (app/(dashboard)/projects/page.tsx) - sidebar, stat boxes,
// toolbar, and the same card: status strip, type, address, client, dates,
// task progress, and the Contract / Paid / Outstanding tiles. A marketing
// picture of a screen the product does not have is a promise it cannot keep.
// Invented jobs, no real data.
type Status = 'active' | 'planning' | 'on_hold' | 'completed'

const PROJECTS: {
  name: string; type: string; address: string; client: string; status: Status
  start: number; months: number; done: number; tasks: number
  contract: number; paid: number; owed: number
}[] = [
  { name: 'Maple Street Residences', type: 'Residential', address: '41 Maple St, Brooklyn, NY 11225', client: 'Maple Street Holdings LLC', status: 'active', start: -5, months: 11, done: 14, tasks: 19, contract: 1200000, paid: 610000, owed: 84000 },
  { name: 'Harborview Lofts', type: 'Commercial', address: '200 Washington Blvd, Jersey City, NJ', client: 'Harborview Partners', status: 'active', start: -3, months: 14, done: 9, tasks: 16, contract: 2400000, paid: 920000, owed: 140000 },
  { name: 'Princeton Commercial', type: 'Commercial', address: '12 Nassau St, Princeton, NJ 08542', client: 'Nassau Street Realty', status: 'planning', start: 2, months: 12, done: 1, tasks: 8, contract: 3100000, paid: 0, owed: 0 },
  { name: 'Oak Park Townhomes', type: 'Residential', address: '88 Oak Park Rd, Newark, NJ 07104', client: 'Daniel Okafor', status: 'active', start: -9, months: 11, done: 21, tasks: 23, contract: 880000, paid: 702000, owed: 36000 },
  { name: 'Cedar Lane Duplex', type: 'Residential', address: '7 Cedar Ln, Edison, NJ 08817', client: 'Priya & Sam Mehta', status: 'on_hold', start: -2, months: 8, done: 2, tasks: 9, contract: 310000, paid: 45000, owed: 12000 },
  { name: 'Summit Office Fit-out', type: 'Commercial', address: '55 Springfield Ave, Summit, NJ', client: 'Summit Medical Group', status: 'active', start: -4, months: 7, done: 8, tasks: 12, contract: 640000, paid: 330000, owed: 58000 },
  { name: 'Garden State Plaza Unit 4', type: 'Commercial', address: '1 Garden State Plaza, Paramus, NJ', client: 'GSP Retail LLC', status: 'planning', start: 1, months: 6, done: 0, tasks: 4, contract: 1700000, paid: 0, owed: 0 },
  { name: 'Riverside Kitchen Reno', type: 'Residential', address: '310 Hudson St, Hoboken, NJ 07030', client: 'Laura Chen', status: 'completed', start: -7, months: 5, done: 11, tasks: 11, contract: 190000, paid: 190000, owed: 0 },
  { name: 'Bergen Point Warehouse', type: 'Industrial', address: '900 Ave A, Bayonne, NJ 07002', client: 'Bergen Logistics Inc.', status: 'active', start: -6, months: 16, done: 10, tasks: 22, contract: 2900000, paid: 1100000, owed: 210000 },
]

const STATUS_BADGE: Record<Status, string> = {
  active: 'bg-success-tint text-success',
  planning: 'bg-info-tint text-info',
  on_hold: 'bg-warn-tint text-warn',
  completed: 'bg-muted text-muted-fg',
}
// The strip across the top of the card is the status, in the badge's colour -
// the same rule as the real card.
const STATUS_STRIP: Record<Status, string> = {
  active: 'bg-success-solid',
  planning: 'bg-info-solid',
  on_hold: 'bg-warn-solid',
  completed: 'bg-muted2',
}
const STATUS_LABEL: Record<Status, string> = {
  active: 'Active', planning: 'Planning', on_hold: 'On hold', completed: 'Completed',
}

// Dates are offsets from the month the page was built, so the picture never
// shows a job "starting" two years ago. A fixed month table and UTC: this
// renders on the server, which must not ask its own machine how to spell a date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthFrom(offset: number, day: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day))
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

// Same shape as the real card's fmtMoney.
function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString('en-US')}`
}

// THE COUNT-UP RUNS ONCE PER PAGE LOAD. The numbers start at zero and the bars
// empty; the first scroll that happens while this screen is on view starts it,
// and once it has run it never goes back - scrolling to the top again leaves
// everything full. A gauge that drains every time you scroll up reads as a
// screen that lost its data. Reduced motion skips straight to the end, and so
// does a mock that was never on view (display: none has no size).
const DURATION = 1400
const STAGGER = 70
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3)

function useCountUpOnScroll() {
  const ref = useRef<HTMLDivElement>(null)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setElapsed(Infinity)
      return
    }
    let raf = 0
    let started = false
    const inView = () => {
      const r = ref.current?.getBoundingClientRect()
      return !!r && r.width > 0 && r.bottom > 0 && r.top < window.innerHeight
    }
    const onScroll = () => {
      if (started || !inView()) return
      started = true
      window.removeEventListener('scroll', onScroll)
      const t0 = performance.now()
      const tick = (t: number) => {
        const ms = t - t0
        setElapsed(ms)
        if (ms < DURATION + STAGGER * PROJECTS.length) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  return { ref, elapsed }
}

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: FolderKanban, label: 'Projects', on: true },
  { icon: Users, label: 'Customers' },
  { icon: BookUser, label: 'Directory' },
  { icon: Folder, label: 'Files' },
  { icon: Wrench, label: 'Equipment' },
  { icon: ShoppingCart, label: 'Materials' },
  { icon: CheckSquare, label: 'Approvals' },
]

export function ProjectsMock() {
  const { ref, elapsed } = useCountUpOnScroll()
  const head = ease(elapsed / DURATION)
  const count = (s: Status) => Math.round(PROJECTS.filter(p => p.status === s).length * head)
  const stats = [
    { label: 'Total', value: Math.round(PROJECTS.length * head), tone: 'text-ink', on: true },
    { label: 'Active', value: count('active'), tone: 'text-success' },
    { label: 'Planning', value: count('planning'), tone: 'text-info' },
    { label: 'On Hold', value: count('on_hold'), tone: 'text-warn' },
    { label: 'Completed', value: count('completed'), tone: 'text-muted-fg' },
  ]

  return (
    <div ref={ref} className="bg-panel text-left h-full overflow-hidden flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-44 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-1.5 px-4 h-11 border-b border-line">
          <SyteNavLogo size={18} />
        </div>
        <nav className="p-2 space-y-0.5">
          {NAV.map(n => (
            <div key={n.label} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${n.on ? 'bg-accent text-accent-ink font-semibold' : 'text-ink-soft'}`}>
              <n.icon className="h-3.5 w-3.5" /> {n.label}
            </div>
          ))}
          <p className="px-2.5 pt-3 pb-1 text-[9px] font-semibold tracking-wider text-faint">MASTER</p>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-ink-soft"><CalendarDays className="h-3.5 w-3.5" /> Master Calendar</div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-ink-soft"><DollarSign className="h-3.5 w-3.5" /> Master Money</div>
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 px-5 h-11 border-b border-line bg-panel shrink-0">
          <span className="text-[11px] text-muted-fg">Projects</span>
          <div className="hidden sm:flex items-center gap-1.5 w-72 rounded-md border border-line px-2 py-1 text-[10px] text-faint">
            <Search className="h-3 w-3" /> Search jobs, line items, receipts, people…
          </div>
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-fg" />
            <span className="h-5 w-5 rounded-full bg-muted" />
          </div>
        </div>

        <div className="p-5 flex-1 min-h-0 flex flex-col">
          {/* Page header */}
          <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
            <div>
              <p className="text-base font-bold text-ink">Projects</p>
              <p className="text-[10px] text-muted-fg">Manage all your construction projects.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-medium text-ink">Bulk Add</span>
              <span className="rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-ink inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> New Project
              </span>
            </div>
          </div>

          {/* Stat boxes */}
          <div className="hidden sm:grid grid-cols-5 gap-2 mb-3 shrink-0">
            {stats.map(s => (
              <div key={s.label} className={`rounded-lg border bg-panel px-3 py-2 ${s.on ? 'border-accent' : 'border-line'}`}>
                <p className={`text-sm font-bold ${s.tone}`}>{s.value}</p>
                <p className="text-[9px] text-muted-fg">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-faint">
              <Search className="h-3 w-3" /> Search by name, address, or client…
            </div>
            {[[Building2, 'All Types'], [SlidersHorizontal, 'All Statuses'], [ArrowUpDown, 'Newest first']].map(([Icon, label]) => {
              const I = Icon as typeof Building2
              return (
                <span key={label as string} className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-ink">
                  <I className="h-3 w-3 text-faint" /> {label as string} <ChevronsUpDown className="h-2.5 w-2.5 text-faint" />
                </span>
              )
            })}
            <span className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-line bg-panel p-0.5">
              <span className="rounded bg-accent p-1"><LayoutGrid className="h-2.5 w-2.5 text-accent-ink" /></span>
              <span className="p-1"><List className="h-2.5 w-2.5 text-faint" /></span>
              <span className="p-1"><MapIcon className="h-2.5 w-2.5 text-faint" /></span>
            </span>
          </div>

          <p className="text-[10px] text-muted-fg mb-2 shrink-0">{PROJECTS.length} projects</p>

          {/* Cards - the real card, smaller. Clips at the bottom like a real
              screen, so the hero monitor never shows empty glass. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 min-h-0 overflow-hidden content-start auto-rows-max">
            {PROJECTS.map((p, i) => {
              const e = ease((elapsed - i * STAGGER) / DURATION)
              return (
              <div key={p.name} className="rounded-lg border border-line bg-panel overflow-hidden">
                <div className={`h-1 ${STATUS_STRIP[p.status]}`} />
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-[9px] text-faint">{p.type}</p>
                    </div>
                    <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 shrink-0 ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-muted-fg">
                    <p className="flex items-center gap-1.5 min-w-0"><MapPin className="h-2.5 w-2.5 shrink-0 text-faint" /><span className="truncate">{p.address}</span></p>
                    <p className="flex items-center gap-1.5 min-w-0"><User className="h-2.5 w-2.5 shrink-0 text-faint" /><span className="truncate">{p.client}</span></p>
                    <p className="flex items-center gap-1.5" suppressHydrationWarning><Calendar className="h-2.5 w-2.5 shrink-0 text-faint" />{monthFrom(p.start, 11)} → {monthFrom(p.start + p.months, 19)}</p>
                  </div>
                  {(() => {
                    const final = Math.round((p.done / p.tasks) * 100)
                    const pct = Math.round(final * e)
                    return (
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[9px] mb-1">
                          <span className="text-muted-fg">Progress</span>
                          <span className="font-semibold text-ink-soft">{pct}%<span className="font-normal text-faint"> · {Math.round(p.done * e)}/{p.tasks} tasks</span></span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${final === 100 && e === 1 ? 'bg-success-solid' : 'bg-accent'}`} style={{ width: `${final * e}%` }} />
                        </div>
                      </div>
                    )
                  })()}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-md bg-surface py-1"><p className="text-[8px] text-faint">Contract</p><p className="text-[10px] font-semibold text-ink-soft">{fmtMoney(p.contract * e)}</p></div>
                    <div className="rounded-md bg-success-tint py-1"><p className="text-[8px] text-success/70">Paid</p><p className="text-[10px] font-semibold text-success">{fmtMoney(p.paid * e)}</p></div>
                    <div className="rounded-md bg-warn-tint py-1"><p className="text-[8px] text-warn/70">Outstanding</p><p className="text-[10px] font-semibold text-warn">{fmtMoney(p.owed * e)}</p></div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line-soft px-3 py-1.5">
                  <span className="text-[10px] font-medium text-accent-fg">Open →</span>
                  <span className="flex items-center gap-2 text-faint"><Pencil className="h-2.5 w-2.5" /><Trash2 className="h-2.5 w-2.5" /></span>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
