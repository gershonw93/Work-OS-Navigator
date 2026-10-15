'use client'

// One change order on the client's link: what changes, what it costs, where it
// stands, Approve / Decline, and a question box. The answer is a RECORD the GC
// approves against - the page says so, so nobody thinks pressing Approve has
// already changed the contract.

import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clientCoStatus, clientResponseProblem, RESPONSE_NOTE_MAX } from '@/lib/change-order-client'
import { PortalThread } from './portal-thread'

export interface PortalCo {
  id: string
  title: string
  description: string | null
  reason: string | null
  amount: number | string
  status: string
  client_shared_at: string | null
  client_response: 'approved' | 'declined' | null
}

const money = (n: number | string) => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

export function PortalChangeOrder({ token, co }: { token: string; co: PortalCo }) {
  const [state, setState] = useState(co)
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'approved' | 'declined' | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const open = state.status === 'pending'

  async function answer(response: 'approved' | 'declined') {
    // The same rule the route asks, asked first so the message lands here.
    const problem = clientResponseProblem(state, response, note.trim() || null)
    if (problem) { setError(problem); return }
    setBusy(response); setError(''); setDone('')
    try {
      const res = await fetch(`/api/portal/${token}/change-orders/${state.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, note: note.trim() || null, name }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not save that. Try again.'); return }
      setState(s => ({ ...s, client_response: response }))
      setDone(d.message ?? 'Saved.')
    } catch {
      setError('We could not tell whether that went - reload the page before answering again.')
    } finally { setBusy(null) }
  }

  const amount = Number(state.amount)
  return (
    <div className="rounded-lg border border-line bg-panel p-3 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{state.title}</p>
          {state.reason && <p className="text-xs text-muted-fg">{state.reason}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className={cn('text-sm font-bold', amount < 0 ? 'text-success' : 'text-ink')}>
            {amount < 0 ? `${money(Math.abs(amount))} credit` : money(amount)}
          </p>
          <span className={cn('whitespace-nowrap inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold',
            state.status === 'approved' ? 'bg-success-tint text-success'
              : state.status === 'rejected' ? 'bg-muted text-muted-fg'
              : state.client_response ? 'bg-info-tint text-info' : 'bg-warn-tint text-warn')}>
            {clientCoStatus(state)}
          </span>
        </div>
      </div>
      {state.description && <p className="text-sm text-muted-fg whitespace-pre-wrap">{state.description}</p>}

      {open && (
        <div className="space-y-2 border-t border-line-soft pt-2.5">
          <textarea rows={2} maxLength={RESPONSE_NOTE_MAX} value={note} onChange={e => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none" />
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name (optional)"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none" />
          <div className="row-even lg:flex lg:flex-wrap gap-2">
            <button type="button" onClick={() => answer('approved')} disabled={!!busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60 lg:min-h-0 lg:py-2">
              {busy === 'approved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {state.client_response === 'approved' ? 'Approved' : 'Approve'}
            </button>
            <button type="button" onClick={() => answer('declined')} disabled={!!busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-surface disabled:opacity-60 lg:min-h-0 lg:py-2">
              {busy === 'declined' ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {state.client_response === 'declined' ? 'Declined' : 'Decline'}
            </button>
          </div>
          <p className="text-xs text-faint">
            Your answer goes straight to us. Approving tells us to go ahead - we add it to your contract and confirm.
            You can change your answer until we do.
          </p>
        </div>
      )}
      {done && <p className="rounded-lg bg-success-tint px-3 py-2 text-sm text-success">{done}</p>}
      {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="border-t border-line-soft pt-2.5">
        <PortalThread token={token} subject="change_order" subjectId={state.id} prompt="Ask about this change order" />
      </div>
    </div>
  )
}
