'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { CheckSquare, FileText, MessageSquare, DollarSign, Clock, CheckCircle2, XCircle, ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type FilterTab = 'all' | 'invoices' | 'rfis'

const STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-warn-tint border-warn/30 text-warn',
  approved:         'bg-success-tint border-success/30 text-success',
  rejected:         'bg-danger-tint border-danger/30 text-danger',
  paid:             'bg-success-tint border-success/30 text-success',
  open:             'bg-accent-tint border-accent/40 text-accent-fg',
  closed:           'bg-surface border-line text-muted-fg',
  pending:          'bg-warn-tint border-warn/30 text-warn',
}

function formatStatus(s: string) {
  return s.replace(/_/g, ' ')
}

export default function ApprovalsPage() {
  const supabase = createClient()
  const [items, setItems] = useState<any[]>([])
  const [isSub, setIsSub] = useState(false)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [acting, setActing] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch('/api/approvals', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      setItems(json.items ?? [])
      setIsSub(json.isSub ?? false)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleInvoiceAction(item: any, status: 'approved' | 'rejected') {
    setActing(item.id)
    setError('')
    const token = await getToken()
    const res = await fetch(`/api/projects/${item.project_id}/invoices/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(j.error ?? 'Action failed. Please try again.')
    } else {
      await load()
    }
    setActing(null)
  }

  const filtered = items.filter(item => {
    if (filter === 'invoices') return item.type === 'invoice'
    if (filter === 'rfis') return item.type === 'rfi'
    return true
  })

  const invoiceCount = items.filter(i => i.type === 'invoice').length
  const rfiCount = items.filter(i => i.type === 'rfi').length

  const tabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'invoices', label: 'Invoices', count: invoiceCount },
    { key: 'rfis', label: 'RFIs', count: rfiCount },
  ]

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Approvals" subtitle="" />
        <div className="py-16 text-center text-sm text-faint">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <PageHeader
        title={isSub ? 'My Submissions' : 'Approvals'}
        subtitle={isSub
          ? 'Track the status of your submitted invoices and RFIs.'
          : 'Review and act on pending invoices and open RFIs.'}
      />

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              'flex items-center gap-1.5 shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-sm font-medium transition-colors',
              filter === t.key
                ? 'border-b-2 border-accent text-accent-fg -mb-px'
                : 'text-muted-fg hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={cn(
                'text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[18px] text-center',
                filter === t.key ? 'bg-accent-tint text-accent-fg' : 'bg-muted text-muted-fg',
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-2.5 text-sm text-danger">{error}</div>
      )}

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={CheckSquare}
              title={isSub ? 'No submissions yet' : 'No pending items'}
              description={isSub
                ? 'Your submitted invoices and RFIs will appear here with their current status.'
                : 'Invoices and RFIs submitted for your review will appear here.'}
            />
          ) : (
            <>
              {/* Mobile card list */}
              <div className="md:hidden divide-y divide-line-soft">
                {filtered.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {item.type === 'invoice'
                          ? <FileText className="h-4 w-4 text-info" />
                          : <MessageSquare className="h-4 w-4 text-accent-fg" />}
                        <span className="text-xs font-semibold text-ink-soft">{item.label}</span>
                      </div>
                      <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[item.status] ?? STATUS_COLORS.pending)}>
                        {formatStatus(item.status)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-medium text-ink-soft">{item.project ?? '-'}</p>
                      {item.description && <p className="text-xs text-muted-fg mt-0.5 line-clamp-2">{item.description}</p>}
                      {!isSub && item.submitted_by && (
                        <p className="text-xs text-faint mt-0.5">From: {item.submitted_by}</p>
                      )}
                      {item.amount != null && (
                        <p className="text-sm font-semibold text-ink-soft mt-1 flex items-center gap-1">
                          <DollarSign className="h-3.5 w-3.5 text-faint" />
                          {Number(item.amount).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-faint mt-1">
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    {/* Actions */}
                    {!isSub && item.type === 'invoice' && (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleInvoiceAction(item, 'approved')}
                          disabled={acting === item.id}
                          className="flex items-center gap-1.5 rounded-lg bg-success-solid hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {acting === item.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleInvoiceAction(item, 'rejected')}
                          disabled={acting === item.id}
                          className="flex items-center gap-1.5 rounded-lg bg-danger-solid hover:bg-danger-solid disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </button>
                      </div>
                    )}

                    {!isSub && item.type === 'rfi' && (
                      <Link
                        href={`/projects/${item.project_id}/rfis`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-fg hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> View &amp; Respond
                      </Link>
                    )}

                    {isSub && item.type === 'rfi' && item.meta?.responded && (
                      <div className="flex items-center gap-1 text-xs text-success font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" /> GC Responded
                      </div>
                    )}
                    {isSub && item.type === 'rfi' && !item.meta?.responded && (
                      <div className="flex items-center gap-1 text-xs text-faint">
                        <Clock className="h-3.5 w-3.5" /> Awaiting GC response
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-soft">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Item</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Project</th>
                      {!isSub && <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Submitted By</th>}
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">
                        {isSub ? 'Notes' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {filtered.map((item) => (
                      <tr key={`${item.type}-${item.id}`} className="hover:bg-surface transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {item.type === 'invoice'
                              ? <FileText className="h-4 w-4 text-info shrink-0" />
                              : <MessageSquare className="h-4 w-4 text-accent-fg shrink-0" />}
                            <div>
                              <p className="font-medium text-ink-soft">{item.label}</p>
                              {item.description && <p className="text-xs text-faint mt-0.5 max-w-[200px] truncate">{item.description}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-ink-soft">{item.project ?? '-'}</td>
                        {!isSub && <td className="px-4 py-3 text-muted-fg">{item.submitted_by ?? '-'}</td>}
                        <td className="px-4 py-3 font-semibold text-ink-soft">
                          {item.amount != null ? `$${Number(item.amount).toLocaleString()}` : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[item.status] ?? STATUS_COLORS.pending)}>
                            {formatStatus(item.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-fg whitespace-nowrap">
                          {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          {!isSub && item.type === 'invoice' && (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleInvoiceAction(item, 'approved')}
                                disabled={acting === item.id}
                                className="flex items-center gap-1 rounded-lg bg-success-solid hover:bg-green-700 disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 transition-colors"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {acting === item.id ? '...' : 'Approve'}
                              </button>
                              <button
                                onClick={() => handleInvoiceAction(item, 'rejected')}
                                disabled={acting === item.id}
                                className="flex items-center gap-1 rounded-lg bg-danger-solid hover:bg-danger-solid disabled:opacity-50 text-white text-xs font-semibold px-2.5 py-1.5 transition-colors"
                              >
                                <XCircle className="h-3.5 w-3.5" />
                                Reject
                              </button>
                            </div>
                          )}
                          {!isSub && item.type === 'rfi' && (
                            <Link
                              href={`/projects/${item.project_id}/rfis`}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-fg hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" /> View &amp; Respond
                            </Link>
                          )}
                          {isSub && item.type === 'rfi' && item.meta?.responded && (
                            <span className="text-xs text-success font-medium flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Responded
                            </span>
                          )}
                          {isSub && item.type === 'rfi' && !item.meta?.responded && (
                            <span className="text-xs text-faint flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" /> Awaiting response
                            </span>
                          )}
                          {isSub && item.type === 'invoice' && (
                            <span className="text-xs text-faint">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
