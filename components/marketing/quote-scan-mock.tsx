import { FileText, ScanLine, Sparkles, Check } from 'lucide-react'

// "Pile of PDFs in, structured job out." Left: the raw document. Right: the
// extracted line items and payment schedule. Used on the home dark band and
// the AI page.
const ITEMS = [
  ['New receptacle & switch points', '24 × $185', '$4,440'],
  ['GFCI devices, kitchen & baths', '6 × $145', '$870'],
  ['Recessed LED rough-in', '18 × $155', '$2,790'],
  ['Dedicated 20A circuits', '3 × $575', '$1,725'],
  ['200A panel upgrade', '1 × $3,200', '$3,200'],
] as const

const STAGES = [
  ['Deposit', '10%'],
  ['Rough-in', '30%'],
  ['Inspection', '20%'],
  ['Trim-out', '25%'],
  ['Final', '15%'],
] as const

export function QuoteScanMock() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <span className="inline-flex items-center gap-2 text-xs sm:text-sm text-ink-soft font-mono min-w-0">
          <FileText className="h-4 w-4 text-accent-fg shrink-0" />
          <span className="truncate">electrical_proposal.pdf</span>
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-success font-medium shrink-0">
          <ScanLine className="h-3.5 w-3.5" /> Scanned in 14s
        </span>
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        {/* The raw document */}
        <div aria-hidden className="hidden sm:block sm:col-span-2 rounded-lg border border-line-soft bg-surface p-3 relative overflow-hidden">
          <div className="space-y-2">
            <div className="h-2.5 w-2/3 rounded bg-muted2" />
            <div className="h-2 w-1/2 rounded bg-muted" />
            <div className="h-px bg-line my-3" />
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="h-1.5 rounded bg-muted flex-1" style={{ width: `${70 - (i % 4) * 8}%` }} />
                <div className="h-1.5 w-8 rounded bg-muted2 shrink-0" />
              </div>
            ))}
            <div className="h-px bg-line my-3" />
            <div className="h-2 w-1/3 rounded bg-muted2 ml-auto" />
          </div>
          {/* Scan beam */}
          <div className="absolute inset-x-0 top-1/3 h-8 bg-gradient-to-b from-transparent via-accent/25 to-transparent border-y border-accent/40" />
        </div>

        {/* Extracted result */}
        <div className="sm:col-span-3 space-y-1.5 min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-faint mb-2">Extracted · Section 2 of 3</p>
          {ITEMS.map(r => (
            <div key={r[0]} className="flex items-center justify-between rounded-lg border border-line-soft bg-surface px-3 py-2 gap-2">
              <div className="min-w-0">
                <p className="text-xs text-ink-soft truncate">{r[0]}</p>
                <p className="text-[10px] text-faint font-mono">{r[1]}</p>
              </div>
              <span className="text-xs font-semibold text-ink shrink-0 font-mono">{r[2]}</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 pt-1.5 text-xs">
            <span className="text-muted-fg">Section total</span>
            <span className="font-bold text-ink font-mono">$13,025</span>
          </div>
        </div>
      </div>

      {/* Payment schedule */}
      <div className="mt-4 rounded-lg bg-accent-tint/60 border border-accent/30 px-3 py-2.5">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-accent-fg font-semibold inline-flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5" /> Payment schedule extracted
          </span>
          <span className="text-ink-soft font-bold">5 stages</span>
        </div>
        <div className="flex gap-1">
          {STAGES.map(([label, pct]) => (
            <div key={label} className="flex-1 min-w-0">
              <div className="h-1.5 rounded-full bg-accent/80 mb-1" />
              <p className="text-[8px] sm:text-[9px] text-muted-fg truncate">{label}</p>
              <p className="text-[9px] sm:text-[10px] font-bold text-ink-soft font-mono">{pct}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-fg">
        <Check className="h-3.5 w-3.5 text-success" /> 24 line items · 3 sections · quantities, rates & terms, ready to review
      </div>
    </div>
  )
}
