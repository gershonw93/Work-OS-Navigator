'use client'

import { useEffect, useState, useCallback } from 'react'
import { Search } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'

interface ProjectRow {
  id: string
  name: string | null
  status: string | null
  project_type: string | null
  client: string | null
  created_at: string | null
  company_name: string | null
}

export default function AdminProjects() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (term: string) => {
    setLoading(true)
    const d = await adminGet<{ projects: ProjectRow[] }>(`/api/admin/projects?q=${encodeURIComponent(term)}`)
    setRows(d?.projects ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => load(q), 250)
    return () => clearTimeout(t)
  }, [q, load])

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">All Projects</h2>
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search projects…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Project</th>
              <th className="px-4 py-2.5 hidden md:table-cell">Company</th>
              <th className="px-4 py-2.5 hidden sm:table-cell">Client</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 hidden sm:table-cell">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No projects found.</td></tr>}
            {!loading && rows.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-800">{p.name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600 hidden md:table-cell">{p.company_name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600 hidden sm:table-cell">{p.client || '—'}</td>
                <td className="px-4 py-2.5"><span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 capitalize">{p.status || '—'}</span></td>
                <td className="px-4 py-2.5 text-slate-500 hidden sm:table-cell">{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
