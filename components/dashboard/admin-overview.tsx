'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TrendingUp, CalendarDays, FileText, ClipboardCheck, Banknote, Truck, CheckSquare, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OverviewData {
  months: { label: string; in: number; out: number }[]
  week: { kind: string; label: string; project: string; project_id: string; date: string }[]
  recent: { id: string; name: string; status: string; pct: number }[]
  dueThisWeek: number
}

const money = (n: number) => n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${Math.round(n / 1_000)}K` : `$${Math.round(n)}`

const WEEK_ICON: Record<string, any> = { delivery: Truck, schedule: ClipboardCheck, task: CheckSquare }

// Cash in vs out (monthly, two series) + This week + Recent projects.
// Series colors come from the validated --chart-in / --chart-out tokens.
export function AdminOverview({ data }: { data: OverviewData }) {
  const [hover, setHover] = useState<number | null>(null)
  const months = data.months
  const max = Math.max(...months.map(m => Math.max(m.in, m.out)), 1)
  const hasCash = months.some(m => m.in > 0 || m.out > 0)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* Cash in vs out */}
      <div className="lg:col-span-3 rounded-xl border border-line bg-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-ink-soft flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-accent-fg" /> Cash in vs out</p>
          <div className="flex items-center gap-3 text-xs text-muted-fg">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'rgb(var(--chart-in))' }} /> In</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'rgb(var(--chart-out))' }} /> Out</span>
          </div>
        </div>

        {hasCash ? (
          <div className="relative">
            {/* Tooltip */}
            {hover !== null && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-line bg-panel shadow-lg px-3 py-1.5 text-xs whitespace-nowrap pointer-events-none">
                <span className="font-semibold text-ink">{months[hover].label}</span>
                <span className="text-muted-fg"> · In {money(months[hover].in)} · Out {money(months[hover].out)}</span>
              </div>
            )}
            <div className="flex items-end gap-1 h-36" onMouseLeave={() => setHover(null)}>
              {months.map((m, i) => (
                <div key={i} onMouseEnter={() => setHover(i)}
                  className={cn('flex-1 flex items-end justify-center gap-[2px] h-full rounded-md pt-1 cursor-default', hover === i && 'bg-muted/60')}>
                  <div className="w-[38%] max-w-4 rounded-t-[4px]" style={{ height: `${Math.max((m.in / max) * 100, m.in > 0 ? 4 : 0)}%`, background: 'rgb(var(--chart-in))' }} />
                  <div className="w-[38%] max-w-4 rounded-t-[4px]" style={{ height: `${Math.max((m.out / max) * 100, m.out > 0 ? 4 : 0)}%`, background: 'rgb(var(--chart-out))' }} />
                </div>
              ))}
            </div>
            <div className="flex gap-1 mt-1.5">
              {months.map((m, i) => (
                <span key={i} className={cn('flex-1 text-center text-[10px]', hover === i ? 'text-ink-soft font-semibold' : 'text-faint')}>{m.label}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-36 flex items-center justify-center text-sm text-faint">
            No payments recorded yet. Cash appears here as client payments and paid invoices come in.
          </div>
        )}
      </div>

      {/* Right column */}
      <div className="lg:col-span-2 space-y-5">
        {/* This week */}
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="text-sm font-semibold text-ink-soft flex items-center gap-1.5 mb-3"><CalendarDays className="h-4 w-4 text-accent-fg" /> This week</p>
          {data.week.length === 0 ? (
            <p className="text-sm text-faint">Nothing scheduled in the next 7 days.</p>
          ) : (
            <div className="space-y-2.5">
              {data.week.map((w, i) => {
                const Icon = WEEK_ICON[w.kind] ?? ClipboardCheck
                return (
                  <Link key={i} href={`/projects/${w.project_id}/${w.kind === 'task' ? 'tasks' : 'schedule'}`} className="flex items-center gap-2.5 group">
                    <Icon className={cn('h-4 w-4 shrink-0', w.kind === 'delivery' ? 'text-warn' : w.kind === 'task' ? 'text-info' : 'text-success')} />
                    <span className="text-sm text-ink-soft truncate group-hover:text-ink">{w.label}</span>
                    <span className="text-xs text-faint truncate">· {w.project}</span>
                    <span className="ml-auto text-xs text-muted-fg shrink-0">{new Date(w.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent projects */}
        <div className="rounded-xl border border-line bg-panel p-5">
          <p className="text-sm font-semibold text-ink-soft flex items-center gap-1.5 mb-3"><FileText className="h-4 w-4 text-accent-fg" /> Recent projects</p>
          {data.recent.length === 0 ? (
            <p className="text-sm text-faint">No projects yet.</p>
          ) : (
            <div className="space-y-3">
              {data.recent.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 group">
                  <span className="text-sm text-ink-soft truncate flex-1 group-hover:text-ink">{p.name}</span>
                  <span className="h-1.5 w-20 rounded-full bg-muted overflow-hidden shrink-0">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${p.pct}%` }} />
                  </span>
                  <span className="text-xs font-semibold text-muted-fg w-9 text-right shrink-0">{p.pct}%</span>
                  <ChevronRight className="h-3.5 w-3.5 text-faint opacity-0 group-hover:opacity-100 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
