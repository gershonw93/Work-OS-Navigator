'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, FileCheck, FileText, ChevronDown, ChevronUp, Phone, Building, ExternalLink, Sparkles, Loader2, AlertCircle, Trash2, Pencil } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'

const PERMIT_TYPES = ['Building', 'Electrical', 'Plumbing', 'Mechanical/HVAC', 'Fire Protection', 'Demolition', 'Excavation', 'Roofing', 'Sign', 'Other']
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-50 border-amber-200 text-amber-700',
  approved: 'bg-green-50 border-green-200 text-green-700',
  active: 'bg-blue-50 border-blue-200 text-blue-700',
  expired: 'bg-red-50 border-red-200 text-red-700',
  rejected: 'bg-red-50 border-red-200 text-red-700',
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
      resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
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
    resetForm(); setShowForm(false); setSubmitting(false); fetchPermits()
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
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{editingPermit ? 'Edit Permit' : 'Add Permit'}</h2>
              <button onClick={() => { setShowForm(false); resetForm() }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-6 space-y-4">
                {/* Upload first so AI fills the rest */}
                <div className="space-y-1.5">
                  <Label><Sparkles className="inline h-3.5 w-3.5 mr-1 text-orange-400" />Upload Permit (AI Auto-Fill)</Label>
                  <div onClick={() => fileRef.current?.click()}
                    className={cn('flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm transition-colors cursor-pointer',
                      analyzing ? 'border-orange-300 bg-orange-50 text-orange-600' :
                      permitFile ? 'border-green-300 bg-green-50 text-green-700' :
                      'border-orange-200 bg-orange-50/40 text-orange-500 hover:border-orange-400')}>
                    {analyzing
                      ? <><Loader2 className="h-4 w-4 animate-spin" /><span>Analyzing permit with AI — filling in fields...</span></>
                      : permitFile
                      ? <><FileText className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{permitFile.name}</span><span className="ml-auto text-xs text-green-600 font-medium shrink-0">✓ Fields auto-filled</span></>
                      : <><Sparkles className="h-4 w-4" /><span className="font-medium">Upload a photo or scan of your permit</span><span className="text-xs ml-1 text-orange-400">— AI fills the fields automatically</span></>}
                  </div>
                  <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => {
                      const file = e.target.files?.[0] ?? null
                      setPermitFile(file)
                      if (file && file.type.startsWith('image/')) analyzePermitImage(file)
                    }} />
                  {analyzeError && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />{analyzeError}
                    </p>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-slate-400">or fill in manually</span></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Permit Type</Label>
                    <select value={permitType} onChange={e => setPermitType(e.target.value)} required
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      {PERMIT_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Permit Number</Label>
                    <Input placeholder="e.g. 2024-EL-001234" value={permitNumber} onChange={e => setPermitNumber(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea rows={2} placeholder="What this permit covers..." value={description} onChange={e => setDescription(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label>Status</Label>
                    <select value={status} onChange={e => setStatus(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      {['pending', 'approved', 'active', 'expired', 'rejected'].map(s => <option key={s}>{s}</option>)}
                    </select>
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
                  <Label><Building className="inline h-3.5 w-3.5 mr-1 text-slate-400" />Issuing Authority</Label>
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
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 sm:px-6 py-4 space-y-2">
                {submitError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{submitError}</p>}
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
          <h1 className="text-2xl font-bold text-slate-900">Permits</h1>
          <p className="text-sm text-slate-500 mt-0.5">Project permits, approvals, and inspector contacts.</p>
        </div>
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Add Permit</Button>
      </div>

      {fetchError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Could not load permits: <strong>{fetchError}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : permits.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <FileCheck className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No permits added yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {permits.map(permit => {
            const isExpanded = expanded === permit.id
            const expiring = isExpiringSoon(permit.expiry_date)
            return (
              <div key={permit.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => setExpanded(isExpanded ? null : permit.id)}>
                  <FileCheck className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{permit.permit_type}</span>
                      {permit.permit_number && <span className="text-xs font-mono text-slate-500">#{permit.permit_number}</span>}
                      <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', STATUS_COLORS[permit.status] ?? STATUS_COLORS.pending)}>
                        {permit.status}
                      </span>
                      {expiring && <span className="text-xs font-medium bg-red-50 border border-red-200 text-red-600 rounded-full px-2 py-0.5">Expiring soon</span>}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {permit.issuing_authority ?? '—'}
                      {permit.expiry_date && ` · Expires ${new Date(permit.expiry_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  {permit.file_url && <FileText className="h-4 w-4 text-orange-400 shrink-0" />}
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {permit.issued_date && <div><p className="text-xs text-slate-400">Issued</p><p className="font-medium text-slate-700">{new Date(permit.issued_date).toLocaleDateString()}</p></div>}
                      {permit.expiry_date && <div><p className="text-xs text-slate-400">Expires</p><p className={cn('font-medium', expiring ? 'text-red-600' : 'text-slate-700')}>{new Date(permit.expiry_date).toLocaleDateString()}</p></div>}
                      {permit.issuing_authority && <div><p className="text-xs text-slate-400">Issued By</p><p className="font-medium text-slate-700">{permit.issuing_authority}</p></div>}
                      {permit.inspector_name && (
                        <div>
                          <p className="text-xs text-slate-400">Inspector</p>
                          <p className="font-medium text-slate-700">{permit.inspector_name}</p>
                          {permit.inspector_phone && (
                            <a href={`tel:${permit.inspector_phone}`} className="flex items-center gap-1 text-xs text-orange-600 hover:underline mt-0.5">
                              <Phone className="h-3 w-3" />{permit.inspector_phone}
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    {permit.description && <p className="text-sm text-slate-600 break-words">{permit.description}</p>}
                    {permit.notes && <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm text-slate-600">{permit.notes}</div>}
                    <div className="flex items-center gap-2 flex-wrap">
                      {permit.file_url && (
                        <a href={permit.file_url} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /> View Document</Button>
                        </a>
                      )}
                      <select value={permit.status} onChange={e => updateStatus(permit.id, e.target.value)}
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs bg-white focus:border-orange-500 focus:outline-none">
                        {['pending', 'approved', 'active', 'expired', 'rejected'].map(s => <option key={s}>{s}</option>)}
                      </select>
                      <button onClick={() => openEdit(permit)} className="text-slate-400 hover:text-slate-600 p-1" title="Edit permit">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDeletePermit(permit.id)} className="text-red-400 hover:text-red-600 p-1" title="Delete permit">
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
