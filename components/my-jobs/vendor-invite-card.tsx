'use client'

import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { fetchProblem } from '@/lib/fetch-error'

// ─────────────────────────────────────────────────────────────────────────────
// "<GC> wants to work with you on SyteNav" - the answer to a vendor invite for
// somebody who already has a company.
//
// Connecting is the sub's decision, so it is a button they press, never a side
// effect of signing in (lib/vendor-link.ts). It says what connecting shares in
// both directions, because "connect" alone is a promise nobody can check: the
// GC sees the work done on THEIR jobs, never this company's other customers -
// which is what the server enforces (lib/sub-scope.ts, lib/job-side.ts).
//
// Loading, failed and none are three facts: nothing renders until the list is
// known, a failed read renders nothing (the card is an offer, not a record -
// the GC can resend, and the next visit asks again), and an empty list is the
// normal state.
// ─────────────────────────────────────────────────────────────────────────────

type Pending = { id: string; gc_name: string; listed_as: string }

export function VendorInviteCard({ onConnected }: { onConnected?: () => void }) {
  const [invites, setInvites] = useState<Pending[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<Record<string, string>>({})

  async function token() {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/invite/accept', { headers: { Authorization: `Bearer ${await token()}` } })
        if (!res.ok) return
        const json = await res.json()
        if (live) setInvites(json.invites ?? [])
      } catch { /* an offer, not a record - asked again on the next visit */ }
    })()
    return () => { live = false }
  }, [])

  async function answer(id: string, decision: 'accept' | 'decline') {
    setBusy(id)
    setProblem(p => ({ ...p, [id]: '' }))
    try {
      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ invite_id: id, decision }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setProblem(p => ({ ...p, [id]: json.error ?? 'Could not answer that just now. Try again.' }))
        return
      }
      setInvites(list => (list ?? []).filter(i => i.id !== id))
      if (decision === 'accept') onConnected?.()
    } catch (e) {
      setProblem(p => ({ ...p, [id]: fetchProblem(e, decision === 'accept' ? 'connecting your company' : 'declining the invite') }))
    } finally {
      setBusy(null)
    }
  }

  if (!invites?.length) return null

  return (
    <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
      {invites.map(inv => (
        <div key={inv.id} className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Link2 className="h-5 w-5 text-accent-fg shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-semibold text-ink">{inv.gc_name} wants to work with you on SyteNav</p>
              <p className="text-sm text-muted-fg">
                Connect your company to see their jobs alongside your own. They see the work you do on their jobs -
                never your other customers. They have you listed as {inv.listed_as}.
              </p>
            </div>
          </div>
          {problem[inv.id] && <p className="text-sm text-danger">{problem[inv.id]}</p>}
          <div className="row-even lg:flex lg:flex-wrap gap-2 lg:justify-end">
            <Button variant="secondary" onClick={() => answer(inv.id, 'decline')} disabled={busy === inv.id}>Decline</Button>
            <Button onClick={() => answer(inv.id, 'accept')} disabled={busy === inv.id}>
              {busy === inv.id ? 'Connecting...' : 'Connect'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
