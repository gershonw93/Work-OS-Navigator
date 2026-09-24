'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchProblem } from '@/lib/fetch-error'

// ─────────────────────────────────────────────────────────────────────────────
// The confirm on the unsubscribe page.
//
// IT ASKS RATHER THAN DOING IT ON LOAD. A link in an email gets opened by
// scanners, previews and corporate mail filters, and a GET that unsubscribes is
// one that fires itself. The one-click header exists for the button beside the
// sender name; this page is for a person who clicked the link in the footer.
// ─────────────────────────────────────────────────────────────────────────────
export function UnsubscribeForm({ email, token }: { email: string; token: string }) {
  const [state, setState] = useState<'ready' | 'saving' | 'done'>('ready')
  const [problem, setProblem] = useState('')

  async function stop() {
    setState('saving')
    setProblem('')
    try {
      const res = await fetch('/api/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, token }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(out?.error ?? 'That did not save.'); setState('ready'); return }
      setState('done')
    } catch (e) {
      setProblem(fetchProblem(e, 'unsubscribe you'))
      setState('ready')
    }
  }

  if (state === 'done') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-line bg-panel p-4 text-sm text-ink">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <span>
          Done - <strong>{email}</strong> is off the list. You will still get anything about your own
          account: invoices, bid requests, and anything to do with signing in.
        </span>
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <Button disabled={state === 'saving'} onClick={stop} className="gap-2">
        {state === 'saving' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Unsubscribe {email}
      </Button>
      {problem && <p className="text-sm text-danger">{problem}</p>}
    </div>
  )
}
