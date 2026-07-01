import { Banknote, Check, Clock, Landmark } from 'lucide-react'

// Client payments & escrow for one project: what's in, what's held, what's due.
const STAGES = [
  { name: 'Deposit', amount: '$14,850', status: 'Paid' },
  { name: 'Rough-in complete', amount: '$44,550', status: 'Paid' },
  { name: 'Inspection passed', amount: '$29,700', status: 'In escrow' },
  { name: 'Trim-out', amount: '$37,125', status: 'Upcoming' },
  { name: 'Final walkthrough', amount: '$22,275', status: 'Upcoming' },
] as const

const BADGE: Record<string, string> = {
  Paid: 'bg-success-tint text-success',
  'In escrow': 'bg-info-tint text-info',
  Upcoming: 'bg-muted text-muted-fg',
}

export function MoneyMock() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl text-left">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <Landmark className="h-4 w-4 text-accent-fg" /> Payments · Linden Ave Remodel
        </span>
        <span className="text-[11px] text-faint font-mono">Contract $148,500</span>
      </div>

      {/* Received progress */}
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-fg">Received to date</span>
        <span className="font-bold text-ink font-mono">$59,400 · 40%</span>
      </div>
      <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-4">
        <div className="h-full bg-accent" style={{ width: '40%' }} />
      </div>

      {/* Balances */}
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        {[
          ['Escrow balance', '$29,700', 'text-info'],
          ['Your fee earned', '$8,910', 'text-success'],
          ['Owed to vendors', '$12,300', 'text-warn'],
        ].map(([label, v, tone]) => (
          <div key={label} className="rounded-lg border border-line-soft bg-surface px-2 py-2.5">
            <p className={`text-sm font-bold font-display ${tone}`}>{v}</p>
            <p className="text-[9px] text-muted-fg mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Stage list */}
      <div className="space-y-1.5">
        {STAGES.map(s => (
          <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2">
            <span className="inline-flex items-center gap-2 text-xs text-ink-soft min-w-0">
              {s.status === 'Paid' ? (
                <Check className="h-3.5 w-3.5 text-success shrink-0" />
              ) : s.status === 'In escrow' ? (
                <Banknote className="h-3.5 w-3.5 text-info shrink-0" />
              ) : (
                <Clock className="h-3.5 w-3.5 text-faint shrink-0" />
              )}
              <span className="truncate">{s.name}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-ink font-mono">{s.amount}</span>
              <span className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 ${BADGE[s.status]}`}>{s.status}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
