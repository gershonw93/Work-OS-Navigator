'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, ClipboardCheck, Phone, Calendar, CheckCircle2, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Loader2, Upload, Trash2, Pencil } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'

const INSPECTION_TYPES = [
  'Foundation', 'Framing', 'Rough Electrical', 'Rough Plumbing', 'Rough Mechanical',
  'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing', 'Final Mechanical',
  'Fire Sprinkler', 'Building Final', 'Certificate of Occupancy', 'Other'
]
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: 'Requested', color: 'bg-warn-tint border-warn/30 text-warn', icon: AlertCircle },
  not_scheduled: { label: 'Not Scheduled', color: 'bg-surface border-line text-muted-fg', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'bg-info-tint border-info/30 text-info', icon: Calendar },
  passed: { label: 'Passed', color: 'bg-success-tint border-success/30 text-success', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-danger-tint border-danger/30 text-danger', icon: XCircle },
  pending_reinspection: { label: 'Re-inspection', color: 'bg-warn-tint border-warn/30 text-warn', icon: AlertCircle },
}

interface Inspection {
  id: string; type: string; trade: string | null; status: string
  scheduled_date: string | null; scheduled_time: string | null; completed_date: string | null
  inspector_name: string | null; inspector_phone: string | null; scheduling_phone: string | null
  scheduler_profile_id: string | null; scheduler_name: string | null; requested_by_name: string | null
  notes: string | null; ready_marked_by: string | null; ready_marked_at: string | null
  card_image_url: string | null; created_at: string
}

interface Teammate { id: string; full_name: string | null; email: string }

export default function InspectionsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null)
  const cardInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [editingInsp, setEditingInsp] = useState<Inspection | null>(null)

  // Form
  const [inspType, setInspType] = useState('Foundation')
  const [trade, setTrade] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorPhone, setInspectorPhone] = useState('')
  const [schedulingPhone, setSchedulingPhone] = useState('')
  const [schedulerId, setSchedulerId] = useState('')
  const [notes, setNotes] = useState('')
  const [teammates, setTeammates] = useState<Teammate[]>([])

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

  async function fetchTeammates() {
    const token = await getToken()
    const res = await fetch('/api/settings/teammates', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setTeammates(d.teammates ?? d.members ?? []) }
  }

  useEffect(() => {
    fetchInspections()
    fetchTeammates()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setCurrentUser(session.user.email)
    })
  }, [params.id])

  // AFTER the inspection happens: attach the inspector's card/paper. AI reads it
  // and fills any blank fields, and offers to set the pass/fail result.
  async function uploadCard(insp: Inspection, file: File) {
    setUploadingCardId(insp.id)
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}/card`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    const data = await res.json().catch(() => ({}))
    setUploadingCardId(null)
    if (res.ok && data.suggested_status && insp.status !== data.suggested_status
      && window.confirm(`The card looks ${data.suggested_status.toUpperCase()}. Mark this inspection ${data.suggested_status}?`)) {
      await updateStatus(insp, data.suggested_status)
      return
    }
    fetchInspections()
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
          scheduled_time: scheduledTime || null,
          inspector_name: inspectorName || null,
          inspector_phone: inspectorPhone || null,
          scheduling_phone: schedulingPhone || null,
          scheduler_profile_id: schedulerId || null,
          scheduler_name: teammates.find(t => t.id === schedulerId)?.full_name || null,
          notes: notes || null,
        }),
      })
      resetForm()
      setShowForm(false); setSubmitting(false); fetchInspections()
      return
    }

    const form = new FormData()
    form.append('inspection_type', inspType)
    if (trade) form.append('trade', trade)
    if (scheduledDate) form.append('scheduled_date', scheduledDate)
    if (scheduledTime) form.append('scheduled_time', scheduledTime)
    form.append('status', scheduledDate ? 'scheduled' : schedulerId ? 'requested' : 'not_scheduled')
    if (inspectorName) form.append('inspector_name', inspectorName)
    if (inspectorPhone) form.append('inspector_phone', inspectorPhone)
    if (schedulingPhone) form.append('scheduling_phone', schedulingPhone)
    if (schedulerId) { form.append('scheduler_profile_id', schedulerId); form.append('scheduler_name', teammates.find(t => t.id === schedulerId)?.full_name || '') }
    if (notes) form.append('notes', notes)
    await fetch(`/api/projects/${params.id}/inspections`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    resetForm()
    setShowForm(false); setSubmitting(false); fetchInspections()
  }

  function resetForm() {
    setEditingInsp(null)
    setInspType('Foundation'); setTrade(''); setScheduledDate(''); setScheduledTime('')
    setInspectorName(''); setInspectorPhone(''); setSchedulingPhone(''); setSchedulerId(''); setNotes('')
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
    setScheduledTime(insp.scheduled_time ?? '')
    setInspectorName(insp.inspector_name ?? '')
    setInspectorPhone(insp.inspector_phone ?? '')
    setSchedulingPhone(insp.scheduling_phone ?? '')
    setSchedulerId(insp.scheduler_profile_id ?? '')
    setNotes(insp.notes ?? '')
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

  const pending = inspections.filter(i => i.status === 'requested' || i.status === 'not_scheduled' || i.status === 'scheduled' || i.status === 'pending_reinspection')
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
              {insp.scheduled_date ? `${new Date(insp.scheduled_date).toLocaleDateString()}${insp.scheduled_time ? ` ${insp.scheduled_time}` : ''}` : 'No date yet'}
              {insp.inspector_name && ` · ${insp.inspector_name}`}
              {insp.status === 'requested' && insp.scheduler_name && ` · ${insp.scheduler_name} to schedule`}
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
              {insp.scheduled_time && (
                <div><p className="text-xs text-faint">Time</p><p className="font-medium text-ink-soft">{insp.scheduled_time}</p></div>
              )}
              {insp.completed_date && (
                <div><p className="text-xs text-faint">Completed</p><p className="font-medium text-ink-soft">{new Date(insp.completed_date).toLocaleDateString()}</p></div>
              )}
              {insp.scheduler_name && (
                <div><p className="text-xs text-faint">Scheduler</p><p className="font-medium text-ink-soft">{insp.scheduler_name}</p></div>
              )}
              {insp.requested_by_name && (
                <div><p className="text-xs text-faint">Requested by</p><p className="font-medium text-ink-soft">{insp.requested_by_name}</p></div>
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

            {/* Add the inspector's card/paper after the inspection happens */}
            <div className="rounded-lg border border-dashed border-line-soft bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">{insp.card_image_url ? "Inspector's card attached" : "Inspector's card / paperwork"}</p>
                  <p className="text-xs text-faint">Upload the card you got from the inspector - AI reads it and fills the details.</p>
                </div>
                <input type="file" accept="image/*,application/pdf" className="sr-only"
                  ref={el => { cardInputRefs.current[insp.id] = el }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadCard(insp, f); e.target.value = '' }} />
                <button type="button" disabled={uploadingCardId === insp.id}
                  onClick={() => cardInputRefs.current[insp.id]?.click()}
                  className="flex items-center gap-2 rounded-md border border-muted2 bg-panel px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface hover:border-accent disabled:opacity-50">
                  {uploadingCardId === insp.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> {insp.card_image_url ? 'Replace card' : "Add inspector's card"}</>}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {insp.status === 'scheduled' && !insp.ready_marked_by && (
                <Button size="sm" variant="outline" onClick={() => markReady(insp)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Ready for Inspection
                </Button>
              )}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-faint">Update status:</span>
                {['requested', 'scheduled', 'passed', 'failed', 'pending_reinspection'].map(s => (
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
              <h2 className="font-semibold text-ink">{editingInsp ? 'Edit Inspection' : 'Request Inspection'}</h2>
              <button onClick={() => { setShowForm(false); setEditingInsp(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                {!editingInsp && (
                  <p className="rounded-lg bg-surface border border-line-soft px-3 py-2 text-xs text-muted-fg">
                    Request an inspection now. Once it happens, upload the inspector's card on the inspection to record the result.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspection Type</Label>
                    <SearchableSelect value={inspType} onChange={e => setInspType(e.target.value)} required
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. Electrical" value={trade} onChange={e => setTrade(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Preferred / Scheduled Date</Label>
                    <Input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time <span className="text-faint font-normal">(optional)</span></Label>
                    <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Who schedules this? <span className="text-faint font-normal">(they get notified)</span></Label>
                  <SearchableSelect value={schedulerId} onChange={e => setSchedulerId(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">No one assigned yet</option>
                    {teammates.map(t => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                  </SearchableSelect>
                  <p className="text-xs text-faint">Assign the person who books inspections - they'll get a notification to schedule it.</p>
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
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : editingInsp ? 'Save Changes' : 'Request Inspection'}</Button>
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
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Request Inspection</Button>
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
