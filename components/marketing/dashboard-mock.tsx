import {
  LayoutDashboard, FolderKanban, Receipt, CheckSquare, CalendarDays, DollarSign,
  TrendingUp, Clock, ShieldCheck, Truck, Banknote,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// The company-wide dashboard "screenshot": stat cards, cash in vs out chart,
// what's due this week, and recent projects. No real data.
export function DashboardMock() {
  const nav = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: FolderKanban, label: 'Projects' },
    { icon: CalendarDays, label: 'Master Calendar' },
    { icon: DollarSign, label: 'Master Money' },
    { icon: Receipt, label: 'Invoices' },
  ]
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
    <div className="flex text-left min-h-[420px]">
      {/* Sidebar */}
      <div className="hidden sm:flex w-44 flex-col border-r border-line bg-panel p-3 gap-1 shrink-0">
        <div className="px-2 py-2 text-sm font-bold text-ink font-display uppercase tracking-tight">SyteNav</div>
        {nav.map(n => (
          <div key={n.label} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium', n.active ? 'bg-accent text-accent-ink' : 'text-muted-fg')}>
            <n.icon className="h-3.5 w-3.5" /> {n.label}
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 p-4 space-y-3.5 min-w-0">
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
          {/* Cash chart */}
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

          {/* Right column */}
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
    </div>
  )
}
