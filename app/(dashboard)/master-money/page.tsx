'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { DollarSign, TrendingUp, CheckCircle2, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StatStrip } from '@/components/ui/stat-strip'
import { InfoHint } from '@/components/ui/info-hint'
import { ESCROW_EXPLAINED, escrowSentence, hasNoMoney } from '@/lib/master-money'

interface Row {
  project_id: string; project_name: string; status: string
  budgeted: number; committed: number; billed: number; paid: number; outstanding: number
  received: number; escrow: number
}
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function MasterMoneyPage() {
  const supabase = createClient()
  // `role`, not `realRole`, so previewing a role shows what that role sees.
  // The API behind this page checks the real role and 403s regardless.
  const { role, loading: permLoading } = usePermissions()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  // PHONE: which project card is open, and whether the no-money ones are shown.
  const [openRow, setOpenRow] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)

  const isAdmin = role === 'admin' || role === 'manager'

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/master/money', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) setRows((await res.json()).rows ?? [])
      setLoading(false)
    })()
  }, [])

  // Nothing renders until permissions are KNOWN. This used to read
  // `!permLoading && !isAdmin`, so while they were still loading the guard was
  // skipped and the page painted its admin layout - Office Staff saw the whole
  // Master Money screen. The data never leaked (the API refuses on the real
  // role, which is why it showed zeros), but the surface did, and "you may not
  // be here" arriving a second late is not a guard.
  if (permLoading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  if (!isAdmin) return <div className="p-8 text-sm text-muted-fg">This view is for admins only.</div>
  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const t = rows.reduce((a, r) => ({
    budgeted: a.budgeted + r.budgeted, committed: a.committed + r.committed,
    billed: a.billed + r.billed, paid: a.paid + r.paid, outstanding: a.outstanding + r.outstanding,
    received: a.received + r.received, escrow: a.escrow + r.escrow,
  }), { budgeted: 0, committed: 0, billed: 0, paid: 0, outstanding: 0, received: 0, escrow: 0 })

  const moneyRows = rows.filter(r => !hasNoMoney(r))
  const emptyRows = rows.filter(hasNoMoney)

  const cards = [
    { label: 'Client Received', value: t.received, icon: DollarSign, color: 'text-success', bg: 'bg-success-tint' },
    { label: 'Committed', value: t.committed, icon: TrendingUp, color: 'text-info', bg: 'bg-info-tint' },
    { label: 'Paid Out', value: t.paid, icon: CheckCircle2, color: 'text-ink', bg: 'bg-panel' },
    { label: 'Escrow Balance', value: t.escrow, icon: Clock, color: t.escrow < 0 ? 'text-danger' : 'text-accent-fg', bg: t.escrow < 0 ? 'bg-danger-tint' : 'bg-accent-tint/50' },
  ]

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-ink">Master Money</h1>
        <p className="text-sm text-muted-fg mt-0.5">Budget, commitments and billing rolled up across every project. Click a row to open its financials.</p>
      </div>

      {/* PHONE: one card, the numbers ink, red only when escrow is negative.
          DESKTOP (lg+): the four tiles it always had. */}
      <StatStrip label="All projects" className="lg:hidden" items={[
        { label: 'Client received', value: money(t.received) },
        { label: 'Committed', value: money(t.committed) },
        { label: 'Paid out', value: money(t.paid) },
        { label: 'Escrow balance', value: money(t.escrow), tone: t.escrow < 0 ? 'danger' : undefined },
      ]} />
      {/* What escrow MEANS, said under the number rather than left to a red
          minus sign. The sentence is built from the route's own arithmetic
          (lib/master-money.ts); the "?" holds the whole definition. */}
      <p className="lg:hidden flex items-start gap-1.5 text-sm text-muted-fg">
        <span className="min-w-0 flex-1">{escrowSentence(t.escrow, money) ?? 'What is escrow?'}</span>
        <InfoHint className="mt-0.5 shrink-0" text={ESCROW_EXPLAINED} />
      </p>
      <div className="hidden lg:grid lg:grid-cols-4 gap-4">
        {cards.map(c => { const Icon = c.icon; return (
          <div key={c.label} className={cn('rounded-xl border border-line p-4', c.bg)}>
            <div className="flex items-center gap-2 mb-2"><Icon className={cn('h-4 w-4', c.color)} /><p className="text-xs font-medium text-muted-fg">{c.label}</p>{c.label === 'Escrow Balance' && <InfoHint text={ESCROW_EXPLAINED} />}</div>
            <p className={cn('text-2xl font-bold', c.color)}>{money(c.value)}</p>
          </div>
        )})}
      </div>

      {rows.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center text-sm text-muted-fg">No projects yet.</div>
      ) : (
        <>
        {/* PHONE: a card of rows, THREE numbers each - received, paid out,
            escrow - and a tap for the rest. It was six label/value lines per
            job, so four jobs filled the screen with twenty-four numbers. Jobs
            with no money on them at all fold into one row at the bottom. */}
        <div className="lg:hidden divide-y divide-line-soft rounded-2xl border border-line bg-panel">
          {moneyRows.map(r => (
            <PhoneMoneyRow key={r.project_id} r={r} open={openRow === r.project_id}
              onToggle={() => setOpenRow(o => o === r.project_id ? null : r.project_id)} />
          ))}
          {emptyRows.length > 0 && (
            <>
              <button type="button" onClick={() => setShowEmpty(v => !v)} aria-expanded={showEmpty}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-fg">
                <span>{emptyRows.length} {emptyRows.length === 1 ? 'project' : 'projects'} with no money yet</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition-transform', showEmpty && 'rotate-180')} />
              </button>
              {showEmpty && emptyRows.map(r => (
                <Link key={r.project_id} href={`/projects/${r.project_id}/payments`}
                  className="flex min-h-11 items-center justify-between gap-3 bg-surface px-4 py-3 last:rounded-b-2xl">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink-soft">{r.project_name}</span>
                    <span className="block text-xs capitalize text-faint">{r.status}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                </Link>
              ))}
            </>
          )}
        </div>
        <div className="hidden lg:block bg-panel rounded-2xl border border-line overflow-hidden lg:rounded-xl">
          <div className="hidden md:grid grid-cols-[1fr_repeat(6,minmax(0,6.5rem))_2rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
            <span>Project</span><span className="text-right">Received</span><span className="text-right">Budgeted</span><span className="text-right">Committed</span><span className="text-right">Paid Out</span><span className="text-right">Outstanding</span><span className="text-right">Escrow <InfoHint className="align-middle normal-case" text={ESCROW_EXPLAINED} /></span><span />
          </div>
          <div className="divide-y divide-line-soft">
            {rows.map(r => (
              <Link key={r.project_id} href={`/projects/${r.project_id}/payments`}
                className="group md:grid md:grid-cols-[1fr_repeat(6,minmax(0,6.5rem))_2rem] md:gap-2 md:items-center px-4 py-3 hover:bg-surface transition-colors block">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-soft truncate">{r.project_name}</p>
                  <p className="text-xs text-faint capitalize">{r.status}</p>
                </div>
                <Cell label="Received" v={money(r.received)} cls="text-success" />
                <Cell label="Budgeted" v={money(r.budgeted)} />
                <Cell label="Committed" v={money(r.committed)} />
                <Cell label="Paid Out" v={money(r.paid)} />
                <Cell label="Outstanding" v={money(r.outstanding)} cls={r.outstanding > 0 ? 'text-warn' : 'text-faint'} />
                <Cell label="Escrow" v={money(r.escrow)} cls={r.escrow < 0 ? 'text-danger font-semibold' : 'text-accent-fg'} />
                <ChevronRight className="hidden md:block h-4 w-4 text-faint opacity-0 group-hover:opacity-100 ml-auto" />
              </Link>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-[1fr_repeat(6,minmax(0,6.5rem))_2rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span>
            <span className="text-right text-success">{money(t.received)}</span><span className="text-right">{money(t.budgeted)}</span>
            <span className="text-right">{money(t.committed)}</span><span className="text-right">{money(t.paid)}</span>
            <span className="text-right text-warn">{money(t.outstanding)}</span>
            <span className={cn('text-right', t.escrow < 0 ? 'text-danger' : 'text-accent-fg')}>{money(t.escrow)}</span><span />
          </div>
        </div>
        </>
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

// One project on a phone. HOISTED so the open/closed state of one row is not
// thrown away when another re-renders the page.
function PhoneMoneyRow({ r, open, onToggle }: { r: Row; open: boolean; onToggle: () => void }) {
  return (
    <div className={cn('first:rounded-t-2xl last:rounded-b-2xl', open && 'bg-surface')}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full px-4 py-3 text-left">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{r.project_name}</span>
            <span className="block text-xs capitalize text-faint">{r.status}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
        </span>
        <span className="mt-2 grid grid-cols-3 gap-2">
          <Headline label="Received" v={money(r.received)} />
          <Headline label="Paid out" v={money(r.paid)} />
          <Headline label="Escrow" v={money(r.escrow)} cls={r.escrow < 0 ? 'text-danger' : undefined} />
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 px-4 pb-3">
          <Detail label="Budgeted" v={money(r.budgeted)} />
          <Detail label="Committed" v={money(r.committed)} />
          <Detail label="Billed by vendors" v={money(r.billed)} />
          <Detail label="Outstanding to vendors" v={money(r.outstanding)} cls={r.outstanding > 0 ? 'text-warn' : undefined} />
          <Link href={`/projects/${r.project_id}/payments`}
            className="mt-2 flex min-h-11 items-center justify-center gap-1 rounded-lg border border-line bg-panel text-sm font-medium text-accent-fg">
            Open financials <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </div>
  )
}

function Headline({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <span className="min-w-0">
      <span className={cn('block truncate text-sm font-semibold tabular-nums text-ink', cls)}>{v}</span>
      <span className="block truncate text-xs text-faint">{label}</span>
    </span>
  )
}

function Detail({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-fg">{label}</span>
      <span className={cn('tabular-nums text-ink-soft', cls)}>{v}</span>
    </div>
  )
}
