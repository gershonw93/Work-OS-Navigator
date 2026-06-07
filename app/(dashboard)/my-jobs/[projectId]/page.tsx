'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Calendar, DollarSign, CheckCircle2, Clock,
  XCircle, AlertCircle, ChevronRight, MessageSquare, ClipboardCheck,
  Receipt, BookOpen, Flag, Plus, X, Phone,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Tab = 'overview' | 'tasks' | 'rfis' | 'inspections' | 'invoices'

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-slate-50 border-slate-200 text-slate-600',
  in_progress: 'bg-blue-50 border-blue-200 text-blue-700',
  completed: 'bg-green-50 border-green-200 text-green-700',
  pending: 'bg-amber-50 border-amber-200 text-amber-700',
  paid: 'bg-green-50 border-green-200 text-green-700',
  approved: 'bg-blue-50 border-blue-200 text-blue-700',
  sent: 'bg-purple-50 border-purple-200 text-purple-700',
  pending_approval: 'bg-amber-50 border-amber-200 text-amber-700',
  passed: 'bg-green-50 border-green-200 text-green-700',
  failed: 'bg-red-50 border-red-200 text-red-600',
  scheduled: 'bg-blue-50 border-blue-200 text-blue-700',
  not_scheduled: 'bg-slate-50 border-slate-200 text-slate-500',
}

export default function SubJobDetailPage({ params }: { params: { projectId: string } }) {
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  // RFI form
  const [showRfiForm, setShowRfiForm] = useState(false)
  const [rfiSubject, setRfiSubject] = useState('')
  const [rfiDescription, setRfiDescription] = useState('')
  const [rfiIsChangeOrder, setRfiIsChangeOrder] = useState(false)
  const [rfiCoDescription, setRfiCoDescription] = useState('')
  const [rfiCoAmount, setRfiCoAmount] = useState('')
  const [rfiSubmitting, setRfiSubmitting] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/my-jobs/${params.projectId}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      setData(await res.json())
    } else {
      const err = await res.json().catch(() => ({}))
      setData({ error: err.error || `HTTP ${res.status}` })
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.projectId])

  async function submitRfi(e: React.FormEvent) {
    e.preventDefault()
    setRfiSubmitting(true)
    const token = await getToken()
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/projects/${params.projectId}/rfis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subject: rfiSubject, description: rfiDescription,
        is_change_order: rfiIsChangeOrder,
        change_order_description: rfiIsChangeOrder ? rfiCoDescription : null,
        change_order_amount: rfiIsChangeOrder && rfiCoAmount ? parseFloat(rfiCoAmount) : null,
        submitted_by_name: session?.user?.email ?? 'Sub',
        company_name: null, company_id: null,
      }),
    })
    setRfiSubject(''); setRfiDescription(''); setRfiIsChangeOrder(false)
    setRfiCoDescription(''); setRfiCoAmount('')
    setShowRfiForm(false); setRfiSubmitting(false)
    load()
  }

  async function markInspectionReady(inspId: string) {
    const token = await getToken()
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/projects/${params.projectId}/inspections/${inspId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready_marked_by: session?.user?.email ?? 'Sub', ready_marked_at: new Date().toISOString() }),
    })
    load()
  }

  if (loading) return <div className="p-6 text-sm text-slate-400 py-12 text-center">Loading...</div>
  if (!data || data.error) return <div className="p-6 text-sm text-red-500">Error: {data?.error ?? 'Job not found or access denied.'}</div>

  const { project, subcontracts, tasks, rfis, inspections, invoices, recentLogs } = data
  const totalContractValue = (subcontracts ?? []).reduce((sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0)
  const openTasks = tasks.filter((t: any) => t.status !== 'completed')
  const openRfis = rfis.filter((r: any) => r.status === 'open')
  const pendingInspections = inspections.filter((i: any) => i.status !== 'passed' && i.status !== 'failed')
  const pendingInvoices = invoices.filter((i: any) => i.status !== 'paid')

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'tasks', label: 'My Tasks', badge: openTasks.length },
    { key: 'rfis', label: 'RFIs', badge: openRfis.length },
    { key: 'inspections', label: 'Inspections', badge: pendingInspections.length },
    { key: 'invoices', label: 'Invoices', badge: pendingInvoices.length },
  ]

  return (
    <div className="p-6 space-y-5">
      {/* Back */}
      <Link href="/my-jobs" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to My Jobs
      </Link>

      {/* Project header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 flex-wrap">
              {project.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.address}</span>}
              {project.start_date && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{new Date(project.start_date).toLocaleDateString()}</span>}
              <span className="capitalize">{project.type?.replace('_', ' ')}</span>
            </div>
          </div>
          {subcontracts?.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400 mb-0.5">Total Contract Value</p>
              <p className="text-2xl font-bold text-slate-900">${totalContractValue.toLocaleString()}</p>
              <p className="text-xs text-slate-500">{subcontracts.map((s: any) => s.trade).join(' · ')}</p>
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          {[
            { label: 'Open Tasks', value: openTasks.length, color: openTasks.length > 0 ? 'text-blue-600' : 'text-green-600' },
            { label: 'Open RFIs', value: openRfis.length, color: openRfis.length > 0 ? 'text-orange-600' : 'text-slate-500' },
            { label: 'Pending Inspections', value: pendingInspections.length, color: 'text-slate-700' },
            { label: 'Unpaid Invoices', value: pendingInvoices.length, color: pendingInvoices.length > 0 ? 'text-amber-600' : 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0',
              activeTab === t.key ? 'border-b-2 border-orange-500 text-orange-600 -mb-px' : 'text-slate-500 hover:text-slate-700')}>
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className={cn('text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[18px] text-center',
                activeTab === t.key ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500')}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Payment schedules — one card per subcontract */}
          {(subcontracts ?? []).map((sub: any) => (
            <div key={sub.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Payment Schedule — {sub.trade}</h2>
                <span className="text-sm font-bold text-slate-900">${Number(sub.contract_amount).toLocaleString()}</span>
              </div>
              {sub.payment_schedule_items?.length > 0 ? (
                <>
                  <div className="divide-y divide-slate-50">
                    {sub.payment_schedule_items.map((item: any) => (
                      <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="shrink-0">
                          {item.status === 'paid'
                            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                            : <Clock className="h-4 w-4 text-slate-300" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800">{item.label}</p>
                          {item.percentage && <p className="text-xs text-slate-400">{item.percentage}% of contract</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-slate-900">
                            {item.amount ? `$${Number(item.amount).toLocaleString()}` : item.percentage ? `${item.percentage}%` : '—'}
                          </p>
                          <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                            STATUS_COLORS[item.status] ?? STATUS_COLORS.pending)}>
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="px-5 py-4 text-sm text-slate-400">No payment schedule set.</p>
              )}
            </div>
          ))}

          {/* Recent logs */}
          {recentLogs.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-700">Recent Site Logs</h2>
              </div>
              <div className="divide-y divide-slate-50">
                {recentLogs.map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    {log.has_issues
                      ? <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                      : <div className="h-4 w-4 rounded-full bg-green-100 flex items-center justify-center shrink-0"><div className="h-1.5 w-1.5 rounded-full bg-green-500" /></div>}
                    <span className="font-medium text-slate-700">
                      {new Date(log.log_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="text-slate-400 text-xs">{log.created_by_name}</span>
                    {log.has_issues && <span className="ml-auto text-xs text-red-500 font-medium">Issue flagged</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">No tasks assigned to you yet.</p>
            </div>
          ) : tasks.map((task: any) => (
            <div key={task.id} className={cn('bg-white rounded-xl border border-slate-200 px-5 py-4',
              task.status === 'completed' && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {task.status === 'completed'
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : task.status === 'in_progress'
                    ? <Clock className="h-4 w-4 text-blue-500" />
                    : <div className="h-4 w-4 rounded-full border-2 border-slate-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('font-medium text-slate-800', task.status === 'completed' && 'line-through text-slate-400')}>{task.title}</p>
                  {task.description && <p className="text-xs text-slate-400 mt-0.5">{task.description}</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[task.status] ?? STATUS_COLORS.open)}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5',
                      task.priority === 'urgent' ? 'bg-red-50 border-red-200 text-red-600' :
                      task.priority === 'high' ? 'bg-orange-50 border-orange-200 text-orange-600' :
                      'bg-slate-50 border-slate-200 text-slate-500')}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-slate-400">{new Date(task.due_date).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* RFIs tab */}
      {activeTab === 'rfis' && (
        <div className="space-y-3">
          {!showRfiForm && (
            <Button onClick={() => setShowRfiForm(true)} variant="outline">
              <Plus className="h-4 w-4" /> Submit New RFI
            </Button>
          )}

          {showRfiForm && (
            <form onSubmit={submitRfi} className="bg-white rounded-xl border border-orange-200 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-slate-800 text-sm">New RFI</h3>
                <button type="button" onClick={() => setShowRfiForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input required value={rfiSubject} onChange={e => setRfiSubject(e.target.value)} placeholder="e.g. Clarify panel location on 2nd floor" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea required rows={3} value={rfiDescription} onChange={e => setRfiDescription(e.target.value)}
                  placeholder="Describe your question..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
              </div>
              <button type="button" onClick={() => setRfiIsChangeOrder(!rfiIsChangeOrder)}
                className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  rfiIsChangeOrder ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-slate-200 text-slate-600 hover:border-purple-300')}>
                <DollarSign className="h-3.5 w-3.5" />{rfiIsChangeOrder ? 'Change Order Included' : 'Include Change Order Request'}
              </button>
              {rfiIsChangeOrder && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5 col-span-2">
                    <Label>Change Order Description</Label>
                    <textarea rows={2} value={rfiCoDescription} onChange={e => setRfiCoDescription(e.target.value)}
                      placeholder="What additional work is required..."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Proposed Amount</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input type="number" step="0.01" value={rfiCoAmount} onChange={e => setRfiCoAmount(e.target.value)} placeholder="0.00" className="pl-7" />
                    </div>
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowRfiForm(false)}>Cancel</Button>
                <Button type="submit" disabled={rfiSubmitting}>{rfiSubmitting ? 'Submitting...' : 'Submit RFI'}</Button>
              </div>
            </form>
          )}

          {rfis.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">No RFIs submitted yet.</p>
            </div>
          ) : rfis.map((rfi: any) => (
            <div key={rfi.id} className={cn('bg-white rounded-xl border overflow-hidden',
              rfi.status === 'open' ? 'border-orange-200' : 'border-slate-200')}>
              <div className="px-5 py-4">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
                      <span className="font-semibold text-slate-900">{rfi.subject}</span>
                      {rfi.is_change_order && <span className="text-xs bg-purple-50 border border-purple-200 text-purple-700 rounded-full px-2 py-0.5">Change Order{rfi.change_order_amount ? ` · $${Number(rfi.change_order_amount).toLocaleString()}` : ''}</span>}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{rfi.description}</p>
                  </div>
                  <span className={cn('shrink-0 text-xs font-medium rounded-full border px-2 py-0.5',
                    rfi.status === 'open' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700')}>
                    {rfi.status}
                  </span>
                </div>
                {rfi.response && (
                  <div className="mt-3 rounded-lg bg-green-50 border border-green-100 px-3 py-2.5">
                    <p className="text-xs font-semibold text-green-500 mb-1">GC Response</p>
                    <p className="text-sm text-green-800">{rfi.response}</p>
                    <p className="text-xs text-green-400 mt-1">— {rfi.responded_by_name}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inspections tab */}
      {activeTab === 'inspections' && (
        <div className="space-y-2">
          {inspections.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">No inspections listed yet.</p>
            </div>
          ) : inspections.map((insp: any) => (
            <div key={insp.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {insp.status === 'passed' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                   insp.status === 'failed' ? <XCircle className="h-5 w-5 text-red-400" /> :
                   insp.status === 'scheduled' ? <Calendar className="h-5 w-5 text-blue-400" /> :
                   <Clock className="h-5 w-5 text-slate-300" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-800">{insp.inspection_type}</span>
                    {insp.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{insp.trade}</span>}
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[insp.status] ?? STATUS_COLORS.not_scheduled)}>
                      {insp.status.replace(/_/g, ' ')}
                    </span>
                    {insp.ready_marked_by && <span className="text-xs text-green-600 font-medium">Ready ✓</span>}
                  </div>
                  {insp.scheduled_date && <p className="text-xs text-slate-400 mt-0.5">Scheduled: {new Date(insp.scheduled_date).toLocaleDateString()}</p>}
                  {insp.scheduling_phone && (
                    <a href={`tel:${insp.scheduling_phone}`} className="flex items-center gap-1 text-xs text-orange-600 hover:underline mt-1 font-medium">
                      <Phone className="h-3 w-3" />Call to schedule: {insp.scheduling_phone}
                    </a>
                  )}
                  {insp.inspector_name && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inspector: {insp.inspector_name}
                      {insp.inspector_phone && ` · `}
                      {insp.inspector_phone && (
                        <a href={`tel:${insp.inspector_phone}`} className="text-orange-500 hover:underline">{insp.inspector_phone}</a>
                      )}
                    </p>
                  )}
                </div>
                {insp.status === 'scheduled' && !insp.ready_marked_by && (
                  <Button size="sm" variant="outline" onClick={() => markInspectionReady(insp.id)} className="shrink-0">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Ready
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoices tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-2">
          {invoices.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">No invoices yet.</p>
            </div>
          ) : invoices.map((inv: any) => (
            <div key={inv.id} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{inv.invoice_number}</span>
                    <span className="font-semibold text-slate-900">${Number(inv.amount).toLocaleString()}</span>
                    <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[inv.status] ?? STATUS_COLORS.pending_approval)}>
                      {inv.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {inv.description && <p className="text-xs text-slate-400 mt-0.5">{inv.description}</p>}
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    {inv.due_date && <span>Due {new Date(inv.due_date).toLocaleDateString()}</span>}
                    {inv.approved_at && <span>Approved {new Date(inv.approved_at).toLocaleDateString()}</span>}
                  </div>
                </div>
                {(inv.status === 'approved' || inv.status === 'sent') && (
                  <Link href={`/projects/${params.projectId}/invoices/${inv.id}/print`} target="_blank">
                    <Button size="sm" variant="outline">View Invoice</Button>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
