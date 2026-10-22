'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, ChevronDown, ChevronUp, ClipboardList,
  CheckCircle2, XCircle, Clock, Trash2, Link2, Share2, MessageSquare, EyeOff, AlertTriangle, Loader2,
} from 'lucide-react'
import { ClientThreadDialog } from '@/components/client-thread/client-thread-dialog'
import { threadShape } from '@/lib/client-thread'
import { responseLine } from '@/lib/change-order-client'
import { useNotice } from '@/components/ui/notice'
import { readPrefill } from '@/lib/change-order-prefill'

import { formatDate } from '@/lib/dates'
import { useDeleteGuard } from '@/components/ui/delete-guard'
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
  applied_to_contract?: boolean
  created_at: string
  /** On the client's link since - written only by Share. */
  client_shared_at?: string | null
  /** The client's answer: a record beside the decision, never the decision. */
  client_response?: 'approved' | 'declined' | null
  client_response_at?: string | null
  client_response_name?: string | null
  client_response_note?: string | null
  /** The address they were signed in as when they answered - their approval needs a login. */
  client_response_email?: string | null
  /** The client's thread on it, shape only - who spoke last. */
  client_messages?: { side: string; created_at: string }[]
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
  pending:  { label: 'Pending',  pillClass: 'bg-warn-tint border-warn/30 text-warn',  icon: Clock },
  approved: { label: 'Approved', pillClass: 'bg-success-tint border-success/30 text-success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', pillClass: 'bg-danger-tint border-danger/30 text-danger',       icon: XCircle },
}

export default function ChangeOrdersPage({ params }: { params: { id: string } }) {
  // useSearchParams needs a Suspense boundary at the route level - same shape
  // as app/(dashboard)/help/page.tsx, which hit this first.
  const guardDelete = useDeleteGuard()
  return <Suspense fallback={null}><ChangeOrdersPageInner params={params} /></Suspense>
}

function ChangeOrdersPageInner({ params }: { params: { id: string } }) {
  const guardDelete = useDeleteGuard()
  const supabase = createClient()
  const searchParams = useSearchParams()

  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [subs, setSubs] = useState<Subcontract[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({})
  // Sharing with the client is a deliberate step with its own dialog: the
  // amount on a sub-linked change order is the SUB's price, our cost.
  const [shareFor, setShareFor] = useState<ChangeOrder | null>(null)
  const [sharing, setSharing] = useState(false)
  const [threadFor, setThreadFor] = useState<ChangeOrder | null>(null)
  const notify = useNotice()

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(REASONS[0])
  const [requestedByType, setRequestedByType] = useState<'gc' | 'sub'>('gc')
  const [subcontractId, setSubcontractId] = useState('')
  // The budget line this change order raises. Carried through the form rather
  // than only on the link, because it is the field that decides whether
  // approving this actually clears the overbilled line or quietly lands on a
  // catch-all row instead.
  const [budgetLineId, setBudgetLineId] = useState<string | null>(null)
  const [budgetLineName, setBudgetLineName] = useState<string | null>(null)

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
    setBudgetLineId(null); setBudgetLineName(null)
  }

  // Arrived from "Raise it with a change order first" on a pay application.
  // Open the form with it filled in, rather than dropping somebody on a list
  // and making them work the same number out a second time.
  useEffect(() => {
    const pre = readPrefill(searchParams)
    if (!pre) return
    setTitle(pre.title)
    setDescription(pre.description)
    setAmount(String(pre.amount))
    // The link's reason only counts if it is one this form offers - otherwise
    // the select would sit on a value that is not in its own list.
    setReason(REASONS.includes(pre.reason) ? pre.reason : REASONS[0])
    setBudgetLineId(pre.budgetLineItemId)
    if (pre.subcontractId) { setRequestedByType('sub'); setSubcontractId(pre.subcontractId) }
    setShowForm(true)
  }, [searchParams])

  // The line's name, for the chip. Fetched rather than passed on the URL: a
  // name in a query string is a copy that can be stale or edited, and this one
  // has to match what the budget actually calls the line.
  useEffect(() => {
    if (!budgetLineId) { setBudgetLineName(null); return }
    let cancelled = false
    ;(async () => {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/budget`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok || cancelled) return
      const d = await res.json()
      const line = (d.lines ?? []).find((l: any) => l.id === budgetLineId)
      if (!cancelled) setBudgetLineName(line ? (line.description || line.cost_code || 'a budget line') : null)
    })()
    return () => { cancelled = true }
  }, [budgetLineId, params.id])

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
        budget_line_item_id: budgetLineId,
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

  async function share(co: ChangeOrder, email: boolean) {
    setSharing(true)
    try {
      const res = await fetch(`/api/projects/${params.id}/change-orders/${co.id}/share`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({ email }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { notify(d.error ?? 'Could not share it.'); return }
      setShareFor(null)
      const e = d.emailed
      const ok = !email || !!e?.sent
      notify(!email ? 'On the client\'s link now.'
        : e?.sent ? `On the client's link, and emailed to ${e.to}.`
        : e?.reason === 'no_email' ? 'On the client\'s link - but there is no email address on this client, so nobody was emailed.'
        : `On the client's link, but the email to ${e?.to} did not go.`, { tone: ok ? 'success' : 'info' })
      fetchData()
    } finally { setSharing(false) }
  }

  async function unshare(co: ChangeOrder) {
    const res = await fetch(`/api/projects/${params.id}/change-orders/${co.id}/share`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${await getToken()}` },
    })
    if (!res.ok) notify((await res.json().catch(() => ({}))).error ?? 'Could not take it off the client link.')
    fetchData()
  }

  function handleDelete(co: ChangeOrder) {
    guardDelete(async () => {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}/change-orders/${co.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchData()
    }, { label: `change order "${co.title}"`, protected: true })
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
    const amountColor = co.amount >= 0 ? 'text-success' : 'text-danger'
    const localNotes = reviewNotes[co.id] ?? co.review_notes ?? ''

    return (
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <button
          className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : co.id)}
        >
          <StatusIcon className={cn('h-5 w-5 shrink-0',
            co.status === 'approved' ? 'text-success' :
            co.status === 'rejected' ? 'text-danger' : 'text-amber-400'
          )} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{co.title}</span>
              <span className={cn('whitespace-nowrap text-xs font-medium rounded-full border px-2 py-0.5', cfg.pillClass)}>
                {cfg.label}
              </span>
              <span className={cn('text-sm font-semibold', amountColor)}>{fmt(co.amount)}</span>
              {co.requested_by_type === 'sub' && (
                <span className="whitespace-nowrap text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">Sub</span>
              )}
              {co.requested_by_type === 'gc' && (
                <span className="whitespace-nowrap text-xs bg-accent-tint text-accent-fg rounded-full px-2 py-0.5">GC</span>
              )}
              {co.client_response ? (
                <span className={cn('whitespace-nowrap text-xs rounded-full px-2 py-0.5',
                  co.client_response === 'approved' ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger')}>
                  Client {co.client_response}
                </span>
              ) : co.client_shared_at ? (
                <span className="whitespace-nowrap text-xs bg-info-tint text-info rounded-full px-2 py-0.5">With client</span>
              ) : null}
              {threadShape(co.client_messages).waitingOnGc && (
                <span className="whitespace-nowrap text-xs font-semibold text-warn">Client asked a question</span>
              )}
            </div>
            <p className="text-xs text-faint mt-0.5">
              {co.reason && `${co.reason} · `}
              {formatDate(co.created_at)}
              {co.subcontract_id && ` · ${getSubName(co.subcontract_id)}`}
            </p>
            {co.applied_to_contract && co.subcontract_id && (
              <p className="text-[11px] text-success mt-0.5 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> Added to {getSubName(co.subcontract_id)}'s contract
              </p>
            )}
          </div>
          {isExpanded
            ? <ChevronUp className="h-4 w-4 text-faint shrink-0" />
            : <ChevronDown className="h-4 w-4 text-faint shrink-0" />
          }
        </button>

        {isExpanded && (
          <div className="border-t border-line-soft px-5 py-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-faint">Amount</p>
                <p className={cn('font-semibold text-base', amountColor)}>{fmt(co.amount)}</p>
              </div>
              <div>
                <p className="text-xs text-faint">Status</p>
                <span className={cn('whitespace-nowrap inline-block text-xs font-medium rounded-full border px-2 py-0.5 mt-0.5', cfg.pillClass)}>
                  {cfg.label}
                </span>
              </div>
              {co.reason && (
                <div>
                  <p className="text-xs text-faint">Reason</p>
                  <p className="font-medium text-ink-soft">{co.reason}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-faint">Requested By</p>
                <p className="font-medium text-ink-soft">{co.requested_by_type === 'gc' ? 'General Contractor' : 'Subcontractor'}</p>
              </div>
              {co.subcontract_id && (
                <div>
                  <p className="text-xs text-faint">Subcontract</p>
                  <p className="font-medium text-ink-soft">{getSubName(co.subcontract_id)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-faint">Created</p>
                <p className="font-medium text-ink-soft">{formatDate(co.created_at)}</p>
              </div>
            </div>

            {co.description && (
              <div>
                <p className="text-xs text-faint mb-1">Description</p>
                <p className="text-sm text-muted-fg whitespace-pre-wrap break-words">{co.description}</p>
              </div>
            )}

            {/* THE CLIENT'S SIDE. Shared on purpose or not at all; the client's
                answer sits here as a record for the Approve button below, which
                stays yours - approving moves money. */}
            <div className="rounded-lg border border-line-soft bg-surface/50 px-3 py-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Client</p>
              {co.client_shared_at ? (
                <>
                  <p className="text-sm text-ink-soft">On the client&apos;s link since {formatDate(co.client_shared_at)}.</p>
                  {co.client_response ? (
                    <p className={cn('text-sm font-semibold', co.client_response === 'approved' ? 'text-success' : 'text-danger')}>
                      {responseLine(co as any, co.client_response_at ? formatDate(co.client_response_at) : null)}
                      {co.client_response_email && (
                        <span className="block text-xs font-normal text-muted-fg">Signed in as {co.client_response_email}.</span>
                      )}
                      {co.client_response === 'approved' && co.status === 'pending' && (
                        <span className="block text-xs font-normal text-muted-fg">It is tied to a subcontract, so approve it below to add it to the contract - their yes does not do that on its own.</span>
                      )}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-fg">No answer from the client yet.</p>
                  )}
                  {co.client_response_note && <p className="text-sm text-muted-fg italic">&ldquo;{co.client_response_note}&rdquo;</p>}
                  <div className="row-even lg:flex lg:flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setThreadFor(co)}>
                      <MessageSquare className="h-3.5 w-3.5" /> Client questions{threadShape(co.client_messages).count ? ` (${threadShape(co.client_messages).count})` : ''}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => unshare(co)}>
                      <EyeOff className="h-3.5 w-3.5" /> Take off client link
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-fg">Not on the client&apos;s link. Share it to let them read it, approve or decline it, and ask about it.</p>
                  {/* ONE PRESS where nothing needs checking: a change order with no
                      subcontract is the client's price, so Share puts it on their link and
                      emails them, and the notice says who it went to. One tied to a
                      subcontract still opens the dialog - its amount is probably the SUB's
                      price, our cost, and that warning is the step worth having. */}
                  {co.subcontract_id ? (
                    <Button size="sm" variant="outline" onClick={() => setShareFor(co)}>
                      <Share2 className="h-3.5 w-3.5" /> Share with client
                    </Button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button size="sm" disabled={sharing} onClick={() => share(co, true)}>
                        {sharing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Share2 className="h-3.5 w-3.5" />} Share and email the client
                      </Button>
                      <button type="button" disabled={sharing} onClick={() => share(co, false)}
                        className="text-xs font-medium text-muted-fg underline hover:text-ink disabled:opacity-50">
                        Share without emailing
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="lg:text-xs text-faint">Review Notes</Label>
              <textarea
                rows={2}
                value={localNotes}
                onChange={e => setReviewNotes(prev => ({ ...prev, [co.id]: e.target.value }))}
                placeholder="Add review notes..."
                className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
              />
              {(reviewNotes[co.id] !== undefined && reviewNotes[co.id] !== (co.review_notes ?? '')) && (
                <button
                  type="button"
                  onClick={() => saveNotes(co)}
                  className="text-xs text-accent-fg hover:underline"
                >
                  Save notes
                </button>
              )}
            </div>

            <div className="row-even lg:flex items-center gap-2 lg:flex-wrap">
              {co.status !== 'approved' && (
                <Button size="sm" onClick={() => updateStatus(co, 'approved')}
                  className="bg-success-solid hover:bg-green-700 text-white">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </Button>
              )}
              {co.status !== 'rejected' && (
                <Button size="sm" variant="outline"
                  className="border-danger/30 text-danger hover:bg-danger-tint"
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
                className="ml-auto text-faint hover:text-danger transition-colors p-1 rounded"
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
        <p className="text-xs font-semibold text-faint uppercase tracking-wide">
          {label} ({items.length})
        </p>
        {items.map(co => <COCard key={co.id} co={co} />)}
      </div>
    )
  }

  return (
    <div className="p-0 lg:p-6 space-y-5">
      {/* Modal */}
      {showForm && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">New Change Order</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                {/* WHAT THIS RAISES, SAID OUT LOUD.
                    The budget line arrives on the link and decides whether
                    approving this clears the overbilled line or lands on a
                    catch-all "Approved change orders" row instead. Hidden,
                    it is how somebody approves a change order believing it
                    does something it does not - so it is on the form, and it
                    can be taken off. */}
                {budgetLineId && (
                  <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-tint/40 px-3 py-2.5">
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-fg" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink-soft">
                        Raises {budgetLineName ?? 'a budget line'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-fg">
                        Once approved, this amount is added to that line&apos;s budget and its
                        scheduled value on pay applications.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBudgetLineId(null)}
                      className="shrink-0 text-xs font-medium text-muted-fg hover:text-ink"
                    >
                      Remove
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Title <span className="text-danger">*</span></Label>
                  <Input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Added electrical outlets in kitchen"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Description <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe the change in detail..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Amount ($)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint text-sm">$</span>
                      <Input
                        type="number"
                        step="0.01"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        className="pl-7"
                      />
                    </div>
                    <p className="text-xs text-faint">Use negative for deductions</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Reason</Label>
                    <SearchableSelect
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none"
                    >
                      {REASONS.map(r => <option key={r}>{r}</option>)}
                    </SearchableSelect>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Requested By</Label>
                    <div className="flex rounded-md border border-muted2 overflow-hidden">
                      {(['gc', 'sub'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setRequestedByType(type)}
                          className={cn(
                            'flex-1 py-2 text-sm font-medium transition-colors',
                            requestedByType === type
                              ? 'bg-accent text-accent-ink'
                              : 'bg-panel text-muted-fg hover:bg-surface'
                          )}
                        >
                          {type === 'gc' ? 'GC' : 'Sub'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Subcontract <span className="text-faint font-normal">(optional)</span></Label>
                    <SearchableSelect
                      value={subcontractId}
                      onChange={e => setSubcontractId(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none"
                    >
                      <option value="">None</option>
                      {subs.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.companies?.name ?? s.scope_of_work ?? s.id}
                        </option>
                      ))}
                    </SearchableSelect>
                    <p className="text-xs text-faint">Linked & approved adds the amount to that sub's contract.</p>
                  </div>
                </div>
              </div>

              <div className="row-even px-4 sm:px-6 py-4 border-t border-line-soft lg:flex lg:flex-wrap gap-2 justify-end">
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
          <h1 className="text-2xl font-bold text-ink">Change Orders</h1>
          <p className="text-sm text-muted-fg mt-0.5">Track scope changes, cost adjustments, and approvals.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Change Order
        </Button>
      </div>

      {/* Stat bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs text-faint uppercase tracking-wide font-medium">Pending</p>
          <p className="text-2xl font-bold text-warn mt-1">{totalPending}</p>
          <p className="text-xs text-faint">awaiting review</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs text-faint uppercase tracking-wide font-medium">Approved Value</p>
          <p className={cn('text-2xl font-bold mt-1', approvedValue >= 0 ? 'text-success' : 'text-danger')}>
            {fmt(approvedValue)}
          </p>
          <p className="text-xs text-faint">running total</p>
        </div>
        <div className="rounded-xl border border-line bg-panel p-4">
          <p className="text-xs text-faint uppercase tracking-wide font-medium">Rejected</p>
          <p className="text-2xl font-bold text-danger mt-1">{totalRejected}</p>
          <p className="text-xs text-faint">not approved</p>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : changeOrders.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <ClipboardList className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No change orders yet</p>
          <p className="text-xs text-faint mt-1">Add change orders to track scope changes and cost impacts.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Group label="Pending" items={pending} />
          <Group label="Approved" items={approved} />
          <Group label="Rejected" items={rejected} />

          {approved.length > 0 && (
            <div className="rounded-xl border border-success/30 bg-success-tint px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-success">Total Approved Change Order Value</p>
                <p className="text-xs text-success mt-0.5">{approved.length} approved change order{approved.length !== 1 ? 's' : ''}</p>
              </div>
              <p className={cn('text-2xl font-bold', approvedValue >= 0 ? 'text-success' : 'text-danger')}>
                {fmt(approvedValue)}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Share with the client: says EXACTLY what they will see, and warns when
          the amount is a sub's price rather than the client's. */}
      {shareFor && (
        <div className="overlay items-center justify-center bg-black/40" data-overlay onClick={() => setShareFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-panel border border-line shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-base font-semibold text-ink">Share with the client</h3>
              <button onClick={() => setShareFor(null)} aria-label="Close" title="Close" className="p-1 rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>
            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm space-y-1">
              <p className="font-semibold text-ink">{shareFor.title}</p>
              <p className="font-semibold text-ink">{fmt(shareFor.amount)}</p>
              {shareFor.reason && <p className="text-muted-fg">{shareFor.reason}</p>}
              {shareFor.description && <p className="text-muted-fg whitespace-pre-wrap">{shareFor.description}</p>}
            </div>
            <p className="text-sm text-muted-fg">
              Your client sees exactly this on their link - the title, the amount, the reason and the description -
              and can approve it, decline it, or ask about it, after signing in with a code we email to the address on
              their customer record. Your review notes and the subcontract stay yours.
            </p>
            <p className="text-sm text-ink-soft">
              {shareFor.subcontract_id
                ? 'Because it is tied to a subcontract, their approval is a record - you still approve it here to add it to the contract.'
                : 'Their approval approves it: it is added to the contract the moment they press Approve.'}
            </p>
            {shareFor.subcontract_id && (
              <p className="flex gap-2 rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>This change order is tied to {getSubName(shareFor.subcontract_id)}&apos;s subcontract, so {fmt(shareFor.amount)} is probably what they charge you. If the client&apos;s price includes your markup, raise a separate change order at that price to share instead.</span>
              </p>
            )}
            <div className="row-even lg:flex lg:flex-wrap gap-2">
              <Button disabled={sharing} onClick={() => share(shareFor, true)}>
                <Share2 className="h-4 w-4" /> Share and email them
              </Button>
              <Button variant="outline" disabled={sharing} onClick={() => share(shareFor, false)}>
                Share without emailing
              </Button>
            </div>
          </div>
        </div>
      )}

      {threadFor && (
        <ClientThreadDialog projectId={params.id} subject="change_order" subjectId={threadFor.id} clientName={null}
          heading={`${threadFor.title} - questions from the client`}
          onClose={() => setThreadFor(null)} onChanged={fetchData} />
      )}
    </div>
  )
}
