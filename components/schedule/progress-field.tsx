'use client'

import { X } from 'lucide-react'
import { pctLabel, type Progress } from '@/lib/schedule-dependencies'

/**
 * HOW FAR ALONG IS IT? - the box that did not exist.
 *
 * `schedule_items.progress_pct` has been on the PATCH whitelist and validated
 * 0-100 since the dependency work shipped, the cascade reads it, and a percent
 * gate depends on it. NOTHING HAS EVER WRITTEN IT: 121 of 121 rows on the live
 * database are null. "A value the app writes, submits and reads back must have
 * a control somewhere" - this is the other half of that rule, a value the app
 * READS with no control to write it, and the effect is the same. Every gate
 * resolved to "nobody has said", which blocks, so every percent link was a
 * gate that could never open.
 *
 * TWO RULES THAT ARE EASY TO GET WRONG:
 *
 * 1. THE BOX IS NEVER PREFILLED WITH THE DERIVED NUMBER. The budget roll-up is
 *    shown BESIDE it, not in it. Seeding the input turns a derived fact into a
 *    typed claim the first time anybody presses Save - which is
 *    "a useState default is a claim" wearing a number, and worse here, because
 *    a typed percent then beats the roll-up for ever.
 * 2. CLEARING IT WRITES NULL, NOT ZERO. "Nobody has said" is not "not
 *    started", and the difference decides whether a gate is shut because the
 *    work is early or because a field was never filled in. The route already
 *    gets this right; the form has to offer it as a visible act.
 *
 * Hoisted, not declared inside the page - a component declared inside a
 * component is a new type on every render, so React throws the DOM away and
 * the half-typed number goes with it.
 */
export function ProgressField({ value, derived, onChange }: {
  /** The raw input. '' means "nobody has said" and writes null. */
  value: string
  /** What the app would answer without a typed number, for the hint. */
  derived: Progress
  onChange: (next: string) => void
}) {
  const typed = value.trim() !== ''
  const rolledUp = derived.source === 'budget' ? pctLabel(derived.pct) : null

  return (
    <div className="space-y-1.5">
      <label htmlFor="line-progress" className="block text-sm font-medium text-muted-fg lg:text-xs">
        How far along is it? <span className="text-faint font-normal">(optional)</span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {/* THE UNIT SITS IN THE ROW. A number box labelled "How far along?" is
            a number with no unit - reported once already on the gate field. */}
        <span className="inline-flex items-center gap-1">
          <input
            id="line-progress" type="number" min={0} max={100} inputMode="numeric"
            className="w-24 rounded-lg border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            value={value}
            // Blank when there is nothing to suggest. A placeholder dash in a
            // number box reads as a value somebody might have typed.
            placeholder={rolledUp ?? ''}
            onChange={e => onChange(e.target.value)}
          />
          <span className="text-muted-fg">%</span>
        </span>

        {typed && (
          <button
            type="button" onClick={() => onChange('')}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted-fg hover:bg-surface"
          >
            <X className="h-3.5 w-3.5" /> Nobody has said
          </button>
        )}
      </div>

      <p className="text-xs text-muted-fg">
        {typed
          ? 'A number you type here beats the budget roll-up. Clear it to go back to "nobody has said".'
          : rolledUp != null
            ? `Nothing typed - using ${rolledUp}% from their budget lines.`
            : 'Nobody has said yet. A trade waiting on this one at a percent stays held until somebody does.'}
      </p>
    </div>
  )
}
