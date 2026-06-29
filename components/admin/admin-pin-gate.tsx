'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function AdminPinGate() {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('No active session.'); return }
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error ?? 'Incorrect code.')
        return
      }
      window.location.reload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <form onSubmit={submit} className="w-full max-w-xs rounded-xl border border-line bg-panel p-6 shadow-sm">
        <div className="mb-4 flex flex-col items-center text-center">
          <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="text-base font-semibold text-ink-soft">Enter admin code</h2>
          <p className="mt-1 text-xs text-muted-fg">This unlocks the platform console for this browser.</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="••••••"
          className="w-full rounded-lg border border-line px-3 py-2 text-center text-lg tracking-widest focus:border-accent focus:outline-none"
        />
        {error && <p className="mt-2 text-center text-xs text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy || !pin}
          className="mt-4 w-full rounded-lg bg-slate-900 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
