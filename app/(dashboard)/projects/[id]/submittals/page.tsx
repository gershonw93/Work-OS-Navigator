'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, FileText, Paperclip, CheckCircle2, XCircle, Clock, RefreshCw,
  ChevronDown, ChevronUp, Trash2, ExternalLink, Sparkles, Loader2,
} from 'lucide-react'

const SUBMITTAL_TYPES = ['Tech Sheet', 'Shop Drawing', 'Product Data', 'Sample', 'Other']

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending Review', color: 'bg-warn-tint border-warn/30 text-warn', icon: Clock },
  approved: { label: 'Approved', color: 'bg-success-tint border-success/30 text-success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-danger-tint border-danger/30 text-danger', icon: XCircle },
  revise: { label: 'Revise & Resubmit', color: 'bg-info-tint border-info/30 text-info', icon: RefreshCw },
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
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [scanned, setScanned] = useState(false)

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

  async function analyzeDoc(f: File) {
    setAnalyzing(true); setAnalyzeError(''); setScanned(false)
    setFile(f)
    const token = await getToken()
    const form = new FormData()
    form.append('file', f)
    const res = await fetch(`/api/projects/${params.id}/submittals/analyze`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    const data = await res.json()
    if (!res.ok || !data.fields) {
      setAnalyzeError(data.error ?? 'Could not read document. Fill in the fields manually.')
      setAnalyzing(false); return
    }
    const fld = data.fields
    if (fld.title) setTitle(fld.title)
    if (fld.type && SUBMITTAL_TYPES.includes(fld.type)) setType(fld.type)
    if (fld.trade) setTrade(fld.trade)
    if (fld.manufacturer) setManufacturer(fld.manufacturer)
    if (fld.model_number) setModelNumber(fld.model_number)
    if (fld.spec_section) setSpecSection(fld.spec_section)
    if (fld.notes) setNotes(fld.notes)
    setScanned(true); setAnalyzing(false)
  }

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
    setScanned(false); setAnalyzeError('')
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
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <button className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-surface transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : sub.id)}>
          <Icon className={cn('h-5 w-5 shrink-0',
            sub.status === 'approved' ? 'text-success' : sub.status === 'rejected' ? 'text-danger' : sub.status === 'revise' ? 'text-info' : 'text-warn')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{sub.title}</span>
              <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{sub.type}</span>
              {sub.trade && <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{sub.trade}</span>}
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
              {sub.file_url && <Paperclip className="h-3.5 w-3.5 text-faint" />}
            </div>
            <p className="text-xs text-faint mt-0.5">
              Submitted {new Date(sub.created_at).toLocaleDateString()}
              {sub.manufacturer && ` · ${sub.manufacturer}`}
              {sub.model_number && ` ${sub.model_number}`}
            </p>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-line-soft px-4 sm:px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div><p className="text-xs text-faint">Type</p><p className="font-medium text-ink-soft">{sub.type}</p></div>
              {sub.trade && <div><p className="text-xs text-faint">Trade</p><p className="font-medium text-ink-soft">{sub.trade}</p></div>}
              {sub.spec_section && <div><p className="text-xs text-faint">Spec Section</p><p className="font-medium text-ink-soft">{sub.spec_section}</p></div>}
              {sub.manufacturer && <div><p className="text-xs text-faint">Manufacturer</p><p className="font-medium text-ink-soft">{sub.manufacturer}</p></div>}
              {sub.model_number && <div><p className="text-xs text-faint">Model Number</p><p className="font-medium text-ink-soft">{sub.model_number}</p></div>}
              <div><p className="text-xs text-faint">Submitted</p><p className="font-medium text-ink-soft">{new Date(sub.created_at).toLocaleDateString()}</p></div>
            </div>

            {sub.file_url && (
              <a href={sub.file_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> View attached file
              </a>
            )}

            {sub.notes && <p className="text-sm text-muted-fg">{sub.notes}</p>}

            {sub.review_notes && (
              <div className={cn('rounded-lg border px-3 py-2 text-xs',
                sub.status === 'rejected' ? 'bg-danger-tint border-red-100 text-danger' : 'bg-info-tint border-blue-100 text-info')}>
                <strong>Review notes:</strong> {sub.review_notes}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-faint">Review:</span>
                {['pending', 'approved', 'rejected', 'revise'].map(s => (
                  <button key={s} type="button" onClick={() => handleStatusClick(sub, s)}
                    className={cn('text-xs rounded-full border px-2 py-0.5 font-medium transition-colors',
                      sub.status === s ? STATUS_CONFIG[s].color : 'border-line text-muted-fg hover:border-muted2')}>
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => handleDelete(sub)}
                className="ml-auto flex items-center gap-1 text-xs text-faint hover:text-danger transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>

            {isReviewing && (
              <div className="rounded-lg border border-line bg-surface p-3 space-y-2">
                <Label>
                  {reviewStatus === 'rejected' ? 'Rejection reason' : 'What needs revision?'}
                </Label>
                <textarea rows={2} autoFocus value={reviewNotes} onChange={e => setReviewNotes(e.target.value)}
                  placeholder="Add review notes for the submitter..."
                  className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
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
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Add Submittal</h2>
              <button onClick={() => setShowForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label><Sparkles className="inline h-3.5 w-3.5 mr-1 text-accent-fg" />Scan Submittal (AI Auto-Fill)</Label>
                  <label className="flex items-center gap-2 rounded-lg border-2 border-dashed border-accent/40 bg-accent-tint/40 px-3 py-3 cursor-pointer hover:bg-accent-tint transition-colors">
                    {analyzing
                      ? <><Loader2 className="h-4 w-4 text-accent-fg animate-spin shrink-0" /><span className="text-accent-fg font-medium text-sm">Reading document…</span></>
                      : <><Sparkles className="h-4 w-4 text-accent-fg shrink-0" /><span className="text-accent-fg font-medium text-sm">Upload a tech sheet / cut sheet</span><span className="text-faint text-xs">— AI fills the fields</span></>}
                    <input type="file" accept="image/*,application/pdf" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) analyzeDoc(f) }} />
                  </label>
                  {analyzeError && <p className="text-xs text-danger flex items-center gap-1"><X className="h-3 w-3 shrink-0" />{analyzeError}</p>}
                  {scanned && !analyzeError && <p className="text-xs font-medium text-success">✓ Scanned — fields filled. The file is attached below.</p>}
                </div>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input placeholder="e.g. Roof Membrane — GAF EverGuard TPO" value={title} onChange={e => setTitle(e.target.value)} required />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Type</Label>
                    <select value={type} onChange={e => setType(e.target.value)} required
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {SUBMITTAL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
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
                  <Label>Spec Section <span className="text-faint font-normal">(optional)</span></Label>
                  <Input placeholder="e.g. 07 54 23" value={specSection} onChange={e => setSpecSection(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label><Paperclip className="inline h-3.5 w-3.5 mr-1 text-faint" />File <span className="text-faint font-normal">(tech sheet, drawing, product data)</span></Label>
                  <Input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any notes for the reviewer..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Add Submittal'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Submittals</h1>
          <p className="text-sm text-muted-fg mt-0.5">Tech sheets, shop drawings, and product data for review and approval.</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="self-start sm:self-auto shrink-0"><Plus className="h-4 w-4" /> Add Submittal</Button>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : submittals.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No submittals yet</p>
          <p className="text-xs text-faint mt-1">Upload tech sheets and product data for the products planned on this project.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Pending Review ({pending.length})</p>
              {pending.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
          {approved.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Approved ({approved.length})</p>
              {approved.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
          {needsAction.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Rejected / Revise ({needsAction.length})</p>
              {needsAction.map(s => <SubCard key={s.id} sub={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
