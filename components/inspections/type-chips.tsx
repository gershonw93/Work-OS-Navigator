'use client'

import { cn } from '@/lib/utils'
import { foldType } from '@/lib/inspection-types'

/**
 * Pick several inspection types as chips. A stored type that is no longer
 * offered (a company type since removed, a spelling from an older list) stays
 * on screen and ticked, so opening a card to fix a phone number cannot quietly
 * drop it.
 */
export function InspectionTypeChips({
  options, value, onChange,
}: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
}) {
  const held = new Set(value.map(foldType))
  const extra = value.filter(v => !options.some(o => foldType(o) === foldType(v)))
  const all = [...options, ...extra]
  const toggle = (t: string) => {
    const k = foldType(t)
    onChange(held.has(k) ? value.filter(v => foldType(v) !== k) : [...value, t])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map(t => {
        const on = held.has(foldType(t))
        return (
          <button key={t} type="button" aria-pressed={on} onClick={() => toggle(t)}
            className={cn('min-h-[36px] whitespace-nowrap rounded-full border px-3 text-xs transition-colors',
              on ? 'border-accent bg-accent-tint font-semibold text-accent-fg' : 'border-line text-ink-soft hover:bg-surface')}>
            {t}
          </button>
        )
      })}
    </div>
  )
}
