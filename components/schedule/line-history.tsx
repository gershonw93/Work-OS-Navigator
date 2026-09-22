'use client'

import { Clock } from 'lucide-react'
import { formatDateShort } from '@/lib/dates'
import { historySentence, inOrder, type DateChange } from '@/lib/schedule-history'

/**
 * WHY THIS DATE MOVED.
 *
 * "How do I currently delay a sub?" - by retyping the end date, and afterwards
 * nothing said it had been a delay, why, or what the dates used to be. This is
 * the other end of that: every move on this line, oldest first, with the reason
 * where somebody gave one.
 *
 * NOTHING IS A REAL ANSWER HERE and it is the common one - most lines have
 * never moved. It says so rather than rendering an empty box, and the sentence
 * is about the LINE, not about the panel failing to load.
 *
 * Hoisted, not declared inside the page: a component declared inside a
 * component is a new type on every render, and this sits inside a dialog with
 * a half-typed reason in it.
 */
export function LineHistory({ changes, nameOf }: {
  changes: DateChange[]
  /** Names the line that pushed this one. Null once that line is deleted. */
  nameOf: (id: string) => string | null
}) {
  const rows = inOrder(changes)

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
        <Clock className="h-4 w-4 shrink-0 text-faint" /> Why this date moved
      </p>

      {rows.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted-fg">
          These dates have not moved since the line was created.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map(c => (
            <li key={c.id} className="text-xs">
              <p className="text-ink-soft">{historySentence(c, nameOf)}</p>
              <p className="text-faint">
                {[
                  formatDateShort(c.created_at),
                  c.changed_by_name,
                  // The dates themselves, because "moved 3 days" three moves
                  // down the list leaves nobody able to say where it was.
                  `${c.from_start} to ${c.to_start}`,
                ].filter(Boolean).join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
