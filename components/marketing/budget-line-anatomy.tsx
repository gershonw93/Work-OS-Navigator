'use client'

import { useEffect, useRef, useState } from 'react'
import { FileSignature, Receipt, ShoppingCart, Wallet } from 'lucide-react'

// One budget line, filling in as the job runs.
//
// This is the whole money model in a single graphic: a line starts as a number
// you planned, becomes a number you're committed to when a subcontract is
// signed, and becomes a number you've spent as invoices and receipts land.
// Everything else on the money side hangs off these three columns, so it's
// worth showing rather than describing.

const STAGES = [
  {
    key: 'budgeted',
    label: 'Budgeted',
    amount: 48000,
    pct: 100,
    bar: 'bg-muted2',
    text: 'text-ink-soft',
    icon: Wallet,
    caption: 'What you planned when you priced the job.',
  },
  {
    key: 'committed',
    label: 'Committed',
    amount: 46200,
    pct: 96,
    bar: 'bg-info-solid',
    text: 'text-info',
    icon: FileSignature,
    caption: 'Volt Bros signed at $46,200. Nothing typed twice - awarding the bid wrote this.',
  },
  {
    key: 'actual',
    label: 'Actual',
    amount: 31450,
    pct: 65,
    bar: 'bg-success-solid',
    text: 'text-success',
    icon: Receipt,
    caption: 'Two approved invoices and a materials receipt. Approving moves it, not paying.',
  },
] as const

const money = (n: number) => `$${n.toLocaleString('en-US')}`

export function BudgetLineAnatomy() {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(-1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setStep(STAGES.length)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        // Reveal one column at a time so the sequence reads as a story
        // rather than three bars appearing at once.
        STAGES.forEach((_, i) => setTimeout(() => setStep(i), 350 + i * 750))
      },
      { threshold: 0.35 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div ref={ref} className="rounded-3xl border border-line bg-panel p-5 sm:p-8 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-line-soft">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-faint">Budget line</p>
          <p className="mt-1 text-lg font-bold text-ink">Electrical · rough-in &amp; finish</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint px-3 py-1 text-[11px] font-semibold text-accent-fg">
          <ShoppingCart className="h-3 w-3" /> Linked to subcontract
        </span>
      </div>

      <div className="mt-6 space-y-6">
        {STAGES.map((s, i) => {
          const shown = step >= i
          return (
            <div key={s.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft">
                  <s.icon className={`h-4 w-4 ${shown ? s.text : 'text-faint'} transition-colors duration-500`} />
                  {s.label}
                </span>
                <span
                  className={`font-mono text-sm font-bold tabular-nums transition-all duration-700 ${shown ? s.text : 'text-faint'}`}
                  style={{ opacity: shown ? 1 : 0.25 }}
                >
                  {money(s.amount)}
                </span>
              </div>

              <div className="mt-2 h-3 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.bar}`}
                  style={{
                    width: shown ? `${s.pct}%` : '0%',
                    transition: 'width 1.1s cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                />
              </div>

              <p
                className="mt-2 text-xs text-muted-fg leading-relaxed"
                style={{
                  opacity: shown ? 1 : 0,
                  transform: shown ? 'none' : 'translateY(6px)',
                  transition: 'opacity 0.6s ease 0.25s, transform 0.6s ease 0.25s',
                }}
              >
                {s.caption}
              </p>
            </div>
          )
        })}
      </div>

      <div
        className="mt-7 rounded-2xl bg-surface border border-line-soft px-4 py-3.5 flex flex-wrap items-center justify-between gap-2"
        style={{
          opacity: step >= STAGES.length - 1 ? 1 : 0,
          transition: 'opacity 0.7s ease 0.4s',
        }}
      >
        <p className="text-sm font-semibold text-ink">Left to spend on this line</p>
        <p className="font-mono text-lg font-bold text-ink tabular-nums">{money(48000 - 31450)}</p>
      </div>
    </div>
  )
}
