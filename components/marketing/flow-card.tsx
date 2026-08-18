'use client'

import { useState } from 'react'
import { ChevronDown, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Flow } from '@/lib/flows'

/**
 * One flow: a tile you can read in three seconds, opening into what actually
 * happens.
 *
 * Every step carries the win and the loss side by side, because the loss is
 * the part that sells. Green alone is a feature list with arrows on it - the
 * red line is the money the reader is already losing this month, which is the
 * only reason anyone changes software.
 *
 * Colour is never the only signal: each carries an arrow and a word, so it
 * still reads on a black-and-white printout and to anyone who cannot separate
 * the two colours.
 */
export function FlowCard({ flow, defaultOpen = false }: { flow: Flow; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={cn(
      'rounded-2xl border bg-panel transition-colors',
      open ? 'border-accent/50' : 'border-line hover:border-accent/40',
    )}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-4 p-5 text-left sm:p-6"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{flow.stake}</p>
          <h3 className="mt-1 text-lg font-bold leading-tight text-ink sm:text-xl">{flow.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-fg">{flow.short}</p>
          {!open && (
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg">
              See how it works <ArrowRight className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <ChevronDown className={cn('mt-1 h-5 w-5 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-line px-5 pb-6 pt-5 sm:px-6">
          <p className="mb-5 text-xs font-medium text-faint">For: {flow.who}</p>

          <ol className="space-y-0">
            {flow.steps.map((s, i) => (
              <li key={i} className="relative flex gap-4 pb-5 last:pb-0">
                {/* The thread down the left. Stops at the last step rather than
                    trailing into nothing. */}
                {i < flow.steps.length - 1 && (
                  <span aria-hidden className="absolute left-[11px] top-7 h-full w-px bg-line" />
                )}
                <span className="relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent-tint text-[11px] font-bold text-accent-fg">
                  {i + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-ink-soft">{s.act}</p>

                  {(s.win || s.loss) && (
                    <div className="mt-2.5 space-y-1.5">
                      {s.win && (
                        <p className="flex items-start gap-2 rounded-lg border border-success/25 bg-success-tint px-3 py-2 text-xs leading-relaxed text-success">
                          <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span><span className="font-bold">Win — </span>{s.win}</span>
                        </p>
                      )}
                      {s.loss && (
                        <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger-tint px-3 py-2 text-xs leading-relaxed text-danger">
                          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span><span className="font-bold">Without it — </span>{s.loss}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-5 rounded-xl border border-accent/30 bg-accent-tint/40 px-4 py-3 text-sm font-semibold text-ink">
            {flow.outcome}
          </p>
        </div>
      )}
    </div>
  )
}
