'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function PortalAccountSignOut() {
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true)
    try { await createClient().auth.signOut() } finally { window.location.href = '/login' }
  }
  return (
    <button type="button" onClick={signOut} disabled={busy}
      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-surface disabled:opacity-60">
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      Sign out
    </button>
  )
}
