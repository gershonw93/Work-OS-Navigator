'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, TrendingUp, Clock, CheckCircle2, ChevronDown, ChevronUp, Zap, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface FinancialsData {
  total_contracted: number; total_paid: number; total_approved: number
  total_pending: number; approved_change_orders: number
  subcontracts: any[]; invoices: any[]; change_orders: any[]
  payment_schedule_items: any[]
}

export default function FinancialsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [data, setData] = useState<FinancialsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSub, setExpandedSub] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/financials`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  async function generateInvoice(sub: any, item: any) {
    setGenerating(item.id)
    const token = await getToken()
    const amount = item.amount ?? (item.percentage ? Math.round(item.percentage / 100 * sub.contract_amount * 100) / 100 : null)
    if (!amount) { setGenerating(null); return }

    const { count } = await (async () => {
      const res = await fetch(`/api/projects/${params.id}/invoices`, { headers: { Authorization: `Bearer ${token}` } })
      const d = res.ok ? await res.json() : { invoices: [] }
      return { count: (d.invoices ?? []).length }
    })()

    await fetch(`/api/projects/${params.id}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subcontract_id: sub.id,
        payment_schedule_item_id: item.id,
        company_id: sub.companies?.id ?? null,
        company_name: sub.companies?.name ?? sub.trade,
        amount,
        description: item.label,
      }),
    })
    setGenerating(null)
    load()
  }

  if (loading) return <div className="p-4 sm:p-6 text-sm text-slate-400 py-12 text-center">Loading...</div>
  if (!data) return <div className="p-4 sm:p-6 text-sm text-red-500">Failed to load financials.</div>

  const totalOutstanding = data.total_approved + data.total_pending
  const remaining = data.total_contracted - data.total_paid - data.total_approved - data.total_pending
  const paidPct = data.total_contracted > 0 ? (data.total_paid / data.total_contracted) * 100 : 0
  const approvedPct = data.total_contracted > 0 ? (data.total_approved / data.total_contracted) * 100 : 0
  const pendingPct = data.total_contracted > 0 ? (data.total_pending / data.total_contracted) * 100 : 0

  // Track which payment_schedule_item_ids already have invoices
  const invoicedItemIds = new Set((data.invoices ?? []).map((i: any) => i.payment_schedule_item_id).filter(Boolean))

  const statCards = [
    { label: 'Total Contracted', value: data.total_contracted, color: 'text-slate-900', bg: 'bg-white', icon: DollarSign, desc: 'Sum of all subcontracts' },
    { label: 'Approved Change Orders', value: data.approved_change_orders, color: 'text-purple-700', bg: 'bg-purple-50', icon: TrendingUp, desc: 'Approved RFI change orders' },
    { label: 'Total Paid', value: data.total_paid, color: 'text-green-700', bg: 'bg-green-50', icon: CheckCircle2, desc: 'Invoices marked as paid' },
    { label: 'Outstanding', value: totalOutstanding, color: 'text-amber-700', bg: 'bg-amber-50', icon: Clock, desc: 'Approved + pending invoices' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Financials</h1>
        <p className="text-sm text-slate-500 mt-0.5">Project cost breakdown and payment status.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border border-slate-200 p-4', s.bg)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', s.color)} />
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
              </div>
              <p className={cn('text-2xl font-bold', s.color)}>${Number(s.value).toLocaleString()}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Payment progress bar */}
      {data.total_contracted > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Payment Progress</p>
            <p className="text-sm text-slate-500">{paidPct.toFixed(1)}% paid</p>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${paidPct}%` }} title={`Paid: $${data.total_paid.toLocaleString()}`} />
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${approvedPct}%` }} title={`Approved: $${data.total_approved.toLocaleString()}`} />
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${pendingPct}%` }} title={`Pending: $${data.total_pending.toLocaleString()}`} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Paid ${data.total_paid.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Approved ${data.total_approved.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" />Pending ${data.total_pending.toLocaleString()}</span>
            {remaining > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" />Remaining ${remaining.toLocaleString()}</span>}
          </div>
        </div>
      )}

      {/* Subcontracts with payment schedule */}
      {data.subcontracts.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-slate-700">Subcontracts & Payment Schedule</h2>
            <span className="text-xs text-slate-400 hidden sm:inline">Click a subcontract to see milestones</span>
          </div>
          <div className="divide-y divide-slate-100">
            {data.subcontracts.map((sub: any) => {
              const subInvoices = data.invoices.filter((i: any) => i.subcontract_id === sub.id)
              const subItems = (data.payment_schedule_items ?? []).filter((p: any) => p.subcontract_id === sub.id)
              const paid = subInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + Number(i.amount), 0)
              const pct = sub.contract_amount > 0 ? (paid / sub.contract_amount) * 100 : 0
              const isExpanded = expandedSub === sub.id
              const readyToInvoice = subItems.filter((item: any) => item.status !== 'paid' && !invoicedItemIds.has(item.id))

              return (
                <div key={sub.id}>
                  <button className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                    onClick={() => setExpandedSub(isExpanded ? null : sub.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-slate-800">{sub.companies?.name ?? 'Unknown'}</span>
                        <span className="text-xs text-slate-400">{sub.trade}</span>
                        {readyToInvoice.length > 0 && (
                          <span className="text-xs rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 font-medium">
                            {readyToInvoice.length} ready to invoice
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-slate-400 shrink-0">{pct.toFixed(0)}% paid</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">${Number(sub.contract_amount).toLocaleString()}</p>
                      <p className="text-xs text-slate-400">${paid.toLocaleString()} paid</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 divide-y divide-slate-100">
                      {/* Payment schedule milestones */}
                      {subItems.length > 0 && (
                        <div className="px-4 sm:px-5 py-3 space-y-2">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Payment Milestones</p>
                          {subItems.map((item: any) => {
                            const itemAmount = item.amount ?? (item.percentage ? Math.round(item.percentage / 100 * sub.contract_amount * 100) / 100 : null)
                            const hasInvoice = invoicedItemIds.has(item.id)
                            const existingInvoice = data.invoices.find((i: any) => i.payment_schedule_item_id === item.id)
                            const isPaid = item.status === 'paid'

                            return (
                              <div key={item.id} className={cn(
                                'flex flex-wrap items-center gap-3 rounded-lg border px-3 sm:px-4 py-3',
                                isPaid ? 'bg-green-50 border-green-200' : hasInvoice ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'
                              )}>
                                <div className="shrink-0">
                                  {isPaid
                                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    : hasInvoice
                                    ? <Receipt className="h-5 w-5 text-blue-500" />
                                    : <Clock className="h-5 w-5 text-slate-300" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.percentage && <span className="text-xs text-slate-400">{item.percentage}% of contract</span>}
                                    {hasInvoice && existingInvoice && (
                                      <span className={cn('text-xs rounded-full px-1.5 py-0.5 border font-medium',
                                        existingInvoice.status === 'paid' ? 'bg-green-50 border-green-200 text-green-700' :
                                        existingInvoice.status === 'approved' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                        'bg-amber-50 border-amber-200 text-amber-700')}>
                                        Invoice {existingInvoice.status.replace('_', ' ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 shrink-0 ml-auto">
                                  {itemAmount && (
                                    <span className="text-sm font-bold text-slate-900">${Number(itemAmount).toLocaleString()}</span>
                                  )}
                                  {!isPaid && !hasInvoice && itemAmount && (
                                    <Button size="sm" onClick={() => generateInvoice(sub, { ...item, amount: itemAmount })}
                                      disabled={generating === item.id}
                                      className="gap-1.5">
                                      <Zap className="h-3.5 w-3.5" />
                                      {generating === item.id ? 'Generating...' : 'Generate Invoice'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Invoice history */}
                      {subInvoices.length > 0 && (
                        <div className="px-4 sm:px-5 py-3 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Invoice History</p>
                          {subInvoices.map((inv: any) => (
                            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs text-slate-400">{inv.invoice_number}</span>
                                <span className="text-slate-700">{inv.description ?? '—'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                                  inv.status === 'paid' ? 'bg-green-50 border-green-200 text-green-700' :
                                  inv.status === 'approved' ? 'bg-blue-50 border-blue-200 text-blue-700' :
                                  'bg-amber-50 border-amber-200 text-amber-700')}>
                                  {inv.status.replace('_', ' ')}
                                </span>
                                <span className="font-semibold text-slate-800">${Number(inv.amount).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {subItems.length === 0 && subInvoices.length === 0 && (
                        <div className="px-5 py-4 text-sm text-slate-400">No payment schedule or invoices for this subcontract.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
            <span className="text-sm font-semibold text-slate-700">Total Contracted</span>
            <span className="text-base font-bold text-slate-900">${Number(data.total_contracted).toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Change Orders */}
      {data.change_orders.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Change Orders (from RFIs)</h2>
            <span className="text-sm font-bold text-purple-700">${Number(data.approved_change_orders).toLocaleString()} approved</span>
          </div>
          <div className="divide-y divide-slate-50">
            {data.change_orders.map((co: any) => (
              <div key={co.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 text-sm">
                <span className="font-mono text-xs text-slate-400">RFI-{String(co.rfi_number).padStart(3, '0')}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-800 truncate">{co.subject}</p>
                  <p className="text-xs text-slate-400">{co.company_name}</p>
                </div>
                <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                  co.change_order_status === 'approved' ? 'bg-green-50 border-green-200 text-green-700' :
                  co.change_order_status === 'denied' ? 'bg-red-50 border-red-200 text-red-600' :
                  'bg-amber-50 border-amber-200 text-amber-700')}>
                  {co.change_order_status ?? co.status}
                </span>
                {co.change_order_amount && (
                  <span className="font-bold text-purple-700">${Number(co.change_order_amount).toLocaleString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data.subcontracts.length === 0 && data.invoices.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <DollarSign className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No financial data yet</p>
          <p className="text-xs text-slate-400 mt-1">Award bids and create invoices to see the breakdown here.</p>
        </div>
      )}
    </div>
  )
}
