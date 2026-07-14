'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const dt = (d: string | null) => d ? new Date(d + 'T00:00:00').toLocaleDateString() : '—'

export default function PayAppPrint({ params }: { params: { id: string; appId: string } }) {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`/api/projects/${params.id}/pay-apps/${params.appId}`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
      if (res.ok) setData(await res.json())
    })()
  }, [params.id, params.appId])

  if (!data) return <div className="p-8 text-sm text-gray-500">Loading…</div>
  const { application: app, lines, summary, project } = data

  return (
    <div className="mx-auto max-w-4xl bg-white p-8 text-[13px] text-black print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-600">Preview - use your browser's Print to save as PDF.</p>
        <button onClick={() => window.print()} className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white">Print</button>
      </div>

      {/* G702 - Application and Certificate for Payment */}
      <div className="border border-gray-400">
        <div className="border-b border-gray-400 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Application and Certificate for Payment</p>
          <h1 className="text-lg font-bold">{project?.name}</h1>
          <p className="text-gray-600">{project?.address}</p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 px-4 py-3 text-[13px]">
          <div className="flex justify-between"><span className="text-gray-500">Application No.</span><span className="font-semibold">{app.application_number}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Billed to</span><span className="font-semibold">{app.bill_to}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Period ending</span><span className="font-semibold">{dt(app.period_end)}</span></div>
          <div className="flex justify-between"><span className="text-gray-500">Owner / Client</span><span className="font-semibold">{project?.client ?? '—'}</span></div>
        </div>
        <table className="w-full border-t border-gray-400 text-[13px]">
          <tbody>
            {[
              ['1. Original contract sum + change orders', summary.scheduled],
              ['2. Total completed & stored to date (G703 col. G)', summary.completed_to_date],
              [`3. Retainage ${app.retainage_pct}%`, summary.retainage],
              ['4. Total earned less retainage (2 - 3)', summary.earned_less_retainage],
              ['5. Less previous certificates for payment', summary.less_previous],
              ['6. CURRENT PAYMENT DUE (4 - 5)', summary.current_due],
              ['7. Balance to finish, plus retainage', summary.balance_to_finish],
            ].map(([label, val], i) => (
              <tr key={i} className={i === 5 ? 'bg-gray-100 font-bold' : ''}>
                <td className="border-t border-gray-200 px-4 py-1.5">{label as string}</td>
                <td className="border-t border-gray-200 px-4 py-1.5 text-right font-mono">{money(val as number)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid grid-cols-2 gap-8 px-4 py-6 text-[13px]">
          <div>
            <p className="mb-8 border-b border-gray-400" />
            <p className="text-gray-500">Contractor - by / date</p>
          </div>
          <div>
            <p className="mb-8 border-b border-gray-400" />
            <p className="text-gray-500">Architect / Lender certification - by / date {app.certified_by ? `(${app.certified_by})` : ''}</p>
          </div>
        </div>
      </div>

      {/* G703 - Continuation Sheet */}
      <p className="mt-6 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Continuation Sheet (G703)</p>
      <table className="w-full border border-gray-400 text-[12px]">
        <thead className="bg-gray-100">
          <tr>
            <th className="border border-gray-300 px-2 py-1 text-left">Item</th>
            <th className="border border-gray-300 px-2 py-1 text-left">Description of work</th>
            <th className="border border-gray-300 px-2 py-1 text-right">Scheduled value</th>
            <th className="border border-gray-300 px-2 py-1 text-right">From previous</th>
            <th className="border border-gray-300 px-2 py-1 text-right">This period</th>
            <th className="border border-gray-300 px-2 py-1 text-right">Stored</th>
            <th className="border border-gray-300 px-2 py-1 text-right">Total & stored</th>
            <th className="border border-gray-300 px-2 py-1 text-right">%</th>
            <th className="border border-gray-300 px-2 py-1 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => {
            const completed = (Number(l.previous_completed) || 0) + (Number(l.this_period) || 0) + (Number(l.materials_stored) || 0)
            const sv = Number(l.scheduled_value) || 0
            return (
              <tr key={l.id}>
                <td className="border border-gray-300 px-2 py-1">{l.cost_code ?? i + 1}</td>
                <td className="border border-gray-300 px-2 py-1">{l.description}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(sv)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(Number(l.previous_completed) || 0)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(Number(l.this_period) || 0)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(Number(l.materials_stored) || 0)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(completed)}</td>
                <td className="border border-gray-300 px-2 py-1 text-right">{sv ? Math.round((completed / sv) * 100) : 0}%</td>
                <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(sv - completed)}</td>
              </tr>
            )
          })}
          <tr className="bg-gray-100 font-bold">
            <td className="border border-gray-300 px-2 py-1" colSpan={2}>Grand total</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.scheduled)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.previous)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.this_period)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.stored)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.completed_to_date)}</td>
            <td className="border border-gray-300 px-2 py-1 text-right">{summary.scheduled ? Math.round((summary.completed_to_date / summary.scheduled) * 100) : 0}%</td>
            <td className="border border-gray-300 px-2 py-1 text-right font-mono">{money(summary.balance_to_finish)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
