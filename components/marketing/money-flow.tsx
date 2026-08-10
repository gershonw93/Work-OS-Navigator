'use client'

import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, Gavel, HardHat, Receipt, Landmark } from 'lucide-react'

// The money on a job, start to finish, as one line.
//
// Each stage lights up in turn with a pulse travelling between them. The point
// of the graphic is continuity: the same numbers carry from the estimate all
// the way to the bank, instead of being re-entered at every stage.

const STAGES = [
  { icon: ClipboardCheck, label: 'Estimate', sub: 'Budget, soft costs, markup' },
  { icon: Gavel, label: 'Buy-out', sub: 'RFQs, bids, subcontracts' },
  { icon: HardHat, label: 'Build', sub: 'Progress, change orders' },
  { icon: Receipt, label: 'Bill', sub: 'Invoices or pay apps' },
  { icon: Landmark, label: 'Paid', sub: 'Payments, escrow, your fee' },
] as const

export function MoneyFlow() {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(-1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(STAGES.length - 1)
      return
    }
    const io = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return
        io.disconnect()
        STAGES.forEach((_, i) => setTimeout(() => setActive(i), 300 + i * 480))
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const pct = active < 0 ? 0 : (active / (STAGES.length - 1)) * 100

  return (
    <div ref={ref} className="relative">
      {/* Rail. Horizontal on desktop, vertical on phones - a five-stop
          pipeline squeezed into 360px is unreadable. */}
      <div aria-hidden className="hidden md:block absolute left-0 right-0 top-7 h-0.5 bg-line">
        <div
          className="h-full bg-accent"
          style={{ width: `${pct}%`, transition: 'width 0.9s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </div>

      <ol className="relative grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-3">
        {STAGES.map((s, i) => {
          const on = active >= i
          return (
            <li key={s.label} className="flex md:block items-start gap-4 md:text-center">
              <span
                className={`relative z-10 grid place-items-center h-14 w-14 shrink-0 rounded-2xl border-2 md:mx-auto transition-all duration-500 ${
                  on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-faint'
                }`}
                style={{ transform: on ? 'scale(1)' : 'scale(0.92)' }}
              >
                <s.icon className="h-6 w-6" />
              </span>
              <div className="md:mt-4">
                <p className={`font-bold transition-colors duration-500 ${on ? 'text-ink' : 'text-faint'}`}>
                  {s.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-fg leading-relaxed">{s.sub}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
