'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'

interface CompanyRow {
  id: string
  name: string | null
  created_at: string | null
  user_count: number
  project_count: number
}

export default function AdminCompanies() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    const d = await adminGet<{ companies: CompanyRow[] }>(`/api/admin/companies?q=${encodeURIComponent(term)}`)
    setRows(d?.companies ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">All Companies</h2>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search companies…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Company</th>
              <th className="px-4 py-2.5">Users</th>
              <th className="px-4 py-2.5">Projects</th>
              <th className="px-4 py-2.5 hidden sm:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No companies found.</td></tr>}
            {!loading && rows.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.user_count}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.project_count}</td>
                <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
