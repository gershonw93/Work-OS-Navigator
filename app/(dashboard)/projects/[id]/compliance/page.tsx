'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { StatCard } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils'
import { ShieldCheck, Upload, RefreshCw, X, AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = 'coi' | 'license' | 'w9' | 'workers_comp' | 'other'
type DocStatus = 'missing' | 'pending' | 'approved' | 'expired' | 'expiring_soon'

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
  companies: { id: string; name: string } | null
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPES: DocType[] = ['coi', 'license', 'w9', 'workers_comp', 'other']

const DOC_LABELS: Record<DocType, string> = {
  coi: 'COI',
  license: 'License',
  w9: 'W-9',
  workers_comp: "Workers' Comp",
  other: 'Other',
}

const STATUS_CONFIG: Record<DocStatus, { label: string; classes: string }> = {
  missing:       { label: 'Missing',        classes: 'bg-red-100 text-red-700' },
  pending:       { label: 'Pending',        classes: 'bg-amber-100 text-amber-700' },
  approved:      { label: 'Approved',       classes: 'bg-green-100 text-green-700' },
  expired:       { label: 'Expired',        classes: 'bg-red-100 text-red-700' },
  expiring_soon: { label: 'Expiring Soon',  classes: 'bg-orange-100 text-orange-700' },
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
  if (status === 'approved') return { label: 'All Good', classes: 'bg-green-100 text-green-700' }
  if (status === 'expiring_soon') return { label: 'Expiring Soon', classes: 'bg-orange-100 text-orange-700' }
  return { label: 'Action Required', classes: 'bg-red-100 text-red-700' }
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
    const { fields: f2 } = await res.json()
    if (f2.expiry_date) setExpiryDate(f2.expiry_date)
    if (f2.status && ['pending', 'approved', 'expired'].includes(f2.status)) setStatus(f2.status as DocStatus)
    const noteParts = [f2.coverage_summary, f2.notes].filter(Boolean)
    if (noteParts.length > 0) setNotes(noteParts.join('\n'))
    setScanned(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')

    const body = {
      company_id: companyId,
      type: docType,
      status,
      expiry_date: expiryDate || null,
      notes: notes || null,
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
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">
          {existingDoc ? 'Update' : 'Upload'} {DOC_LABELS[docType]} — {companyName}
        </p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
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
                    : 'border-slate-200 text-slate-500 hover:border-slate-300',
                )}
              >
                {STATUS_CONFIG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry date */}
        <div className="space-y-1">
          <Label htmlFor="expiry" className="text-xs">Expiry Date <span className="text-slate-400 font-normal">(optional)</span></Label>
          <Input
            id="expiry"
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* AI Scan */}
        <div className={cn('rounded-lg border p-3 space-y-2', scanned ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50')}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">🤖 Scan with AI</span>
            <span className="text-xs text-slate-500">— upload the document and Claude extracts expiry, status &amp; coverage</span>
          </div>
          <label className={cn(
            'flex items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed px-4 py-3 cursor-pointer transition-colors text-sm font-medium',
            analyzing ? 'border-orange-300 bg-white text-orange-500' :
            scanned ? 'border-green-300 bg-white text-green-700' :
            'border-orange-300 bg-white text-orange-600 hover:bg-orange-50'
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
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) analyzeDoc(f)
                else setFile(null)
              }}
            />
          </label>
          {analyzeError && <p className="text-xs text-red-600">{analyzeError}</p>}
        </div>

        {/* File URL */}
        <div className="space-y-1">
          <Label htmlFor="file_url" className="text-xs">File URL <span className="text-slate-400 font-normal">(optional — paste a link to the stored doc)</span></Label>
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
          <Label htmlFor="notes" className="text-xs">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this document..."
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

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

  function getDoc(type: DocType): ComplianceDoc | null {
    return docs.find((d) => d.company_id === companyId && d.type === type) ?? null
  }

  function resolveStatus(type: DocType): DocStatus {
    const doc = getDoc(type)
    if (!doc) return 'missing'
    if (doc.status === 'approved' && isExpiringSoon(doc.expiry_date)) return 'expiring_soon'
    return doc.status
  }

  const allStatuses = DOC_TYPES.map(resolveStatus)
  const worst = worstStatus(allStatuses)
  const chip = cardChip(worst)

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">{companyName}</h3>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', chip.classes)}>
          {chip.label}
        </span>
      </div>

      {/* Doc rows */}
      <div className="divide-y divide-slate-100">
        {DOC_TYPES.map((type) => {
          const doc = getDoc(type)
          const status = resolveStatus(type)
          const cfg = STATUS_CONFIG[status]

          return (
            <div key={type}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 sm:px-5 py-3">
                {/* Label */}
                <span className="w-24 sm:w-28 text-sm text-slate-600 shrink-0">{DOC_LABELS[type]}</span>

                {/* Status badge */}
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', cfg.classes)}>
                  {cfg.label}
                </span>

                {/* Expiry */}
                {doc?.expiry_date && (
                  <span className={cn(
                    'text-xs',
                    status === 'expiring_soon' ? 'text-orange-600 font-medium' :
                    status === 'expired' ? 'text-red-500' : 'text-slate-400'
                  )}>
                    {status === 'expiring_soon' && <AlertTriangle className="inline h-3 w-3 mr-0.5 -mt-0.5" />}
                    Exp {new Date(doc.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}

                {/* Upload / Update button */}
                <div className="ml-auto">
                  <button
                    onClick={() => setOpenForm(openForm === type ? null : type)}
                    className={cn(
                      'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      openForm === type
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700',
                    )}
                  >
                    {doc ? (
                      <><RefreshCw className="h-3 w-3" /> Update</>
                    ) : (
                      <><Upload className="h-3 w-3" /> Upload</>
                    )}
                  </button>
                </div>
              </div>

              {/* Inline upload form */}
              {openForm === type && (
                <div className="px-4 sm:px-5 pb-4">
                  <UploadForm
                    projectId={projectId}
                    companyId={companyId}
                    companyName={companyName}
                    docType={type}
                    existingDoc={doc}
                    token={token}
                    onClose={() => setOpenForm(null)}
                    onSaved={onRefresh}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
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
    if (doc.status === 'approved' && isExpiringSoon(doc.expiry_date)) return 'expiring_soon'
    return doc.status
  }

  const totalSubs = subs.length
  const allCompliant = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return DOC_TYPES.every((t) => resolveStatus(id, t) === 'approved')
  }).length
  const expiringSoon = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return DOC_TYPES.some((t) => resolveStatus(id, t) === 'expiring_soon')
  }).length
  const missingDocs = subs.filter((s) => {
    const id = s.companies?.id ?? ''
    return DOC_TYPES.some((t) => resolveStatus(id, t) === 'missing')
  }).length

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Compliance</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Track insurance, licenses, and required documents for each subcontractor.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-16 text-center">Loading...</div>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No subcontractors yet</p>
          <p className="text-xs text-slate-400 mt-1">
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
              iconColor="text-slate-500"
            />
            <StatCard
              label="All Compliant"
              value={allCompliant}
              icon={CheckCircle2}
              iconColor="text-green-500"
            />
            <StatCard
              label="Expiring Soon"
              value={expiringSoon}
              icon={AlertTriangle}
              iconColor="text-orange-500"
            />
            <StatCard
              label="Missing Docs"
              value={missingDocs}
              icon={FileWarning}
              iconColor="text-red-500"
            />
          </div>

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
