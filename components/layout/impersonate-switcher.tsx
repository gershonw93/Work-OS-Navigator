'use client'

import { useEffect, useState, useCallback } from 'react'
import { UserCog, Search, X, LogOut } from 'lucide-react'
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
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ userId: u.id }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(`Could not log in as this user: ${e.error ?? res.statusText}`)
        return
      }
      const { token_hash, target } = await res.json()

      // Stash the owner's own session so we can restore it on exit
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }))

      // Establish a REAL session as the target user
      const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
      if (error) {
        localStorage.removeItem(ADMIN_SESSION_KEY)
        alert(`Could not start session: ${error.message}`)
        return
      }

      localStorage.setItem(IMPERSONATING_KEY, JSON.stringify({
        targetId: target.id, name: target.name, email: target.email,
      }))
      window.location.href = '/dashboard'
    } finally {
      setBusy(null)
    }
  }

  if (!isOwner) return null
  // Hide the entry point while already impersonating (use the banner to exit)
  if (getImpersonation()) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Log in as another account"
        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
      >
        <UserCog className="h-3.5 w-3.5 text-slate-400" />
        <span className="hidden sm:inline">Log in as</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Log in as another account</h2>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  autoFocus
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Search by name or email…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
              <div className="mt-3 max-h-80 overflow-y-auto">
                {loading && <p className="py-6 text-center text-sm text-slate-400">Searching…</p>}
                {!loading && users.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">No accounts found.</p>
                )}
                {!loading && users.map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{u.full_name || u.email}</p>
                      <p className="truncate text-xs text-slate-500">
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
        Logged in as <strong>{state.name}</strong> ({state.email}) — customer-support session.
      </span>
      <button
        onClick={() => exitImpersonation()}
        className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        <LogOut className="h-3 w-3" /> Exit & return to my account
      </button>
    </div>
  )
}
