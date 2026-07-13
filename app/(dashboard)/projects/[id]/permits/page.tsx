'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, FileCheck, FileText, ChevronDown, ChevronUp, Phone, Building, ExternalLink, Sparkles, Loader2, AlertCircle, Trash2, Pencil, Check, UserPlus } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'

const PERMIT_TYPES = [
  'Building', 'Electrical', 'Plumbing', 'Mechanical/HVAC',
  'Fire Protection', 'Fire Alarm', 'Sprinkler',
  'Demolition', 'Excavation', 'Grading',
  'Roofing', 'Siding', 'Windows/Doors',
  'Sewage/Septic', 'Stormwater', 'Utilities',
  'Fence/Wall', 'Pool/Spa', 'Solar',
  'Sign', 'Zoning/Land Use',
  'Notice of Commencement', 'Survey', 'Plans Review',
  'Other',
]
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warn-tint border-warn/30 text-warn',
  approved: 'bg-success-tint border-success/30 text-success',
  active: 'bg-info-tint border-info/30 text-info',
  recorded: 'bg-special-tint border-special/30 text-special',
  expired: 'bg-danger-tint border-danger/30 text-danger',
  rejected: 'bg-danger-tint border-danger/30 text-danger',
}

interface Permit {
  id: string; permit_type: string; permit_number: string | null; description: string | null
  status: string; issued_date: string | null; expiry_date: string | null
  issuing_authority: string | null; inspector_name: string | null; inspector_phone: string | null
  notes: string | null; file_url: string | null; created_at: string
}

export default function PermitsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [permits, setPermits] = useState<Permit[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form
  const [permitType, setPermitType] = useState('Building')
  const [permitNumber, setPermitNumber] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending')
  const [issuedDate, setIssuedDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [issuingAuthority, setIssuingAuthority] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorPhone, setInspectorPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [permitFile, setPermitFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  const [submitError, setSubmitError] = useState('')
  const [fetchError, setFetchError] = useState('')
  const [editingPermit, setEditingPermit] = useState<Permit | null>(null)

  // After saving a permit, offer to save a newly-typed inspector to contacts.
  const [contactPrompt, setContactPrompt] = useState<{ name: string; phone: string } | null>(null)
  const [contactSaving, setContactSaving] = useState(false)
  const [contactSaved, setContactSaved] = useState(false)

  async function maybePromptInspectorContact(name: string, phone: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const token = await getToken()
    // Check whether this inspector already exists in the directory
    const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const json = await res.json()
      const exists = (json.companies ?? []).some(
        (c: any) => c.type === 'inspector' && c.name?.trim().toLowerCase() === trimmed.toLowerCase()
      )
      if (exists) return
    }
    setContactSaved(false)
    setContactPrompt({ name: trimmed, phone: phone.trim() })
  }

  async function saveInspectorContact() {
    if (!contactPrompt) return
    setContactSaving(true)
    const token = await getToken()
    await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: contactPrompt.name,
        type: 'inspector',
        phone: contactPrompt.phone || null,
        contact_email: `noemail+${Date.now()}@placeholder.com`,
      }),
    })
    setContactSaving(false)
    setContactSaved(true)
    setTimeout(() => setContactPrompt(null), 1500)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchPermits() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/permits`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    if (res.ok) setPermits(json.permits ?? [])
    else setFetchError(json.error ?? `Error ${res.status}`)
    setLoading(false)
  }

  useEffect(() => { fetchPermits() }, [params.id])

  function resetForm() {
    setPermitType('Building'); setPermitNumber(''); setDescription(''); setStatus('pending')
    setIssuedDate(''); setExpiryDate(''); setIssuingAuthority('')
    setInspectorName(''); setInspectorPhone(''); setNotes(''); setPermitFile(null)
    setAnalyzeError(''); setEditingPermit(null)
  }

  function openEdit(permit: Permit) {
    setEditingPermit(permit)
    setPermitType(permit.permit_type)
    setPermitNumber(permit.permit_number ?? '')
    setDescription(permit.description ?? '')
    setStatus(permit.status)
    setIssuedDate(permit.issued_date ?? '')
    setExpiryDate(permit.expiry_date ?? '')
    setIssuingAuthority(permit.issuing_authority ?? '')
    setInspectorName(permit.inspector_name ?? '')
    setInspectorPhone(permit.inspector_phone ?? '')
    setNotes(permit.notes ?? '')
    setPermitFile(null)
    setAnalyzeError('')
    setShowForm(true)
  }

  async function handleDeletePermit(permitId: string) {
    if (!window.confirm('Delete this permit? This cannot be undone.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/permits/${permitId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchPermits()
  }

  async function analyzePermitImage(file: File) {
    setAnalyzing(true)
    setAnalyzeError('')
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/permits/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const data = await res.json()
    if (!res.ok || !data.fields) {
      setAnalyzeError(data.error ?? 'Analysis failed. Please fill in the fields manually.')
      setAnalyzing(false)
      return
    }
    const f = data.fields
    if (f.permit_type && PERMIT_TYPES.includes(f.permit_type)) setPermitType(f.permit_type)
    if (f.permit_number) setPermitNumber(f.permit_number)
    if (f.description) setDescription(f.description)
    if (f.status) setStatus(f.status)
    if (f.issued_date) setIssuedDate(f.issued_date)
    if (f.expiry_date) setExpiryDate(f.expiry_date)
    if (f.issuing_authority) setIssuingAuthority(f.issuing_authority)
    if (f.inspector_name) setInspectorName(f.inspector_name)
    if (f.inspector_phone) setInspectorPhone(f.inspector_phone)
    if (f.notes) setNotes(f.notes)
    setAnalyzing(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const token = await getToken()

    if (editingPermit) {
      const res = await fetch(`/api/projects/${params.id}/permits/${editingPermit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          permit_type: permitType,
          permit_number: permitNumber || null,
          description: description || null,
          status,
          issued_date: issuedDate || null,
          expiry_date: expiryDate || null,
          issuing_authority: issuingAuthority || null,
          inspector_name: inspectorName || null,
          inspector_phone: inspectorPhone || null,
          notes: notes || null,
        }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setSubmitError(json.error ?? `Save failed (${res.status})`)
        setSubmitting(false)
        return
      }
      setSubmitError('')
      const insName = inspectorName, insPhone = inspectorPhone
      resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
      maybePromptInspectorContact(insName, insPhone)
      return
    }

    const form = new FormData()
    form.append('permit_type', permitType)
    if (permitNumber) form.append('permit_number', permitNumber)
    if (description) form.append('description', description)
    form.append('status', status)
    if (issuedDate) form.append('issued_date', issuedDate)
    if (expiryDate) form.append('expiry_date', expiryDate)
    if (issuingAuthority) form.append('issuing_authority', issuingAuthority)
    if (inspectorName) form.append('inspector_name', inspectorName)
    if (inspectorPhone) form.append('inspector_phone', inspectorPhone)
    if (notes) form.append('notes', notes)
    if (permitFile) form.append('file', permitFile)
    const res = await fetch(`/api/projects/${params.id}/permits`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setSubmitError(json.error ?? `Save failed (${res.status})`)
      setSubmitting(false)
      return
    }
    setSubmitError('')
    const insName = inspectorName, insPhone = inspectorPhone
    resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
    maybePromptInspectorContact(insName, insPhone)
  }

  async function updateStatus(permitId: string, newStatus: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/permits/${permitId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    })
    fetchPermits()
  }

  const isExpiringSoon = (date: string | null) => {
    if (!date) return false
    const diff = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff > 0 && diff < 30
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Post-save: offer to save a newly-typed inspector to contacts */}
      {contactPrompt && (
        <div className="fixed bottom-4 right-4 z-[60] w-[calc(100%-2rem)] sm:w-96 rounded-xl border border-line bg-panel shadow-2xl p-4">
          {contactSaved ? (
            <p className="text-sm font-medium text-success flex items-center gap-2">
              <Check className="h-4 w-4" /> Added {contactPrompt.name} to contacts
            </p>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center shrink-0">
                  <UserPlus className="h-4 w-4 text-accent-fg" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Save inspector to contacts?</p>
                  <p className="text-xs text-muted-fg mt-0.5 truncate">
                    {contactPrompt.name}{contactPrompt.phone ? ` · ${contactPrompt.phone}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-3">
                <Button variant="outline" size="sm" onClick={() => setContactPrompt(null)}>Not now</Button>
                <Button size="sm" onClick={saveInspectorContact} disabled={contactSaving}>
                  {contactSaving ? 'Saving…' : 'Add contact'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-panel border-b border-line-soft px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editingPermit ? 'Edit Permit' : 'Add Permit'}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-6 space-y-4">
                {/* Upload first so AI fills the rest */}
                <div className="space-y-1.5">
                  <Label><Sparkles className="inline h-3.5 w-3.5 mr-1 text-accent-fg" />Upload Permit (AI Auto-Fill)</Label>
                  <label className={cn('flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm transition-colors cursor-pointer',
                      analyzing ? 'border-accent bg-accent-tint text-accent-fg pointer-events-none' :
                      permitFile ? 'border-green-300 bg-success-tint text-success' :
                      'border-accent/40 bg-accent-tint/40 text-accent-fg hover:border-accent')}>
                    {analyzing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Analyzing permit with AI - filling in fields...</span></>
                      : permitFile
                      ? <><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{permitFile.name}</span><span className="ml-auto text-xs text-success font-medium shrink-0">✓ Fields auto-filled</span></>
                      : <><Sparkles className="h-4 w-4" /><span className="font-medium">Upload a photo or PDF of your permit</span><span className="text-xs ml-1 text-accent-fg">- AI fills the fields automatically</span></>}
                    <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      setPermitFile(file)
                      if (file) analyzePermitImage(file)
                    }} />
                  </label>
                  {analyzeError && (
                    <p className="text-xs text-danger flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />{analyzeError}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line-soft" /></div>
                  <div className="relative flex justify-center"><span className="bg-panel px-2 text-xs text-faint">or fill in manually</span></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Permit Type</Label>
                    <SearchableSelect value={permitType} onChange={e => setPermitType(e.target.value)} required
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {PERMIT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Permit Number</Label>
                    <Input placeholder="e.g. 2024-EL-001234" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea rows={2} placeholder="What this permit covers..." value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <SearchableSelect value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      {['pending', 'approved', 'active', 'recorded', 'expired', 'rejected'].map(s => <option key={s}>{s}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date Issued</Label>
                    <Input type="date" value={issuedDate} onChange={e => setIssuedDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expiry Date</Label>
                    <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label><Building className="inline h-3.5 w-3.5 mr-1 text-faint" />Issuing Authority</Label>
                  <Input placeholder="e.g. NYC Department of Buildings" value={issuingAuthority} onChange={e => setIssuingAuthority(e.target.value)} />
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
                    <Input type="tel" placeholder="(555) 000-0000" value={inspectorPhone} onChange={e => setInspectorPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any additional notes..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="sticky bottom-0 bg-panel border-t border-line-soft px-4 sm:px-6 py-4 space-y-2">
                {submitError && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{submitError}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={submitting || analyzing}>
                  {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing...</> : submitting ? 'Saving...' : editingPermit ? 'Save Changes' : 'Add Permit'}
                </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Permits</h1>
          <p className="text-sm text-muted-fg mt-0.5">Project permits, approvals, and inspector contacts.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Permit</Button>
      </div>

      {fetchError && (
        <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Could not load permits: <strong>{fetchError}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : permits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <FileCheck className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No permits added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {permits.map(permit => {
            const isExpanded = expanded === permit.id
            const expiring = isExpiringSoon(permit.expiry_date)
            return (
              <div key={permit.id} className="rounded-xl border border-line bg-panel overflow-hidden">
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : permit.id)}>
                  <FileCheck className="h-5 w-5 text-faint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-ink">{permit.permit_type}</span>
                      {permit.permit_number && <span className="text-xs font-mono text-muted-fg">#{permit.permit_number}</span>}
                      <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[permit.status] ?? STATUS_COLORS.pending)}>
                        {permit.status}
                      </span>
                      {expiring && <span className="text-xs font-medium bg-danger-tint border border-danger/30 text-danger rounded-full px-2 py-0.5">Expiring soon</span>}
                    </div>
                    <p className="text-xs text-muted-fg mt-0.5 truncate">
                      {permit.description
                        ? <span className="text-muted-fg font-medium">{permit.description}</span>
                        : null}
                      {permit.description && (permit.issuing_authority || permit.expiry_date) && <span className="text-faint mx-1">·</span>}
                      {permit.issuing_authority}
                      {permit.expiry_date && ` · Expires ${new Date(permit.expiry_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  {permit.file_url && <FileText className="h-4 w-4 text-accent-fg shrink-0" />}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-line-soft px-5 py-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {permit.issued_date && <div><p className="text-xs text-faint">Issued</p><p className="font-medium text-ink-soft">{new Date(permit.issued_date).toLocaleDateString()}</p></div>}
                      {permit.expiry_date && <div><p className="text-xs text-faint">Expires</p><p className={cn('font-medium', expiring ? 'text-danger' : 'text-ink-soft')}>{new Date(permit.expiry_date).toLocaleDateString()}</p></div>}
                      {permit.issuing_authority && <div><p className="text-xs text-faint">Issued By</p><p className="font-medium text-ink-soft">{permit.issuing_authority}</p></div>}
                      {permit.inspector_name && (
                        <div>
                          <p className="text-xs text-faint">Inspector</p>
                          <p className="font-medium text-ink-soft">{permit.inspector_name}</p>
                          {permit.inspector_phone && (
                            <a href={`tel:${permit.inspector_phone}`} className="flex items-center gap-1 text-xs text-accent-fg hover:underline mt-0.5">
                              <Phone className="h-3 w-3" />{permit.inspector_phone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {permit.description && <p className="text-sm text-muted-fg break-words">{permit.description}</p>}
                    {permit.notes && <div className="rounded-lg bg-surface border border-line-soft px-3 py-2 text-sm text-muted-fg">{permit.notes}</div>}
                    <div className="flex items-center gap-2 flex-wrap">
                      {permit.file_url && (
                        <a href={permit.file_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /> View Document</Button>
                        </a>
                      )}
                      <SearchableSelect value={permit.status} onChange={e => updateStatus(permit.id, e.target.value)}
                        className="rounded-md border border-muted2 px-2 py-1.5 text-xs bg-panel focus:border-accent focus:outline-none">
                        {['pending', 'approved', 'active', 'recorded', 'expired', 'rejected'].map(s => <option key={s}>{s}</option>)}
                      </SearchableSelect>
                      <button onClick={() => openEdit(permit)} className="text-faint hover:text-muted-fg p-1" title="Edit permit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDeletePermit(permit.id)} className="text-danger hover:text-danger p-1" title="Delete permit">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
