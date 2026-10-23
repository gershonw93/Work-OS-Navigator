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
  Plus, X, ChevronRight, ClipboardList,
  CheckCircle2, XCircle, Clock, Trash2, Link2, Share2, MessageSquare, EyeOff, AlertTriangle, Loader2, DollarSign, Users,
} from 'lucide-react'
import {
  BackLink, DetailRows, DetailSection, Pill, PhoneActionBar, StatTile, StepTrack, type PillTone,
} from '@/components/bills/detail-parts'
import { changeOrderSteps } from '@/lib/bill-view'
import { useOpenRecord } from '@/lib/use-open-record'
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

const STATUS_CONFIG: Record<string, { label: string; tone: PillTone; icon: any }> = {
  pending:  { label: 'Pending',  tone: 'warn',    icon: Clock },
  approved: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'danger',  icon: XCircle },
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
  // The change order open as a screen of its own - in the URL, so Back and
  // a refresh both land where they should. It used to unfold in the list.
  const { id: openId, open: openCO, close: closeCO } = useOpenRecord()
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
      if (openId === co.id) closeCO()
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

  const withClient = changeOrders.filter(c => c.client_shared_at && !c.client_response && c.status === 'pending')
  const pendingValue = pending.reduce((sum, c) => sum + c.amount, 0)
  const shown = openId ? changeOrders.find(c => c.id === openId) ?? null : null

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

      {shown ? (
        <CODetail
          co={shown}
          subName={getSubName(shown.subcontract_id)}
          notes={reviewNotes[shown.id] ?? shown.review_notes ?? ''}
          notesDirty={reviewNotes[shown.id] !== undefined && reviewNotes[shown.id] !== (shown.review_notes ?? '')}
          onNotes={v => setReviewNotes(prev => ({ ...prev, [shown.id]: v }))}
          onSaveNotes={() => saveNotes(shown)}
          onStatus={next => updateStatus(shown, next)}
          setShareFor={setShareFor}
          share={share}
          sharing={sharing}
          onUnshare={() => unshare(shown)}
          onThread={() => setThreadFor(shown)}
          onDelete={() => handleDelete(shown)}
          onBack={closeCO}
        />
      ) : (
      <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">Change Orders</h1>
          <p className="text-sm text-muted-fg mt-0.5">Track scope changes, cost adjustments, and approvals.</p>
        </div>
        <Button size="lg" className="h-11 rounded-[10px] px-5" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" /> New Change Order
        </Button>
      </div>

      {/* THE FOUR FIGURES, the same tile as the money pages. Approved value
          is the one people quote; the green "Total Approved" card that used to
          sit under the list said it a second time. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatTile label="Pending" value={String(totalPending)} icon={Clock} tone="warn"
          note={totalPending ? `${fmt(pendingValue)} awaiting your decision` : 'Nothing waiting on you'} />
        <StatTile label="Approved value" value={fmt(approvedValue)} icon={DollarSign} tone="success"
          alarm={approvedValue < 0 ? 'danger' : undefined}
          note={`${approved.length} approved change order${approved.length !== 1 ? 's' : ''}`} />
        <StatTile label="With the client" value={String(withClient.length)} icon={Users} tone="info"
          note={withClient.length ? 'On their link, no answer yet' : 'Nothing waiting on the client'} />
        <StatTile label="Rejected" value={String(totalRejected)} icon={XCircle} tone="danger"
          note="Not going ahead" />
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : changeOrders.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line py-16 text-center">
          <ClipboardList className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No change orders yet</p>
          <p className="text-xs text-faint mt-1">Add change orders to track scope changes and cost impacts.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {([['Pending', pending], ['Approved', approved], ['Rejected', rejected]] as const).map(([label, items]) => items.length > 0 && (
            <div key={label} className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">{label} ({items.length})</p>
              {/* ONE card of divided rows - the same list as Bills from subs. */}
              <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel">
                {items.map(co => <CORow key={co.id} co={co} subName={getSubName(co.subcontract_id)} onOpen={() => openCO(co.id)} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      </>
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

/**
 * One change order in the list. Opens it as a screen of its own.
 */
function CORow({ co, subName, onOpen }: { co: ChangeOrder; subName: string | null; onOpen: () => void }) {
  const cfg = STATUS_CONFIG[co.status] ?? STATUS_CONFIG.pending
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface lg:gap-4 lg:px-6 lg:py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-[15px] font-semibold text-ink">{co.title}</span>
          <Pill tone={cfg.tone}>{cfg.label}</Pill>
          {co.client_response ? (
            <Pill tone={co.client_response === 'approved' ? 'success' : 'danger'}>Client {co.client_response}</Pill>
          ) : co.client_shared_at ? (
            <Pill tone="info">With client</Pill>
          ) : null}
          {threadShape(co.client_messages).waitingOnGc && (
            <span className="whitespace-nowrap text-xs font-semibold text-warn">Client asked a question</span>
          )}
        </div>
        <p className="mt-0.5 break-words text-xs text-muted-fg">
          {co.requested_by_type === 'sub' ? 'Raised by the sub' : 'Raised by you'}
          {co.reason && ` · ${co.reason}`}
          {` · ${formatDate(co.created_at)}`}
          {subName && ` · ${subName}`}
        </p>
        {co.applied_to_contract && subName && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="h-3 w-3" /> Added to {subName}&apos;s contract
          </p>
        )}
      </div>
      <div className={cn('shrink-0 text-[15px] font-bold tabular-nums', co.amount < 0 ? 'text-danger' : 'text-ink')}>{fmt(co.amount)}</div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </button>
  )
}

interface CODetailProps {
  co: ChangeOrder
  subName: string | null
  notes: string
  notesDirty: boolean
  onNotes: (v: string) => void
  onSaveNotes: () => void
  onStatus: (next: 'approved' | 'rejected' | 'pending') => void
  setShareFor: (co: ChangeOrder) => void
  share: (co: ChangeOrder, email: boolean) => void
  sharing: boolean
  onUnshare: () => void
  onThread: () => void
  onDelete: () => void
  onBack: () => void
}

/**
 * One change order, as a screen of its own - the same shape as a sub's bill:
 * the title and the amount at the top, the steps it has been through, ONE
 * primary action, and the client's side, the notes and the details in cards.
 * Approving stays the GC's: it raises the contract and what the client is
 * billed, so the client's own answer is shown beside it as a record.
 */
function CODetail({
  co, subName, notes, notesDirty, onNotes, onSaveNotes, onStatus,
  setShareFor, share, sharing, onUnshare, onThread, onDelete, onBack,
}: CODetailProps) {
  const cfg = STATUS_CONFIG[co.status] ?? STATUS_CONFIG.pending
  const thread = threadShape(co.client_messages)
  const primary = co.status !== 'approved'
    ? { label: 'Approve', icon: CheckCircle2, next: 'approved' as const }
    : null
  return (
    <div className="flex flex-col gap-4 lg:gap-5">
      <BackLink label="Change Orders" onClick={onBack} />

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 lg:gap-6 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:justify-between lg:gap-6">
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={cfg.tone}>{cfg.label}</Pill>
              {co.reason && <span className="text-[13px] text-muted-fg">{co.reason}</span>}
              <span className="text-faint" aria-hidden="true">·</span>
              <span className="text-[13px] text-muted-fg">{co.requested_by_type === 'sub' ? 'Raised by the sub' : 'Raised by you'}</span>
            </div>
            <h1 className="break-words text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">{co.title}</h1>
            {subName && <div className="text-[13px] text-muted-fg">On {subName}&apos;s subcontract</div>}
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-line-soft pt-3.5 lg:flex-col lg:items-end lg:gap-1 lg:border-0 lg:pt-0">
            <div className="lg:text-right">
              <div className="text-xs font-medium text-muted-fg lg:text-[13px]">{co.amount < 0 ? 'Deduction' : 'Change to the contract'}</div>
              <div className={cn('text-[32px] font-bold leading-tight tracking-tight tabular-nums lg:text-4xl lg:leading-none',
                co.amount < 0 ? 'text-danger' : 'text-ink')}>{fmt(co.amount)}</div>
            </div>
            <div className="text-right text-xs text-muted-fg lg:text-sm">Raised {formatDate(co.created_at)}</div>
          </div>
        </div>

        <div className="hidden flex-wrap items-center gap-2.5 lg:flex">
          {primary && (
            <Button size="lg" onClick={() => onStatus(primary.next)} className="h-11 rounded-[10px] px-5">
              <primary.icon className="h-4 w-4" /> {primary.label}
            </Button>
          )}
          {co.status !== 'rejected' && (
            <Button size="lg" variant="outline" onClick={() => onStatus('rejected')}
              className="h-11 rounded-[10px] px-4 border-danger/30 text-danger hover:bg-danger-tint">
              <XCircle className="h-4 w-4" /> Reject
            </Button>
          )}
          {co.status !== 'pending' && (
            <Button size="lg" variant="outline" onClick={() => onStatus('pending')} className="h-11 rounded-[10px] px-4">
              <Clock className="h-4 w-4" /> Reset to Pending
            </Button>
          )}
          {subName && co.status === 'pending' && (
            <span className="min-w-[220px] flex-1 text-[13px] text-muted-fg">Approving adds {fmt(co.amount)} to {subName}&apos;s contract.</span>
          )}
          <button type="button" onClick={onDelete} aria-label="Delete change order" title="Delete change order"
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-danger hover:bg-danger-tint">
            <Trash2 className="h-[19px] w-[19px]" />
          </button>
        </div>

        {thread.waitingOnGc && (
          <button type="button" onClick={onThread}
            className="flex min-h-11 items-center gap-2 self-start rounded-lg bg-warn-tint px-3 text-sm font-semibold text-warn hover:underline">
            <MessageSquare className="h-4 w-4" /> The client asked a question - reply
          </button>
        )}

        <div className="lg:border-t lg:border-line-soft lg:pt-4">
          <StepTrack steps={changeOrderSteps(co)} />
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1 lg:gap-5">
          {co.description && (
            <DetailSection title="What changed">
              <p className="whitespace-pre-wrap break-words text-sm text-ink-soft">{co.description}</p>
            </DetailSection>
          )}

          {/* THE CLIENT'S SIDE. Shared on purpose or not at all; the client's
              answer sits here as a record beside the Approve button, which
              stays yours - approving moves money. */}
          <DetailSection title="The client" aside={
            co.client_response
              ? <Pill tone={co.client_response === 'approved' ? 'success' : 'danger'}>Client {co.client_response}</Pill>
              : co.client_shared_at ? <Pill tone="info">On their link</Pill> : <Pill tone="muted">Not shared</Pill>
          }>
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
                      <span className="block text-xs font-normal text-muted-fg">It is tied to a subcontract, so approve it yourself to add it to the contract - their yes does not do that on its own.</span>
                    )}
                  </p>
                ) : (
                  <p className="text-sm text-muted-fg">No answer from the client yet.</p>
                )}
                {co.client_response_note && <p className="text-sm italic text-muted-fg">&ldquo;{co.client_response_note}&rdquo;</p>}
                <div className="row-even lg:flex lg:flex-wrap gap-2">
                  <Button variant="outline" className="h-11 rounded-[10px] lg:h-9" onClick={onThread}>
                    <MessageSquare className="h-4 w-4 shrink-0" /> Client questions{thread.count ? ` (${thread.count})` : ''}
                  </Button>
                  <Button variant="outline" className="h-11 rounded-[10px] lg:h-9" onClick={onUnshare}>
                    <EyeOff className="h-4 w-4 shrink-0" /> Take off client link
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
                      className="min-h-11 text-xs font-medium text-muted-fg underline hover:text-ink disabled:opacity-50 lg:min-h-0">
                      Share without emailing
                    </button>
                  </div>
                )}
              </>
            )}
          </DetailSection>

          <DetailSection title="Review notes">
            <textarea
              rows={3}
              value={notes}
              onChange={e => onNotes(e.target.value)}
              aria-label="Review notes"
              placeholder="Anything worth remembering about this decision - only your team sees it."
              className="w-full resize-none rounded-[10px] border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
            />
            {notesDirty && (
              <Button variant="outline" onClick={onSaveNotes} className="h-11 self-start rounded-[10px] lg:h-9">Save notes</Button>
            )}
          </DetailSection>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:w-[340px] lg:shrink-0 lg:gap-5">
          <DetailSection title="Details">
            <DetailRows rows={[
              { label: 'Amount', value: fmt(co.amount) },
              { label: 'Status', value: cfg.label },
              ...(co.reason ? [{ label: 'Reason', value: co.reason }] : []),
              { label: 'Requested by', value: co.requested_by_type === 'gc' ? 'General Contractor' : 'Subcontractor' },
              ...(subName ? [{ label: 'Subcontract', value: subName }] : []),
              ...(co.applied_to_contract && subName ? [{ label: 'Contract', value: 'Added to it' }] : []),
              { label: 'Created', value: formatDate(co.created_at) },
            ]} />
          </DetailSection>
          {/* Phone: the secondary actions, as words, under everything. */}
          <div className="flex flex-wrap justify-center gap-2 lg:hidden">
            {co.status !== 'rejected' && (
              <button type="button" onClick={() => onStatus('rejected')} className="min-h-11 px-3.5 text-sm font-medium text-danger">Reject</button>
            )}
            {co.status !== 'pending' && (
              <button type="button" onClick={() => onStatus('pending')} className="min-h-11 px-3.5 text-sm font-medium text-ink-soft">Reset to Pending</button>
            )}
            <button type="button" onClick={onDelete} className="min-h-11 px-3.5 text-sm font-medium text-danger">Delete</button>
          </div>
        </div>
      </div>

      {primary && (
        <PhoneActionBar>
          <button type="button" onClick={() => onStatus(primary.next)}
            className="inline-flex h-[52px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-accent text-base font-semibold text-accent-ink">
            <primary.icon className="h-5 w-5" /> {primary.label} · {fmt(co.amount)}
          </button>
        </PhoneActionBar>
      )}
    </div>
  )
}
