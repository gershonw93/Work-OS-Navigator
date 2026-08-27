'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * The client's email for a project, for pre-filling a Send box.
 *
 * A hook rather than a fetch repeated per component, because the repetition
 * already cost us: /api/projects/[id]/client-email answers `{ clientEmail }`,
 * the invoice composer read `clientEmail`, and the payment-request box read
 * `email`. Undefined is falsy, the guard swallowed it, and the field simply
 * stayed blank - no error, nothing in the console, and the browser's own
 * autofill dropdown appearing in its place made it look like the app had
 * offered something.
 *
 * One reader means one key to get wrong, once.
 */
export function useClientEmail(projectId: string): string {
  const [email, setEmail] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const res = await fetch(`/api/projects/${projectId}/client-email`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok || !active) return
      const d = await res.json().catch(() => ({}))
      if (active && d?.clientEmail) setEmail(d.clientEmail)
    })()
    return () => { active = false }
  }, [projectId])

  return email
}
