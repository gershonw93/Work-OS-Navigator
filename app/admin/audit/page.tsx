'use client'

import { useEffect, useState } from 'react'
import { adminGet } from '@/lib/admin-fetch'

interface LogRow {
  id: string
  actor_email: string | null
  target_email: string | null
  created_at: string
}

export default function AdminAudit() {
  const [rows, setRows] = useState<LogRow[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminGet<{ log: LogRow[]; note?: string }>('/api/admin/audit').then(d => {
      setRows(d?.log ?? [])
      setNote(d?.note ?? null)
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Impersonation Audit Log</h2>
      {note && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{note}</div>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Admin</th>
              <th className="px-4 py-2.5">Logged in as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No impersonation events yet.</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-600">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-slate-800">{r.actor_email || '—'}</td>
                <td className="px-4 py-2.5 text-slate-800">{r.target_email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
