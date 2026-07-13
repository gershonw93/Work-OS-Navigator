'use client'

import { useEffect, useState, useCallback } from 'react'
import { UserCog, Search, X, LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isSuperAdmin } from '@/lib/super-admin'

const ADMIN_SESSION_KEY = 'workos_admin_session'
const IMPERSONATING_KEY = 'workos_impersonating'

interface ImpersonationState {
  targetId: string
  name: string
  email: string
}

export function getImpersonation(): ImpersonationState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(IMPERSONATING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

interface AccountRow {
  id: string
  full_name: string | null
  email: string | null
  role: string
  company_name: string | null
}

// Shared impersonation flow - mints a real session for the target user and swaps to it.
// Returns an error message on failure, or null on success (the page will redirect).
export async function impersonateUser(userId: string): Promise<string | null> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return 'No active session.'

  const res = await fetch('/api/admin/impersonate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ userId }),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    return e.error ?? res.statusText
  }
  const { token_hash, target } = await res.json()

  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }))

  const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
  if (error) {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    return error.message
  }

  localStorage.setItem(IMPERSONATING_KEY, JSON.stringify({
    targetId: target.id, name: target.name, email: target.email,
  }))
  window.location.href = '/dashboard'
  return null
}

export function ImpersonateSwitcher() {
  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Determine super-admin from the current session
  useEffect(() => {
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      setIsOwner(isSuperAdmin(session?.user?.email))
    })()
  }, [])

  const search = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const d = res.ok ? await res.json() : null
      setUsers(d?.users ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => search(q), 250)
    return () => clearTimeout(t)
  }, [q, open, search])

  async function impersonate(u: AccountRow) {
    setBusy(u.id)
    const err = await impersonateUser(u.id)
    if (err) {
      alert(`Could not log in as this user: ${err}`)
      setBusy(null)
    }
    // On success the helper redirects, so no need to clear busy
  }

  if (!isOwner) return null
  // Hide the entry point while already impersonating (use the banner to exit)
  if (getImpersonation()) return null

  return (
    <>
      <a
        href="/admin"
        title="Platform admin console"
        className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-800"
      >
        <Shield className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Admin</span>
      </a>
      <button
        onClick={() => setOpen(true)}
        title="Log in as another account"
        className="flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface"
      >
        <UserCog className="h-3.5 w-3.5 text-faint" />
        <span className="hidden sm:inline">Log in as</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-panel shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <h2 className="text-sm font-semibold text-ink-soft">Log in as another account</h2>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-muted-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-faint" />
                <input
                  autoFocus
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
                />
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto">
                {loading && <p className="py-6 text-center text-sm text-faint">Searching…</p>}
                {!loading && users.length === 0 && (
                  <p className="py-6 text-center text-sm text-faint">No accounts found.</p>
                )}
                {!loading && users.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-soft">{u.full_name || u.email}</p>
                      <p className="truncate text-xs text-muted-fg">
                        {u.email}{u.company_name ? ` · ${u.company_name}` : ''}{u.role ? ` · ${u.role}` : ''}
                      </p>
                    </div>
                    <button
                      disabled={busy === u.id}
                      onClick={() => impersonate(u)}
                      className="shrink-0 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {busy === u.id ? '…' : 'Log in'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export async function exitImpersonation() {
  const supabase = createClient()
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    if (raw) {
      const { access_token, refresh_token } = JSON.parse(raw)
      await supabase.auth.setSession({ access_token, refresh_token })
    } else {
      await supabase.auth.signOut()
    }
  } catch {
    await supabase.auth.signOut()
  }
  localStorage.removeItem(ADMIN_SESSION_KEY)
  localStorage.removeItem(IMPERSONATING_KEY)
  window.location.href = '/dashboard'
}

export function ImpersonationBanner() {
  const [state, setState] = useState<ImpersonationState | null>(null)
  useEffect(() => { setState(getImpersonation()) }, [])

  if (!state) return null

  return (
    <div className="flex items-center justify-center gap-3 bg-rose-600 px-4 py-1.5 text-white text-sm font-medium">
      <UserCog className="h-4 w-4 shrink-0" />
      <span>
        Logged in as <strong>{state.name}</strong> ({state.email}) - customer-support session.
      </span>
      <button
        onClick={() => exitImpersonation()}
        className="inline-flex items-center gap-1 rounded-md bg-panel/20 px-2 py-0.5 text-xs font-semibold hover:bg-panel/30 transition-colors"
      >
        <LogOut className="h-3 w-3" /> Exit & return to my account
      </button>
    </div>
  )
}
