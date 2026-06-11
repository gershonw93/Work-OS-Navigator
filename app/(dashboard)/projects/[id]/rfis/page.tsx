'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { X, ChevronDown, ChevronUp, MessageSquare, DollarSign, CheckCircle2, Clock, AlertCircle, Check, XCircle, RefreshCw, Paperclip } from 'lucide-react'

interface RFI {
  id: string; rfi_number: number; submitted_by_name: string; company_name: string | null
  subject: string; description: string; is_change_order: boolean
  change_order_description: string | null; change_order_items: any[] | null; change_order_amount: number | null
  change_order_status: string | null; attachments: any[] | null
  status: string; response: string | null; responded_by_name: string | null
  responded_at: string | null; created_at: string
}

const CO_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:            { label: 'Pending Review',       color: 'bg-purple-50 border-purple-200 text-purple-700' },
  approved:           { label: 'Approved',             color: 'bg-green-50 border-green-200 text-green-700' },
  denied:             { label: 'Denied',               color: 'bg-red-50 border-red-200 text-red-600' },
  revision_requested: { label: 'Revision Requested',   color: 'bg-amber-50 border-amber-200 text-amber-700' },
}

export default function RFIsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [rfis, setRfis] = useState<RFI[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedRfi, setExpandedRfi] = useState<string | null>(null)
  const [respondingTo, setRespondingTo] = useState<RFI | null>(null)
  const [responseText, setResponseText] = useState('')
  const [responseStatus, setResponseStatus] = useState<'answered' | 'closed'>('answered')
  const [coDecision, setCoDecision] = useState<'approved' | 'denied' | 'revision_requested' | null>(null)
  const [responding, setResponding] = useState(false)

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
      <button onClick={() => openRespond(rfi)}
        className={cn('rounded-xl border bg-white p-4 text-left hover:shadow-md transition-all hover:-translate-y-0.5 w-full',
          rfi.status === 'open' ? 'border-orange-200' : 'border-slate-200')}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-mono text-slate-400">RFI-{String(rfi.rfi_number).padStart(3, '0')}</span>
          <span className={cn('text-xs font-medium rounded-full border px-1.5 py-0.5 shrink-0',
            rfi.status === 'open' ? 'bg-orange-50 border-orange-200 text-orange-700' :
            rfi.status === 'closed' ? 'bg-slate-50 border-slate-200 text-slate-500' :
            'bg-green-50 border-green-200 text-green-700')}>
            {rfi.status}
          </span>
        </div>
        <p className="text-sm font-semibold text-slate-900 line-clamp-2 leading-snug">{rfi.subject}</p>
        <p className="text-xs text-slate-400 mt-1 truncate">{rfi.company_name ?? rfi.submitted_by_name}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {rfi.is_change_order && (
            <span className={cn('text-xs rounded-full border px-1.5 py-0.5 flex items-center gap-0.5', coConfig.color)}>
              <DollarSign className="h-2.5 w-2.5" />
              {rfi.change_order_amount ? `$${Number(rfi.change_order_amount).toLocaleString()}` : 'CO'} · {coConfig.label}
            </span>
          )}
          {(rfi.attachments?.length ?? 0) > 0 && (
            <span className="text-xs text-slate-400 flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{rfi.attachments?.length}</span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">{new Date(rfi.created_at).toLocaleDateString()}</p>
        {rfi.status === 'open' && (
          <div className="mt-3 pt-2 border-t border-slate-100">
            <span className="text-xs font-medium text-orange-600">Click to respond →</span>
          </div>
        )}
      </button>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {respondingTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h2 className="font-semibold text-slate-900">Respond to RFI-{String(respondingTo.rfi_number).padStart(3, '0')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">{respondingTo.subject}</p>
              </div>
              <button onClick={() => setRespondingTo(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleRespond}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-600 whitespace-pre-wrap">{respondingTo.description}</div>

                {/* Change order decision */}
                {respondingTo.is_change_order && (
                  <div className="space-y-2">
                    <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2.5">
                      <p className="text-xs font-semibold text-purple-600 mb-1">Change Order: ${Number(respondingTo.change_order_amount ?? 0).toLocaleString()}</p>
                      {respondingTo.change_order_description && <p className="text-xs text-purple-700">{respondingTo.change_order_description}</p>}
                      {respondingTo.change_order_items && respondingTo.change_order_items.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {respondingTo.change_order_items.map((item: any, i: number) => (
                            <div key={i} className="flex justify-between text-xs text-purple-700">
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
                        { key: 'approved', label: 'Approve', icon: Check, color: 'border-green-400 bg-green-50 text-green-700' },
                        { key: 'denied', label: 'Deny', icon: XCircle, color: 'border-red-400 bg-red-50 text-red-600' },
                        { key: 'revision_requested', label: 'Request Revision', icon: RefreshCw, color: 'border-amber-400 bg-amber-50 text-amber-700' },
                      ] as const).map(opt => (
                        <button key={opt.key} type="button" onClick={() => setCoDecision(opt.key)}
                          className={cn('flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-colors',
                            coDecision === opt.key ? opt.color : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                          <opt.icon className="h-4 w-4" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Response <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <textarea autoFocus={!respondingTo.is_change_order} rows={4} value={responseText} onChange={e => setResponseText(e.target.value)}
                    placeholder={respondingTo.is_change_order ? 'Add any notes about your decision...' : 'Answer the question...'}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none" />
                </div>

                <div className="flex gap-2">
                  {(['answered', 'closed'] as const).map(s => (
                    <button key={s} type="button" onClick={() => setResponseStatus(s)}
                      className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        responseStatus === s ? 'border-orange-400 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-600 hover:border-slate-300')}>
                      {s === 'answered' ? 'Answered' : 'Answered & Closed'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setRespondingTo(null)}>Cancel</Button>
                <Button type="submit" disabled={responding || (respondingTo.is_change_order && !coDecision)}>
                  {responding ? 'Sending...' : 'Send Response'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">RFIs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Requests for information from subcontractors.</p>
        </div>
        {open.length > 0 && (
          <span className="flex items-center gap-1.5 text-sm text-orange-600 font-medium">
            <AlertCircle className="h-4 w-4" />{open.length} awaiting response
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : rfis.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No RFIs yet</p>
          <p className="text-xs text-slate-400 mt-1">Subcontractors can submit questions from their job page.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {open.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Awaiting Response ({open.length})</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {open.map(r => <RfiCard key={r.id} rfi={r} />)}
              </div>
            </div>
          )}
          {answered.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Answered ({answered.length})</p>
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
