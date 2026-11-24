'use client'

import { useState } from 'react'
import { Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { fetchProblem } from '@/lib/fetch-error'
import { RUN_OWN_JOBS } from '@/lib/sub-account'

// The "Run your own jobs" offer on My Jobs, for a light sub account
// (lib/sub-account.ts). It is FREE and says so, and it carries no purchase word:
// nothing is bought, and the iOS build may show no purchase language.
//
// Pressing it reloads the page: the menu (Customers), the New Project button
// and, for somebody leaving an old Directory seat, the company they are signed
// in under all change at once, and they arrive with the permissions.
export function RunOwnJobsCard() {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  async function go() {
    setBusy(true)
    setProblem('')
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/account/run-own-jobs', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not turn that on just now. Try again.'); return }
      window.location.reload()
    } catch (e) {
      setProblem(fetchProblem(e, 'setting up your own jobs'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Briefcase className="h-5 w-5 text-accent-fg shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-ink">{RUN_OWN_JOBS.label}</p>
          <p className="text-sm text-muted-fg">{RUN_OWN_JOBS.line}</p>
        </div>
      </div>
      {problem && <p className="text-sm text-danger">{problem}</p>}
      <div className="row-even lg:flex lg:justify-end">
        <Button onClick={go} disabled={busy}>{busy ? 'Setting up...' : RUN_OWN_JOBS.label}</Button>
      </div>
    </div>
  )
}
