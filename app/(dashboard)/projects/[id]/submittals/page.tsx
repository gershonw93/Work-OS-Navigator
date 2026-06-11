'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, FileText, Paperclip, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, Trash2, ExternalLink,
} from 'lucide-react'

const SUBMITTAL_TYPES = ['Tech Sheet', 'Shop Drawing', 'Product Data', 'Sample', 'Other']

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending Review', color: 'bg-amber-50 border-amber-200 text-amber-700', icon: Clock },
  approved: { label: 'Approved', color: 'bg-green-50 border-green-200 text-green-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-red-50 border-red-200 text-red-600', icon: XCircle },
  revise: { label: 'Revise & Resubmit', color: 'bg-blue-50 border-blue-200 text-blue-700', icon: RefreshCw },
}

interface Submittal {
  id: string; title: string; type: string; trade: string | null
  spec_section: string | null; manufacturer: string | null; model_number: string | null
  status: string; notes: string | null; review_notes: string | null
  file_url: string | null; submitted_by_company_id: string | null; created_at: string
}

export default function SubmittalsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [submittals, setSubmittals] = useState<Submittal[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewStatus, setReviewStatus] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')

  // Form
  const [title, setTitle] = useState('')
  const [type, setType] = useState('Tech Sheet')
  const [trade, setTrade] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [modelNumber, setModelNumber] = useState('')
  const [specSection, setSpecSection] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchSubmittals() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/submittals`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setSubmittals((await res.json()).submittals)
    setLoading(false)
  }

  useEffect(() => { fetchSubmittals() }, [params.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const token = await getToken()
    const fd = new FormData()
    fd.append('title', title)
    fd.append('type', type)
    fd.append('trade', trade)
    fd.append('spec_section', specSection)
    fd.append('manufacturer', manufacturer)
    fd.append('model_number', modelNumber)
    fd.append('notes', notes)
    if (file) fd.append('file', file)
    await fetch(`/api/projects/${params.id}/submittals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    setTitle(''); setType('Tech Sheet'); setTrade(''); setManufacturer('')
    setModelNumber(''); setSpecSection(''); setNotes(''); setFile(null)
    setShowForm(false); setSubmitting(false); fetchSubmittals()
  }

  async function updateStatus(sub: Submittal, newStatus: string, review_notes?: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/submittals/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(review_notes !== undefined ? { status: newStatus, review_notes } : { status: newStatus }),
    })
    setReviewingId(null); setReviewStatus(''); setReviewNotes('')
    fetchSubmittals()
  }

  async function handleDelete(sub: Submittal) {
    if (!confirm(`Delete submittal "${sub.title}"?`)) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/submittals/${sub.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchSubmittals()
  }

  function handleStatusClick(sub: Submittal, s: string) {
    if (s === sub.status) return
    if (s === 'rejected' || s === 'revise') {
      setReviewingId(sub.id); setReviewStatus(s); setReviewNotes(sub.review_notes ?? '')
    } else {
      updateStatus(sub, s)
    }
  }

  const pending = submittals.filter(s => s.status === 'pending')
  const approved = submittals.filter(s => s.status === 'approved')
  const needsAction = submittals.filter(s => s.status === 'rejected' || s.status === 'revise')

  function SubCard({ sub }: { sub: Submittal }) {
    const isExpanded = expanded === sub.id
    const cfg = STATUS_CONFIG[sub.status] ?? STATUS_CONFIG.pending
    const Icon = cfg.icon
    const isReviewing = reviewingId === sub.id
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : sub.id)}>
          <Icon className={cn('h-5 w-5 shrink-0',
            sub.status === 'approved' ? 'text-green-500' : sub.status === 'rejected' ? 'text-red-400' : sub.status === 'revise' ? 'text-blue-500' : 'text-amber-500')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900">{sub.title}</span>
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{sub.type}</span>
              {sub.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{sub.trade}</span>}
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
              {sub.file_url && <Paperclip className="h-3.5 w-3.5 text-slate-400" />}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Submitted {new Date(sub.created_at).toLocaleDateString()}
              {sub.manufacturer && ` · ${sub.manufacturer}`}
              {sub.model_number && ` ${sub.model_number}`}
            </p>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-slate-100 px-4 sm:px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-slate-400">Type</p><p className="font-medium text-slate-700">{sub.type}</p></div>
              {sub.trade && <div><p className="text-xs text-slate-400">Trade</p><p className="font-medium text-slate-700">{sub.trade}</p></div>}
              {sub.spec_section && <div><p className="text-xs text-slate-400">Spec Section</p><p className="font-medium text-slate-700">{sub.spec_section}</p></div>}
              {sub.manufacturer && <div><p className="text-xs text-slate-400">Manufacturer</p><p className="font-medium text-slate-700">{sub.manufacturer}</p></div>}
              {sub.model_number && <div><p className="text-xs text-slate-400">Model Number</p><p className="font-medium text-slate-700">{sub.model_number}</p></div>}
              <div><p className="text-xs text-slate-400">Submitted</p><p className="font-medium text-slate-700">{new Date(sub.created_at).toLocaleDateString()}</p></div>
            </div>

            {sub.file_url && (
              <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> View attached file
              </a>
            )}

            {sub.notes && <p className="text-sm text-slate-600">{sub.notes}</p>}

            {sub.review_notes && (
              <div className={cn('rounded-lg border px-3 py-2 text-xs',
                sub.status === 'rejected' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700')}>
                <strong>Review notes:</strong> {sub.review_notes}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-slate-400">Review:</span>
                {['pending', 'approved', 'rejected', 'revise'].map(s => (
                  <button key={s} type="button" onClick={() => handleStatusClick(sub, s)}
                    className={cn('text-xs rounded-full border px-2 py-0.5 font-medium transition-colors',
                      sub.status === s ? STATUS_CONFIG[s].color : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => handleDelete(sub)}
                className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-red-500 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>

            {isReviewing && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <Label>
                  {reviewStatus === 'rejected' ? 'Rejection reason' : 'What needs revision?'}
                </Label>
                <textarea rows={2} autoFocus value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Add review notes for the submitter..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" size="sm" variant="secondary" onClick={() => { setReviewingId(null); setReviewNotes('') }}>Cancel</Button>
                  <Button type="button" size="sm" onClick={() => updateStatus(sub, reviewStatus, reviewNotes || undefined)}>
                    {reviewStatus === 'rejected' ? 'Reject Submittal' : 'Request Revision'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Add Submittal</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input placeholder="e.g. Roof Membrane — GAF EverGuard TPO" value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select value={type} onChange={e => setType(e.target.value)} required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      {SUBMITTAL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trade <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. Roofing" value={trade} onChange={e => setTrade(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Manufacturer</Label>
                    <Input placeholder="e.g. GAF" value={manufacturer} onChange={e => setManufacturer(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model Number</Label>
                    <Input placeholder="e.g. TPO-60" value={modelNumber} onChange={e => setModelNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Spec Section <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input placeholder="e.g. 07 54 23" value={specSection} onChange={e => setSpecSection(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label><Paperclip className="inline h-3.5 w-3.5 mr-1 text-slate-400" />File <span className="text-slate-400 font-normal">(tech sheet, drawing, product data)</span></Label>
                  <Input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any notes for the reviewer..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Add Submittal'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Submittals</h1>
          <p className="text-sm text-slate-500 mt-0.5">Tech sheets, shop drawings, and product data for review and approval.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="self-start sm:self-auto shrink-0"><Plus className="h-4 w-4" /> Add Submittal</Button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : submittals.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <FileText className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No submittals yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload tech sheets and product data for the products planned on this project.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pending Review ({pending.length})</p>
              {pending.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Approved ({approved.length})</p>
              {approved.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
          {needsAction.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Rejected / Revise ({needsAction.length})</p>
              {needsAction.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
