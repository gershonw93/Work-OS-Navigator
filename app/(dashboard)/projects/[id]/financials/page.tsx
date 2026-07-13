'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, TrendingUp, Clock, CheckCircle2, ChevronDown, ChevronUp, Zap, Receipt, FileText, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface FinancialsData {
  budget: number
  total_contracted: number; revised_contract: number; change_orders_on_top: number; total_paid: number; total_approved: number
  total_pending: number; approved_change_orders: number
  materials_total: number; materials: any[]
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

  if (loading) return <div className="p-4 sm:p-6 text-sm text-faint py-12 text-center">Loading...</div>
  if (!data) return <div className="p-4 sm:p-6 text-sm text-danger">Failed to load financials.</div>

  // Revised contract = subcontracts + approved change orders. All progress is
  // measured against it so approved COs immediately widen the "whole".
  const revised = data.revised_contract ?? data.total_contracted
  const totalOutstanding = data.total_approved + data.total_pending
  const remaining = revised - data.total_paid - data.total_approved - data.total_pending
  const paidPct = revised > 0 ? (data.total_paid / revised) * 100 : 0
  const approvedPct = revised > 0 ? (data.total_approved / revised) * 100 : 0
  const pendingPct = revised > 0 ? (data.total_pending / revised) * 100 : 0

  // Track which payment_schedule_item_ids already have invoices
  const invoicedItemIds = new Set((data.invoices ?? []).map((i: any) => i.payment_schedule_item_id).filter(Boolean))

  const statCards = [
    { label: 'Total Contracted', value: data.total_contracted, color: 'text-ink', bg: 'bg-panel', icon: DollarSign, desc: 'Sum of all subcontracts' },
    { label: 'Approved Change Orders', value: data.approved_change_orders, color: 'text-special', bg: 'bg-special-tint', icon: TrendingUp, desc: 'Approved on the Change Orders tab' },
    { label: 'Total Paid', value: data.total_paid, color: 'text-success', bg: 'bg-success-tint', icon: CheckCircle2, desc: 'Invoices marked as paid' },
    { label: 'Outstanding', value: totalOutstanding, color: 'text-warn', bg: 'bg-warn-tint', icon: Clock, desc: 'Approved + pending invoices' },
  ]

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink">Financials</h1>
        <p className="text-sm text-muted-fg mt-0.5">Project cost breakdown and payment status.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border border-line p-4', s.bg)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', s.color)} />
                <p className="text-xs font-medium text-muted-fg">{s.label}</p>
              </div>
              <p className={cn('text-2xl font-bold', s.color)}>${Number(s.value).toLocaleString()}</p>
              <p className="text-xs text-faint mt-0.5">{s.desc}</p>
            </div>
          )
        })}
      </div>

      {/* Payment progress bar */}
      {data.total_contracted > 0 && (
        <div className="bg-panel rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink-soft">Payment Progress</p>
            <p className="text-sm text-muted-fg">{paidPct.toFixed(1)}% paid</p>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
            <div className="h-full bg-success-solid transition-all" style={{ width: `${paidPct}%` }} title={`Paid: $${data.total_paid.toLocaleString()}`} />
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${approvedPct}%` }} title={`Approved: $${data.total_approved.toLocaleString()}`} />
            <div className="h-full bg-warn-solid transition-all" style={{ width: `${pendingPct}%` }} title={`Pending: $${data.total_pending.toLocaleString()}`} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-fg">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success-solid" />Paid ${data.total_paid.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" />Approved ${data.total_approved.toLocaleString()}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn-solid" />Pending ${data.total_pending.toLocaleString()}</span>
            {remaining > 0 && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted2" />Remaining ${remaining.toLocaleString()}</span>}
          </div>
        </div>
      )}

      {/* Subcontracts with payment schedule */}
      {data.subcontracts.length > 0 && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-ink-soft">Subcontracts & Payment Schedule</h2>
            <span className="text-xs text-faint hidden sm:inline">Click a subcontract to see milestones</span>
          </div>
          <div className="divide-y divide-line-soft">
            {data.subcontracts.map((sub: any) => {
              const subInvoices = data.invoices.filter((i: any) => i.subcontract_id === sub.id)
              const subItems = (data.payment_schedule_items ?? []).filter((p: any) => p.subcontract_id === sub.id)
              const paid = subInvoices.filter((i: any) => i.status === 'paid').reduce((s: number, i: any) => s + Number(i.amount), 0)
              const pct = sub.contract_amount > 0 ? (paid / sub.contract_amount) * 100 : 0
              const isExpanded = expandedSub === sub.id
              const readyToInvoice = subItems.filter((item: any) => item.status !== 'paid' && !invoicedItemIds.has(item.id))

              return (
                <div key={sub.id}>
                  <button className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-surface transition-colors text-left"
                    onClick={() => setExpandedSub(isExpanded ? null : sub.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-ink-soft">{sub.companies?.name ?? 'Unknown'}</span>
                        <span className="text-xs text-faint">{sub.trade}</span>
                        {readyToInvoice.length > 0 && (
                          <span className="text-xs rounded-full bg-accent-tint text-accent-fg px-1.5 py-0.5 font-medium">
                            {readyToInvoice.length} ready to invoice
                          </span>
                        )}
                        {sub.proposal_url && (
                          <a href={sub.proposal_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            className="text-xs text-accent-fg hover:underline inline-flex items-center gap-1">
                            <FileText className="h-3 w-3" /> View quote
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-success-solid transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-xs text-faint shrink-0">{pct.toFixed(0)}% paid</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-ink">${Number(sub.contract_amount).toLocaleString()}</p>
                      <p className="text-xs text-faint">${paid.toLocaleString()} paid</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-line-soft bg-surface divide-y divide-line-soft">
                      {/* Payment schedule milestones */}
                      {subItems.length > 0 && (
                        <div className="px-4 sm:px-5 py-3 space-y-2">
                          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-3">Payment Milestones</p>
                          {subItems.map((item: any) => {
                            const itemAmount = item.amount ?? (item.percentage ? Math.round(item.percentage / 100 * sub.contract_amount * 100) / 100 : null)
                            const hasInvoice = invoicedItemIds.has(item.id)
                            const existingInvoice = data.invoices.find((i: any) => i.payment_schedule_item_id === item.id)
                            const isPaid = item.status === 'paid'

                            return (
                              <div key={item.id} className={cn(
                                'flex flex-wrap items-center gap-3 rounded-lg border px-3 sm:px-4 py-3',
                                isPaid ? 'bg-success-tint border-success/30' : hasInvoice ? 'bg-info-tint border-info/30' : 'bg-panel border-line'
                              )}>
                                <div className="shrink-0">
                                  {isPaid
                                    ? <CheckCircle2 className="h-5 w-5 text-success" />
                                    : hasInvoice
                                    ? <Receipt className="h-5 w-5 text-info" />
                                    : <Clock className="h-5 w-5 text-faint" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-ink-soft break-words">{item.label}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    {item.percentage && <span className="text-xs text-faint">{item.percentage}% of contract</span>}
                                    {hasInvoice && existingInvoice && (
                                      <span className={cn('text-xs rounded-full px-1.5 py-0.5 border font-medium',
                                        existingInvoice.status === 'paid' ? 'bg-success-tint border-success/30 text-success' :
                                        existingInvoice.status === 'approved' ? 'bg-info-tint border-info/30 text-info' :
                                        'bg-warn-tint border-warn/30 text-warn')}>
                                        Invoice {existingInvoice.status.replace('_', ' ')}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 ml-auto">
                                  {itemAmount && (
                                    <span className="text-sm font-bold text-ink">${Number(itemAmount).toLocaleString()}</span>
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
                          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">Invoice History</p>
                          {subInvoices.map((inv: any) => (
                            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-mono text-xs text-faint shrink-0">{inv.invoice_number}</span>
                                <span className="text-ink-soft truncate min-w-0">{inv.description ?? '-'}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                                  inv.status === 'paid' ? 'bg-success-tint border-success/30 text-success' :
                                  inv.status === 'approved' ? 'bg-info-tint border-info/30 text-info' :
                                  'bg-warn-tint border-warn/30 text-warn')}>
                                  {inv.status.replace('_', ' ')}
                                </span>
                                <span className="font-semibold text-ink-soft">${Number(inv.amount).toLocaleString()}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {subItems.length === 0 && subInvoices.length === 0 && (
                        <div className="px-5 py-4 text-sm text-faint">No payment schedule or invoices for this subcontract.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="px-5 py-3 border-t border-line-soft bg-surface space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-fg">Total Contracted</span>
              <span className="text-sm font-semibold text-ink-soft">${Number(data.total_contracted).toLocaleString()}</span>
            </div>
            {(data.change_orders_on_top ?? 0) !== 0 && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-fg">+ Change Orders (on top)</span>
                  <span className="text-sm font-semibold text-special">${Number(data.change_orders_on_top).toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between border-t border-line-soft pt-1 mt-1">
                  <span className="text-sm font-semibold text-ink-soft">Revised Contract</span>
                  <span className="text-base font-bold text-ink">${Number(revised).toLocaleString()}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Change Orders (from the Change Orders tab) */}
      {data.change_orders.length > 0 && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line-soft flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-soft">Change Orders</h2>
            <span className="text-sm font-bold text-special">${Number(data.approved_change_orders).toLocaleString()} approved</span>
          </div>
          <div className="divide-y divide-line-soft">
            {data.change_orders.map((co: any) => (
              <div key={co.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-soft truncate">{co.title}</p>
                  {co.reason && <p className="text-xs text-faint truncate">{co.reason}</p>}
                </div>
                <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                  co.status === 'approved' ? 'bg-success-tint border-success/30 text-success' :
                  co.status === 'rejected' ? 'bg-danger-tint border-danger/30 text-danger' :
                  'bg-warn-tint border-warn/30 text-warn')}>
                  {co.status}
                </span>
                {co.amount != null && Number(co.amount) !== 0 && (
                  <span className={cn('font-bold', co.status === 'approved' ? 'text-special' : 'text-muted-fg')}>${Number(co.amount).toLocaleString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {(data.materials?.length ?? 0) > 0 && (() => {
        const materialsOwed = data.materials.reduce((s: number, m: any) => s + (m.client_paid ? 0 : Number(m.amount ?? 0)), 0)
        return (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-soft inline-flex items-center gap-1.5"><ShoppingCart className="h-4 w-4 text-muted-fg" /> Materials</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-ink">${Number(data.materials_total).toLocaleString()} spent</span>
              {materialsOwed > 0 && <span className="font-medium text-warn">${materialsOwed.toLocaleString()} owed by client</span>}
            </div>
          </div>
          <div className="divide-y divide-line-soft">
            {data.materials.map((m: any) => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-soft truncate">{m.store_name || 'Material purchase'}</p>
                  <p className="text-xs text-faint truncate">{[m.category, m.purchase_date && new Date(m.purchase_date + 'T00:00:00').toLocaleDateString()].filter(Boolean).join(' · ')}</p>
                </div>
                {m.client_paid ? (
                  <span className="text-xs font-medium text-success">Paid</span>
                ) : (
                  <span className="text-xs font-medium text-warn">Owed</span>
                )}
                {m.receipt_url && <a href={m.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-accent-fg hover:underline">Receipt</a>}
                <span className="font-bold text-ink">${Number(m.amount).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-line-soft bg-surface text-right">
            <Link href="/materials" className="text-xs font-medium text-accent-fg hover:underline">Manage materials →</Link>
          </div>
        </div>
        )
      })()}

      {data.subcontracts.length === 0 && data.invoices.length === 0 && (data.materials?.length ?? 0) === 0 && (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <DollarSign className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No financial data yet</p>
          <p className="text-xs text-faint mt-1">Award bids and create invoices to see the breakdown here.</p>
        </div>
      )}
    </div>
  )
}
