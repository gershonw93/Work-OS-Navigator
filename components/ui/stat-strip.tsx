import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * A row of numbers that belong together, in ONE card.
 *
 * WHAT THIS REPLACES. Screens grew a coloured pill per metric - "8 total",
 * "4 open", "2 in progress", "6 overdue", "2 completed · 25%" - five boxes,
 * five borders, four colours, wrapping onto two lines on a phone. Every one of
 * them was a box saying a number, and together they read as clutter rather than
 * as a summary.
 *
 * One card, hairline dividers, the number big and the label quiet. Colour only
 * where the colour MEANS something: an overdue count is worth red, a total is
 * not.
 */
export interface Stat {
  label: string
  value: string | number
  /** Only when the colour carries meaning. Left alone, the number is ink. */
  tone?: 'danger' | 'warn' | 'success' | 'info'
  /** A quieter second line - "of 8", "3 days late". */
  note?: string
  /** Where tapping the number goes. The whole cell is the target. */
  href?: string
}

const TONE: Record<NonNullable<Stat['tone']>, string> = {
  danger: 'text-danger',
  warn: 'text-warn',
  success: 'text-success',
  info: 'text-info',
}

export function StatStrip({
  items, label, className,
}: {
  items: Stat[]
  /** A quiet heading, e.g. "Overview". Omit it when the page title says enough. */
  label?: string
  className?: string
}) {
  const shown = items.filter(s => s.value !== null && s.value !== undefined)
  if (!shown.length) return null

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-line bg-panel', className)}>
      {label && (
        <p className="px-5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-faint">
          {label}
        </p>
      )}
      {/* Two across. The dividers are drawn with ring insets rather than
          borders so the grid keeps one hairline between cells and none around
          the outside, at any number of items. */}
      <div className="grid grid-cols-2">
        {shown.map((s, i) => {
          const Cell: any = s.href ? Link : 'div'
          return (
          <Cell
            key={s.label}
            {...(s.href ? { href: s.href } : {})}
            className={cn(
              'block min-w-0 px-5 py-4',
              s.href && 'transition-colors hover:bg-surface active:bg-surface',
              // a line above every row after the first
              i >= 2 && 'border-t border-line-soft',
              // and one between the two columns
              i % 2 === 1 && 'border-l border-line-soft',
              // an odd last item takes the full width rather than leaving a gap
              i === shown.length - 1 && shown.length % 2 === 1 && 'col-span-2',
            )}
          >
            <p className={cn('text-2xl font-bold tabular-nums tracking-tight',
              s.tone ? TONE[s.tone] : 'text-ink')}>
              {s.value}
            </p>
            <p className="mt-0.5 truncate text-[13px] text-muted-fg">{s.label}</p>
            {s.note && <p className="mt-0.5 truncate text-xs text-faint">{s.note}</p>}
          </Cell>
          )
        })}
      </div>
    </div>
  )
}
