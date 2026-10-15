'use client'

// A client thread opened from a ROW (an invoice, a payment request): over the
// screen, never at the foot of the card - opened from the third row it would
// otherwise scroll you away from what you tapped.

import { X } from 'lucide-react'
import { ClientThreadPanel } from './client-thread-panel'
import type { ClientSubject } from '@/lib/client-thread'

export function ClientThreadDialog({ projectId, subject, subjectId, clientName, heading, onClose, onChanged }: {
  projectId: string
  subject: ClientSubject
  subjectId: string | null
  clientName: string | null
  /** What it is about: "Invoice INV-0007". */
  heading: string
  onClose: () => void
  onChanged?: () => unknown
}) {
  return (
    <div className="overlay items-center justify-center bg-black/40" data-overlay onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-panel border border-line shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 text-base font-semibold text-ink">{heading}</h3>
          <button onClick={onClose} aria-label="Close" title="Close" className="p-1 rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
        </div>
        <ClientThreadPanel projectId={projectId} subject={subject} subjectId={subjectId} clientName={clientName} onChanged={onChanged} />
      </div>
    </div>
  )
}
