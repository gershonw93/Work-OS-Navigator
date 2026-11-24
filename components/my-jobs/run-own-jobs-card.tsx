'use client'

import { useState } from 'react'
import { Briefcase } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { fetchProblem } from '@/lib/fetch-error'
import { RUN_OWN_JOBS } from '@/lib/sub-account'
import { SUB_TRIAL_DAYS } from '@/lib/plans'
import { useCanShowPricing } from '@/lib/use-native'

// The "Run your own jobs" offer on My Jobs, for a light sub account
// (lib/sub-account.ts): a SUB_TRIAL_DAYS free trial, then one of the plans.
//
// NOT IN THE iOS BUILD. A trial that ends in a plan is an offer to buy, which
// 3.1.3(f) keeps out of the app - the same reason a GC's iPhone has no Billing
// tab. `useCanShowPricing` stays shut until it KNOWS the platform, because an
// offer shown inside the iOS app cannot be taken back; on the web it appears a
// frame later.
//
// Pressing it reloads the page: the menu (Customers), the New Project button
// and, for somebody leaving an old Directory seat, the company they are signed
// in under all change at once, and they arrive with the permissions.
export function RunOwnJobsCard() {
  const canOffer = useCanShowPricing()
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

  if (!canOffer) return null

  return (
    <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Briefcase className="h-5 w-5 text-accent-fg shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-ink">{RUN_OWN_JOBS.label}</p>
          <p className="text-sm text-muted-fg">{RUN_OWN_JOBS.line(SUB_TRIAL_DAYS)}</p>
        </div>
      </div>
      {problem && <p className="text-sm text-danger">{problem}</p>}
      <div className="row-even lg:flex lg:justify-end">
        <Button onClick={go} disabled={busy}>{busy ? 'Setting up...' : RUN_OWN_JOBS.button(SUB_TRIAL_DAYS)}</Button>
      </div>
    </div>
  )
}
