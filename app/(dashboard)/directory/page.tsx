'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { StatStrip } from '@/components/ui/stat-strip'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import Link from 'next/link'
import { Building2, Plus, X, Search, Phone, Mail, MapPin, Globe, BadgeCheck, Send, ExternalLink, Pencil, Trash2, Users, Download} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { TRADES, tradeChoices } from '@/lib/trades'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { parseDate, formatDate } from '@/lib/dates'
import { expiryLabel } from '@/lib/expiry'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { usePermissions } from '@/lib/use-permissions'
import { invitable, inviteBatchSummary, type InviteOutcome } from '@/lib/directory-invite'

// ─── Constants ───────────────────────────────────────────────────────────────

// THE TRADE LIST LIVES IN `lib/trades.ts`. It was hardcoded here AND the scope
// templates had their own, so the two disagreed: this list offered "Paint"
// while a template is keyed on "Painting", and it had no "Excavation" at all.
// A sub filed from here could be unmatchable by the template meant for them.

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
  gc: 'bg-info-tint text-info',
  subcontractor: 'bg-accent-tint text-accent-fg',
  inspector: 'bg-special-tint text-special',
  supplier: 'bg-success-tint text-success',
  worker: 'bg-muted text-muted-fg',
  other: 'bg-muted text-muted-fg',
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
  /** A vendor invite is out and not yet accepted (company_invites, pending). */
  invite_pending?: boolean
  /**
   * Came out of a Google Contacts import rather than being typed in.
   *
   * DERIVED on the route from `google_contact_imports.company_record_id`, not
   * a column on the contact - the import already records which row it created,
   * and a second home for one fact is a second thing to keep in step.
   */
  imported?: boolean
  extra?: Extra | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DirectoryPage() {
  const guardDelete = useDeleteGuard()
  const notify = useNotice()
  const supabase = createClient()
  const [companies, setCompanies] = useState<Company[]>([])
  // Deep link. An inspection card links here NAMING a contact, so the page has
  // to open that card - landing somebody at the top of a list to find it
  // themselves is the "a control must lead to the thing it names" failure the
  // setup checklist was fixed for.
  const urlParams = useSearchParams()
  const openedFromUrl = useRef<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'all' | ContactType>('all')

  // Modal state
  const [showAdd, setShowAdd] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Profile drawer state
  const [profileCompanyId, setProfileCompanyId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileTab, setProfileTab] = useState<'overview' | 'documents' | 'payments' | 'projects'>('overview')
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editTrade, setEditTrade] = useState('')
  /**
   * THE LABEL DECIDES WHICH PICKERS OFFER THEM, AND IT WAS NOT EDITABLE.
   *
   * Reported as "I imported contacts, now I want to add a sub from the
   * directory and it's not there". The import had worked perfectly - the
   * contact was staged, labelled "Other" and written to `companies` as
   * `type: 'other'` - and the Add Sub picker filters on
   * `type === 'subcontractor'`, so it could never appear. Nothing was
   * broken and nothing said anything; the row was simply in a category no
   * sub picker asks for.
   *
   * The trap was that there was NO WAY BACK. The Add form has a Contact
   * Type control and `PATCH /api/directory/[companyId]` has always
   * accepted `type` on its whitelist - only this form was missing the box,
   * so a label chosen once during a bulk import was permanent. A value the
   * app writes, submits and reads back must have a control somewhere.
   */
  const [editType, setEditType] = useState<ContactType>('subcontractor')
  const [importedOnly, setImportedOnly] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  // Invite state
  const [inviteCompany, setInviteCompany] = useState<Company | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [invitedIds, setInvitedIds] = useState<string[]>([])

  // Bulk invite state. ONE control at the top for "everybody not on SyteNav",
  // instead of an identical button on every card.
  const { can } = usePermissions()
  const canInvite = can('directory', 'edit')
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<string[]>([])
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResults, setBulkResults] = useState<InviteOutcome[] | null>(null)

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

  // IMPORTED CUTS ACROSS THE TYPE TABS, so it is a toggle beside them rather
  // than a tab of its own: "show me the subs I imported" is the question, and
  // a seventh tab could not answer it.
  const tabFiltered = (activeTab === 'all' ? companies : companies.filter(c => c.type === activeTab))
    .filter(c => (importedOnly ? !!c.imported : true))

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

  // Who the top "Invite N contacts" control covers - the SAME answer the
  // dialog lists, so the number on the button cannot disagree with it.
  const { ready: toInvite, noEmail: cannotInvite } = invitable(companies, invitedIds)

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function TypeBadge({ type }: { type: ContactType }) {
    return (
      <span className={cn(
        'whitespace-nowrap inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TYPE_BADGE_CLASSES[type] ?? 'bg-muted text-muted-fg'
      )}>
        {TYPE_LABELS[type] ?? type}
      </span>
    )
  }

  // Once, and only after the list exists - `openProfile` reads from it. The
  // guard is a REF, not state: re-opening the card on every render would make
  // it impossible to close.
  useEffect(() => {
    const wanted = urlParams?.get('contact')
    if (!wanted || openedFromUrl.current === wanted || !companies.length) return
    if (!companies.some(c => c.id === wanted)) return
    openedFromUrl.current = wanted
    openProfile(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParams, companies])

  async function openProfile(companyId: string) {
    setProfileCompanyId(companyId)
    setProfileData(null)
    setProfileLoading(true)
    setProfileTab('overview')
    const token = await getToken()
    const res = await fetch(`/api/directory/${companyId}/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) setProfileData(await res.json())
    setProfileLoading(false)
  }

  function openEditCompany(company: any) {
    if (!company) return
    setEditingCompany(company)
    setEditName(company.name ?? '')
    setEditEmail(company.contact_email ?? '')
    setEditPhone(company.phone ?? '')
    setEditAddress(company.address ?? '')
    setEditTrade(company.trade ?? '')
    setEditType((company.type as ContactType) ?? 'other')
  }

  async function saveEditCompany(e: React.FormEvent) {
    e.preventDefault()
    if (!editingCompany) return
    setEditSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/directory/${editingCompany.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editName, contact_email: editEmail, phone: editPhone, address: editAddress, trade: editTrade, type: editType }),
    })
    setEditSaving(false)
    if (!res.ok) { notify('Could not save changes.'); return }
    setEditingCompany(null)
    fetchData()
    if (profileCompanyId) openProfile(profileCompanyId)
  }

  /**
   * Delete a contact.
   *
   * THE BUG THAT BROUGHT ME HERE. This used to open with `window.confirm`, and
   * in the native shell that is a blocking dialog: when it fails to present,
   * the page never runs another line. Three hours of production logs after
   * three attempts showed the DELETE endpoint had never been called ONCE - the
   * handler died before the fetch, which from the outside is a dead, blank tab.
   */
  function deleteCompany(company: any) {
    if (!company) return
    guardDelete(async () => {
      const token = await getToken()
      const res = await fetch(`/api/directory/${company.id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({} as any))
        notify(d.error ?? 'Could not delete that contact.')
        return
      }
      setProfileCompanyId(null)
      fetchData()
    }, { label: company.name })
  }

  /**
   * One vendor invite through /api/invite. The single-card dialog and the
   * bulk dialog both come through here, so they cannot ask for different
   * things - the route gates it on `directory: edit`, decides the role, and
   * checks the company is in this Directory.
   */
  async function postVendorInvite(companyId: string, email: string) {
    const token = await getToken()
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        // A VENDOR, not a teammate. They get the email that says what the
        // account is for; the route reads the inviting company off the
        // profile, so it no longer needs (or trusts) a name from here.
        audience: 'vendor',
        company_id: companyId,
        email,
      }),
    })
    const body = await res.json().catch(() => ({} as any))
    return { res, body }
  }

  function openBulkInvite() {
    setBulkSelected(toInvite.map(c => c.id))
    setBulkResults(null)
    setBulkOpen(true)
  }

  /**
   * Invite everybody ticked, one request each. A LOOP THAT THROWS ABANDONS THE
   * REST IN SILENCE, so every contact's answer is collected - sent, recorded
   * without an email, or refused - and the dialog shows each one that did not
   * simply work, with the route's own reason beside the name.
   */
  async function sendBulkInvites() {
    if (bulkSending) return
    const chosen = toInvite.filter(c => bulkSelected.includes(c.id))
    setBulkSending(true)
    const outcomes: InviteOutcome[] = []
    try {
      for (const c of chosen) {
        try {
          const { res, body } = await postVendorInvite(c.id, c.contact_email)
          if (!res.ok) {
            outcomes.push({ id: c.id, name: c.name, status: 'failed', reason: body.error ?? 'Could not send that invite.' })
          } else if (body.emailSent === false) {
            outcomes.push({ id: c.id, name: c.name, status: 'recorded', reason: body.note ?? 'The invite was recorded, but the email did not send.' })
          } else {
            outcomes.push({ id: c.id, name: c.name, status: 'sent' })
          }
        } catch (err) {
          console.error('[directory] bulk invite failed', { company: c.id, err })
          outcomes.push({ id: c.id, name: c.name, status: 'failed', reason: 'No answer from the server. Reload before trying this one again.' })
        }
      }
    } finally {
      setBulkSending(false)
      // Anything written - sent or only recorded - is an invite that exists,
      // so it leaves the "not invited yet" list either way.
      const written = outcomes.filter(o => o.status !== 'failed').map(o => o.id)
      if (written.length) setInvitedIds(prev => [...prev, ...written])
      const summary = inviteBatchSummary(outcomes)
      if (!summary.problems.length) {
        setBulkOpen(false)
        notify(summary.text, { tone: 'success' })
      } else {
        setBulkResults(outcomes)
      }
    }
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
    const { res, body } = await postVendorInvite(inviteCompany.id, inviteEmail)
    setInviteLoading(false)
    if (!res.ok) {
      setInviteError(body.error ?? 'Could not send that invite.')
      return
    }

    // READ THE ANSWER. This used to tick "Invited" on `res.ok` alone - and the
    // route answers 200 with `emailSent: false` when the record was written and
    // the email did not go, precisely so somebody can say which. An invite went
    // out reading Invited with nothing arriving, and the reason was in this
    // response the whole time. Settings has read it for months; this screen
    // never did.
    if (body.emailSent === false) {
      setInviteError(body.note ?? 'The invite was recorded, but the email did not send. Use the invite again once email is working.')
      return
    }

    setInvitedIds(prev => [...prev, inviteCompany.id])
    setInviteCompany(null)
    notify(`Invite sent to ${inviteEmail}.`, { tone: 'success' })
  }

  // ─── Add Modal ──────────────────────────────────────────────────────────────

  const isSubOrGC = formType === 'subcontractor' || formType === 'gc'
  const isInspector = formType === 'inspector'
  const isSupplier = formType === 'supplier'

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6">

      {/* ── Add Contact Modal ── */}
      {showAdd && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg overflow-y-auto">
            <div className="sticky top-0 bg-panel border-b border-line-soft px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add Contact</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-faint hover:text-muted-fg">
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
                      autoFocus={autoFocusOnDesktop()}
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
                    <Label htmlFor="form-phone">Phone <span className="text-faint font-normal">(optional)</span></Label>
                    <Input
                      id="form-phone"
                      placeholder="(555) 000-0000"
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-1.5">
                    <Label htmlFor="form-address">Address <span className="text-faint font-normal">(optional)</span></Label>
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
                        <Label htmlFor="form-trade">Trade <span className="text-faint font-normal">(optional)</span></Label>
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
                        <Label htmlFor="form-license">License # <span className="text-faint font-normal">(optional)</span></Label>
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
                        <Label htmlFor="form-jurisdiction">Jurisdiction <span className="text-faint font-normal">(optional)</span></Label>
                        <Input
                          id="form-jurisdiction"
                          placeholder="e.g. City of Austin"
                          value={formJurisdiction}
                          onChange={e => setFormJurisdiction(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="form-cert">Certification # <span className="text-faint font-normal">(optional)</span></Label>
                        <Input
                          id="form-cert"
                          placeholder="e.g. CERT-78901"
                          value={formCertNumber}
                          onChange={e => setFormCertNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="form-notes">Notes <span className="text-faint font-normal">(optional)</span></Label>
                        <textarea
                          id="form-notes"
                          rows={3}
                          placeholder="Any additional notes about this inspector..."
                          value={formNotes}
                          onChange={e => setFormNotes(e.target.value)}
                          className="flex w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
                        />
                      </div>
                    </>
                  )}

                  {/* Supplier fields */}
                  {isSupplier && (
                    <>
                      <div className="space-y-1.5">
                        <Label htmlFor="form-category">Category <span className="text-faint font-normal">(optional)</span></Label>
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
                        <Label htmlFor="form-website">Website <span className="text-faint font-normal">(optional)</span></Label>
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

                {addError && <p className="text-sm text-danger">{addError}</p>}
              </div>

              <div className="row-even sticky bottom-0 bg-panel border-t border-line-soft px-6 py-4 lg:flex gap-2 justify-end">
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
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Invite to SyteNav</h2>
              <button onClick={() => setInviteCompany(null)} className="text-faint hover:text-muted-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-muted-fg">
                  Send <span className="font-medium text-ink">{inviteCompany.name}</span> an invite so they can log in and view their jobs on SyteNav.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    required
                    autoFocus={autoFocusOnDesktop()}
                  />
                </div>
                {inviteError && <p className="text-sm text-danger">{inviteError}</p>}
              </div>
              <div className="row-even px-6 py-4 border-t border-line-soft lg:flex gap-2 justify-end">
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

      {/* ── Bulk Invite Modal ── */}
      {bulkOpen && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="absolute inset-0" onClick={() => { if (!bulkSending) setBulkOpen(false) }} />
          <div className="relative bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md flex flex-col">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3 shrink-0">
              <h2 className="min-w-0 text-base font-semibold text-ink">Invite to SyteNav</h2>
              <button onClick={() => { if (!bulkSending) setBulkOpen(false) }} aria-label="Close" title="Close"
                className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-muted-fg lg:h-8 lg:w-8">
                <X className="h-4 w-4" />
              </button>
            </div>

            {bulkResults ? (
              <>
                <div className="px-6 py-5 space-y-3 overflow-y-auto">
                  {(() => {
                    const summary = inviteBatchSummary(bulkResults)
                    return (
                      <>
                        <p className={cn('text-sm font-medium', summary.tone === 'danger' ? 'text-danger' : summary.tone === 'warn' ? 'text-warn' : 'text-success')}>
                          {summary.text}
                        </p>
                        <ul className="rounded-xl border border-line divide-y divide-line-soft">
                          {summary.problems.map(o => (
                            <li key={o.id} className="px-4 py-3">
                              <p className="text-sm font-medium text-ink">{o.name}</p>
                              <p className={cn('text-xs mt-0.5', o.status === 'failed' ? 'text-danger' : 'text-warn')}>
                                {o.status === 'recorded' ? 'Invited, but no email went out. ' : ''}{o.reason}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </>
                    )
                  })()}
                </div>
                <div className="px-6 py-4 border-t border-line-soft flex justify-end shrink-0">
                  <Button className="w-full lg:w-auto" onClick={() => setBulkOpen(false)}>Done</Button>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                  <p className="text-sm text-muted-fg">
                    Each contact gets an email inviting them to log in and see the jobs they are on with you. They can only read their own work.
                  </p>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-muted-fg">{bulkSelected.length} of {toInvite.length} selected</p>
                    <button type="button"
                      onClick={() => setBulkSelected(bulkSelected.length === toInvite.length ? [] : toInvite.map(c => c.id))}
                      className="min-h-11 whitespace-nowrap text-xs font-medium text-accent-fg hover:underline lg:min-h-0">
                      {bulkSelected.length === toInvite.length ? 'Select none' : 'Select all'}
                    </button>
                  </div>
                  <ul className="rounded-xl border border-line divide-y divide-line-soft">
                    {toInvite.map(c => {
                      const on = bulkSelected.includes(c.id)
                      return (
                        <li key={c.id}>
                          <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5">
                            <input type="checkbox" checked={on}
                              onChange={() => setBulkSelected(prev => on ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                              className="h-4 w-4 shrink-0 accent-accent" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                              <span className="block truncate text-xs text-muted-fg">{c.contact_email}</span>
                            </span>
                            <span className="shrink-0"><TypeBadge type={(c.type ?? 'other') as ContactType} /></span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  {cannotInvite.length > 0 && (
                    <p className="text-xs text-muted-fg">
                      Not included, no email address on file: {cannotInvite.map(c => c.name).join(', ')}. Add one from the contact&apos;s card to invite them.
                    </p>
                  )}
                </div>
                <div className="row-even px-6 py-4 border-t border-line-soft lg:flex gap-2 justify-end shrink-0">
                  <Button type="button" variant="secondary" onClick={() => setBulkOpen(false)} disabled={bulkSending}>Cancel</Button>
                  <Button type="button" onClick={() => {
                    if (!bulkSelected.length) { notify('Tick at least one contact to invite.'); return }
                    sendBulkInvites()
                  }} disabled={bulkSending}>
                    <Send className="h-3.5 w-3.5" />
                    {bulkSending ? 'Sending...' : `Send ${bulkSelected.length} invite${bulkSelected.length === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Directory</h1>
          <p className="text-sm text-muted-fg mt-0.5">GCs, subs, inspectors, suppliers, and workers.</p>
        </div>
        <div className="row-even sm:flex sm:items-center gap-2 self-start sm:self-auto">
          {/* The staging area is a separate PLACE on purpose - contacts from a
              phone book are not directory contacts until somebody says they
              are. The door to it belongs here, beside adding one by hand. */}
          <Link href="/directory/imported"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-3 text-sm font-medium text-muted-fg hover:bg-surface lg:min-h-0 lg:py-2">
            <Users className="h-4 w-4" /> Imported contacts
          </Link>
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" />
            Add Contact
          </Button>
          {/* ONE invite control for the whole list. It was a button on every
              card not on the platform - twenty-two of them on the Subs tab -
              for an action most people take once. Hidden when nobody is left
              to ask, and for anybody the route would refuse. */}
          {canInvite && toInvite.length > 0 && (
            <Button variant="outline" onClick={openBulkInvite}>
              <Send className="h-4 w-4" />
              Invite {toInvite.length} contact{toInvite.length === 1 ? '' : 's'} not on SyteNav
            </Button>
          )}
        </div>
      </div>

      {/* IMPORTED, as a toggle rather than a seventh tab. It cuts ACROSS the
          types - "the subs I imported" is the question somebody actually has -
          and it only appears when there is something to filter, because a
          control that can only ever return nothing is noise on every other
          company's screen. */}
      {companies.some(c => c.imported) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setImportedOnly(v => !v)}
            aria-pressed={importedOnly}
            className={cn(
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
              importedOnly
                ? 'border-accent bg-accent-tint text-accent-fg'
                : 'border-line text-muted-fg hover:text-ink-soft',
            )}
          >
            <Download className="h-3.5 w-3.5" />
            Imported
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-fg">
              {companies.filter(c => c.imported).length}
            </span>
          </button>
          {importedOnly && (
            <span className="text-xs text-faint">
              Showing only contacts that came from a Google Contacts import.
            </span>
          )}
        </div>
      )}

      {/* ── Tabs ──
          Six tabs with counts do not fit 390px: "Inspectors 2" was cut off at
          the edge. The strip scrolls, and `.scroll-fade` is what says so - the
          scrollbar is hidden, so a faded edge is the only sign of more. */}
      <div className="flex gap-0 border-b border-line mb-5 overflow-x-auto scrollbar-hide scroll-fade">
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
                  ? 'border-accent text-accent-fg'
                  : 'border-transparent text-muted-fg hover:text-ink-soft hover:border-muted2'
              )}
            >
              {tab.label}
              {/* EVERY tab carries its count, zero included. Hiding a zero
                  left Workers as the one tab with no number, which read as
                  "not counted" rather than "none". */}
              <span className={cn(
                'whitespace-nowrap inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-medium min-w-[1.25rem]',
                active ? 'bg-accent-tint text-accent-fg' : 'bg-muted text-muted-fg'
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
        <Input
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
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
                onClick={() => openProfile(company.id)}
                className="bg-panel rounded-xl border border-line p-4 flex flex-col gap-3 hover:border-muted2 hover:shadow-md transition-shadow cursor-pointer"
              >
                {/* Card header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {company.has_account && (
                      <span title="On Platform" className="shrink-0 h-2 w-2 rounded-full bg-success-solid" />
                    )}
                    <span className="font-semibold text-ink truncate">{company.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2" onClick={e => e.stopPropagation()}>
                    {/* Says where the row came from. Only ever shown when it
                        is true - an "added by hand" badge on every other card
                        would be noise for a fact nobody asked about. */}
                    {company.imported && (
                      <span
                        title="Came from a Google Contacts import"
                        className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-fg"
                      >
                        Imported
                      </span>
                    )}
                    <TypeBadge type={type} />
                    {/* The card's secondary actions. Inviting ONE contact lives
                        here now; the whole list is the control at the top. */}
                    <RowMenu label={`More for ${company.name}`}>
                      {close => (
                        <>
                          {canInvite && !company.has_account && (
                            <MenuItem onClick={() => { close(); openInvite(company) }}>
                              <Send className="h-4 w-4" />
                              {company.invite_pending || invitedIds.includes(company.id) ? 'Resend invite' : 'Invite to SyteNav'}
                            </MenuItem>
                          )}
                          <MenuItem onClick={() => { close(); openEditCompany(company) }}>
                            <Pencil className="h-4 w-4" /> Edit
                          </MenuItem>
                          <MenuItem danger onClick={() => { close(); deleteCompany(company) }}>
                            <Trash2 className="h-4 w-4" /> Delete
                          </MenuItem>
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>

                {/* Inspector specialty badge */}
                {type === 'inspector' && extra.specialty && (
                  <span className="whitespace-nowrap inline-flex items-center gap-1 self-start rounded-full px-2.5 py-0.5 text-xs font-medium bg-special-tint text-special border border-special/30">
                    <BadgeCheck className="h-3 w-3" />
                    {extra.specialty}
                  </span>
                )}

                {/* Trade / category */}
                {company.trade && (
                  <p className="text-xs text-muted-fg">{company.trade}</p>
                )}

                {/* Inspector extra fields */}
                {type === 'inspector' && (extra.jurisdiction || extra.certification_number) && (
                  <div className="space-y-0.5">
                    {extra.jurisdiction && (
                      <p className="text-xs text-muted-fg">
                        <span className="font-medium text-ink-soft">Jurisdiction:</span> {extra.jurisdiction}
                      </p>
                    )}
                    {extra.certification_number && (
                      <p className="text-xs font-mono text-muted-fg">
                        <span className="font-sans font-medium text-ink-soft">Cert #:</span> {extra.certification_number}
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
                    className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline truncate"
                  >
                    <Globe className="h-3 w-3 shrink-0" />
                    {extra.website.replace(/^https?:\/\//, '')}
                  </a>
                )}

                {/* Contact row */}
                <div className="mt-auto space-y-1">
                  {company.contact_email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-fg truncate">
                      <Mail className="h-3 w-3 shrink-0 text-faint" />
                      {company.contact_email}
                    </div>
                  )}
                  {company.phone && (
                    <a
                      href={`tel:${company.phone}`}
                      className="flex items-center gap-1.5 text-xs text-muted-fg hover:text-accent-fg"
                    >
                      <Phone className="h-3 w-3 shrink-0 text-faint" />
                      {company.phone}
                    </a>
                  )}
                  {company.address && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-fg">
                      <MapPin className="h-3 w-3 shrink-0 text-faint mt-0.5" />
                      {company.address}
                    </p>
                  )}
                </div>

                {/* Platform status - a fact, not a button. Somebody not on
                    SyteNav and not invited shows nothing here: the invite is
                    in the row menu and in the one control at the top. */}
                {company.has_account ? (
                  <div className="flex items-center gap-1 pt-1 border-t border-line-soft">
                    <span className="h-1.5 w-1.5 rounded-full bg-success-solid" />
                    <span className="text-xs text-success font-medium">On Platform</span>
                  </div>
                ) : (company.invite_pending || invitedIds.includes(company.id)) ? (
                  <div className="pt-1 border-t border-line-soft">
                    <span className="text-xs text-muted-fg font-medium flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted2" />
                      Invited ✓
                    </span>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      {editingCompany && (
        <div className="overlay z-[60] items-center justify-center bg-black/40 backdrop-blur-sm" data-overlay>
          <div className="absolute inset-0" onClick={() => setEditingCompany(null)} />
          <div className="relative w-full max-w-md bg-panel rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink">Edit {editingCompany.name}</h2>
              <button onClick={() => setEditingCompany(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEditCompany}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-fg">Name</label>
                  <input className="w-full rounded-lg border border-muted2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-fg">Email</label>
                  <input type="email" className="w-full rounded-lg border border-muted2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-fg">Phone</label>
                  <input className="w-full rounded-lg border border-muted2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-type">Contact Type</Label>
                  {/* The label is what every picker filters on - a sub list asks
                      for `subcontractor` and nothing else - so getting it wrong
                      on import hides the contact from the screen that wanted
                      them. It is changeable here now. */}
                  <Select id="edit-type" value={editType} onChange={e => setEditType(e.target.value as ContactType)}>
                    <option value="gc">General Contractor (GC)</option>
                    <option value="subcontractor">Subcontractor</option>
                    <option value="inspector">Inspector</option>
                    <option value="supplier">Supplier</option>
                    <option value="worker">Worker</option>
                    <option value="other">Other</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-fg">Trade</label>
                  {/* A PICKER HERE TOO, AND THIS IS THE DOOR THE TYPOS CAME
                      THROUGH. Adding a contact has always made you choose;
                      editing one let you type anything, so "Electric",
                      "Elecric" and a company name ended up in this column -
                      and a sub whose trade is spelled differently does not
                      appear when you pick Electrical to price out electrical.
                      `tradeChoices` keeps whatever is already stored at the
                      top of the list, so opening a card to fix a phone number
                      cannot silently refile the sub under something else. */}
                  <Select value={editTrade} onChange={e => setEditTrade(e.target.value)}>
                    <option value="">No trade set</option>
                    {tradeChoices(editTrade).map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-fg">Address</label>
                  <input className="w-full rounded-lg border border-muted2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-line-soft flex justify-end gap-2">
                <button type="button" onClick={() => setEditingCompany(null)} className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted-fg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={editSaving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:bg-accent disabled:opacity-50">{editSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      {profileCompanyId && (
        <div className="overlay items-center justify-center bg-black/40 backdrop-blur-sm" data-overlay>
          {/* Backdrop */}
          <div className="absolute inset-0" onClick={() => setProfileCompanyId(null)} />
          {/* Panel */}
          <div className="relative w-full max-w-2xl bg-panel shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            {/* Header
                THE NAME WAS COMING OUT ONE LETTER PER LINE - "Vol / t / Ele /
                ctri / c / Co". This was `flex justify-between` with Edit,
                Delete and a close button on the right and NOTHING to stop them
                taking the width: at 390px, `px-8` plus a 56px icon plus a
                ~200px button group leaves the name about 50px, and the app's
                prose default (`overflow-wrap: anywhere`, there so a pasted
                reference number cannot blow a container out) then breaks it
                wherever it likes. The same fault as a `w-full` table crushing
                "Create" to Cr/ea/te, one layer over.
                Two fixes, and the first is not enough on its own: `min-w-0` so
                the name shrinks honestly instead of shattering, and on a phone
                the actions get their OWN row - three controls and a title do
                not share 390px, and truncating the name to "V…" would be no
                more readable than the shards were. The close button stays top
                right at every width, because that is where a dialog's exit
                lives and it is the one control that must never move. */}
            <div className="px-5 pt-5 pb-4 lg:px-8 lg:pt-8 lg:pb-6 border-b border-line-soft shrink-0">
              <div className="flex items-start gap-3 lg:gap-4">
                <div className="h-12 w-12 lg:h-14 lg:w-14 rounded-2xl bg-accent-tint flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6 lg:h-7 lg:w-7 text-accent-fg" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl lg:text-2xl font-bold text-ink break-words">{profileData?.company?.name ?? '…'}</h2>
                  <p className="text-sm text-faint mt-0.5 break-words">{[profileData?.company?.trade, profileData?.company?.type ? TYPE_LABELS[profileData.company.type as ContactType] : null].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="hidden lg:flex items-center gap-2 mt-1 shrink-0">
                  <button onClick={() => openEditCompany(profileData?.company)} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:border-muted2 hover:text-ink-soft transition-colors">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button onClick={() => deleteCompany(profileData?.company)} className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-tint transition-colors">
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                  <button onClick={() => setProfileCompanyId(null)} aria-label="Close" title="Close" className="text-faint hover:text-muted-fg ml-2"><X className="h-5 w-5" /></button>
                </div>
                <button onClick={() => setProfileCompanyId(null)} aria-label="Close" title="Close"
                  className="lg:hidden -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-muted-fg">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {/* Both edges, equal width - .row-even, not `flex` making each
                  control as wide as its own label. */}
              <div className="row-even gap-2 mt-4 lg:hidden">
                <button onClick={() => openEditCompany(profileData?.company)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-muted-fg hover:border-muted2 hover:text-ink-soft transition-colors">
                  <Pencil className="h-4 w-4" /> Edit
                </button>
                <button onClick={() => deleteCompany(profileData?.company)} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-danger/30 px-3 text-sm font-medium text-danger hover:bg-danger-tint transition-colors">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              </div>
            </div>

            {/* Tabs
                "I can't see all options on top - missing projects, it's cut
                off." Four tabs at `px-5` come to ~440px inside a 390px screen
                and the strip was a plain `flex`, so Projects was not merely
                off the edge - there was no way to scroll to it. A strip that
                does not fit SCROLLS, and it carries `.scroll-fade`: the
                scrollbar is hidden, so a faded right edge is the only thing
                that says there is more. Same rule as the Tasks filter row and
                the Settings tab strip; this one was missed. */}
            <div className="flex border-b border-line-soft shrink-0 px-5 lg:px-8 overflow-x-auto scrollbar-hide scroll-fade">
              {[
                { key: 'overview', label: 'Overview' },
                { key: 'documents', label: 'Documents' },
                { key: 'payments', label: 'Payments' },
                { key: 'projects', label: 'Projects' },
              ].map(t => (
                <button key={t.key} onClick={() => setProfileTab(t.key as any)}
                  className={cn('shrink-0 whitespace-nowrap px-4 lg:px-5 py-3.5 text-sm font-medium border-b-2 transition-colors',
                    profileTab === t.key ? 'border-accent text-accent-fg' : 'border-transparent text-muted-fg hover:text-ink-soft')}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
              {profileLoading ? (
                <p className="text-sm text-faint text-center py-12">Loading…</p>
              ) : !profileData ? (
                <p className="text-sm text-faint text-center py-12">Could not load profile.</p>
              ) : (
                <>
                  {/* OVERVIEW TAB */}
                  {profileTab === 'overview' && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-line divide-y divide-line-soft">
                        {profileData.company?.contact_email && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <Mail className="h-4 w-4 text-faint shrink-0" />
                            <span className="text-sm text-ink-soft select-all">{profileData.company.contact_email}</span>
                          </div>
                        )}
                        {profileData.company?.phone && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <Phone className="h-4 w-4 text-faint shrink-0" />
                            <span className="text-sm text-ink-soft">{profileData.company.phone}</span>
                          </div>
                        )}
                        {profileData.company?.address && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <MapPin className="h-4 w-4 text-faint shrink-0" />
                            <span className="text-sm text-ink-soft">{profileData.company.address}</span>
                          </div>
                        )}
                        {profileData.company?.license_number && (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <BadgeCheck className="h-4 w-4 text-faint shrink-0" />
                            <span className="text-sm text-ink-soft">License: {profileData.company.license_number}</span>
                          </div>
                        )}
                      </div>
                      {/* Quick stats. Phone: one card. Desktop (lg+): three tiles. */}
                      <StatStrip className="lg:hidden" items={[
                        { label: 'Projects', value: profileData.subcontracts?.length ?? 0 },
                        { label: 'Contracted', value: (() => {
                          const t = profileData.subcontracts?.reduce((s: number, sub: any) => s + (Number(sub.contract_amount) || 0), 0) ?? 0
                          return t > 0 ? '$' + (t / 1000).toFixed(0) + 'k' : '-'
                        })() },
                        { label: 'Invoices', value: profileData.invoices?.length ?? 0 },
                      ]} />
                      <div className="hidden lg:grid lg:grid-cols-3 gap-3">
                        <div className="rounded-lg border border-line p-3 text-center">
                          <p className="text-xl font-bold text-ink">{profileData.subcontracts?.length ?? 0}</p>
                          <p className="text-xs text-faint mt-0.5">Projects</p>
                        </div>
                        <div className="rounded-lg border border-line p-3 text-center">
                          <p className="text-xl font-bold text-ink">
                            {profileData.subcontracts?.reduce((s: number, sub: any) => s + (Number(sub.contract_amount) || 0), 0) > 0
                              ? '$' + (profileData.subcontracts.reduce((s: number, sub: any) => s + (Number(sub.contract_amount) || 0), 0) / 1000).toFixed(0) + 'k'
                              : '-'}
                          </p>
                          <p className="text-xs text-faint mt-0.5">Contracted</p>
                        </div>
                        <div className="rounded-lg border border-line p-3 text-center">
                          <p className="text-xl font-bold text-ink">{profileData.invoices?.length ?? 0}</p>
                          <p className="text-xs text-faint mt-0.5">Invoices</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DOCUMENTS TAB */}
                  {profileTab === 'documents' && (
                    <div>
                      {profileData.complianceDocs?.length === 0 ? (
                        <div className="text-center py-10">
                          <p className="text-sm text-faint">No compliance documents on file.</p>
                          <p className="text-xs text-faint mt-1">Upload them from a project's Compliance tab.</p>
                        </div>
                      ) : (
                        <>
                        {/* Desktop (lg+): the table it always had. */}
                        <div className="hidden lg:block rounded-xl border border-line overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-surface border-b border-line-soft">
                              <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-fg">Document</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-fg">Status</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-fg">Expires</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-fg">Uploaded</th>
                                <th className="px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line-soft">
                              {profileData.complianceDocs.map((doc: any) => {
                                const isExpired = doc.expiry_date && new Date(doc.expiry_date + 'T00:00:00') < new Date()
                                const resolvedStatus = (doc.status === 'expired' && doc.expiry_date && !isExpired) ? 'approved' : doc.status
                                const statusColors: Record<string, string> = {
                                  approved: 'bg-success-tint text-success',
                                  pending: 'bg-warn-tint text-warn',
                                  expired: 'bg-danger-tint text-danger',
                                  missing: 'bg-danger-tint text-danger',
                                  expiring_soon: 'bg-accent-tint text-accent-fg',
                                }
                                const typeLabels: Record<string, string> = { coi: 'COI', license: 'License', w9: 'W-9', workers_comp: "Workers' Comp", other: 'Other' }
                                return (
                                  <tr key={doc.id} className="hover:bg-surface">
                                    <td className="px-4 py-3 font-medium text-ink-soft">{typeLabels[doc.type] ?? doc.type}</td>
                                    <td className="px-4 py-3">
                                      <span className={cn('whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[resolvedStatus] ?? 'bg-muted text-muted-fg')}>
                                        {resolvedStatus.replace('_', ' ')}
                                      </span>
                                    </td>
                                    <td className="px-4 py-3 text-muted-fg text-xs">
                                      {doc.expiry_date ? formatDate(doc.expiry_date, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-faint text-xs">
                                      {doc.created_at ? formatDate(doc.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      {doc.file_url ? (
                                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline font-medium">
                                          <ExternalLink className="h-3 w-3" /> View
                                        </a>
                                      ) : <span className="text-xs text-faint">No file</span>}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                        {/* Phone: a list. Five columns did not fit, and a document's
                            status and dates read as a sentence better than as cells. */}
                        <div className="divide-y divide-line-soft rounded-xl border border-line lg:hidden">
                          {profileData.complianceDocs.map((doc: any) => {
                            const isExpired = doc.expiry_date && new Date(doc.expiry_date + 'T00:00:00') < new Date()
                            const resolvedStatus = (doc.status === 'expired' && doc.expiry_date && !isExpired) ? 'approved' : doc.status
                            const statusColors: Record<string, string> = {
                              approved: 'bg-success-tint text-success',
                              pending: 'bg-warn-tint text-warn',
                              expired: 'bg-danger-tint text-danger',
                              missing: 'bg-danger-tint text-danger',
                              expiring_soon: 'bg-accent-tint text-accent-fg',
                            }
                            const typeLabels: Record<string, string> = { coi: 'COI', license: 'License', w9: 'W-9', workers_comp: "Workers' Comp", other: 'Other' }
                            return (
                              <div key={doc.id} className="flex items-start justify-between gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-ink">{typeLabels[doc.type] ?? doc.type}</p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-fg">
                                    <span>{expiryLabel(doc.expiry_date) ?? 'No expiry'}</span>
                                    {doc.created_at && <span className="text-faint">Uploaded {formatDate(doc.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                                    {doc.file_url
                                      ? <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent-fg hover:underline"><ExternalLink className="h-3 w-3" /> View</a>
                                      : <span className="text-faint">No file</span>}
                                  </p>
                                </div>
                                <span className={cn('whitespace-nowrap shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', statusColors[resolvedStatus] ?? 'bg-muted text-muted-fg')}>
                                  {resolvedStatus.replace('_', ' ')}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* PAYMENTS TAB */}
                  {profileTab === 'payments' && (
                    <div className="space-y-4">
                      {/* Invoices */}
                      {profileData.invoices?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">Invoices</p>
                          <div className="space-y-2">
                            {profileData.invoices.map((inv: any) => (
                              <div key={inv.id} className="rounded-lg border border-line bg-panel p-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-ink-soft truncate">{inv.invoice_number ?? `Invoice`}</p>
                                  <p className="text-xs text-faint">{inv.projects?.name ?? ''}{inv.due_date ? ` · Due ${formatDate(inv.due_date, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-semibold text-ink">${Number(inv.amount).toLocaleString()}</p>
                                  <span className={cn('whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full',
                                    inv.status === 'paid' ? 'bg-success-tint text-success' :
                                    inv.status === 'overdue' ? 'bg-danger-tint text-danger' :
                                    'bg-warn-tint text-warn')}>
                                    {inv.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Payment schedule */}
                      {profileData.payments?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide mb-2">Contract Milestones</p>
                          <div className="space-y-2">
                            {profileData.payments.map((p: any) => (
                              <div key={p.id} className="rounded-lg border border-line bg-panel p-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-ink-soft">{p.label}</p>
                                  <p className="text-xs text-faint">{p.subcontracts?.projects?.name ?? ''}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  {p.amount && <p className="text-sm font-semibold text-ink">${Number(p.amount).toLocaleString()}</p>}
                                  {p.percentage && <p className="text-xs text-faint">{p.percentage}%</p>}
                                  <span className={cn('whitespace-nowrap text-xs font-medium px-2 py-0.5 rounded-full',
                                    p.status === 'paid' ? 'bg-success-tint text-success' :
                                    p.status === 'invoiced' ? 'bg-info-tint text-info' :
                                    'bg-muted text-muted-fg')}>
                                    {p.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {profileData.invoices?.length === 0 && profileData.payments?.length === 0 && (
                        <div className="text-center py-10">
                          <p className="text-sm text-faint">No invoices or payment milestones yet.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* PROJECTS TAB */}
                  {profileTab === 'projects' && (
                    <div className="space-y-3">
                      {profileData.subcontracts?.length === 0 ? (
                        <div className="text-center py-10">
                          <p className="text-sm text-faint">Not on any projects yet.</p>
                        </div>
                      ) : (
                        profileData.subcontracts.map((sub: any) => {
                          const pid = sub.projects?.id
                          const inner = (
                            <>
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-medium text-ink-soft">{sub.projects?.name ?? 'Unknown Project'}</p>
                                <span className={cn('whitespace-nowrap text-xs px-2 py-0.5 rounded-full font-medium',
                                  sub.projects?.status === 'active' ? 'bg-success-tint text-success' : 'bg-muted text-muted-fg')}>
                                  {sub.projects?.status ?? ''}
                                </span>
                              </div>
                              <p className="text-xs text-muted-fg">{sub.trade ?? ''}{sub.scope ? ` · ${sub.scope}` : ''}</p>
                              {sub.contract_amount && <p className="text-sm font-semibold text-ink">${Number(sub.contract_amount).toLocaleString()}</p>}
                            </>
                          )
                          return pid ? (
                            <Link key={sub.id} href={`/projects/${pid}`} className="block rounded-lg border border-line bg-panel p-4 space-y-1 hover:border-accent hover:bg-surface transition-colors">
                              {inner}
                            </Link>
                          ) : (
                            <div key={sub.id} className="rounded-lg border border-line bg-panel p-4 space-y-1">{inner}</div>
                          )
                        })
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
