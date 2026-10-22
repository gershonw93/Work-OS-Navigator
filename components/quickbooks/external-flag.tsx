'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { externalLabel } from '@/lib/qbo-pull'

// ─────────────────────────────────────────────────────────────────────────────
// "Voided / Deleted / Changed / Part paid in QuickBooks" on the row it is about
// (lib/quickbooks-pull.ts). A flag is a question for a person - QuickBooks says
// otherwise, which is right? - so it says what QuickBooks has, in words, on the
// row (a phone has no hover), and can be dismissed once answered. Deleting or
// editing the record to match answers it too.
// ─────────────────────────────────────────────────────────────────────────────

export function QboExternalFlag({ state, note, table, id, onCleared }: {
  state: string | null | undefined
  note?: string | null
  table: 'client_payments' | 'client_invoices' | 'invoices'
  id: string
  onCleared?: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = externalLabel(state)
  if (!label) return null

  async function dismiss() {
    if (busy) return
    setBusy(true); setError('')
    try {
      const { data } = await createClient().auth.getSession()
      const t = data?.session?.access_token
      const res = await fetch('/api/quickbooks/flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
        body: JSON.stringify({ table, id }),
      })
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not dismiss it.'); return }
      onCleared?.()
    } catch {
      setError('Could not reach the server. Reload and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="block text-xs text-warn">
      <span className="inline-flex items-center gap-1 font-semibold"><AlertTriangle className="h-3 w-3" /> {label}</span>
      {note ? <> - {note}</> : null}
      {' '}
      <button type="button" onClick={dismiss} disabled={busy} className="font-medium text-muted-fg underline hover:text-ink disabled:opacity-50">
        {busy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : 'Dismiss'}
      </button>
      {error && <span className="block text-danger">{error}</span>}
    </span>
  )
}
