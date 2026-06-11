'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, ChevronDown, ChevronUp, ClipboardList,
  CheckCircle2, XCircle, Clock, Trash2,
} from 'lucide-react'

const REASONS = [
  'Scope Addition',
  'Scope Reduction',
  'Owner Request',
  'Unforeseen Condition',
  'Design Change',
  'Other',
]

interface ChangeOrder {
  id: string
  project_id: string
  subcontract_id: string | null
  title: string
  description: string | null
  amount: number
  reason: string | null
  status: string
  requested_by_type: string
  review_notes: string | null
  created_at: string
}

interface Subcontract {
  id: string
  companies: { name: string } | null
  scope_of_work: string | null
}

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

const STATUS_CONFIG: Record<string, { label: string; pillClass: string; icon: any }> = {
  pending:  { label: 'Pending',  pillClass: 'bg-amber-50 border-amber-200 text-amber-700',  icon: Clock },
  approved: { label: 'Approved', pillClass: 'bg-green-50 border-green-200 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', pillClass: 'bg-red-50 border-red-200 text-red-600',       icon: XCircle },
}

export default function ChangeOrdersPage({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [subs, setSubs] = useState<Subcontract[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [requestedByType, setRequestedByType] = useState<'gc' | 'sub'>('gc')
  const [subcontractId, setSubcontractId] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    const token = await getToken()
    const headers = { Authorization: `Bearer ${token}` }
    const [coRes, subsRes] = await Promise.all([
      fetch(`/api/projects/${params.id}/change-orders`, { headers }),
      fetch(`/api/projects/${params.id}/subcontracts`, { headers }),
    ])
    if (coRes.ok) {
      const json = await coRes.json()
      setChangeOrders(json.changeOrders ?? [])
    }
    if (subsRes.ok) {
      const json = await subsRes.json()
      setSubs(json.subcontracts ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  function resetForm() {
    setTitle(''); setDescription(''); setAmount(''); setReason(REASONS[0])
    setRequestedByType('gc'); setSubcontractId('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/change-orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title,
        description: description || null,
        amount: parseFloat(amount) || 0,
        reason,
        requested_by_type: requestedByType,
        subcontract_id: subcontractId || null,
      }),
    })
    resetForm()
    setShowForm(false)
    setSubmitting(false)
    fetchData()
  }

  async function updateStatus(co: ChangeOrder, status: string) {
    const token = await getToken()
    const notes = reviewNotes[co.id]
    await fetch(`/api/projects/${params.id}/change-orders/${co.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, review_notes: notes ?? co.review_notes }),
    })
    fetchData()
  }

  async function saveNotes(co: ChangeOrder) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/change-orders/${co.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ review_notes: reviewNotes[co.id] ?? co.review_notes }),
    })
    fetchData()
  }

  async function handleDelete(co: ChangeOrder) {
    if (!confirm(`Delete change order "${co.title}"?`)) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/change-orders/${co.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  // Stats
  const totalPending = changeOrders.filter(c => c.status === 'pending').length
  const approvedValue = changeOrders.filter(c => c.status === 'approved').reduce((sum, c) => sum + c.amount, 0)
  const totalRejected = changeOrders.filter(c => c.status === 'rejected').length

  // Grouped
  const pending  = changeOrders.filter(c => c.status === 'pending')
  const approved = changeOrders.filter(c => c.status === 'approved')
  const rejected = changeOrders.filter(c => c.status === 'rejected')

  function getSubName(id: string | null) {
    if (!id) return null
    const sub = subs.find(s => s.id === id)
    return sub?.companies?.name ?? sub?.scope_of_work ?? id
  }

  function COCard({ co }: { co: ChangeOrder }) {
    const isExpanded = expanded === co.id
    const cfg = STATUS_CONFIG[co.status] ?? STATUS_CONFIG.pending
    const StatusIcon = cfg.icon
    const amountColor = co.amount >= 0 ? 'text-green-600' : 'text-red-500'
    const localNotes = reviewNotes[co.id] ?? co.review_notes ?? ''

    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : co.id)}
        >
          <StatusIcon className={cn('h-5 w-5 shrink-0',
            co.status === 'approved' ? 'text-green-500' :
            co.status === 'rejected' ? 'text-red-400' : 'text-amber-400'
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">{co.title}</span>
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.pillClass)}>
                {cfg.label}
              </span>
              <span className={cn('text-sm font-semibold', amountColor)}>{fmt(co.amount)}</span>
              {co.requested_by_type === 'sub' && (
                <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">Sub</span>
              )}
              {co.requested_by_type === 'gc' && (
                <span className="text-xs bg-orange-50 text-orange-600 rounded-full px-2 py-0.5">GC</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {co.reason && `${co.reason} · `}
              {new Date(co.created_at).toLocaleDateString()}
              {co.subcontract_id && ` · ${getSubName(co.subcontract_id)}`}
            </p>
          </div>
          {isExpanded
            ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
            : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
          }
        </button>

        {isExpanded && (
          <div className="border-t border-slate-100 px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-slate-400">Amount</p>
                <p className={cn('font-semibold text-base', amountColor)}>{fmt(co.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <span className={cn('inline-block text-xs font-medium rounded-full border px-2 py-0.5 mt-0.5', cfg.pillClass)}>
                  {cfg.label}
                </span>
              </div>
              {co.reason && (
                <div>
                  <p className="text-xs text-slate-400">Reason</p>
                  <p className="font-medium text-slate-700">{co.reason}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Requested By</p>
                <p className="font-medium text-slate-700">{co.requested_by_type === 'gc' ? 'General Contractor' : 'Subcontractor'}</p>
              </div>
              {co.subcontract_id && (
                <div>
                  <p className="text-xs text-slate-400">Subcontract</p>
                  <p className="font-medium text-slate-700">{getSubName(co.subcontract_id)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Created</p>
                <p className="font-medium text-slate-700">{new Date(co.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            {co.description && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Description</p>
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{co.description}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Review Notes</Label>
              <textarea
                rows={2}
                value={localNotes}
                onChange={e => setReviewNotes(prev => ({ ...prev, [co.id]: e.target.value }))}
                placeholder="Add review notes..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
              />
              {(reviewNotes[co.id] !== undefined && reviewNotes[co.id] !== (co.review_notes ?? '')) && (
                <button
                  type="button"
                  onClick={() => saveNotes(co)}
                  className="text-xs text-orange-600 hover:underline"
                >
                  Save notes
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {co.status !== 'approved' && (
                <Button size="sm" onClick={() => updateStatus(co, 'approved')}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </Button>
              )}
              {co.status !== 'rejected' && (
                <Button size="sm" variant="outline"
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  onClick={() => updateStatus(co, 'rejected')}>
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
              )}
              {co.status !== 'pending' && (
                <Button size="sm" variant="outline" onClick={() => updateStatus(co, 'pending')}>
                  <Clock className="h-3.5 w-3.5" /> Reset to Pending
                </Button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(co)}
                className="ml-auto text-slate-400 hover:text-red-500 transition-colors p-1 rounded"
                title="Delete change order"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function Group({ label, items }: { label: string; items: ChangeOrder[] }) {
    if (items.length === 0) return null
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          {label} ({items.length})
        </p>
        {items.map(co => <COCard key={co.id} co={co} />)}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">New Change Order</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Title <span className="text-red-400">*</span></Label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Added electrical outlets in kitchen"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Description <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the change in detail..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Amount ($)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-7"
                      />
                    </div>
                    <p className="text-xs text-slate-400">Use negative for deductions</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Reason</Label>
                    <select
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none"
                    >
                      {REASONS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Requested By</Label>
                    <div className="flex rounded-md border border-slate-300 overflow-hidden">
                      {(['gc', 'sub'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setRequestedByType(type)}
                          className={cn(
                            'flex-1 py-2 text-sm font-medium transition-colors',
                            requestedByType === type
                              ? 'bg-orange-500 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          )}
                        >
                          {type === 'gc' ? 'GC' : 'Sub'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Subcontract <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <select
                      value={subcontractId}
                      onChange={e => setSubcontractId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none"
                    >
                      <option value="">None</option>
                      {subs.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.companies?.name ?? s.scope_of_work ?? s.id}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm() }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || !title.trim()}>
                  {submitting ? 'Creating...' : 'Create Change Order'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Change Orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track scope changes, cost adjustments, and approvals.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Change Order
        </Button>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Pending</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{totalPending}</p>
          <p className="text-xs text-slate-400">awaiting review</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Approved Value</p>
          <p className={cn('text-2xl font-bold mt-1', approvedValue >= 0 ? 'text-green-600' : 'text-red-500')}>
            {fmt(approvedValue)}
          </p>
          <p className="text-xs text-slate-400">running total</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">Rejected</p>
          <p className="text-2xl font-bold text-red-500 mt-1">{totalRejected}</p>
          <p className="text-xs text-slate-400">not approved</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : changeOrders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No change orders yet</p>
          <p className="text-xs text-slate-400 mt-1">Add change orders to track scope changes and cost impacts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Group label="Pending" items={pending} />
          <Group label="Approved" items={approved} />
          <Group label="Rejected" items={rejected} />

          {approved.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-green-800">Total Approved Change Order Value</p>
                <p className="text-xs text-green-600 mt-0.5">{approved.length} approved change order{approved.length !== 1 ? 's' : ''}</p>
              </div>
              <p className={cn('text-2xl font-bold', approvedValue >= 0 ? 'text-green-700' : 'text-red-600')}>
                {fmt(approvedValue)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
