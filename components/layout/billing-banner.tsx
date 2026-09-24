'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Lock, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { TRIAL_WARN_FROM } from '@/lib/trial-warning'

// ─────────────────────────────────────────────────────────────────────────────
// "Why did my save just fail?"
//
// A locked account refuses every write with a 402 and a sentence, which is the
// right answer to a REQUEST and a terrible way to find out. Somebody types a
// daily log, presses save, and learns their trial ended - after doing the work.
// So the fact is announced ONCE for the session, beside the other two that say
// the same class of thing (`ViewAsBanner`, `PermissionsBanner`).
//
// IT SAYS NOTHING UNLESS THERE IS SOMETHING TO SAY. A failed read is not a
// lock: if this cannot reach the server it stays quiet rather than telling
// somebody their account is closed on the strength of one bad request - the
// same rule `lib/auth-outcome.ts` settles, and the same direction.
// ─────────────────────────────────────────────────────────────────────────────

interface State {
  state: string
  writable: boolean
  reason: string
  daysLeft: number | null
}

// THE SCREEN SAYS WHAT THE LETTER SAYS. This used to be its own `= 3`, which is
// a second spelling of a rule the reminder job also holds - and two spellings is
// how a company gets a calm screen on the morning we emailed them that their
// trial was ending, or a shouting one on a day we sent nothing. One list, in
// lib/trial-warning.ts, read by both.

export function BillingBanner() {
  const [access, setAccess] = useState<State | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { data } = await createClient().auth.getSession()
        const token = data?.session?.access_token
        if (!token) return
        const res = await fetch('/api/billing/usage', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) return
        const body = await res.json()
        if (live && body?.access) setAccess(body.access as State)
      } catch {
        // Deliberately silent. See the note above.
      }
    })()
    return () => { live = false }
  }, [])

  if (!access) return null

  if (!access.writable) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-danger-solid px-4 py-1.5 text-sm font-medium text-white sm:px-6">
        <Lock className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{access.reason}</span>
        <Link href="/settings?tab=billing" className="shrink-0 underline underline-offset-2">
          Choose a plan
        </Link>
      </div>
    )
  }

  const ending = access.state === 'trial' && access.daysLeft !== null && access.daysLeft <= TRIAL_WARN_FROM
  const failed = access.state === 'overdue'
  if (!ending && !failed) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warn-tint px-4 py-1.5 text-sm font-medium text-warn sm:px-6">
      <Clock className="h-4 w-4 shrink-0" />
      <span className="min-w-0">{access.reason}</span>
      <Link href="/settings?tab=billing" className="shrink-0 underline underline-offset-2">
        {failed ? 'Update the card' : 'See plans'}
      </Link>
    </div>
  )
}
