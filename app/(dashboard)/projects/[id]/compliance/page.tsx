'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatCard } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import { ShieldCheck, Upload, RefreshCw, X, AlertTriangle, CheckCircle2, FileWarning, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = 'coi' | 'license' | 'w9' | 'workers_comp' | 'other'
type DocStatus = 'missing' | 'pending' | 'approved' | 'expired' | 'expiring_soon' | 'optional'

interface ComplianceDoc {
  id: string
  company_id: string
  project_id: string
  type: DocType
  status: DocStatus
  expiry_date: string | null
  notes: string | null
  file_url: string | null
  created_at: string
}

interface Sub {
  id: string
  companies: { id: string; name: string; type?: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES: DocType[] = ['coi', 'license', 'w9', 'workers_comp', 'other']

// Which docs each vendor type needs. Suppliers (materials) usually only need a W-9.
function docTypesFor(companyType?: string): DocType[] {
  if (companyType === 'supplier') return ['w9', 'coi', 'other']
  return DOC_TYPES
}
function requiredDocsFor(companyType?: string): DocType[] {
  if (companyType === 'supplier') return ['w9']                 // COI/Other optional
  return ['coi', 'license', 'w9', 'workers_comp']               // Other optional
}

const DOC_LABELS: Record<DocType, string> = {
  coi: 'COI',
  license: 'License',
  w9: 'W-9',
  workers_comp: "Workers' Comp",
  other: 'Other',
}

const STATUS_CONFIG: Record<DocStatus, { label: string; classes: string }> = {
  missing:       { label: 'Missing',        classes: 'bg-danger-tint text-danger' },
  pending:       { label: 'Pending',        classes: 'bg-warn-tint text-warn' },
  approved:      { label: 'Approved',       classes: 'bg-success-tint text-success' },
  expired:       { label: 'Expired',        classes: 'bg-danger-tint text-danger' },
  expiring_soon: { label: 'Expiring Soon',  classes: 'bg-accent-tint text-accent-fg' },
  optional:      { label: '—',              classes: 'bg-transparent text-faint' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function worstStatus(statuses: DocStatus[]): DocStatus {
  const priority: DocStatus[] = ['missing', 'expired', 'expiring_soon', 'pending', 'approved']
  for (const s of priority) {
    if (statuses.includes(s)) return s
  }
  return 'approved'
}

function cardChip(status: DocStatus) {
  if (status === 'approved') return { label: 'All Good', classes: 'bg-success-tint text-success' }
  if (status === 'expiring_soon') return { label: 'Expiring Soon', classes: 'bg-accent-tint text-accent-fg' }
  return { label: 'Action Required', classes: 'bg-danger-tint text-danger' }
}

function isExpiringSoon(expiry: string | null): boolean {
  if (!expiry) return false
  const diff = new Date(expiry).getTime() - Date.now()
  return diff > 0 && diff <= 30 * 24 * 60 * 60 * 1000
}

// ─── Upload Form ──────────────────────────────────────────────────────────────

interface UploadFormProps {
  projectId: string
  companyId: string
  companyName: string
  docType: DocType
  existingDoc: ComplianceDoc | null
  token: string
  onClose: () => void
  onSaved: () => void
}

function UploadForm({
  projectId, companyId, companyName, docType, existingDoc, token, onClose, onSaved,
}: UploadFormProps) {
  const [expiryDate, setExpiryDate] = useState(existingDoc?.expiry_date?.slice(0, 10) ?? '')
  const [notes, setNotes] = useState(existingDoc?.notes ?? '')
  const [fileUrl, setFileUrl] = useState(existingDoc?.file_url ?? '')
  const [status, setStatus] = useState<DocStatus>(existingDoc?.status ?? 'pending')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [scanned, setScanned] = useState(false)
  // COI fields
  const [insurer, setInsurer] = useState((existingDoc as any)?.insurer ?? '')
  const [policyNumber, setPolicyNumber] = useState((existingDoc as any)?.policy_number ?? '')
  const [glPerOccurrence, setGlPerOccurrence] = useState((existingDoc as any)?.gl_per_occurrence ?? '')
  const [glAggregate, setGlAggregate] = useState((existingDoc as any)?.gl_aggregate ?? '')
  const [autoLimit, setAutoLimit] = useState((existingDoc as any)?.auto_limit ?? '')
  const [umbrellaLimit, setUmbrellaLimit] = useState((existingDoc as any)?.umbrella_limit ?? '')
  const [wcElAccident, setWcElAccident] = useState((existingDoc as any)?.wc_el_accident ?? '')
  const [additionalInsured, setAdditionalInsured] = useState<boolean | null>((existingDoc as any)?.additional_insured ?? null)
  // License fields
  const [licenseNumber, setLicenseNumber] = useState((existingDoc as any)?.license_number ?? '')
  const [licenseType, setLicenseType] = useState((existingDoc as any)?.license_type ?? '')
  const [issuingState, setIssuingState] = useState((existingDoc as any)?.issuing_state ?? '')
  // W-9 fields
  const [entityType, setEntityType] = useState((existingDoc as any)?.entity_type ?? '')
  const [einLast4, setEinLast4] = useState((existingDoc as any)?.ein_last4 ?? '')
  // Workers comp fields
  const [wcCarrier, setWcCarrier] = useState((existingDoc as any)?.wc_carrier ?? '')
  const [wcPolicyNumber, setWcPolicyNumber] = useState((existingDoc as any)?.wc_policy_number ?? '')
  const [wcElDiseaseLimit, setWcElDiseaseLimit] = useState((existingDoc as any)?.wc_el_disease_limit ?? '')

  async function analyzeDoc(f: File) {
    setAnalyzing(true); setAnalyzeError(''); setScanned(false)
    setFile(f)
    const fd = new FormData()
    fd.append('file', f)
    const res = await fetch(`/api/projects/${projectId}/compliance/analyze`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    setAnalyzing(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setAnalyzeError(e.error ?? 'Could not analyze document')
      return
    }
    const { fields: f2, file_url } = await res.json()
    if (file_url) setFileUrl(file_url)
    if (f2.expiry_date) setExpiryDate(f2.expiry_date)
    if (f2.status && ['pending', 'approved', 'expired'].includes(f2.status)) setStatus(f2.status as DocStatus)
    // COI
    if (f2.insurer) setInsurer(f2.insurer)
    if (f2.policy_number) setPolicyNumber(f2.policy_number)
    if (f2.gl_per_occurrence) setGlPerOccurrence(String(f2.gl_per_occurrence))
    if (f2.gl_aggregate) setGlAggregate(String(f2.gl_aggregate))
    if (f2.auto_limit) setAutoLimit(String(f2.auto_limit))
    if (f2.umbrella_limit) setUmbrellaLimit(String(f2.umbrella_limit))
    if (f2.wc_el_accident) setWcElAccident(String(f2.wc_el_accident))
    if (f2.additional_insured != null) setAdditionalInsured(f2.additional_insured)
    // License
    if (f2.license_number) setLicenseNumber(f2.license_number)
    if (f2.license_type) setLicenseType(f2.license_type)
    if (f2.issuing_state) setIssuingState(f2.issuing_state)
    // W-9
    if (f2.entity_type) setEntityType(f2.entity_type)
    if (f2.ein_last4) setEinLast4(f2.ein_last4)
    // Workers comp
    if (f2.wc_carrier) setWcCarrier(f2.wc_carrier)
    if (f2.wc_policy_number) setWcPolicyNumber(f2.wc_policy_number)
    if (f2.wc_el_disease_limit) setWcElDiseaseLimit(String(f2.wc_el_disease_limit))
    // Notes
    if (f2.notes) setNotes(f2.notes)
    setScanned(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    // Build a structured summary line from type-specific fields
    let structuredSummary = ''
    if (docType === 'coi') {
      const parts = []
      if (glPerOccurrence) parts.push(`GL $${Number(glPerOccurrence).toLocaleString()}`)
      if (glAggregate) parts.push(`Agg $${Number(glAggregate).toLocaleString()}`)
      if (autoLimit) parts.push(`Auto $${Number(autoLimit).toLocaleString()}`)
      if (umbrellaLimit) parts.push(`Umbrella $${Number(umbrellaLimit).toLocaleString()}`)
      if (wcElAccident) parts.push(`WC/EL $${Number(wcElAccident).toLocaleString()}`)
      if (insurer) parts.push(`Insurer: ${insurer}`)
      if (policyNumber) parts.push(`Policy: ${policyNumber}`)
      if (additionalInsured != null) parts.push(`Add'l Insured: ${additionalInsured ? 'Yes' : 'No'}`)
      structuredSummary = parts.join(' · ')
    } else if (docType === 'license') {
      const parts = []
      if (licenseType) parts.push(licenseType)
      if (licenseNumber) parts.push(`#${licenseNumber}`)
      if (issuingState) parts.push(issuingState)
      structuredSummary = parts.join(' · ')
    } else if (docType === 'w9') {
      const parts = []
      if (entityType) parts.push(entityType.replace('_', ' '))
      if (einLast4) parts.push(`EIN …${einLast4}`)
      structuredSummary = parts.join(' · ')
    } else if (docType === 'workers_comp') {
      const parts = []
      if (wcCarrier) parts.push(wcCarrier)
      if (wcPolicyNumber) parts.push(`Policy: ${wcPolicyNumber}`)
      if (wcElAccident) parts.push(`EL/Accident $${Number(wcElAccident).toLocaleString()}`)
      structuredSummary = parts.join(' · ')
    }
    const combinedNotes = [structuredSummary, notes].filter(Boolean).join('\n') || null

    const body = {
      company_id: companyId,
      type: docType,
      status,
      expiry_date: expiryDate || null,
      notes: combinedNotes,
      file_url: fileUrl || null,
    }

    const res = await fetch(`/api/projects/${projectId}/compliance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      const data = await res.json()
      setError(data.error ?? 'Failed to save')
    }
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-soft">
          {existingDoc ? 'Update' : 'Upload'} {DOC_LABELS[docType]} — {companyName}
        </p>
        <button onClick={onClose} className="text-faint hover:text-muted-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Status */}
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <div className="flex flex-wrap gap-2">
            {(['pending', 'approved', 'expired'] as DocStatus[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  status === s
                    ? STATUS_CONFIG[s].classes + ' border-transparent'
                    : 'border-line text-muted-fg hover:border-muted2',
                )}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry date */}
        <div className="space-y-1">
          <Label htmlFor="expiry" className="text-xs">Expiry Date <span className="text-faint font-normal">(optional)</span></Label>
          <Input
            id="expiry"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Type-specific fields */}
        {docType === 'coi' && (
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <p className="text-xs font-semibold text-ink-soft">Coverage Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Insurer</Label>
                <Input className="h-8 text-xs" placeholder="e.g. Liberty Mutual" value={insurer} onChange={e => setInsurer(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Policy Number</Label>
                <Input className="h-8 text-xs" placeholder="e.g. GL-123456" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">GL Per Occurrence</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                  <Input className="h-8 text-xs pl-5" placeholder="1,000,000" value={glPerOccurrence} onChange={e => setGlPerOccurrence(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">GL Aggregate</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                  <Input className="h-8 text-xs pl-5" placeholder="2,000,000" value={glAggregate} onChange={e => setGlAggregate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Auto Liability</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                  <Input className="h-8 text-xs pl-5" placeholder="1,000,000" value={autoLimit} onChange={e => setAutoLimit(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Umbrella/Excess</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                  <Input className="h-8 text-xs pl-5" placeholder="2,000,000" value={umbrellaLimit} onChange={e => setUmbrellaLimit(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">WC / EL Per Accident</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                  <Input className="h-8 text-xs pl-5" placeholder="1,000,000" value={wcElAccident} onChange={e => setWcElAccident(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Additional Insured</Label>
                <div className="flex gap-2 pt-1">
                  {([true, false] as const).map(v => (
                    <button key={String(v)} type="button" onClick={() => setAdditionalInsured(v)}
                      className={cn('rounded-full border px-3 py-0.5 text-xs font-medium transition-colors',
                        additionalInsured === v ? 'bg-slate-800 text-white border-slate-800' : 'border-line text-muted-fg')}>
                      {v ? 'Yes' : 'No'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {docType === 'license' && (
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <p className="text-xs font-semibold text-ink-soft">License Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">License Number</Label>
                <Input className="h-8 text-xs" placeholder="e.g. LIC-123456" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Issuing State</Label>
                <Input className="h-8 text-xs" placeholder="e.g. NY" maxLength={2} value={issuingState} onChange={e => setIssuingState(e.target.value.toUpperCase())} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">License Type</Label>
              <Input className="h-8 text-xs" placeholder="e.g. General Contractor, Electrical" value={licenseType} onChange={e => setLicenseType(e.target.value)} />
            </div>
          </div>
        )}

        {docType === 'w9' && (
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <p className="text-xs font-semibold text-ink-soft">W-9 Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Entity Type</Label>
                <SearchableSelect className="h-8 w-full rounded-md border border-muted2 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  value={entityType} onChange={e => setEntityType(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="individual">Individual / Sole Prop</option>
                  <option value="llc">LLC</option>
                  <option value="corporation">Corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="other">Other</option>
                </SearchableSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">EIN (last 4)</Label>
                <Input className="h-8 text-xs" placeholder="e.g. 1234" maxLength={4} value={einLast4} onChange={e => setEinLast4(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {docType === 'workers_comp' && (
          <div className="space-y-3 rounded-lg border border-line bg-panel p-3">
            <p className="text-xs font-semibold text-ink-soft">Workers' Comp Details</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Carrier</Label>
                <Input className="h-8 text-xs" placeholder="e.g. State Farm" value={wcCarrier} onChange={e => setWcCarrier(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Policy Number</Label>
                <Input className="h-8 text-xs" placeholder="e.g. WC-987654" value={wcPolicyNumber} onChange={e => setWcPolicyNumber(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">EL Per Accident</Label>
              <div className="relative">
                <span className="absolute left-2.5 top-1.5 text-faint text-xs">$</span>
                <Input className="h-8 text-xs pl-5" placeholder="1,000,000" value={wcElAccident} onChange={e => setWcElAccident(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* AI Scan */}
        <div className={cn('rounded-lg border p-3 space-y-2', scanned ? 'border-success/30 bg-success-tint' : 'border-accent/40 bg-accent-tint')}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink-soft">🤖 Scan with AI</span>
            <span className="text-xs text-muted-fg">— upload the document and Claude extracts expiry, status &amp; coverage</span>
          </div>
          <label className={cn(
            'flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors text-sm font-medium',
            analyzing ? 'border-accent bg-panel text-accent-fg' :
            scanned ? 'border-green-300 bg-panel text-success' :
            'border-accent bg-panel text-accent-fg hover:bg-accent-tint'
          )}>
            {analyzing ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Scanning document…
              </>
            ) : scanned ? (
              <>✓ Scanned — fields auto-filled. Choose another to re-scan.</>
            ) : (
              <><Upload className="h-4 w-4" /> Choose PDF or image to scan</>
            )}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) analyzeDoc(f)
                else setFile(null)
              }}
            />
          </label>
          {analyzeError && <p className="text-xs text-danger">{analyzeError}</p>}
        </div>

        {/* File URL */}
        <div className="space-y-1">
          <Label htmlFor="file_url" className="text-xs">File URL <span className="text-faint font-normal">(optional — paste a link to the stored doc)</span></Label>
          <Input
            id="file_url"
            type="url"
            placeholder="https://..."
            value={fileUrl}
            onChange={(e) => setFileUrl(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Notes */}
        <div className="space-y-1">
          <Label htmlFor="notes" className="text-xs">Notes <span className="text-faint font-normal">(optional)</span></Label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this document..."
            className="w-full rounded-md border border-muted2 px-3 py-1.5 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent resize-none"
          />
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="h-7 text-xs px-3">
            Cancel
          </Button>
          <Button type="submit" disabled={saving} className="h-7 text-xs px-3">
            {saving ? 'Saving...' : existingDoc ? 'Update' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}

// ─── Sub Card ─────────────────────────────────────────────────────────────────

interface SubCardProps {
  sub: Sub
  docs: ComplianceDoc[]
  projectId: string
  token: string
  onRefresh: () => void
}

function SubCard({ sub, docs, projectId, token, onRefresh }: SubCardProps) {
  const [openForm, setOpenForm] = useState<DocType | null>(null)
  const companyId = sub.companies?.id ?? ''
  const companyName = sub.companies?.name ?? 'Unknown'
  const companyType = sub.companies?.type
  const visibleDocs = docTypesFor(companyType)
  const requiredDocs = requiredDocsFor(companyType)

  function getDoc(type: DocType): ComplianceDoc | null {
    return docs.find((d) => d.company_id === companyId && d.type === type) ?? null
  }

  function resolveStatus(type: DocType): DocStatus {
    const doc = getDoc(type)
    if (!doc) return requiredDocs.includes(type) ? 'missing' : 'optional'
    if (doc.status === 'expired' && doc.expiry_date && new Date(doc.expiry_date + 'T00:00:00') > new Date()) return isExpiringSoon(doc.expiry_date) ? 'expiring_soon' : 'approved'
    if (doc.status === 'approved' && isExpiringSoon(doc.expiry_date)) return 'expiring_soon'
    return doc.status
  }

  // Only required docs drive the card's overall status
  const allStatuses = requiredDocs.map(resolveStatus)
  const worst = worstStatus(allStatuses)
  const chip = cardChip(worst)

  return (
    <div className="rounded-xl border border-line bg-panel overflow-hidden">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-4 border-b border-line-soft">
        <h3 className="font-semibold text-ink">{companyName}</h3>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', chip.classes)}>
          {chip.label}
        </span>
      </div>

      {/* Doc table */}
      <table className="w-full text-sm">
        <thead className="bg-surface border-b border-line-soft">
          <tr>
            <th className="text-left px-5 py-2.5 font-medium text-muted-fg text-xs">Document</th>
            <th className="text-left px-5 py-2.5 font-medium text-muted-fg text-xs">Status</th>
            <th className="text-left px-5 py-2.5 font-medium text-muted-fg text-xs">Expires</th>
            <th className="text-left px-5 py-2.5 font-medium text-muted-fg text-xs">File</th>
            <th className="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {visibleDocs.map((type) => {
            const doc = getDoc(type)
            const status = resolveStatus(type)
            const cfg = STATUS_CONFIG[status]
            return (
              <tr key={type}>
                <td className="px-5 py-3 text-ink-soft font-medium">{DOC_LABELS[type]}</td>
                <td className="px-5 py-3">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', cfg.classes)}>
                    {status === 'expiring_soon' && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                    {cfg.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-xs text-faint">
                  {doc?.expiry_date
                    ? new Date(doc.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—'}
                </td>
                <td className="px-5 py-3">
                  {doc?.file_url
                    ? <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline font-medium"><ExternalLink className="h-3 w-3" /> View</a>
                    : <span className="text-xs text-faint">—</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setOpenForm(openForm === type ? null : type)}
                    className={cn('flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ml-auto',
                      openForm === type ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}
                  >
                    {doc ? <><RefreshCw className="h-3 w-3" /> Update</> : <><Upload className="h-3 w-3" /> Upload</>}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {/* Inline upload form (below table) */}
      {openForm && (
        <div className="px-5 pb-5 pt-2">
          <UploadForm
            projectId={projectId}
            companyId={companyId}
            companyName={companyName}
            docType={openForm}
            existingDoc={getDoc(openForm)}
            token={token}
            onClose={() => setOpenForm(null)}
            onSaved={onRefresh}
          />
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompliancePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [subs, setSubs] = useState<Sub[]>([])
  const [docs, setDocs] = useState<ComplianceDoc[]>([])
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    const t = await getToken()
    setToken(t)

    const res = await fetch(`/api/projects/${params.id}/compliance`, {
      headers: { Authorization: `Bearer ${t}` },
    })

    if (res.ok) {
      const json = await res.json()
      setSubs(json.subcontracts ?? [])
      setDocs(json.docs ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  // ── Summary stats ──────────────────────────────────────────────────────────
  function resolveStatus(companyId: string, type: DocType): DocStatus {
    const doc = docs.find((d) => d.company_id === companyId && d.type === type)
    if (!doc) return 'missing'
    if (doc.status === 'expired' && doc.expiry_date && new Date(doc.expiry_date + 'T00:00:00') > new Date()) return isExpiringSoon(doc.expiry_date) ? 'expiring_soon' : 'approved'
    if (doc.status === 'approved' && isExpiringSoon(doc.expiry_date)) return 'expiring_soon'
    return doc.status
  }

  const totalSubs = subs.length
  const reqFor = (s: Sub) => requiredDocsFor(s.companies?.type)
  const allCompliant = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return reqFor(s).every((t) => resolveStatus(id, t) === 'approved')
  }).length
  const expiringSoon = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return reqFor(s).some((t) => resolveStatus(id, t) === 'expiring_soon')
  }).length
  const missingDocs = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return reqFor(s).some((t) => resolveStatus(id, t) === 'missing')
  }).length

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">Compliance</h1>
        <p className="text-sm text-muted-fg mt-0.5">
          Track insurance, licenses, and required documents for each subcontractor.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-16 text-center">Loading...</div>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No subcontractors yet</p>
          <p className="text-xs text-faint mt-1">
            Once subcontracts are awarded you'll track COI, license, W-9, and workers' comp documents here.
          </p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Total Subs"
              value={totalSubs}
              icon={ShieldCheck}
              iconColor="text-muted-fg"
            />
            <StatCard
              label="All Compliant"
              value={allCompliant}
              icon={CheckCircle2}
              iconColor="text-success"
            />
            <StatCard
              label="Expiring Soon"
              value={expiringSoon}
              icon={AlertTriangle}
              iconColor="text-accent-fg"
            />
            <StatCard
              label="Missing Docs"
              value={missingDocs}
              icon={FileWarning}
              iconColor="text-danger"
            />
          </div>

          {/* Expiring / expired alerts */}
          {(() => {
            const companyName = (cid: string) => subs.find(s => s.companies?.id === cid)?.companies?.name ?? 'Unknown'
            const now = Date.now()
            const flagged = docs
              .filter(d => d.expiry_date)
              .map(d => {
                const days = Math.ceil((new Date(d.expiry_date + 'T00:00:00').getTime() - now) / 86400000)
                return { d, days }
              })
              .filter(({ days }) => days <= 30)
              .sort((a, b) => a.days - b.days)
            if (flagged.length === 0) return null
            return (
              <div className="rounded-xl border border-warn/30 bg-warn-tint px-4 py-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warn" />
                  <span className="text-sm font-semibold text-warn">
                    {flagged.length} document{flagged.length !== 1 ? 's' : ''} need attention
                  </span>
                </div>
                <div className="space-y-1">
                  {flagged.map(({ d, days }) => (
                    <div key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="text-ink-soft">
                        <span className="font-medium">{companyName(d.company_id)}</span>
                        <span className="text-muted-fg"> · {DOC_LABELS[d.type] ?? d.type}</span>
                      </span>
                      <span className={cn('text-xs font-medium', days < 0 ? 'text-danger' : 'text-warn')}>
                        {days < 0 ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago` : days === 0 ? 'Expires today' : `Expires in ${days} day${days !== 1 ? 's' : ''}`}
                        {d.expiry_date && <span className="text-faint"> · {new Date(d.expiry_date + 'T00:00:00').toLocaleDateString()}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Per-sub cards */}
          <div className="space-y-4">
            {subs.map((sub) => (
              <SubCard
                key={sub.id}
                sub={sub}
                docs={docs}
                projectId={params.id}
                token={token}
                onRefresh={fetchData}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
