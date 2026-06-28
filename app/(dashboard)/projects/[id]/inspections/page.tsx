'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, ClipboardCheck, Phone, Calendar, CheckCircle2, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Sparkles, Loader2, Trash2, Pencil } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'

const INSPECTION_TYPES = [
  'Foundation', 'Framing', 'Rough Electrical', 'Rough Plumbing', 'Rough Mechanical',
  'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing', 'Final Mechanical',
  'Fire Sprinkler', 'Building Final', 'Certificate of Occupancy', 'Other'
]
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  not_scheduled: { label: 'Not Scheduled', color: 'bg-surface border-line text-muted-fg', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'bg-info-tint border-info/30 text-info', icon: Calendar },
  passed: { label: 'Passed', color: 'bg-success-tint border-success/30 text-success', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-danger-tint border-danger/30 text-danger', icon: XCircle },
  pending_reinspection: { label: 'Re-inspection', color: 'bg-warn-tint border-warn/30 text-warn', icon: AlertCircle },
}

interface Inspection {
  id: string; type: string; trade: string | null; status: string
  scheduled_date: string | null; completed_date: string | null
  inspector_name: string | null; inspector_phone: string | null; scheduling_phone: string | null
  notes: string | null; ready_marked_by: string | null; ready_marked_at: string | null
  card_image_url: string | null; created_at: string
}

export default function InspectionsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [scannedFile, setScannedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [editingInsp, setEditingInsp] = useState<Inspection | null>(null)

  // Form
  const [inspType, setInspType] = useState('Foundation')
  const [trade, setTrade] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorPhone, setInspectorPhone] = useState('')
  const [schedulingPhone, setSchedulingPhone] = useState('')
  const [notes, setNotes] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchInspections() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/inspections`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setInspections((await res.json()).inspections)
    setLoading(false)
  }

  useEffect(() => {
    fetchInspections()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setCurrentUser(session.user.email)
    })
  }, [params.id])

  async function analyzeImage(file: File) {
    setAnalyzing(true)
    setAnalyzeError('')
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    setScannedFile(file)
    const res = await fetch(`/api/projects/${params.id}/inspections/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const data = await res.json()
    if (!res.ok || !data.fields) {
      setAnalyzeError(data.error ?? 'Could not read image. Fill in the fields manually.')
      setAnalyzing(false)
      return
    }
    const f = data.fields
    if (f.inspection_type && INSPECTION_TYPES.includes(f.inspection_type)) setInspType(f.inspection_type)
    if (f.trade) setTrade(f.trade)
    if (f.scheduled_date) setScheduledDate(f.scheduled_date)
    if (f.inspector_name) setInspectorName(f.inspector_name)
    if (f.inspector_phone) setInspectorPhone(f.inspector_phone)
    if (f.scheduling_phone) setSchedulingPhone(f.scheduling_phone)
    if (f.notes) {
      const extra = [f.notes, f.issuing_authority && `Authority: ${f.issuing_authority}`, f.permit_number && `Permit #${f.permit_number}`].filter(Boolean).join(' · ')
      setNotes(extra)
    }
    setAnalyzing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const token = await getToken()

    if (editingInsp) {
      await fetch(`/api/projects/${params.id}/inspections/${editingInsp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type: inspType,
          trade: trade || null,
          scheduled_date: scheduledDate || null,
          inspector_name: inspectorName || null,
          inspector_phone: inspectorPhone || null,
          scheduling_phone: schedulingPhone || null,
          notes: notes || null,
        }),
      })
      setEditingInsp(null)
      setInspType('Foundation'); setTrade(''); setScheduledDate('')
      setInspectorName(''); setInspectorPhone(''); setSchedulingPhone(''); setNotes('')
      setScannedFile(null)
      setShowForm(false); setSubmitting(false); fetchInspections()
      return
    }

    const form = new FormData()
    form.append('inspection_type', inspType)
    if (trade) form.append('trade', trade)
    if (scheduledDate) form.append('scheduled_date', scheduledDate)
    form.append('status', scheduledDate ? 'scheduled' : 'not_scheduled')
    if (inspectorName) form.append('inspector_name', inspectorName)
    if (inspectorPhone) form.append('inspector_phone', inspectorPhone)
    if (schedulingPhone) form.append('scheduling_phone', schedulingPhone)
    if (notes) form.append('notes', notes)
    if (scannedFile) form.append('file', scannedFile)
    await fetch(`/api/projects/${params.id}/inspections`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    setInspType('Foundation'); setTrade(''); setScheduledDate('')
    setInspectorName(''); setInspectorPhone(''); setSchedulingPhone(''); setNotes('')
    setScannedFile(null)
    setShowForm(false); setSubmitting(false); fetchInspections()
  }

  async function updateStatus(insp: Inspection, newStatus: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchInspections()
  }

  function openEditInsp(insp: Inspection) {
    setEditingInsp(insp)
    setInspType(insp.type)
    setTrade(insp.trade ?? '')
    setScheduledDate(insp.scheduled_date ?? '')
    setInspectorName(insp.inspector_name ?? '')
    setInspectorPhone(insp.inspector_phone ?? '')
    setSchedulingPhone(insp.scheduling_phone ?? '')
    setNotes(insp.notes ?? '')
    setScannedFile(null)
    setShowForm(true)
  }

  async function handleDeleteInsp(inspId: string) {
    if (!window.confirm('Delete this inspection? This cannot be undone.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/inspections/${inspId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchInspections()
  }

  async function markReady(insp: Inspection) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready_marked_by: currentUser, ready_marked_at: new Date().toISOString() }),
    })
    fetchInspections()
  }

  const pending = inspections.filter(i => i.status === 'not_scheduled' || i.status === 'scheduled' || i.status === 'pending_reinspection')
  const completed = inspections.filter(i => i.status === 'passed' || i.status === 'failed')

  function InspCard({ insp }: { insp: Inspection }) {
    const isExpanded = expanded === insp.id
    const cfg = STATUS_CONFIG[insp.status] ?? STATUS_CONFIG.not_scheduled
    const Icon = cfg.icon
    return (
      <div className="rounded-xl border border-line bg-panel overflow-hidden">
        <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : insp.id)}>
          <Icon className={cn('h-5 w-5 shrink-0', insp.status === 'passed' ? 'text-success' : insp.status === 'failed' ? 'text-danger' : insp.status === 'scheduled' ? 'text-info' : 'text-faint')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{insp.type}</span>
              {insp.trade && <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{insp.trade}</span>}
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
              {insp.ready_marked_by && insp.status === 'scheduled' && (
                <span className="text-xs font-medium bg-success-tint border border-success/30 text-success rounded-full px-2 py-0.5">Ready ✓</span>
              )}
            </div>
            <p className="text-xs text-faint mt-0.5">
              {insp.scheduled_date ? `Scheduled ${new Date(insp.scheduled_date).toLocaleDateString()}` : 'Not scheduled'}
              {insp.inspector_name && ` · ${insp.inspector_name}`}
            </p>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-line-soft px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {insp.scheduled_date && (
                <div><p className="text-xs text-faint">Scheduled Date</p><p className="font-medium text-ink-soft">{new Date(insp.scheduled_date).toLocaleDateString()}</p></div>
              )}
              {insp.completed_date && (
                <div><p className="text-xs text-faint">Completed</p><p className="font-medium text-ink-soft">{new Date(insp.completed_date).toLocaleDateString()}</p></div>
              )}
              {insp.inspector_name && (
                <div>
                  <p className="text-xs text-faint">Inspector</p>
                  <p className="font-medium text-ink-soft">{insp.inspector_name}</p>
                  {insp.inspector_phone && (
                    <a href={`tel:${insp.inspector_phone}`} className="flex items-center gap-1 text-xs text-accent-fg hover:underline mt-0.5">
                      <Phone className="h-3 w-3" />{insp.inspector_phone}
                    </a>
                  )}
                </div>
              )}
              {insp.scheduling_phone && (
                <div>
                  <p className="text-xs text-faint">Schedule Inspection</p>
                  <a href={`tel:${insp.scheduling_phone}`} className="flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
                    <Phone className="h-3.5 w-3.5" />{insp.scheduling_phone}
                  </a>
                </div>
              )}
            </div>

            {insp.ready_marked_by && (
              <div className="rounded-lg bg-success-tint border border-green-100 px-3 py-2 text-xs text-success">
                Marked ready by <strong>{insp.ready_marked_by}</strong>
                {insp.ready_marked_at && ` on ${new Date(insp.ready_marked_at).toLocaleDateString()}`}
              </div>
            )}

            {insp.notes && <p className="text-sm text-muted-fg break-words">{insp.notes}</p>}

            {insp.card_image_url && (
              <a href={insp.card_image_url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={insp.card_image_url} alt="Inspection card" className="rounded-lg border border-line max-h-48 object-contain w-auto" />
                <p className="text-xs text-accent-fg mt-1 hover:underline">View full image ↗</p>
              </a>
            )}

            <div className="flex items-center gap-2 flex-wrap">
              {insp.status === 'scheduled' && !insp.ready_marked_by && (
                <Button size="sm" variant="outline" onClick={() => markReady(insp)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Ready for Inspection
                </Button>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-faint">Update status:</span>
                {['not_scheduled', 'scheduled', 'passed', 'failed', 'pending_reinspection'].map(s => (
                  <button key={s} type="button" onClick={() => updateStatus(insp, s)}
                    className={cn('text-xs rounded-full border px-2 py-0.5 font-medium transition-colors',
                      insp.status === s ? STATUS_CONFIG[s].color : 'border-line text-muted-fg hover:border-muted2')}>
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
              </div>
              <button onClick={() => openEditInsp(insp)} className="text-faint hover:text-muted-fg p-1 ml-auto" title="Edit inspection">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => handleDeleteInsp(insp.id)} className="text-danger hover:text-danger p-1" title="Delete inspection">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editingInsp ? 'Edit Inspection' : 'Add Inspection'}</h2>
              <button onClick={() => { setShowForm(false); setEditingInsp(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                {/* AI photo scan */}
                <div className="space-y-1.5">
                  <Label><Sparkles className="inline h-3.5 w-3.5 mr-1 text-accent-fg" />Scan Inspection Card (AI Auto-Fill)</Label>
                  <label
                    className={cn(
                      'flex flex-col sm:flex-row items-center gap-3 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm transition-colors cursor-pointer',
                      analyzing ? 'border-accent bg-accent-tint cursor-wait pointer-events-none' : 'border-accent/40 bg-accent-tint/50 hover:bg-accent-tint hover:border-accent'
                    )}
                  >
                    {analyzing
                      ? <><Loader2 className="h-4 w-4 text-accent-fg animate-spin shrink-0" /><span className="text-accent-fg font-medium">Analyzing card…</span></>
                      : <><Sparkles className="h-4 w-4 text-accent-fg shrink-0" /><span className="text-accent-fg font-medium">Upload a photo or PDF of the inspection card</span><span className="text-faint text-xs">— AI fills the fields automatically</span></>
                    }
                    <input ref={fileRef} type="file" accept="image/*,application/pdf" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) analyzeImage(f) }} />
                  </label>
                  {analyzeError && <p className="text-xs text-danger flex items-center gap-1"><X className="h-3 w-3 shrink-0" />{analyzeError}</p>}
                  {scannedFile && !analyzeError && (
                    <div className="flex items-center gap-2 mt-1">
                      <img src={URL.createObjectURL(scannedFile)} alt="Scanned card" className="h-14 w-14 rounded object-cover border border-line shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-success">✓ Card scanned — fields filled</p>
                        <p className="text-xs text-faint truncate">{scannedFile.name}</p>
                        <button type="button" onClick={() => { setScannedFile(null); if (fileRef.current) fileRef.current.value = '' }} className="text-xs text-danger hover:text-danger">Remove</button>
                      </div>
                    </div>
                  )}
                  {!scannedFile && !analyzing && <p className="text-xs text-faint">or fill in manually below</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspection Type</Label>
                    <select value={inspType} onChange={e => setInspType(e.target.value)} required
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. Electrical" value={trade} onChange={e => setTrade(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Scheduled Date <span className="text-faint font-normal">(if known)</span></Label>
                  <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspector Name</Label>
                    <ContactPicker
                      filterType="inspector"
                      value={inspectorName}
                      onChange={name => setInspectorName(name)}
                      onPhoneChange={phone => setInspectorPhone(phone)}
                      placeholder="Search inspectors…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspector Phone</Label>
                    <Input type="tel" placeholder="Direct line" value={inspectorPhone} onChange={e => setInspectorPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label><Phone className="inline h-3.5 w-3.5 mr-1 text-faint" />Scheduling Phone</Label>
                  <Input type="tel" placeholder="Number to call to order inspection" value={schedulingPhone} onChange={e => setSchedulingPhone(e.target.value)} />
                  <p className="text-xs text-faint">Both GC and subs can see this to call and order the inspection</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any notes about this inspection..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingInsp(null) }}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : editingInsp ? 'Save Changes' : 'Add Inspection'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inspections</h1>
          <p className="text-sm text-muted-fg mt-0.5">Track all required inspections, status, and inspector contacts.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Inspection</Button>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : inspections.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <ClipboardCheck className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No inspections added yet</p>
          <p className="text-xs text-faint mt-1">Add all required inspections for this project to track status.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Pending ({pending.length})</p>
              {pending.map(i => <InspCard key={i.id} insp={i} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Completed ({completed.length})</p>
              {completed.map(i => <InspCard key={i.id} insp={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
