'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search, LogIn } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'
import { impersonateUser } from '@/components/layout/impersonate-switcher'

interface AccountRow {
  id: string
  full_name: string | null
  email: string | null
  role: string
  company_name: string | null
}

export default function AdminUsers() {
  const [q, setQ] = useState('')
  const [users, setUsers] = useState<AccountRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    const d = await adminGet<{ users: AccountRow[] }>(`/api/admin/users?q=${encodeURIComponent(term)}`)
    setUsers(d?.users ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  async function loginAs(u: AccountRow) {
    setBusy(u.id)
    const err = await impersonateUser(u.id)
    if (err) { alert(`Could not log in as this user: ${err}`); setBusy(null) }
  }

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink-soft">All Users</h2>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-faint" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-lg border border-line py-2 pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs font-semibold uppercase text-muted-fg">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5 hidden sm:table-cell">Email</th>
              <th className="px-4 py-2.5 hidden md:table-cell">Company</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-faint">Loading…</td></tr>}
            {!loading && users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-faint">No users found.</td></tr>}
            {!loading && users.map(u => (
              <tr key={u.id} className="hover:bg-surface">
                <td className="px-4 py-2.5 font-medium text-ink-soft">{u.full_name || '—'}</td>
                <td className="px-4 py-2.5 text-muted-fg hidden sm:table-cell">{u.email}</td>
                <td className="px-4 py-2.5 text-muted-fg hidden md:table-cell">{u.company_name || '—'}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-fg">{u.role || '—'}</span></td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    disabled={busy === u.id}
                    onClick={() => loginAs(u)}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    <LogIn className="h-3 w-3" /> {busy === u.id ? '…' : 'Log in as'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
