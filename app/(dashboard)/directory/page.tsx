'use client'

import { useEffect, useState, useRef } from 'react'
import { Building2, Plus, X, Search, Phone, Mail, MapPin, Globe, BadgeCheck, Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

// ─── Constants ───────────────────────────────────────────────────────────────

const TRADES = [
  'Demolition', 'Concrete', 'Masonry', 'Structural Steel', 'Framing',
  'Roofing', 'Waterproofing', 'Insulation', 'Drywall', 'Doors & Hardware',
  'Glazing', 'Tile', 'Flooring', 'Paint', 'Electrical', 'Plumbing',
  'HVAC', 'Fire Protection', 'Elevators', 'Landscaping', 'Other',
]

const INSPECTOR_SPECIALTIES = [
  'Electrical', 'Plumbing', 'Structural', 'Mechanical/HVAC',
  'Fire', 'Building/General', 'Zoning', 'Environmental', 'Other',
]

const SUPPLIER_CATEGORIES = [
  'Lumber & Framing', 'Concrete & Masonry', 'Electrical Supplies', 'Plumbing Supplies',
  'HVAC Equipment', 'Roofing Materials', 'Flooring', 'Paint & Finishes',
  'Tools & Equipment', 'Safety Equipment', 'Other',
]

type ContactType = 'gc' | 'subcontractor' | 'inspector' | 'supplier' | 'worker' | 'other'

const TYPE_LABELS: Record<ContactType, string> = {
  gc: 'GC',
  subcontractor: 'Sub',
  inspector: 'Inspector',
  supplier: 'Supplier',
  worker: 'Worker',
  other: 'Other',
}

const TYPE_BADGE_CLASSES: Record<ContactType, string> = {
  gc: 'bg-blue-100 text-blue-800',
  subcontractor: 'bg-orange-100 text-orange-800',
  inspector: 'bg-purple-100 text-purple-800',
  supplier: 'bg-green-100 text-green-800',
  worker: 'bg-slate-100 text-slate-600',
  other: 'bg-slate-100 text-slate-600',
}

const TABS: { key: 'all' | ContactType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gc', label: 'GCs' },
  { key: 'subcontractor', label: 'Subs' },
  { key: 'inspector', label: 'Inspectors' },
  { key: 'supplier', label: 'Suppliers' },
  { key: 'worker', label: 'Workers' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Extra {
  specialty?: string
  jurisdiction?: string
  certification_number?: string
  notes?: string
  website?: string
}

interface Company {
  id: string
  name: string
  type: ContactType
  trade: string | null
  contact_email: string
  phone: string | null
  address: string | null
  insurance_status: string
  license_number: string | null
  has_account: boolean
  extra?: Extra | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectoryPage() {
  const supabase = createClient()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | ContactType>('all')

  // Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Invite state
  const [inviteCompany, setInviteCompany] = useState<Company | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<string[]>([])

  // Form fields
  const [formType, setFormType] = useState<ContactType>('subcontractor')
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formTrade, setFormTrade] = useState('')
  const [formLicense, setFormLicense] = useState('')
  const [formSpecialty, setFormSpecialty] = useState('')
  const [formJurisdiction, setFormJurisdiction] = useState('')
  const [formCertNumber, setFormCertNumber] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formWebsite, setFormWebsite] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    setLoading(true)
    const token = await getToken()
    const res = await fetch('/api/directory', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setCompanies(data.companies ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function resetForm() {
    setFormType('subcontractor')
    setFormName(''); setFormEmail(''); setFormPhone(''); setFormAddress('')
    setFormTrade(''); setFormLicense(''); setFormSpecialty(''); setFormJurisdiction('')
    setFormCertNumber(''); setFormNotes(''); setFormWebsite('')
    setAddError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddLoading(true)
    const token = await getToken()
    const res = await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: formName,
        type: formType,
        contact_email: formEmail,
        phone: formPhone || undefined,
        address: formAddress || undefined,
        trade: formTrade || undefined,
        license_number: formLicense || undefined,
        specialty: formSpecialty || undefined,
        jurisdiction: formJurisdiction || undefined,
        certification_number: formCertNumber || undefined,
        notes: formNotes || undefined,
        website: formWebsite || undefined,
      }),
    })
    if (!res.ok) {
      const body = await res.json()
      setAddError(body.error)
      setAddLoading(false)
      return
    }
    resetForm()
    setShowAdd(false)
    setAddLoading(false)
    fetchData()
  }

  // ─── Filtering ──────────────────────────────────────────────────────────────

  const tabFiltered = activeTab === 'all' ? companies : companies.filter(c => c.type === activeTab)

  const filtered = tabFiltered.filter(c => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contact_email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.trade ?? '').toLowerCase().includes(q)
    )
  })

  // Counts per tab
  const counts: Record<string, number> = { all: companies.length }
  for (const t of ['gc', 'subcontractor', 'inspector', 'supplier', 'worker', 'other'] as ContactType[]) {
    counts[t] = companies.filter(c => c.type === t).length
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function TypeBadge({ type }: { type: ContactType }) {
    return (
      <span className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TYPE_BADGE_CLASSES[type] ?? 'bg-slate-100 text-slate-600'
      )}>
        {TYPE_LABELS[type] ?? type}
      </span>
    )
  }

  function openInvite(company: Company) {
    setInviteCompany(company)
    setInviteEmail(company.contact_email ?? '')
    setInviteError(null)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteCompany) return
    setInviteError(null)
    setInviteLoading(true)
    const token = await getToken()
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        company_id: inviteCompany.id,
        email: inviteEmail,
        company_name: inviteCompany.name,
      }),
    })
    if (!res.ok) {
      const body = await res.json()
      setInviteError(body.error)
      setInviteLoading(false)
      return
    }
    setInvitedIds(prev => [...prev, inviteCompany.id])
    setInviteCompany(null)
    setInviteLoading(false)
  }

  // ─── Add Modal ──────────────────────────────────────────────────────────────

  const isSubOrGC = formType === 'subcontractor' || formType === 'gc'
  const isInspector = formType === 'inspector'
  const isSupplier = formType === 'supplier'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6">

      {/* ── Add Contact Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add Contact</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="px-6 py-5 space-y-4">

                {/* Type */}
                <div className="space-y-1.5">
                  <Label htmlFor="form-type">Contact Type</Label>
                  <Select
                    id="form-type"
                    value={formType}
                    onChange={e => setFormType(e.target.value as ContactType)}
                  >
                    <option value="gc">General Contractor (GC)</option>
                    <option value="subcontractor">Subcontractor</option>
                    <option value="inspector">Inspector</option>
                    <option value="supplier">Supplier</option>
                    <option value="worker">Worker</option>
                    <option value="other">Other</option>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Name */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="form-name">
                      {isInspector || formType === 'worker' ? 'Full Name' : 'Company Name'} *
                    </Label>
                    <Input
                      id="form-name"
                      placeholder={isInspector ? 'e.g. John Martinez' : 'e.g. Citywide Electric'}
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="form-email">Contact Email *</Label>
                    <Input
                      id="form-email"
                      type="email"
                      placeholder="contact@example.com"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      required
                    />
                  </div>

                  {/* Phone */}
                  <div className="space-y-1.5">
                    <Label htmlFor="form-phone">Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input
                      id="form-phone"
                      placeholder="(555) 000-0000"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5">
                    <Label htmlFor="form-address">Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input
                      id="form-address"
                      placeholder="123 Main St, City, State"
                      value={formAddress}
                      onChange={e => setFormAddress(e.target.value)}
                    />
                  </div>

                  {/* Sub / GC fields */}
                  {isSubOrGC && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-trade">Trade <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Select
                          id="form-trade"
                          value={formTrade}
                          onChange={e => setFormTrade(e.target.value)}
                        >
                          <option value="">Select trade...</option>
                          {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-license">License # <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                          id="form-license"
                          placeholder="e.g. LIC-123456"
                          value={formLicense}
                          onChange={e => setFormLicense(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {/* Inspector fields */}
                  {isInspector && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-specialty">Specialty</Label>
                        <Select
                          id="form-specialty"
                          value={formSpecialty}
                          onChange={e => setFormSpecialty(e.target.value)}
                        >
                          <option value="">Select specialty...</option>
                          {INSPECTOR_SPECIALTIES.map(s => <option key={s} value={s}>{s}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-jurisdiction">Jurisdiction <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                          id="form-jurisdiction"
                          placeholder="e.g. City of Austin"
                          value={formJurisdiction}
                          onChange={e => setFormJurisdiction(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="form-cert">Certification # <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                          id="form-cert"
                          placeholder="e.g. CERT-78901"
                          value={formCertNumber}
                          onChange={e => setFormCertNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="form-notes">Notes <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <textarea
                          id="form-notes"
                          rows={3}
                          placeholder="Any additional notes about this inspector..."
                          value={formNotes}
                          onChange={e => setFormNotes(e.target.value)}
                          className="flex w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Supplier fields */}
                  {isSupplier && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-category">Category <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Select
                          id="form-category"
                          value={formTrade}
                          onChange={e => setFormTrade(e.target.value)}
                        >
                          <option value="">Select category...</option>
                          {SUPPLIER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-website">Website <span className="text-slate-400 font-normal">(optional)</span></Label>
                        <Input
                          id="form-website"
                          type="url"
                          placeholder="https://supplier.com"
                          value={formWebsite}
                          onChange={e => setFormWebsite(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                </div>

                {addError && <p className="text-sm text-red-600">{addError}</p>}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); resetForm() }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addLoading}>
                  {addLoading ? 'Adding...' : `Add ${TYPE_LABELS[formType]}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Invite Modal ── */}
      {inviteCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Invite to Platform</h2>
              <button onClick={() => setInviteCompany(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-slate-600">
                  Send <span className="font-medium text-slate-900">{inviteCompany.name}</span> an invite so they can log in and view their jobs on Work OS Navigator.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setInviteCompany(null)}>Cancel</Button>
                <Button type="submit" disabled={inviteLoading}>
                  <Send className="h-3.5 w-3.5" />
                  {inviteLoading ? 'Sending...' : 'Send Invite'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Contacts Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">GCs, subs, inspectors, suppliers, and workers.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Add Contact
        </Button>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-slate-200 mb-5 overflow-x-auto">
        {TABS.map(tab => {
          const count = counts[tab.key] ?? 0
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch('') }}
              className={cn(
                'shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                active
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium min-w-[1.25rem]',
                  active ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'
                )}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={companies.length === 0 ? 'No contacts yet' : 'No matches found'}
          description={
            companies.length === 0
              ? 'Add GCs, subcontractors, inspectors, suppliers, and workers to your directory.'
              : 'Try a different search term or switch tabs.'
          }
          action={companies.length === 0 ? { label: 'Add Contact', onClick: () => setShowAdd(true) } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(company => {
            const type = (company.type ?? 'other') as ContactType
            const extra = company.extra ?? {}
            return (
              <div
                key={company.id}
                className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-3 hover:border-slate-300 transition-colors"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {company.has_account && (
                      <span title="On Platform" className="shrink-0 h-2 w-2 rounded-full bg-green-500" />
                    )}
                    <span className="font-semibold text-slate-900 truncate">{company.name}</span>
                  </div>
                  <TypeBadge type={type} />
                </div>

                {/* Inspector specialty badge */}
                {type === 'inspector' && extra.specialty && (
                  <span className="inline-flex items-center gap-1 self-start rounded-full px-2.5 py-0.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                    <BadgeCheck className="h-3 w-3" />
                    {extra.specialty}
                  </span>
                )}

                {/* Trade / category */}
                {company.trade && (
                  <p className="text-xs text-slate-500">{company.trade}</p>
                )}

                {/* Inspector extra fields */}
                {type === 'inspector' && (extra.jurisdiction || extra.certification_number) && (
                  <div className="space-y-0.5">
                    {extra.jurisdiction && (
                      <p className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">Jurisdiction:</span> {extra.jurisdiction}
                      </p>
                    )}
                    {extra.certification_number && (
                      <p className="text-xs font-mono text-slate-500">
                        <span className="font-sans font-medium text-slate-700">Cert #:</span> {extra.certification_number}
                      </p>
                    )}
                  </div>
                )}

                {/* Supplier website */}
                {type === 'supplier' && extra.website && (
                  <a
                    href={extra.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-orange-600 hover:underline truncate"
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    {extra.website.replace(/^https?:\/\//, '')}
                  </a>
                )}

                {/* Contact row */}
                <div className="mt-auto space-y-1">
                  {company.contact_email && (
                    <a
                      href={`mailto:${company.contact_email}`}
                      className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-orange-600 truncate"
                    >
                      <Mail className="h-3 w-3 shrink-0 text-slate-400" />
                      {company.contact_email}
                    </a>
                  )}
                  {company.phone && (
                    <a
                      href={`tel:${company.phone}`}
                      className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-orange-600"
                    >
                      <Phone className="h-3 w-3 shrink-0 text-slate-400" />
                      {company.phone}
                    </a>
                  )}
                  {company.address && (
                    <p className="flex items-start gap-1.5 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0 text-slate-400 mt-0.5" />
                      {company.address}
                    </p>
                  )}
                </div>

                {/* On-platform indicator */}
                {company.has_account && (
                  <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <span className="text-xs text-green-700 font-medium">On Platform</span>
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
