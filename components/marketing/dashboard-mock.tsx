import { LayoutDashboard, FolderKanban, Wallet, Receipt, CheckSquare, FileText, CalendarDays, DollarSign, TrendingUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// A believable faux product UI to place inside a BrowserMock, used as the
// "screenshot" on the marketing site (no real data needed).
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
  const bars = [40, 65, 50, 80, 72, 95, 60, 88]
  const rows = [
    ['Maple Street Residences', 'Active', '74%'],
    ['Linden Ave Remodel', 'Active', '38%'],
    ['Princeton Commercial', 'Planning', '12%'],
    ['Oak Park Townhomes', 'Active', '91%'],
  ]
  return (
    <div className="flex text-left min-h-[420px]">
      {/* Sidebar */}
      <div className="hidden sm:flex w-44 flex-col border-r border-line bg-panel p-3 gap-1 shrink-0">
        <div className="px-2 py-2 text-sm font-bold text-ink">SyteNav</div>
        {nav.map(n => (
          <div key={n.label} className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium', n.active ? 'bg-accent text-accent-ink' : 'text-muted-fg')}>
            <n.icon className="h-3.5 w-3.5" /> {n.label}
          </div>
        ))}
      </div>
      {/* Main */}
      <div className="flex-1 p-4 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-ink">Good morning, Garry</p>
            <p className="text-[11px] text-faint">Here's what's happening across your jobs</p>
          </div>
          <div className="h-7 w-7 rounded-full bg-accent/30" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center gap-1.5 mb-1.5"><s.icon className={cn('h-3.5 w-3.5', s.color)} /><span className="text-[10px] text-muted-fg">{s.label}</span></div>
              <p className={cn('text-lg font-bold', s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="grid lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 rounded-lg border border-line bg-panel p-3">
            <p className="text-[11px] font-semibold text-ink-soft mb-3 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-accent-fg" /> Cash in vs out</p>
            <div className="flex items-end gap-2 h-28">
              {bars.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end gap-1">
                  <div className="w-full rounded-t bg-accent" style={{ height: `${b}%` }} />
                  <div className="w-full rounded-t bg-info/40" style={{ height: `${Math.max(b - 25, 8)}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-2 rounded-lg border border-line bg-panel p-3">
            <p className="text-[11px] font-semibold text-ink-soft mb-2 flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-accent-fg" /> Recent projects</p>
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r[0]} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-ink-soft truncate">{r[0]}</span>
                  <span className="text-[10px] font-semibold text-success shrink-0">{r[2]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
