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
      <h2 className="mb-4 text-lg font-semibold text-ink-soft">Impersonation Audit Log</h2>
      {note && (
        <div className="mb-4 rounded-lg border border-warn/30 bg-warn-tint px-3 py-2 text-sm text-warn">{note}</div>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-panel">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-xs font-semibold uppercase text-muted-fg">
            <tr>
              <th className="px-4 py-2.5">When</th>
              <th className="px-4 py-2.5">Admin</th>
              <th className="px-4 py-2.5">Logged in as</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {loading && <tr><td colSpan={3} className="px-4 py-8 text-center text-faint">Loading…</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-faint">No impersonation events yet.</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-surface">
                <td className="px-4 py-2.5 text-muted-fg">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.actor_email || '-'}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.target_email || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
