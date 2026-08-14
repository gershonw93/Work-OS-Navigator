'use client'

import { useEffect, useRef, useState } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * A number you can change, but not by accident.
 *
 * Some figures drive what a client is billed - a markup rate, a contract value.
 * As a permanently-live input they sat one stray click-and-type away from
 * moving, on a screen people scroll through all day to READ. Reading is the
 * common act; editing is the rare one, so reading is the default state.
 *
 * Click the pencil and it becomes an input with an explicit tick to commit.
 * Escape or the cross abandons the edit and puts the old value back - nothing
 * is written on blur, so wandering off mid-edit changes nothing.
 */
export function LockedField({
  value, display, onSave, prefix, suffix, saving, inputClassName, ariaLabel,
}: {
  /** The raw editable value. */
  value: string
  /** How it reads when not being edited - "10%", "$1,200,000". */
  display: string
  onSave: (next: string) => void | Promise<void>
  prefix?: string
  suffix?: string
  saving?: boolean
  inputClassName?: string
  ariaLabel: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  // Re-syncs when the saved value changes underneath - after a save, or when
  // another field on the page reloads the project.
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  function commit() {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }
  function abandon() {
    setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-lg font-semibold tabular-nums text-ink">{display}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${ariaLabel}`}
          title={`Edit ${ariaLabel}`}
          className="rounded p-1 text-faint transition-colors hover:bg-surface hover:text-accent-fg"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {saving && <span className="text-xs text-faint">saving…</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1">
      {prefix && <span className="text-sm text-muted-fg">{prefix}</span>}
      <input
        ref={ref}
        type="number"
        min="0"
        step="any"
        value={draft}
        aria-label={ariaLabel}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); abandon() }
        }}
        className={cn(
          'rounded-md border border-accent bg-panel px-2 py-1 text-sm tabular-nums text-ink focus:outline-none',
          inputClassName ?? 'w-24',
        )}
      />
      {suffix && <span className="text-sm font-medium text-muted-fg">{suffix}</span>}
      <button type="button" onClick={commit} aria-label="Save"
        className="rounded p-1 text-success hover:bg-success-tint">
        <Check className="h-4 w-4" />
      </button>
      <button type="button" onClick={abandon} aria-label="Cancel"
        className="rounded p-1 text-faint hover:bg-surface hover:text-danger">
        <X className="h-4 w-4" />
      </button>
    </span>
  )
}
