'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { DollarSign, TrendingUp, CheckCircle2, Clock, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Row {
  project_id: string; project_name: string; status: string
  budgeted: number; committed: number; billed: number; paid: number; outstanding: number
}
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function MasterMoneyPage() {
  const supabase = createClient()
  const { realRole, loading: permLoading } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const isAdmin = realRole === 'admin' || realRole === 'manager'

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/master/money', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) setRows((await res.json()).rows ?? [])
      setLoading(false)
    })()
  }, [])

  if (!permLoading && !isAdmin) return <div className="p-8 text-sm text-muted-fg">This view is for admins only.</div>
  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const t = rows.reduce((a, r) => ({
    budgeted: a.budgeted + r.budgeted, committed: a.committed + r.committed,
    billed: a.billed + r.billed, paid: a.paid + r.paid, outstanding: a.outstanding + r.outstanding,
  }), { budgeted: 0, committed: 0, billed: 0, paid: 0, outstanding: 0 })

  const cards = [
    { label: 'Total Budget', value: t.budgeted, icon: DollarSign, color: 'text-ink', bg: 'bg-panel' },
    { label: 'Committed', value: t.committed, icon: TrendingUp, color: 'text-info', bg: 'bg-info-tint' },
    { label: 'Paid', value: t.paid, icon: CheckCircle2, color: 'text-success', bg: 'bg-success-tint' },
    { label: 'Outstanding', value: t.outstanding, icon: Clock, color: 'text-warn', bg: 'bg-warn-tint' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-ink">Master Money</h1>
        <p className="text-sm text-muted-fg mt-0.5">Budget, commitments and billing rolled up across every project. Click a row to open its financials.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => { const Icon = c.icon; return (
          <div key={c.label} className={cn('rounded-xl border border-line p-4', c.bg)}>
            <div className="flex items-center gap-2 mb-2"><Icon className={cn('h-4 w-4', c.color)} /><p className="text-xs font-medium text-muted-fg">{c.label}</p></div>
            <p className={cn('text-2xl font-bold', c.color)}>{money(c.value)}</p>
          </div>
        )})}
      </div>

      {rows.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center text-sm text-muted-fg">No projects yet.</div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_repeat(5,minmax(0,7rem))_2rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
            <span>Project</span><span className="text-right">Budgeted</span><span className="text-right">Committed</span><span className="text-right">Billed</span><span className="text-right">Paid</span><span className="text-right">Outstanding</span><span />
          </div>
          <div className="divide-y divide-line-soft">
            {rows.map(r => (
              <Link key={r.project_id} href={`/projects/${r.project_id}/financials`}
                className="group md:grid md:grid-cols-[1fr_repeat(5,minmax(0,7rem))_2rem] md:gap-2 md:items-center px-4 py-3 hover:bg-surface transition-colors block">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-soft truncate">{r.project_name}</p>
                  <p className="text-xs text-faint capitalize">{r.status}</p>
                </div>
                <Cell label="Budgeted" v={money(r.budgeted)} />
                <Cell label="Committed" v={money(r.committed)} />
                <Cell label="Billed" v={money(r.billed)} />
                <Cell label="Paid" v={money(r.paid)} cls="text-success" />
                <Cell label="Outstanding" v={money(r.outstanding)} cls={r.outstanding > 0 ? 'text-warn' : 'text-faint'} />
                <ChevronRight className="hidden md:block h-4 w-4 text-faint opacity-0 group-hover:opacity-100 ml-auto" />
              </Link>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-[1fr_repeat(5,minmax(0,7rem))_2rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span>
            <span className="text-right">{money(t.budgeted)}</span><span className="text-right">{money(t.committed)}</span>
            <span className="text-right">{money(t.billed)}</span><span className="text-right text-success">{money(t.paid)}</span>
            <span className="text-right text-warn">{money(t.outstanding)}</span><span />
          </div>
        </div>
      )}
    </div>
  )
}

function Cell({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between md:block md:text-right text-sm mt-1 md:mt-0">
      <span className="md:hidden text-xs text-faint">{label}</span>
      <span className={cn('text-ink-soft', cls)}>{v}</span>
    </div>
  )
}
