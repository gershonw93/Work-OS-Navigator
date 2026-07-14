'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { X, ChevronDown, ChevronUp, MessageSquare, DollarSign, CheckCircle2, Clock, AlertCircle, Check, XCircle, RefreshCw, Paperclip, Trash2, Pencil, Link2 } from 'lucide-react'

interface RFI {
  id: string; rfi_number: number; submitted_by_name: string; company_name: string | null
  subject: string; description: string; is_change_order: boolean
  change_order_description: string | null; change_order_items: any[] | null; change_order_amount: number | null
  change_order_status: string | null; attachments: any[] | null
  status: string; response: string | null; responded_by_name: string | null
  responded_at: string | null; created_at: string
}

const CO_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pending Review',       color: 'bg-special-tint border-special/30 text-special' },
  approved:           { label: 'Approved',             color: 'bg-success-tint border-success/30 text-success' },
  denied:             { label: 'Denied',               color: 'bg-danger-tint border-danger/30 text-danger' },
  revision_requested: { label: 'Revision Requested',   color: 'bg-warn-tint border-warn/30 text-warn' },
}

export default function RFIsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [rfis, setRfis] = useState<RFI[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRfi, setExpandedRfi] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState<string | null>(null)
  const [respondingTo, setRespondingTo] = useState<RFI | null>(null)
  const [responseText, setResponseText] = useState('')
  const [responseStatus, setResponseStatus] = useState<'answered' | 'closed'>('answered')
  const [coDecision, setCoDecision] = useState<'approved' | 'denied' | 'revision_requested' | null>(null)
  const [responding, setResponding] = useState(false)

  const [editingRfi, setEditingRfi] = useState<RFI | null>(null)
  const [editSubject, setEditSubject] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchRfis() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/rfis`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setRfis((await res.json()).rfis)
    setLoading(false)
  }

  useEffect(() => { fetchRfis() }, [params.id])

  function openEditRfi(rfi: RFI) {
    setEditingRfi(rfi)
    setEditSubject(rfi.subject)
    setEditDescription(rfi.description)
  }

  async function handleEditRfi(e: React.FormEvent) {
    e.preventDefault()
    if (!editingRfi) return
    setEditSubmitting(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/rfis/${editingRfi.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: editSubject, description: editDescription }),
    })
    setEditingRfi(null)
    setEditSubmitting(false)
    fetchRfis()
  }

  async function handleDeleteRfi(rfiId: string) {
    if (!window.confirm('Delete this RFI? This cannot be undone.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/rfis/${rfiId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchRfis()
  }

  // One-time answer link for the architect/designer (like compliance requests).
  async function copyAnswerLink(rfi: RFI) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${params.id}/rfis/${rfi.id}/answer-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({}),
    })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'Could not create the link.'); return }
    const { token } = await res.json()
    const url = `${window.location.origin}/rfi/${token}`
    try { await navigator.clipboard.writeText(url) } catch { window.prompt('Copy the answer link:', url); return }
    setLinkCopied(rfi.id)
    setTimeout(() => setLinkCopied(c => (c === rfi.id ? null : c)), 2500)
  }

  function openRespond(rfi: RFI) {
    setRespondingTo(rfi)
    setResponseText('')
    setCoDecision(rfi.is_change_order ? (rfi.change_order_status as any ?? null) : null)
  }

  async function handleRespond(e: React.FormEvent) {
    e.preventDefault()
    if (!respondingTo) return
    setResponding(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/rfis/${respondingTo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        response: responseText || null,
        status: responseStatus,
        ...(respondingTo.is_change_order && coDecision ? { change_order_status: coDecision } : {}),
      }),
    })
    setRespondingTo(null); setResponseText(''); setResponding(false)
    fetchRfis()
  }

  const open = rfis.filter(r => r.status === 'open')
  const answered = rfis.filter(r => r.status !== 'open')

  function RfiCard({ rfi }: { rfi: RFI }) {
    const coStatus = rfi.change_order_status ?? 'pending'
    const coConfig = CO_STATUS_CONFIG[coStatus] ?? CO_STATUS_CONFIG.pending

    return (
      <div className={cn('rounded-xl border bg-panel p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5',
        rfi.status === 'open' ? 'border-accent/40' : 'border-line')}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-mono text-faint">RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={cn('text-xs font-medium rounded-full border px-1.5 py-0.5',
              rfi.status === 'open' ? 'bg-accent-tint border-accent/40 text-accent-fg' :
              rfi.status === 'closed' ? 'bg-surface border-line text-muted-fg' :
              'bg-success-tint border-success/30 text-success')}>
              {rfi.status}
            </span>
            {rfi.status === 'open' && (
              <button onClick={() => copyAnswerLink(rfi)} className="text-faint hover:text-accent-fg p-0.5"
                title="Copy answer link - send it to the architect/designer, they answer without an account">
                {linkCopied === rfi.id ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5" />}
              </button>
            )}
            <button onClick={() => openEditRfi(rfi)} className="text-faint hover:text-muted-fg p-0.5" title="Edit RFI">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => handleDeleteRfi(rfi.id)} className="text-danger hover:text-danger p-0.5" title="Delete RFI">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <button onClick={() => openRespond(rfi)} className="w-full text-left">
          <p className="text-sm font-semibold text-ink line-clamp-2 leading-snug">{rfi.subject}</p>
          <p className="text-xs text-faint mt-1 truncate">{rfi.company_name ?? rfi.submitted_by_name}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {rfi.is_change_order && (
              <span className={cn('text-xs rounded-full border px-1.5 py-0.5 flex items-center gap-0.5', coConfig.color)}>
                <DollarSign className="h-2.5 w-2.5" />
                {rfi.change_order_amount ? `$${Number(rfi.change_order_amount).toLocaleString()}` : 'CO'} · {coConfig.label}
              </span>
            )}
            {(rfi.attachments?.length ?? 0) > 0 && (
              <span className="text-xs text-faint flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{rfi.attachments?.length}</span>
            )}
          </div>
          <p className="text-xs text-faint mt-2">{new Date(rfi.created_at).toLocaleDateString()}</p>
          {rfi.status === 'open' && (
            <div className="mt-3 pt-2 border-t border-line-soft">
              <span className="text-xs font-medium text-accent-fg">Click to respond →</span>
            </div>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between sticky top-0 bg-panel">
              <div>
                <h2 className="font-semibold text-ink">Respond to RFI-{String(respondingTo.rfi_number).padStart(3, '0')}</h2>
                <p className="text-xs text-muted-fg mt-0.5">{respondingTo.subject}</p>
              </div>
              <button onClick={() => setRespondingTo(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleRespond}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="rounded-lg bg-surface border border-line px-3 py-2.5 text-sm text-muted-fg whitespace-pre-wrap">{respondingTo.description}</div>

                {/* Change order decision */}
                {respondingTo.is_change_order && (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-special-tint border border-special/30 px-3 py-2.5">
                      <p className="text-xs font-semibold text-special mb-1">Change Order: ${Number(respondingTo.change_order_amount ?? 0).toLocaleString()}</p>
                      {respondingTo.change_order_description && <p className="text-xs text-special">{respondingTo.change_order_description}</p>}
                      {respondingTo.change_order_items && respondingTo.change_order_items.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {respondingTo.change_order_items.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs text-special">
                              <span>{item.description} ×{item.qty}</span>
                              <span>${(item.qty * item.unit_price).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <Label className="text-xs">Change Order Decision</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {([
                        { key: 'approved', label: 'Approve', icon: Check, color: 'border-green-400 bg-success-tint text-success' },
                        { key: 'denied', label: 'Deny', icon: XCircle, color: 'border-red-400 bg-danger-tint text-danger' },
                        { key: 'revision_requested', label: 'Request Revision', icon: RefreshCw, color: 'border-amber-400 bg-warn-tint text-warn' },
                      ] as const).map(opt => (
                        <button key={opt.key} type="button" onClick={() => setCoDecision(opt.key)}
                          className={cn('flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-colors',
                            coDecision === opt.key ? opt.color : 'border-line text-muted-fg hover:border-muted2')}>
                          <opt.icon className="h-4 w-4" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Response <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea autoFocus={!respondingTo.is_change_order} rows={4} value={responseText} onChange={e => setResponseText(e.target.value)}
                    placeholder={respondingTo.is_change_order ? 'Add any notes about your decision...' : 'Answer the question...'}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
                </div>

                <div className="flex gap-2">
                  {(['answered', 'closed'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setResponseStatus(s)}
                      className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        responseStatus === s ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                      {s === 'answered' ? 'Answered' : 'Answered & Closed'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setRespondingTo(null)}>Cancel</Button>
                <Button type="submit" disabled={responding || (respondingTo.is_change_order && !coDecision)}>
                  {responding ? 'Sending...' : 'Send Response'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit RFI modal */}
      {editingRfi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit RFI-{String(editingRfi.rfi_number).padStart(3, '0')}</h2>
              <button onClick={() => setEditingRfi(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditRfi}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Subject</label>
                  <input value={editSubject} onChange={e => setEditSubject(e.target.value)} required
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Description / Question</label>
                  <textarea rows={4} value={editDescription} onChange={e => setEditDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditingRfi(null)}>Cancel</Button>
                <Button type="submit" disabled={editSubmitting}>{editSubmitting ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">RFIs</h1>
          <p className="text-sm text-muted-fg mt-0.5">Requests for information from subcontractors.</p>
        </div>
        {open.length > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-accent-fg font-medium">
            <AlertCircle className="h-4 w-4" />{open.length} awaiting response
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : rfis.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <MessageSquare className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No RFIs yet</p>
          <p className="text-xs text-faint mt-1">Subcontractors can submit questions from their job page.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Awaiting Response ({open.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {open.map(r => <RfiCard key={r.id} rfi={r} />)}
              </div>
            </div>
          )}
          {answered.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Answered ({answered.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {answered.map(r => <RfiCard key={r.id} rfi={r} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
