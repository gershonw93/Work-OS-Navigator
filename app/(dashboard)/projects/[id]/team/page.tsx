'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, X, Phone, Mail, HardHat, Building2, DollarSign, UserCircle2, Pencil, UserPlus, Sparkles, Loader2, Paperclip, ChevronDown, ChevronUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

const GC_ROLES = [
  'Project Manager', 'Site Manager', 'Superintendent', 'Foreman',
  'Laborer', 'Safety Officer', 'Quality Control', 'Other',
]

const TRADES = [
  'General Labor', 'Excavation', 'Concrete / Foundation', 'Masonry', 'Framing',
  'Carpentry', 'Roofing', 'Plumbing', 'Electrical', 'HVAC', 'Insulation',
  'Drywall', 'Painting', 'Flooring', 'Tile', 'Cabinetry / Millwork',
  'Windows / Glazing', 'Steel / Welding', 'Fire Protection', 'Low Voltage / Security',
  'Landscaping', 'Demolition', 'Other',
]

interface TeamMember {
  id: string
  name: string
  role: string
  phone: string | null
  email: string | null
}

interface CompanyProfile {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

interface Subcontract {
  id: string
  scope: string
  trade: string | null
  contract_amount: number
  status: string
  added_manually?: boolean | null
  proposal_url?: string | null
  line_items?: { description: string; amount: number | null }[] | null
  companies: { name: string; contact_email: string | null; phone: string | null } | null
}

export default function TeamPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Site Manager')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [showAddCompanyMember, setShowAddCompanyMember] = useState(false)
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState('')
  const [companyMemberRole, setCompanyMemberRole] = useState('Site Manager')
  const [companyMemberSaving, setCompanyMemberSaving] = useState(false)
  const [companyProfilesLoading, setCompanyProfilesLoading] = useState(false)

  // Add a subcontractor (manual / from directory)
  const [showAddSub, setShowAddSub] = useState(false)
  const [editingSubId, setEditingSubId] = useState<string | null>(null)
  const [expandedSubId, setExpandedSubId] = useState<string | null>(null)
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null)
  const [subMode, setSubMode] = useState<'new' | 'existing'>('new')
  const [subExistingId, setSubExistingId] = useState('')
  const [directorySubs, setDirectorySubs] = useState<{ id: string; name: string; trade: string | null }[]>([])
  const [subCompany, setSubCompany] = useState('')
  const [subTrade, setSubTrade] = useState('')
  const [subScope, setSubScope] = useState('')
  const [subLineItems, setSubLineItems] = useState<{ description: string; amount: string; qty?: number | null; unit?: string | null; unit_price?: number | null }[]>([{ description: '', amount: '' }])
  const [subPayments, setSubPayments] = useState<{ label: string; percent: string; amount: string }[]>([])
  const [subAmount, setSubAmount] = useState('')
  const [subStart, setSubStart] = useState('')
  const [subEnd, setSubEnd] = useState('')
  const [subEmail, setSubEmail] = useState('')
  const [subPhone, setSubPhone] = useState('')
  const [subProposal, setSubProposal] = useState<File | null>(null)
  const [subSaving, setSubSaving] = useState(false)
  const [subAnalyzing, setSubAnalyzing] = useState(false)
  const [subAnalyzeError, setSubAnalyzeError] = useState('')
  const [subScanned, setSubScanned] = useState(false)

  const lineItemsTotal = subLineItems.reduce((s, li) => s + (parseFloat(li.amount.replace(/[^0-9.]/g, '')) || 0), 0)
  const paymentTotalPct = Math.round(subPayments.reduce((s, p) => s + (parseFloat(p.percent.replace(/[^0-9.]/g, '')) || 0), 0))

  function resetSubForm() {
    setSubMode('new'); setSubExistingId('')
    setSubCompany(''); setSubTrade(''); setSubScope(''); setSubAmount('')
    setSubStart(''); setSubEnd('')
    setSubEmail(''); setSubPhone(''); setSubProposal(null); setSubScanned(false); setSubAnalyzeError('')
    setSubLineItems([{ description: '', amount: '' }]); setSubPayments([])
  }

  async function openEditSub(sub: Subcontract) {
    setEditingSubId(sub.id)
    setSubMode('new')
    setSubCompany(sub.companies?.name ?? '')
    setSubEmail(sub.companies?.contact_email ?? '')
    setSubPhone(sub.companies?.phone ?? '')
    setSubTrade(sub.trade ?? '')
    setSubScope(sub.scope ?? '')
    setSubAmount(sub.contract_amount ? String(sub.contract_amount) : '')
    const items = Array.isArray(sub.line_items) && sub.line_items.length > 0
      ? sub.line_items.map((li: any) => ({ description: li.description ?? '', amount: li.amount != null ? String(li.amount) : '' }))
      : [{ description: '', amount: '' }]
    setSubLineItems(items)
    setSubPayments([])
    setShowAddSub(true)
    // Load existing payment schedule milestones
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/subcontracts/${sub.id}/payment-schedule`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      if (Array.isArray(d.items) && d.items.length > 0) {
        setSubPayments(d.items.map((p: any) => ({
          label: p.label ?? '',
          percent: p.percentage != null ? String(p.percentage) : '',
          amount: p.amount != null ? String(p.amount) : '',
        })))
      }
    }
  }

  async function deleteSub(sub: Subcontract) {
    if (!confirm(`Remove ${sub.companies?.name ?? 'this subcontractor'} from the project?`)) return
    setDeletingSubId(sub.id)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/subcontracts/${sub.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    setDeletingSubId(null)
    if (!res.ok) { alert('Could not remove subcontractor.'); return }
    load()
  }

  function openAddSub() {
    setEditingSubId(null)
    resetSubForm()
    setShowAddSub(true)
    getToken().then(async token => {
      const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const d = await res.json()
      const subs = (d.companies ?? []).filter((c: any) => c.type === 'subcontractor').map((c: any) => ({ id: c.id, name: c.name, trade: c.trade }))
      setDirectorySubs(subs)
    })
  }

  function updateLineItem(i: number, field: 'description' | 'amount', val: string) {
    setSubLineItems(items => items.map((li, idx) => idx === i ? { ...li, [field]: val } : li))
  }
  function addLineItem() { setSubLineItems(items => [...items, { description: '', amount: '' }]) }
  function removeLineItem(i: number) { setSubLineItems(items => items.length > 1 ? items.filter((_, idx) => idx !== i) : items) }

  function updatePayment(i: number, field: 'label' | 'percent' | 'amount', val: string) {
    setSubPayments(items => items.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  }
  function addPayment() { setSubPayments(items => [...items, { label: '', percent: '', amount: '' }]) }
  function removePayment(i: number) { setSubPayments(items => items.filter((_, idx) => idx !== i)) }

  async function analyzeProposal(f: File) {
    setSubAnalyzing(true); setSubAnalyzeError(''); setSubScanned(false)
    setSubProposal(f)
    const token = await getToken()
    const form = new FormData()
    form.append('file', f)
    const res = await fetch(`/api/projects/${params.id}/subcontracts/analyze-proposal`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    const data = await res.json()
    if (!res.ok || !data.fields) {
      setSubAnalyzeError(data.error ?? 'Could not read proposal. Fill in manually.')
      setSubAnalyzing(false); return
    }
    const f2 = data.fields
    setSubMode('new')
    if (f2.company_name) setSubCompany(f2.company_name)
    if (f2.trade) setSubTrade(f2.trade)
    if (f2.scope) setSubScope(f2.scope)
    if (Array.isArray(f2.line_items) && f2.line_items.length > 0) {
      setSubLineItems(f2.line_items.map((li: any) => ({
        description: li.description ?? '',
        amount: li.amount != null ? String(li.amount) : '',
        qty: li.qty ?? null,
        unit: li.unit ?? null,
        unit_price: li.unit_price ?? null,
      })))
    }
    if (Array.isArray(f2.payment_schedule) && f2.payment_schedule.length > 0) {
      setSubPayments(f2.payment_schedule.map((p: any) => ({
        label: p.label ?? '',
        percent: p.percent != null ? String(p.percent) : '',
        amount: p.amount != null ? String(p.amount) : '',
      })))
    }
    if (f2.contract_amount != null) setSubAmount(String(f2.contract_amount))
    if (f2.contact_email) setSubEmail(f2.contact_email)
    if (f2.phone) setSubPhone(f2.phone)
    setSubScanned(true); setSubAnalyzing(false)
  }

  async function addSub(e: React.FormEvent) {
    e.preventDefault()
    setSubSaving(true)
    const token = await getToken()

    const cleanItemsArr = subLineItems
      .filter(li => li.description.trim() || li.amount.trim())
      .map(li => ({ description: li.description.trim(), amount: li.amount ? parseFloat(li.amount.replace(/[^0-9.]/g, '')) : null, qty: li.qty ?? null, unit: li.unit ?? null, unit_price: li.unit_price ?? null }))
    const cleanPayments = subPayments
      .filter(p => p.label.trim() || p.percent.trim() || p.amount.trim())
      .map(p => ({ label: p.label.trim(), percent: p.percent ? parseFloat(p.percent.replace(/[^0-9.]/g, '')) : null, amount: p.amount ? parseFloat(p.amount.replace(/[^0-9.]/g, '')) : null }))

    // Edit existing subcontract
    if (editingSubId) {
      const res = await fetch(`/api/projects/${params.id}/subcontracts/${editingSubId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          company_name: subCompany,
          contact_email: subEmail,
          phone: subPhone,
          trade: subTrade,
          scope: subScope,
          contract_amount: subAmount ? parseFloat(subAmount.replace(/[^0-9.]/g, '')) : (cleanItemsArr.reduce((s, li) => s + (li.amount || 0), 0) || null),
          line_items: cleanItemsArr,
          payment_schedule: cleanPayments,
        }),
      })
      if (!res.ok) {
        const e2 = await res.json().catch(() => ({}))
        alert(`Could not save: ${e2.error ?? res.statusText}`)
        setSubSaving(false); return
      }
      setShowAddSub(false); setEditingSubId(null); setSubSaving(false); resetSubForm(); load()
      return
    }

    const fd = new FormData()
    if (subMode === 'existing' && subExistingId) {
      fd.append('existing_company_id', subExistingId)
    } else {
      fd.append('company_name', subCompany)
      fd.append('contact_email', subEmail)
      fd.append('phone', subPhone)
    }
    fd.append('trade', subTrade)
    fd.append('scope', subScope)
    fd.append('contract_amount', subAmount)
    fd.append('start_date', subStart)
    fd.append('end_date', subEnd)
    fd.append('line_items', JSON.stringify(cleanItemsArr))
    fd.append('payment_schedule', JSON.stringify(cleanPayments))
    if (subProposal) fd.append('proposal', subProposal)
    const res = await fetch(`/api/projects/${params.id}/subcontracts`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    if (!res.ok) {
      const e2 = await res.json().catch(() => ({}))
      alert(`Could not add subcontractor: ${e2.error ?? res.statusText}`)
      setSubSaving(false); return
    }
    setSubMode('new'); setSubExistingId('')
    setSubCompany(''); setSubTrade(''); setSubScope(''); setSubAmount('')
    setSubStart(''); setSubEnd('')
    setSubEmail(''); setSubPhone(''); setSubProposal(null); setSubScanned(false); setSubAnalyzeError('')
    setSubLineItems([{ description: '', amount: '' }]); setSubPayments([])
    setShowAddSub(false); setSubSaving(false); load()
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/team`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setSubcontracts(data.subcontracts)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, role, phone: phone || null, email: email || null }),
    })
    if (res.ok) {
      setShowAdd(false)
      setName(''); setRole('Site Manager'); setPhone(''); setEmail('')
      load()
    }
    setSaving(false)
  }

  function openEditMember(member: TeamMember) {
    setEditMember(member)
    setEditName(member.name)
    setEditRole(member.role)
    setEditPhone(member.phone ?? '')
    setEditEmail(member.email ?? '')
  }

  async function handleEditMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editMember) return
    setEditSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/team/${editMember.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editName,
        role: editRole,
        phone: editPhone || null,
        email: editEmail || null,
      }),
    })
    setEditSaving(false)
    setEditMember(null)
    load()
  }

  async function removeMember(id: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/team/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  async function openAddMember() {
    setShowAdd(true)
    setCompanyProfilesLoading(true)
    const token = await getToken()
    const res = await fetch('/api/settings/teammates', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setCompanyProfiles(data.teammates ?? [])
    }
    setCompanyProfilesLoading(false)
  }

  async function openAddCompanyMember() {
    setShowAddCompanyMember(true)
    setCompanyProfilesLoading(true)
    const token = await getToken()
    // Use the teammates API (service role) so RLS doesn't hide company members
    const res = await fetch('/api/settings/teammates', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setCompanyProfiles(data.teammates ?? [])
    }
    setCompanyProfilesLoading(false)
  }

  async function addCompanyMember(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedProfileId) return
    setCompanyMemberSaving(true)
    const selectedProfile = companyProfiles.find(p => p.id === selectedProfileId)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: selectedProfile?.full_name ?? selectedProfile?.email ?? 'Unknown',
        role: companyMemberRole,
        email: selectedProfile?.email ?? null,
      }),
    })
    if (res.ok) {
      setShowAddCompanyMember(false)
      setSelectedProfileId('')
      setCompanyMemberRole('Site Manager')
      load()
    }
    setCompanyMemberSaving(false)
  }

  const totalContractValue = subcontracts.reduce((sum, s) => sum + Number(s.contract_amount), 0)

  return (
    <div className="space-y-6">

      {/* Edit Member Modal */}
      {editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Edit Team Member</h2>
              <button onClick={() => setEditMember(null)} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditMember}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Full Name <span className="text-danger">*</span></Label>
                  <Input id="edit-name" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Role <span className="text-danger">*</span></Label>
                  <Select id="edit-role" value={editRole} onChange={e => setEditRole(e.target.value)}>
                    {GC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input id="edit-phone" type="tel" placeholder="(555) 000-0000" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" type="email" placeholder="name@company.com" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditMember(null)}>Cancel</Button>
                <Button type="submit" disabled={editSaving || !editName.trim()}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add Team Member</h2>
              <button onClick={() => setShowAdd(false)} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={addMember}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name <span className="text-danger">*</span></Label>
                  <div className="relative">
                    <input
                      id="name"
                      type="text"
                      required
                      autoComplete="off"
                      className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                      placeholder="Search teammates or type a name…"
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                    {companyProfiles.length > 0 && (
                      <ul className="absolute z-10 w-full bg-panel border border-line rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {companyProfiles
                          .filter(p => !name || (p.full_name ?? p.email ?? '').toLowerCase().includes(name.toLowerCase()))
                          .map(p => (
                            <li key={p.id}>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent-tint hover:text-accent-fg flex items-center gap-2"
                                onClick={() => {
                                  setName(p.full_name ?? '')
                                  setEmail(p.email ?? '')
                                }}
                              >
                                <span className="font-medium">{p.full_name || p.email}</span>
                                {p.role && <span className="text-xs text-faint capitalize">{p.role.replace('_', ' ')}</span>}
                              </button>
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role <span className="text-danger">*</span></Label>
                  <Select id="role" value={role} onChange={e => setRole(e.target.value)}>
                    {GC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Company Member Modal */}
      {showAddCompanyMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">Add Company Member</h2>
              <button onClick={() => setShowAddCompanyMember(false)} className="text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={addCompanyMember}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                {companyProfilesLoading ? (
                  <p className="text-sm text-faint text-center py-4">Loading company members...</p>
                ) : companyProfiles.length === 0 ? (
                  <p className="text-sm text-faint text-center py-4">No other company members found.</p>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="company-member">Select Member <span className="text-danger">*</span></Label>
                    <Select id="company-member" value={selectedProfileId} onChange={e => setSelectedProfileId(e.target.value)} required>
                      <option value="">-- Choose a member --</option>
                      {companyProfiles.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email || p.id}{p.role ? ` (${p.role})` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="company-member-role">Project Role <span className="text-danger">*</span></Label>
                  <Select id="company-member-role" value={companyMemberRole} onChange={e => setCompanyMemberRole(e.target.value)}>
                    {GC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowAddCompanyMember(false)}>Cancel</Button>
                <Button type="submit" disabled={companyMemberSaving || !selectedProfileId}>
                  {companyMemberSaving ? 'Adding...' : 'Add to Project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subcontractor Manually Modal */}
      {showAddSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">{editingSubId ? 'Edit Subcontractor' : 'Add Subcontractor'}</h2>
                <p className="text-xs text-faint">{editingSubId ? 'Update this sub’s details.' : 'Enter a sub manually — they don’t need an account.'}</p>
              </div>
              <button onClick={() => { setShowAddSub(false); setEditingSubId(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={addSub}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                {/* New vs existing toggle (add only) */}
                {!editingSubId && (
                <div className="inline-flex rounded-lg border border-line p-0.5 text-sm">
                  <button type="button" onClick={() => setSubMode('new')}
                    className={cn('px-3 py-1 rounded-md font-medium', subMode === 'new' ? 'bg-slate-800 text-white' : 'text-muted-fg')}>
                    New subcontractor
                  </button>
                  <button type="button" onClick={() => setSubMode('existing')}
                    className={cn('px-3 py-1 rounded-md font-medium', subMode === 'existing' ? 'bg-slate-800 text-white' : 'text-muted-fg')}>
                    From my directory
                  </button>
                </div>
                )}

                {subMode === 'existing' ? (
                  <div className="space-y-1.5">
                    <Label>Choose subcontractor <span className="text-danger">*</span></Label>
                    <Select value={subExistingId} onChange={e => setSubExistingId(e.target.value)}>
                      <option value="">-- Pick from your saved subs --</option>
                      {directorySubs.map(s => <option key={s.id} value={s.id}>{s.name}{s.trade ? ` (${s.trade})` : ''}</option>)}
                    </Select>
                    {directorySubs.length === 0 && <p className="text-xs text-faint">No saved subs yet — add a new one and it'll be saved here for next time.</p>}
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label>Company Name <span className="text-danger">*</span></Label>
                      <Input placeholder="e.g. Joe's Plumbing" value={subCompany} onChange={e => setSubCompany(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label>Contact Email</Label>
                        <Input type="email" placeholder="joe@plumbing.com" value={subEmail} onChange={e => setSubEmail(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input placeholder="(555) 123-4567" value={subPhone} onChange={e => setSubPhone(e.target.value)} />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Trade</Label>
                  <Select value={subTrade} onChange={e => setSubTrade(e.target.value)}>
                    <option value="">-- Select trade --</option>
                    {subTrade && !TRADES.includes(subTrade) && <option value={subTrade}>{subTrade}</option>}
                    {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>

                {/* Scope as line items */}
                <div className="space-y-2">
                  <Label>Scope of Work — line items</Label>
                  <div className="space-y-2">
                    {subLineItems.map((li, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input className="flex-1" placeholder={`Item ${i + 1} — e.g. Rough-in plumbing`} value={li.description} onChange={e => updateLineItem(i, 'description', e.target.value)} />
                        <div className="relative w-28 shrink-0">
                          <span className="absolute left-2.5 top-2 text-faint text-sm">$</span>
                          <Input className="pl-5" placeholder="0" value={li.amount} onChange={e => updateLineItem(i, 'amount', e.target.value)} />
                        </div>
                        <button type="button" onClick={() => removeLineItem(i)} className="text-faint hover:text-danger shrink-0"><X className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addLineItem} className="text-xs font-medium text-accent-fg hover:underline flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add line item
                  </button>
                </div>

                <div className="space-y-1.5">
                  <Label>Contract Amount {lineItemsTotal > 0 && <span className="text-faint font-normal">(line items total: ${lineItemsTotal.toLocaleString()})</span>}</Label>
                  <Input placeholder={lineItemsTotal > 0 ? `Leave blank to use $${lineItemsTotal.toLocaleString()}` : 'e.g. 45000'} value={subAmount} onChange={e => setSubAmount(e.target.value)} />
                </div>

                {/* Payment schedule (deposit / progress / final) */}
                <div className="space-y-2 rounded-lg bg-surface border border-line p-3">
                  <div className="flex items-center justify-between">
                    <Label className="mb-0">Payment Schedule <span className="text-faint font-normal">(deposit / progress / final)</span></Label>
                    {paymentTotalPct > 0 && <span className={cn('text-xs font-semibold', Math.round(paymentTotalPct) === 100 ? 'text-success' : 'text-warn')}>{paymentTotalPct}%</span>}
                  </div>
                  {subPayments.length === 0 && <p className="text-xs text-faint">No payment terms yet. Scan a proposal or add milestones (e.g. 40% deposit, 50% at start, 10% completion).</p>}
                  {subPayments.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input className="flex-1" placeholder="e.g. Deposit on approval" value={p.label} onChange={e => updatePayment(i, 'label', e.target.value)} />
                      <div className="relative w-16 shrink-0">
                        <Input className="pr-5 text-right" placeholder="40" value={p.percent} onChange={e => updatePayment(i, 'percent', e.target.value)} />
                        <span className="absolute right-2 top-2 text-faint text-sm">%</span>
                      </div>
                      <div className="relative w-24 shrink-0">
                        <span className="absolute left-2.5 top-2 text-faint text-sm">$</span>
                        <Input className="pl-5" placeholder="0" value={p.amount} onChange={e => updatePayment(i, 'amount', e.target.value)} />
                      </div>
                      <button type="button" onClick={() => removePayment(i)} className="text-faint hover:text-danger shrink-0"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={addPayment} className="text-xs font-medium text-accent-fg hover:underline flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Add payment milestone
                  </button>
                </div>

                {!editingSubId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Start Date <span className="text-faint font-normal">(adds to schedule)</span></Label>
                    <Input type="date" value={subStart} onChange={e => setSubStart(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input type="date" value={subEnd} onChange={e => setSubEnd(e.target.value)} />
                  </div>
                </div>
                )}

                {/* Attach proposal / contract */}
                {!editingSubId && (
                <div className="space-y-1.5">
                  <Label><Paperclip className="inline h-3.5 w-3.5 mr-1 text-faint" />Attach proposal / contract <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={e => setSubProposal(e.target.files?.[0] ?? null)} />
                  {subProposal && <p className="text-xs text-faint truncate">📎 {subProposal.name}</p>}
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-fg cursor-pointer hover:underline">
                    {subAnalyzing
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</>
                      : <><Sparkles className="h-3.5 w-3.5" /> Or scan a file and let AI fill the form</>}
                    <input type="file" accept="image/*,application/pdf" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) analyzeProposal(f) }} />
                  </label>
                  {subAnalyzeError && <p className="text-xs text-danger flex items-center gap-1"><X className="h-3 w-3 shrink-0" />{subAnalyzeError}</p>}
                  {subScanned && !subAnalyzeError && <p className="text-xs font-medium text-success">✓ AI filled the fields below — review and edit as needed.</p>}
                </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowAddSub(false); setEditingSubId(null) }}>Cancel</Button>
                <Button type="submit" disabled={subSaving || (editingSubId ? !subCompany : (subMode === 'new' ? !subCompany : !subExistingId))}>{subSaving ? 'Saving...' : (editingSubId ? 'Save Changes' : 'Add Subcontractor')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Team</h1>
          <p className="text-sm text-muted-fg mt-0.5">Your crew and awarded subcontractors on this project.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto shrink-0">
          <Button variant="secondary" onClick={openAddCompanyMember}>
            <UserPlus className="h-4 w-4" />
            Add Company Member
          </Button>
          <Button onClick={() => openAddMember()}>
            <Plus className="h-4 w-4" />
            Add Member
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : (
        <div className="space-y-8">

          {/* GC Crew */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <HardHat className="h-4 w-4 text-muted-fg" />
              <p className="text-xs font-semibold text-faint uppercase tracking-wider">GC Crew</p>
            </div>
            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-10 text-center">
                <UserCircle2 className="h-8 w-8 text-faint mx-auto mb-2" />
                <p className="text-sm text-faint">No crew members added yet</p>
                <button onClick={() => openAddMember()} className="mt-2 text-sm text-accent-fg hover:underline">Add your first member</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map(member => (
                  <div key={member.id} className="group bg-panel rounded-xl border border-line px-4 py-3.5 flex items-start gap-3 hover:border-muted2 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-accent-tint flex items-center justify-center shrink-0 text-sm font-semibold text-accent-fg">
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm break-words">{member.name}</p>
                      <p className="text-xs text-muted-fg mt-0.5">{member.role}</p>
                      {member.phone && (
                        <a href={`tel:${member.phone}`} className="flex items-center gap-1 text-xs text-faint hover:text-muted-fg mt-1">
                          <Phone className="h-3 w-3" />{member.phone}
                        </a>
                      )}
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="flex items-center gap-1 text-xs text-faint hover:text-muted-fg mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" /><span className="truncate min-w-0">{member.email}</span>
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => openEditMember(member)}
                        className="text-faint hover:text-muted-fg transition-colors"
                        title="Edit member"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeMember(member.id)}
                        className="text-faint hover:text-danger transition-colors"
                        title="Remove member"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subcontractors */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-fg" />
                <p className="text-xs font-semibold text-faint uppercase tracking-wider">
                  Subcontractors ({subcontracts.length})
                </p>
              </div>
              <div className="flex items-center gap-3">
                {totalContractValue > 0 && (
                  <div className="flex items-center gap-1 text-sm text-muted-fg">
                    <DollarSign className="h-3.5 w-3.5" />
                    <span className="font-semibold text-ink-soft">{totalContractValue.toLocaleString()}</span>
                    <span className="text-xs">total contracted</span>
                  </div>
                )}
                <Button size="sm" variant="secondary" onClick={openAddSub}>
                  <Plus className="h-4 w-4" /> Add Sub
                </Button>
              </div>
            </div>
            {subcontracts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line py-10 text-center">
                <Building2 className="h-8 w-8 text-faint mx-auto mb-2" />
                <p className="text-sm text-faint">No subcontractors yet</p>
                <p className="text-xs text-faint mt-1">Award bids to populate this automatically, or use <strong>Add Sub</strong> to enter one manually.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {subcontracts.map(sub => {
                  const isOpen = expandedSubId === sub.id
                  const items = Array.isArray(sub.line_items) ? sub.line_items : []
                  return (
                    <div key={sub.id} className="bg-panel rounded-xl border border-line overflow-hidden">
                      {/* Collapsed row */}
                      <button onClick={() => setExpandedSubId(isOpen ? null : sub.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors text-left">
                        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-fg">
                          {(sub.companies?.name ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-ink text-sm">{sub.companies?.name ?? 'Unknown'}</span>
                            {sub.trade && <span className="text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{sub.trade}</span>}
                            {sub.added_manually && <span className="text-xs bg-warn-tint text-warn border border-warn/30 rounded-full px-2 py-0.5">Not on platform</span>}
                          </div>
                          {sub.scope && <p className="text-xs text-faint truncate mt-0.5">{sub.scope}</p>}
                        </div>
                        <span className="text-sm font-bold text-ink-soft shrink-0">${Number(sub.contract_amount ?? 0).toLocaleString()}</span>
                        {isOpen ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
                      </button>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div className="border-t border-line-soft px-4 py-4 space-y-4">
                          {items.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-faint uppercase tracking-wide mb-1.5">Scope / Line Items</p>
                              <div className="rounded-lg border border-line-soft divide-y divide-line-soft">
                                {items.map((li: any, i) => (
                                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                                    <span className="text-ink-soft">
                                      {li.description || `Item ${i + 1}`}
                                      {(li.qty != null || li.unit_price != null) && (
                                        <span className="text-faint text-xs ml-1">
                                          {li.qty != null ? `${Number(li.qty).toLocaleString()}${li.unit ? ` ${li.unit}` : ''}` : ''}{li.unit_price != null ? ` @ $${Number(li.unit_price).toLocaleString()}` : ''}
                                        </span>
                                      )}
                                    </span>
                                    <span className="text-muted-fg font-medium shrink-0">{li.amount != null ? `$${Number(li.amount).toLocaleString()}` : '—'}</span>
                                  </div>
                                ))}
                                <div className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm bg-surface font-semibold">
                                  <span className="text-ink-soft">Total</span>
                                  <span className="text-ink">${Number(sub.contract_amount ?? 0).toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                            {sub.companies?.contact_email && (
                              <a href={`mailto:${sub.companies.contact_email}`} className="flex items-center gap-1 text-muted-fg hover:text-ink-soft">
                                <Mail className="h-3.5 w-3.5" />{sub.companies.contact_email}
                              </a>
                            )}
                            {sub.companies?.phone && (
                              <a href={`tel:${sub.companies.phone}`} className="flex items-center gap-1 text-muted-fg hover:text-ink-soft">
                                <Phone className="h-3.5 w-3.5" />{sub.companies.phone}
                              </a>
                            )}
                            {sub.proposal_url && (
                              <a href={sub.proposal_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-accent-fg hover:underline">
                                <Paperclip className="h-3.5 w-3.5" />View proposal
                              </a>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <Button size="sm" variant="secondary" onClick={() => openEditSub(sub)}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                            <button onClick={() => deleteSub(sub)} disabled={deletingSubId === sub.id}
                              className="flex items-center gap-1 text-xs text-faint hover:text-danger transition-colors ml-auto">
                              <X className="h-3.5 w-3.5" /> {deletingSubId === sub.id ? 'Removing…' : 'Remove'}
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

        </div>
      )}
    </div>
  )
}
