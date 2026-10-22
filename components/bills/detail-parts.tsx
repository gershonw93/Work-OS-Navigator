'use client'

import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Countdown, Step } from '@/lib/bill-view'

/**
 * The pieces both bill screens are built from - a sub's bill to you and your
 * invoice to the client. One home for the shape, so the two screens read as
 * one product: the same header, the same track of steps, the same cards.
 */

/** A card with a heading and, optionally, something on its right. */
export function DetailSection({
  title, aside, className, children,
}: { title: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('flex flex-col gap-3.5 rounded-2xl border border-line bg-panel p-5 lg:p-6', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink lg:text-[17px]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export type PillTone = 'warn' | 'info' | 'special' | 'success' | 'danger' | 'muted'

const PILL: Record<PillTone, string> = {
  warn: 'bg-warn-tint text-warn',
  info: 'bg-info-tint text-info',
  special: 'bg-special-tint text-special',
  success: 'bg-success-tint text-success',
  danger: 'bg-danger-tint text-danger',
  muted: 'bg-surface text-muted-fg',
}

/** A status or a count, as a quiet tinted pill. Never wraps. */
export function Pill({ tone, icon, children }: { tone: PillTone; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold lg:text-[13px]', PILL[tone])}>
      {icon}
      {children}
    </span>
  )
}

/**
 * The steps a bill moves through, lit as far as it has got. An <ol>, because
 * the order is the information.
 */
export function StepTrack({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5 lg:gap-3" aria-label="Progress">
      {steps.map(s => (
        <li key={s.label} className="flex min-w-0 flex-col gap-1.5">
          <div className={cn('h-1 rounded', s.done ? 'bg-accent-fg' : 'bg-muted')} />
          <div className={cn('truncate text-[11px] font-semibold lg:text-[13px]', s.done ? 'text-ink' : 'text-muted-fg')}>
            {s.label}
            <span className="sr-only">{s.done ? ' (done)' : ' (not yet)'}</span>
          </div>
          {/* The note is the date and who - on a phone four columns of it is
              noise at 11px, so it is the desktop's. The Details card says the
              same dates on a phone. */}
          <div className="hidden truncate text-xs text-muted-fg lg:block">{s.note}</div>
        </li>
      ))}
    </ol>
  )
}

/** "Due Oct 29, 2026 · in 7 days", with the countdown coloured only when it means something. */
export function CountdownText({ countdown }: { countdown: Countdown | null }) {
  if (!countdown) return null
  return (
    <span className={cn('font-semibold',
      countdown.tone === 'late' ? 'text-danger' : countdown.tone === 'soon' ? 'text-warn' : 'text-ink')}>
      {countdown.text}
    </span>
  )
}

/** Label on the left, value on the right, hairlines between. */
export function DetailRows({ rows }: { rows: { label: string; value: ReactNode; mono?: boolean }[] }) {
  return (
    <dl className="divide-y divide-line-soft text-sm">
      {rows.map(r => (
        <div key={r.label} className="flex justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-muted-fg">{r.label}</dt>
          <dd className={cn('min-w-0 text-right text-ink break-words', r.mono && 'text-[13px] tabular-nums')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Back to the list this record came from. 44px tall, because it is the way out. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-muted-fg hover:text-ink">
      <ChevronLeft className="h-4 w-4" /> {label}
    </button>
  )
}

/**
 * A phone's primary action, pinned to the bottom of what you can see.
 *
 * `sticky bottom-0` inside `[data-app-scroll]`: the scroller's own bottom
 * padding (`pb-tab-bar`) is what keeps it above the tab bar - a sticky box is
 * held inside the scroller's padding, measured in Chromium before this was
 * written. Bleeds to the screen edges over the page's `p-6` gutter.
 */
export function PhoneActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-20 -mx-6 -mb-6 flex gap-2 border-t border-line bg-panel px-4 py-3 lg:hidden">
      {children}
    </div>
  )
}

/** Three sums side by side: cost, markup, what the client pays. */
export function SumTiles({ tiles }: { tiles: { label: string; value: string; strong?: boolean }[] }) {
  return (
    <>
      {/* Phone: a stack of rows, the last one tinted - three tiles of 22px
          figures do not share 340px. */}
      <div className="flex flex-col gap-2 text-sm lg:hidden">
        {tiles.map(t => t.strong ? (
          <div key={t.label} className="mt-0.5 flex items-center justify-between rounded-xl border border-accent/40 bg-accent-tint px-3 py-2.5">
            <span className="font-semibold text-accent-fg">{t.label}</span>
            <span className="text-lg font-bold tabular-nums text-ink">{t.value}</span>
          </div>
        ) : (
          <div key={t.label} className="flex justify-between">
            <span className="text-muted-fg">{t.label}</span>
            <span className="font-semibold tabular-nums text-ink">{t.value}</span>
          </div>
        ))}
      </div>
      <div className="hidden grid-cols-3 gap-3 lg:grid">
        {tiles.map(t => (
          <div key={t.label} className={cn('flex flex-col gap-1 rounded-xl border px-4 py-3.5',
            t.strong ? 'border-accent/40 bg-accent-tint' : 'border-line-soft')}>
            <div className={cn('text-[13px]', t.strong ? 'font-medium text-accent-fg' : 'text-muted-fg')}>{t.label}</div>
            <div className="text-[22px] font-bold tabular-nums text-ink">{t.value}</div>
          </div>
        ))}
      </div>
    </>
  )
}
