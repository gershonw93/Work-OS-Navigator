'use client'

import { useState } from 'react'
import {
  LayoutDashboard, FolderKanban, Receipt, CheckSquare, CalendarDays, DollarSign,
  TrendingUp, Clock, ShieldCheck, Truck, Banknote, MapPin, Wallet2, ArrowDownRight,
  ArrowUpRight, Hammer, FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrowserMock } from './browser-mock'

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', path: 'dashboard' },
  { icon: FolderKanban, label: 'Projects', path: 'projects' },
  { icon: CalendarDays, label: 'Master Calendar', path: 'master-calendar' },
  { icon: DollarSign, label: 'Master Money', path: 'master-money' },
  { icon: Receipt, label: 'Invoices', path: 'invoices' },
] as const

type NavPath = (typeof NAV)[number]['path']

// Interactive company-wide dashboard "screenshot". The sidebar (and the mobile
// tab strip) switch the main panel, and the browser URL bar follows along, so
// visitors can click around a believable product without leaving the page.
export function DashboardMock() {
  const [active, setActive] = useState<NavPath>('dashboard')

  return (
    <BrowserMock url={`app.sytenav.com/${active}`}>
      <div className="flex text-left min-h-[420px]">
        {/* Sidebar (desktop) */}
        <div className="hidden sm:flex w-44 flex-col border-r border-line bg-panel p-3 gap-1 shrink-0">
          <div className="px-2 py-2 text-sm font-bold text-ink font-display uppercase tracking-tight">SyteNav</div>
          {NAV.map(n => {
            const on = n.path === active
            return (
              <button
                key={n.path}
                onClick={() => setActive(n.path)}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-left transition-colors',
                  on ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-muted hover:text-ink'
                )}
              >
                <n.icon className="h-3.5 w-3.5 shrink-0" /> {n.label}
              </button>
            )
          })}
        </div>

        {/* Main */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile tab strip (no sidebar on small screens) */}
          <div className="sm:hidden flex gap-1.5 overflow-x-auto scrollbar-hide border-b border-line-soft px-3 py-2">
            {NAV.map(n => {
              const on = n.path === active
              return (
                <button
                  key={n.path}
                  onClick={() => setActive(n.path)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-colors',
                    on ? 'bg-accent text-accent-ink' : 'bg-muted text-muted-fg'
                  )}
                >
                  <n.icon className="h-3 w-3" /> {n.label}
                </button>
              )
            })}
          </div>

          <div className="p-4 flex-1">
            {active === 'dashboard' && <DashboardPanel />}
            {active === 'projects' && <ProjectsPanel />}
            {active === 'master-calendar' && <CalendarPanel />}
            {active === 'master-money' && <MoneyPanel />}
            {active === 'invoices' && <InvoicesPanel />}
          </div>
        </div>
      </div>
    </BrowserMock>
  )
}

// ─── Panels ───────────────────────────────────────────────────────────────

function DashboardPanel() {
  const stats = [
    { label: 'Active Projects', value: '18', icon: FolderKanban, color: 'text-accent-fg' },
    { label: 'Under Contract', value: '$4.2M', icon: DollarSign, color: 'text-success' },
    { label: 'Open Tasks', value: '63', icon: CheckSquare, color: 'text-info' },
    { label: 'Due This Week', value: '11', icon: Clock, color: 'text-warn' },
  ]
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
  const bars = [40, 65, 50, 80, 72, 95, 60, 88]
  const week = [
    { icon: ShieldCheck, text: 'Rough inspection · Maple St', when: 'Thu', tone: 'text-info' },
    { icon: Banknote, text: 'Draw #2 · Linden Ave', when: 'Fri', tone: 'text-success' },
    { icon: Truck, text: 'Steel delivery · Harborview', when: 'Mon', tone: 'text-warn' },
  ]
  const rows = [
    ['Maple Street Residences', 74],
    ['Linden Ave Remodel', 38],
    ['Oak Park Townhomes', 91],
  ] as const
  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-ink">Good morning, Garry</p>
          <p className="text-[11px] text-faint">Here&apos;s what&apos;s happening across your jobs</p>
        </div>
        <div className="h-7 w-7 rounded-full bg-accent/30" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <s.icon className={cn('h-3.5 w-3.5', s.color)} />
              <span className="text-[10px] text-muted-fg">{s.label}</span>
            </div>
            <p className={cn('text-lg font-bold font-display', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3 rounded-lg border border-line bg-panel p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-ink-soft flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5 text-accent-fg" /> Cash in vs out
            </p>
            <div className="flex items-center gap-3 text-[9px] text-muted-fg">
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm bg-accent inline-block" /> In</span>
              <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-sm bg-info/50 inline-block" /> Out</span>
            </div>
          </div>
          <div className="flex gap-2 h-24">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 h-full flex items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-accent" style={{ height: `${b}%` }} />
                <div className="w-1/2 rounded-t bg-info/40" style={{ height: `${Math.max(b - 25, 8)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-1.5">
            {months.map(m => (
              <span key={m} className="flex-1 text-center text-[8px] text-faint">{m}</span>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-3">
          <div className="rounded-lg border border-line bg-panel p-3">
            <p className="text-[11px] font-semibold text-ink-soft mb-2 flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-accent-fg" /> This week
            </p>
            <div className="space-y-1.5">
              {week.map(w => (
                <div key={w.text} className="flex items-center gap-1.5">
                  <w.icon className={cn('h-3 w-3 shrink-0', w.tone)} />
                  <span className="text-[10px] text-ink-soft truncate flex-1">{w.text}</span>
                  <span className="text-[9px] text-faint shrink-0">{w.when}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-line bg-panel p-3">
            <p className="text-[11px] font-semibold text-ink-soft mb-2">Recent projects</p>
            <div className="space-y-1.5">
              {rows.map(([name, pct]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-soft truncate flex-1">{name}</span>
                  <div className="h-1 w-12 bg-muted rounded-full overflow-hidden shrink-0">
                    <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[9px] font-semibold text-success shrink-0">{pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ label }: { label: string }) {
  const tone =
    label === 'Active' ? 'bg-success-tint text-success'
    : label === 'Planning' ? 'bg-info-tint text-info'
    : 'bg-warn-tint text-warn'
  return <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold', tone)}>{label}</span>
}

function ProjectsPanel() {
  const projects = [
    { name: 'Maple Street Residences', loc: 'Brooklyn, NY', status: 'Active', pct: 74, val: '$1.2M' },
    { name: 'Linden Ave Remodel', loc: 'Linden, NJ', status: 'Active', pct: 38, val: '$420K' },
    { name: 'Princeton Commercial', loc: 'Princeton, NJ', status: 'Planning', pct: 12, val: '$3.1M' },
    { name: 'Oak Park Townhomes', loc: 'Newark, NJ', status: 'Active', pct: 91, val: '$880K' },
    { name: 'Cedar Lane Duplex', loc: 'Edison, NJ', status: 'On hold', pct: 22, val: '$310K' },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Projects <span className="text-faint font-normal text-xs">· 18 active</span></p>
        <span className="rounded-md bg-accent text-accent-ink text-[10px] font-bold px-2.5 py-1">+ New project</span>
      </div>
      <div className="space-y-2">
        {projects.map(p => (
          <div key={p.name} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-ink truncate">{p.name}</p>
                <p className="text-[10px] text-faint flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {p.loc}</p>
              </div>
              <StatusPill label={p.status} />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-accent" style={{ width: `${p.pct}%` }} />
              </div>
              <span className="text-[10px] text-muted-fg shrink-0">{p.pct}%</span>
              <span className="text-[10px] font-bold text-ink shrink-0 w-12 text-right">{p.val}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CalendarPanel() {
  const days = [
    { day: 'Mon', events: [{ t: 'Steel delivery · Harborview', tone: 'bg-warn' }] },
    { day: 'Tue', events: [{ t: 'Framing start · Cedar Lane', tone: 'bg-accent' }, { t: 'Client walk · Linden', tone: 'bg-info' }] },
    { day: 'Wed', events: [] },
    { day: 'Thu', events: [{ t: 'Rough inspection · Maple St', tone: 'bg-info' }] },
    { day: 'Fri', events: [{ t: 'Draw #2 due · Linden Ave', tone: 'bg-success-solid' }, { t: 'COI expires · Volt Bros', tone: 'bg-danger-solid' }] },
  ]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Master Calendar</p>
        <p className="text-[11px] text-faint">This week · all jobs</p>
      </div>
      <div className="space-y-1.5">
        {days.map(d => (
          <div key={d.day} className="flex gap-3 rounded-lg border border-line bg-panel p-2.5">
            <span className="text-[11px] font-bold text-ink-soft w-8 shrink-0">{d.day}</span>
            <div className="flex-1 space-y-1.5 min-w-0">
              {d.events.length === 0 ? (
                <span className="text-[10px] text-faint italic">No events</span>
              ) : d.events.map(e => (
                <div key={e.t} className="flex items-center gap-2">
                  <span className={cn('h-2 w-2 rounded-full shrink-0', e.tone)} />
                  <span className="text-[10px] text-ink-soft truncate">{e.t}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoneyPanel() {
  const tiles = [
    { label: 'Cash in (mo)', value: '$612K', icon: ArrowDownRight, color: 'text-success' },
    { label: 'Cash out (mo)', value: '$447K', icon: ArrowUpRight, color: 'text-danger' },
    { label: 'Net', value: '$165K', icon: Wallet2, color: 'text-accent-fg' },
  ]
  const breakdown = [
    { label: 'In escrow', value: '$1.24M', icon: ShieldCheck },
    { label: 'Fee earned to date', value: '$389K', icon: Banknote },
    { label: 'Owed to vendors', value: '$212K', icon: Truck },
    { label: 'Retainage held', value: '$96K', icon: Hammer },
  ]
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-ink">Master Money <span className="text-faint font-normal text-xs">· across 18 jobs</span></p>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map(t => (
          <div key={t.label} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-center gap-1 mb-1">
              <t.icon className={cn('h-3.5 w-3.5', t.color)} />
              <span className="text-[9px] text-muted-fg">{t.label}</span>
            </div>
            <p className={cn('text-base font-bold font-display', t.color)}>{t.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-line bg-panel divide-y divide-line-soft">
        {breakdown.map(b => (
          <div key={b.label} className="flex items-center gap-2 px-3 py-2.5">
            <b.icon className="h-3.5 w-3.5 text-muted-fg shrink-0" />
            <span className="text-[11px] text-ink-soft flex-1">{b.label}</span>
            <span className="text-[11px] font-bold text-ink">{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function InvoicesPanel() {
  const invoices = [
    { no: 'INV-1042', job: 'Maple Street', amt: '$44,550', status: 'Paid' },
    { no: 'INV-1041', job: 'Linden Ave', amt: '$29,700', status: 'Pending' },
    { no: 'INV-1039', job: 'Harborview Lofts', amt: '$61,200', status: 'Overdue' },
    { no: 'INV-1038', job: 'Oak Park', amt: '$18,900', status: 'Paid' },
    { no: 'INV-1036', job: 'Cedar Lane', amt: '$12,300', status: 'Pending' },
  ]
  const tone = (s: string) =>
    s === 'Paid' ? 'bg-success-tint text-success'
    : s === 'Pending' ? 'bg-info-tint text-info'
    : 'bg-danger-tint text-danger'
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-ink">Invoices</p>
        <p className="text-[11px] text-faint">$103K outstanding</p>
      </div>
      <div className="rounded-lg border border-line bg-panel divide-y divide-line-soft">
        {invoices.map(inv => (
          <div key={inv.no} className="flex items-center gap-2 px-3 py-2.5">
            <FileText className="h-3.5 w-3.5 text-muted-fg shrink-0" />
            <span className="text-[11px] font-mono font-semibold text-ink shrink-0">{inv.no}</span>
            <span className="text-[10px] text-faint truncate flex-1">{inv.job}</span>
            <span className="text-[11px] font-bold text-ink shrink-0">{inv.amt}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-[9px] font-semibold shrink-0 w-16 text-center', tone(inv.status))}>{inv.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
