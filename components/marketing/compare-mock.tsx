import { Sparkles, AlertTriangle, Check, Minus } from 'lucide-react'

// AI bid comparison: three quotes side by side with gap analysis and a pick.
const ROWS = [
  { label: 'Bid total', a: '$48,200', b: '$44,900', c: '$51,750' },
  { label: 'Line items read', a: '31', b: '24', c: '35' },
  { label: 'Panel upgrade', a: 'yes', b: 'no', c: 'yes' },
  { label: 'Permit fees', a: 'yes', b: 'no', c: 'yes' },
  { label: 'Payment terms', a: '5 stages', b: '50/50', c: '4 stages' },
] as const

function Cell({ v }: { v: string }) {
  if (v === 'yes') return <Check aria-label="Included" className="h-3.5 w-3.5 text-success mx-auto" />
  if (v === 'no') return <Minus aria-label="Missing" className="h-3.5 w-3.5 text-danger mx-auto" />
  return <span className="font-mono text-[11px] text-ink-soft">{v}</span>
}

export function CompareMock() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl text-left">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-ink">Compare bids · Electrical</span>
        <span className="inline-flex items-center gap-1 text-[11px] text-accent-fg font-semibold">
          <Sparkles className="h-3.5 w-3.5" /> AI analysis
        </span>
      </div>

      <div className="grid grid-cols-4 gap-x-2 text-center text-[11px]">
        {/* Column headers */}
        <div />
        {[['Apex Electric', false], ['Volt Bros', false], ['Current Co.', true]].map(([name, pick]) => (
          <div key={name as string} className={`rounded-t-lg px-1 py-2 ${pick ? 'bg-accent-tint border border-b-0 border-accent/40' : ''}`}>
            <p className="font-semibold text-ink truncate">{name as string}</p>
            {pick ? (
              <p className="text-[9px] font-bold text-accent-fg mt-0.5 inline-flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" /> Best fit
              </p>
            ) : (
              <p className="text-[9px] text-faint mt-0.5">&nbsp;</p>
            )}
          </div>
        ))}

        {ROWS.map((r, i) => (
          <div key={r.label} className="contents">
            <div className={`text-left text-[10px] text-muted-fg py-2 pr-1 ${i > 0 ? 'border-t border-line-soft' : ''}`}>{r.label}</div>
            {[r.a, r.b, r.c].map((v, j) => (
              <div key={j} className={`py-2 flex items-center justify-center ${i > 0 ? 'border-t border-line-soft' : ''} ${j === 2 ? 'bg-accent-tint/50 border-x border-accent/40' : ''}`}>
                <Cell v={v} />
              </div>
            ))}
          </div>
        ))}

        {/* Close the highlighted column */}
        <div />
        <div />
        <div />
        <div className="rounded-b-lg border border-t-0 border-accent/40 bg-accent-tint/50 h-1.5" />
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-start gap-1.5 rounded-lg bg-warn-tint px-3 py-2 text-[11px] text-warn">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>Volt Bros is lowest, but it excludes the panel upgrade and permit fees. True cost is roughly $6,400 higher.</span>
        </div>
        <div className="flex items-start gap-1.5 rounded-lg bg-accent-tint/60 px-3 py-2 text-[11px] text-accent-fg">
          <Sparkles className="h-3.5 w-3.5 shrink-0 mt-px" />
          <span>Current Co. covers full scope with staged payments that match your draw schedule.</span>
        </div>
      </div>
    </div>
  )
}
