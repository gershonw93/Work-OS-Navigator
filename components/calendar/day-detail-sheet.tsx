'use client'

// ─────────────────────────────────────────────────────────────────────────────
// Everything happening on one day, over the screen.
//
// Reported against the job's Schedule calendar: "when I tap a day it should
// show the days summary like master calendar". The Master Calendar has had
// exactly this sheet since it shipped, so the fix is not to write a second one
// - two screens needing the same thing is when a pattern becomes a component.
//
// IT TAKES A CALLBACK, NOT AN href, and that is the load-bearing part. On the
// job's calendar the click FOLLOWS THE KIND: a schedule bar opens the edit
// dialog it always did, while an inspection or a task navigates to its own tab,
// because nothing in that dialog could save either of them. A sheet that only
// knew how to navigate would have had to break that rule to be shared.
// ─────────────────────────────────────────────────────────────────────────────

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'

export interface DaySheetRow {
  id: string
  title: string
  /** The quiet second line - what it is, whose it is, when in the day. */
  subtitle?: string | null
  /** Background class for the leading dot, e.g. 'bg-info'. */
  dot?: string
  done?: boolean
  /** What tapping this row does. The caller decides; see the note above. */
  onOpen: () => void
}

export function DayDetailSheet({ date, rows, onClose }: {
  /** ISO date (YYYY-MM-DD) - the day this sheet is about. */
  date: string
  rows: DaySheetRow[]
  onClose: () => void
}) {
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-4">
          <h2 className="text-lg font-bold text-ink">
            {formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>
          <button onClick={onClose} aria-label="Close" title="Close"
            className="text-faint hover:text-ink text-2xl leading-none">×</button>
        </div>
        <div className="space-y-2 px-5 py-4">
          {rows.map(r => (
            <button key={r.id} onClick={() => { onClose(); r.onOpen() }}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3 text-left hover:border-accent hover:bg-surface transition-colors">
              <span className={cn('mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full', r.dot ?? 'bg-faint')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block font-medium text-ink', r.done && 'line-through text-muted-fg')}>{r.title}</span>
                {r.subtitle && <span className="block text-xs text-muted-fg">{r.subtitle}</span>}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
            </button>
          ))}
          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-fg">Nothing scheduled.</p>}
        </div>
      </div>
    </div>
  )
}
