'use client'

import { ReactNode, useState } from 'react'
import { cn } from '@/lib/utils'

// Overlapping phone mockups fanned like a hand of cards. Clicking (or
// focusing) one lifts it to the front; the others tuck behind at a slight
// angle. Pure transform/opacity so it animates cheaply.
export function PhoneFan({ items, initial = 1 }: { items: { key: string; label: string; node: ReactNode }[]; initial?: number }) {
  const [active, setActive] = useState(initial)
  const mid = (items.length - 1) / 2

  return (
    <div>
      <div className="relative h-[560px] w-full" role="group" aria-label="Field app screens">
        {items.map((it, i) => {
          const offset = i - mid // e.g. -1, 0, 1
          const isActive = i === active
          return (
            <button
              key={it.key}
              type="button"
              aria-pressed={isActive}
              aria-label={`Show ${it.label} screen`}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
              className={cn(
                'absolute left-1/2 top-1/2 cursor-pointer rounded-[2.6rem] text-left',
                'transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                isActive ? 'opacity-100' : 'opacity-80 hover:opacity-95',
              )}
              style={{
                zIndex: isActive ? 30 : 20 - Math.abs(offset),
                transform: [
                  'translate(-50%, -50%)',
                  `translateX(${offset * 42}%)`,
                  `rotate(${isActive ? 0 : offset * 7}deg)`,
                  `scale(${isActive ? 1 : 0.86})`,
                ].join(' '),
              }}
            >
              {it.node}
            </button>
          )
        })}
      </div>

      {/* Screen picker dots double as labels for what's in the stack */}
      <div className="mt-2 flex items-center justify-center gap-2">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
              i === active ? 'bg-ink text-surface' : 'bg-muted text-muted-fg hover:text-ink',
            )}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
