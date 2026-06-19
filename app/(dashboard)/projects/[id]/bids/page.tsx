'use client'

import { useEffect, useState } from 'react'
import { Package, Plus, X, ChevronDown, ChevronUp, Award, Paperclip, Users, CheckCircle2, Clock, XCircle, Bell, FileText, RotateCcw, ChevronRight, Check, Ban, BarChart2, PenLine, Trash2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { BidLevelingModal } from '@/components/ui/bid-leveling-modal'
import { SignaturePad } from '@/components/signature-pad'
import { cn } from '@/lib/utils'

const TRADES = [
  'All Trades', 'Demolition', 'Concrete', 'Masonry', 'Structural Steel', 'Framing',
  'Roofing', 'Waterproofing', 'Insulation', 'Drywall', 'Doors & Hardware',
  'Glazing', 'Tile', 'Flooring', 'Paint', 'Electrical', 'Plumbing',
  'HVAC', 'Fire Protection', 'Elevators', 'Landscaping', 'Other',
]

interface Invitation {
  id: string
  company_id: string
  status: string
  companies: { name: string }
}

interface Attachment {
  id: string
  plan_id: string
  project_plans: { name: string; plan_type: string }
}

interface BidPackage {
  id: string
  scope: string
  description: string
  trade: string | null
  due_date: string | null
  status: string
  bid_invitations: Invitation[]
  bid_package_attachments: Attachment[]
}

interface Bid {
  id: string
  bid_package_id: string
  company_id: string
  amount: number
  notes: string | null
  status: string
  submitted_at: string | null
  duration_days: number | null
  crew_size: number | null
  earliest_start_date: string | null
  payment_terms: string | null
  proposal_url: string | null
  revision_note: string | null
  scope_categories: any[] | null
  bid_packages: { scope: string; project_id: string }
  companies: { name: string }
}

interface Plan { id: string; name: string; plan_type: string }
interface Company { id: string; name: string; trade: string | null; contact_email: string; has_account: boolean }

interface Subcontract {
  id: string
  bid_id: string | null
  gc_signed_at: string | null
  gc_signed_by: string | null
  gc_signature_url: string | null
  sub_signed_at: string | null
  sub_signed_by: string | null
  sub_signature_url: string | null
  fully_executed_at: string | null
}

export default function BidsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [packages, setPackages] = useState<BidPackage[]>([])
  const [bids, setBids] = useState<Bid[]>([])
  const [allPlans, setAllPlans] = useState<Plan[]>([])
  const [allCompanies, setAllCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, 'invitations' | 'bids'>>({})

  // New package form
  const [showNewPkg, setShowNewPkg] = useState(false)
  const [scope, setScope] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [trade, setTrade] = useState('All Trades')
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([])
  const [selectedPlans, setSelectedPlans] = useState<string[]>([])
  const [pkgLoading, setPkgLoading] = useState(false)
  const [pkgError, setPkgError] = useState<string | null>(null)
  const [companySearch, setCompanySearch] = useState('')

  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])

  const [awardingBid, setAwardingBid] = useState<string | null>(null)
  const [expandedBid, setExpandedBid] = useState<string | null>(null)
  const [levelingPkgId, setLevelingPkgId] = useState<string | null>(null)

  // Signature signing
  const [signBidId, setSignBidId] = useState<string | null>(null)
  const [signingLoading, setSigningLoading] = useState(false)
  const [signingError, setSigningError] = useState<string | null>(null)

  // Invite to existing package
  const [invitePkgId, setInvitePkgId] = useState<string | null>(null)
  const [inviteSelected, setInviteSelected] = useState<string[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [remindingCompany, setRemindingCompany] = useState<string | null>(null)

  // Post-award invite prompt
  const [awardInvitePrompt, setAwardInvitePrompt] = useState<{ company: Company; email: string } | null>(null)
  const [awardInviteLoading, setAwardInviteLoading] = useState(false)

  // Request revision
  const [revisionBid, setRevisionBid] = useState<Bid | null>(null)
  const [revisionNote, setRevisionNote] = useState('')
  const [revisionLoading, setRevisionLoading] = useState(false)
  const [revisionError, setRevisionError] = useState<string | null>(null)

  // Edit/Delete package
  const [editingPkg, setEditingPkg] = useState<BidPackage | null>(null)
  const [editPkgScope, setEditPkgScope] = useState('')
  const [editPkgTrade, setEditPkgTrade] = useState('')
  const [editPkgDescription, setEditPkgDescription] = useState('')
  const [editPkgDueDate, setEditPkgDueDate] = useState('')
  const [editPkgLoading, setEditPkgLoading] = useState(false)
  const [editPkgError, setEditPkgError] = useState<string | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  function openEditPkg(pkg: BidPackage) {
    setEditingPkg(pkg)
    setEditPkgScope(pkg.scope)
    setEditPkgTrade(pkg.trade ?? '')
    setEditPkgDescription(pkg.description)
    setEditPkgDueDate(pkg.due_date ?? '')
    setEditPkgError(null)
  }

  async function handleEditPkg(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPkg) return
    setEditPkgLoading(true)
    setEditPkgError(null)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids/packages/${editingPkg.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        scope: editPkgScope,
        trade: editPkgTrade || null,
        description: editPkgDescription,
        due_date: editPkgDueDate || null,
      }),
    })
    if (!res.ok) {
      const body = await res.json()
      setEditPkgError(body.error)
      setEditPkgLoading(false)
      return
    }
    setEditingPkg(null)
    setEditPkgLoading(false)
    fetchData()
  }

  async function handleDeletePkg(pkgId: string) {
    if (!window.confirm('Delete this bid package? This will delete all bids for this package.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/bids/packages/${pkgId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  async function fetchData() {
    setLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setPackages(data.packages)
      setBids(data.bids)
      setAllPlans(data.plans)
      setAllCompanies(data.companies)
      setSubcontracts(data.subcontracts ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  function toggleCompany(id: string) {
    setSelectedCompanies(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  function togglePlan(id: string) {
    setSelectedPlans(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  function resetForm() {
    setScope(''); setDescription(''); setDueDate(''); setTrade('All Trades')
    setSelectedCompanies([]); setSelectedPlans([]); setCompanySearch('')
    setPkgError(null)
  }

  async function createPackage(e: React.FormEvent) {
    e.preventDefault()
    setPkgError(null)
    setPkgLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        scope, description, due_date: dueDate,
        trade: trade === 'All Trades' ? null : trade,
        invited_company_ids: selectedCompanies,
        plan_ids: selectedPlans,
      }),
    })
    if (!res.ok) {
      const body = await res.json()
      setPkgError(body.error)
      setPkgLoading(false)
      return
    }
    resetForm()
    setShowNewPkg(false)
    setPkgLoading(false)
    fetchData()
  }

  async function inviteToPackage(e: React.FormEvent) {
    e.preventDefault()
    if (!invitePkgId) return
    setInviteError(null)
    setInviteLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids/${invitePkgId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_ids: inviteSelected }),
    })
    if (!res.ok) {
      const body = await res.json()
      setInviteError(body.error)
      setInviteLoading(false)
      return
    }
    setInvitePkgId(null); setInviteSelected([]); setInviteSearch('')
    setInviteLoading(false)
    fetchData()
  }

  async function remindSub(packageId: string, companyId: string) {
    setRemindingCompany(companyId)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/bids/${packageId}/remind`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ company_id: companyId }),
    })
    setRemindingCompany(null)
  }

  async function requestRevision(e: React.FormEvent) {
    e.preventDefault()
    if (!revisionBid) return
    setRevisionError(null)
    setRevisionLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids/${revisionBid.bid_package_id}/revise`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bid_id: revisionBid.id, revision_note: revisionNote }),
    })
    if (!res.ok) {
      const body = await res.json()
      setRevisionError(body.error)
      setRevisionLoading(false)
      return
    }
    setRevisionBid(null)
    setRevisionNote('')
    setRevisionLoading(false)
    fetchData()
  }

  async function awardBid(packageId: string, bidId: string) {
    setAwardingBid(bidId)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/bids/${packageId}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bid_id: bidId }),
    })
    setAwardingBid(null)
    // Check if the awarded sub lacks an account — prompt to invite
    const awardedBid = bids.find(b => b.id === bidId)
    if (awardedBid) {
      const company = allCompanies.find(c => c.id === awardedBid.company_id)
      if (company && !company.has_account) {
        setAwardInvitePrompt({ company, email: company.contact_email ?? '' })
      }
    }
    fetchData()
  }

  async function sendAwardInvite() {
    if (!awardInvitePrompt) return
    setAwardInviteLoading(true)
    const token = await getToken()
    await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        company_id: awardInvitePrompt.company.id,
        email: awardInvitePrompt.email,
        company_name: awardInvitePrompt.company.name,
      }),
    })
    setAwardInviteLoading(false)
    setAwardInvitePrompt(null)
  }

  async function signSubcontract(bidId: string, dataUrl: string, signerName: string) {
    const sub = subcontracts.find(s => s.bid_id === bidId)
    if (!sub) return
    setSigningLoading(true)
    setSigningError(null)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/subcontracts/${sub.id}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ signer_type: 'gc', signer_name: signerName, signature_data_url: dataUrl }),
    })
    if (!res.ok) {
      const body = await res.json()
      setSigningError(body.error ?? 'Failed to save signature')
      setSigningLoading(false)
      return
    }
    setSignBidId(null)
    setSigningLoading(false)
    fetchData()
  }

  const subForBid = (bidId: string) => subcontracts.find(s => s.bid_id === bidId) ?? null

  const bidsForPackage = (pkgId: string) => bids.filter(b => b.bid_package_id === pkgId)
  const filteredCompanies = allCompanies.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
      (c.trade ?? '').toLowerCase().includes(companySearch.toLowerCase())
    const matchesTrade = trade === 'All Trades' || !c.trade || c.trade === trade
    return matchesSearch && matchesTrade
  })

  const invitationIcon = (status: string) => {
    if (status === 'accepted') return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
    if (status === 'declined') return <XCircle className="h-3.5 w-3.5 text-red-400" />
    return <Clock className="h-3.5 w-3.5 text-amber-400" />
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">

      {/* Edit Package Modal */}
      {editingPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit Bid Package</h2>
              <button onClick={() => setEditingPkg(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditPkg}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Scope of Work</Label>
                  <Input value={editPkgScope} onChange={e => setEditPkgScope(e.target.value)} required placeholder="e.g. Electrical" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Trade</Label>
                    <Select value={editPkgTrade} onChange={e => setEditPkgTrade(e.target.value)}>
                      {TRADES.map(t => <option key={t} value={t === 'All Trades' ? '' : t}>{t}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Due Date</Label>
                    <Input type="date" value={editPkgDueDate} onChange={e => setEditPkgDueDate(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea rows={3} value={editPkgDescription} onChange={e => setEditPkgDescription(e.target.value)}
                    placeholder="Describe the work included in this package..."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
                {editPkgError && <p className="text-sm text-red-600">{editPkgError}</p>}
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditingPkg(null)}>Cancel</Button>
                <Button type="submit" disabled={editPkgLoading}>{editPkgLoading ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Signature Modal */}
      {signBidId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Sign as GC</h2>
                <p className="text-xs text-slate-500 mt-0.5">Your signature will be saved to this subcontract.</p>
              </div>
              <button
                onClick={() => { setSignBidId(null); setSigningError(null) }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-4 sm:px-6 py-5">
              {signingError && (
                <p className="mb-3 text-sm text-red-600">{signingError}</p>
              )}
              <SignaturePad
                onSign={(dataUrl, name) => signSubcontract(signBidId, dataUrl, name)}
                onCancel={() => { setSignBidId(null); setSigningError(null) }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Post-Award Invite Prompt */}
      {awardInvitePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900">Invite to Work OS Navigator?</h2>
              <p className="text-sm text-slate-600">
                Invite <span className="font-medium text-slate-900">{awardInvitePrompt.company.name}</span> to Work OS Navigator so they can see their awarded jobs and submit bids online.
              </p>
            </div>
            <div className="px-6 pb-5 flex flex-wrap gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setAwardInvitePrompt(null)}>
                Skip
              </Button>
              <Button
                type="button"
                disabled={awardInviteLoading}
                onClick={sendAwardInvite}
              >
                {awardInviteLoading ? 'Sending...' : `Yes, Invite ${awardInvitePrompt.company.name}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Request Revision Modal */}
      {revisionBid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Revision</h2>
                <p className="text-sm text-slate-500 mt-0.5">{revisionBid.companies?.name}</p>
              </div>
              <button onClick={() => { setRevisionBid(null); setRevisionNote(''); setRevisionError(null) }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={requestRevision}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Note to Subcontractor</label>
                  <textarea
                    rows={4}
                    autoFocus
                    placeholder="e.g. Please break out material and labor separately. Also confirm whether fire stopping is included."
                    value={revisionNote}
                    onChange={e => setRevisionNote(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  />
                  <p className="text-xs text-slate-400">The sub will be notified and can resubmit their bid.</p>
                </div>
                {revisionError && <p className="text-sm text-red-600">{revisionError}</p>}
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setRevisionBid(null); setRevisionNote('') }}>Cancel</Button>
                <Button type="submit" variant="outline" disabled={revisionLoading || !revisionNote.trim()}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  {revisionLoading ? 'Sending...' : 'Request Revision'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite to Existing Package Modal */}
      {invitePkgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-md min-w-0 max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Invite Subcontractors</h2>
              <button onClick={() => { setInvitePkgId(null); setInviteSelected([]); setInviteSearch('') }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={inviteToPackage}>
              <div className="px-4 sm:px-6 py-4 space-y-3">
                <Input placeholder="Search companies..." value={inviteSearch} onChange={e => setInviteSearch(e.target.value)} autoFocus />
                {(() => {
                  const invitedIds = new Set(packages.find(p => p.id === invitePkgId)?.bid_invitations.map(i => i.company_id) ?? [])
                  const available = allCompanies.filter(c =>
                    !invitedIds.has(c.id) &&
                    (c.name.toLowerCase().includes(inviteSearch.toLowerCase()) || (c.trade ?? '').toLowerCase().includes(inviteSearch.toLowerCase()))
                  )
                  return available.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4">
                      {allCompanies.length === 0 ? 'No companies in directory.' : 'All companies already invited or no matches.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {available.map(company => (
                        <button key={company.id} type="button"
                          onClick={() => setInviteSelected(prev => prev.includes(company.id) ? prev.filter(c => c !== company.id) : [...prev, company.id])}
                          className={cn('w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            inviteSelected.includes(company.id) ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          )}>
                          <div className={cn('h-4 w-4 rounded border-2 flex items-center justify-center shrink-0', inviteSelected.includes(company.id) ? 'border-orange-500 bg-orange-500' : 'border-slate-300')}>
                            {inviteSelected.includes(company.id) && <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{company.name}</p>
                            {company.trade && <p className="text-xs text-slate-400">{company.trade}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )
                })()}
                {inviteError && <p className="text-sm text-red-600">{inviteError}</p>}
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 sm:px-6 py-4 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setInvitePkgId(null); setInviteSelected([]) }}>Cancel</Button>
                <Button type="submit" disabled={inviteLoading || inviteSelected.length === 0}>
                  {inviteLoading ? 'Sending...' : `Invite${inviteSelected.length > 0 ? ` ${inviteSelected.length}` : ''}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Package Modal */}
      {showNewPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-2xl min-w-0 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">New Bid Package</h2>
              <button onClick={() => { setShowNewPkg(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createPackage}>
              <div className="px-4 sm:px-6 py-5 space-y-5">

                {/* Scope + Trade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="scope">Scope of Work</Label>
                    <Input id="scope" placeholder="e.g. Electrical" value={scope} onChange={e => setScope(e.target.value)} required autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trade">Trade</Label>
                    <Select id="trade" value={trade} onChange={e => setTrade(e.target.value)}>
                      {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1.5">
                  <Label htmlFor="description">Description</Label>
                  <textarea
                    id="description"
                    rows={3}
                    placeholder="Describe the work included in this package..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  />
                </div>

                {/* Due Date */}
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="dueDate">Bid Due Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>

                {/* Attach Plans */}
                {allPlans.length > 0 && (
                  <div className="space-y-2">
                    <Label>
                      <Paperclip className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                      Attach Plans <span className="text-slate-400 font-normal">(optional)</span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
                      {allPlans.map(plan => (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => togglePlan(plan.id)}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                            selectedPlans.includes(plan.id)
                              ? 'border-orange-400 bg-orange-50 text-orange-800'
                              : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <div className={cn('h-2 w-2 rounded-full shrink-0', selectedPlans.includes(plan.id) ? 'bg-orange-500' : 'bg-slate-300')} />
                          <span className="truncate">{plan.name}</span>
                          <span className="text-xs text-slate-400 shrink-0 capitalize">{plan.plan_type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invite Subs */}
                <div className="space-y-2">
                  <Label>
                    <Users className="inline h-3.5 w-3.5 mr-1 text-slate-400" />
                    Invite Subcontractors
                    {selectedCompanies.length > 0 && (
                      <span className="ml-2 text-xs font-normal text-orange-600">{selectedCompanies.length} selected</span>
                    )}
                  </Label>
                  <Input
                    placeholder="Search by name or trade..."
                    value={companySearch}
                    onChange={e => setCompanySearch(e.target.value)}
                    className="mb-2"
                  />
                  {filteredCompanies.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3 text-center">
                      {allCompanies.length === 0
                        ? 'No subcontractors in your directory yet. Add them first.'
                        : 'No matches found.'}
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {filteredCompanies.map(company => (
                        <button
                          key={company.id}
                          type="button"
                          onClick={() => toggleCompany(company.id)}
                          className={cn(
                            'w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                            selectedCompanies.includes(company.id)
                              ? 'border-orange-400 bg-orange-50'
                              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          )}
                        >
                          <div className={cn(
                            'h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                            selectedCompanies.includes(company.id)
                              ? 'border-orange-500 bg-orange-500'
                              : 'border-slate-300'
                          )}>
                            {selectedCompanies.includes(company.id) && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{company.name}</p>
                            {company.trade && <p className="text-xs text-slate-400">{company.trade}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {pkgError && <p className="text-sm text-red-600">{pkgError}</p>}
              </div>

              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 sm:px-6 py-4 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowNewPkg(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={pkgLoading}>
                  {pkgLoading ? 'Creating...' : `Create Package${selectedCompanies.length > 0 ? ` & Invite ${selectedCompanies.length}` : ''}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bid Leveling Modal */}
      {levelingPkgId && (() => {
        const pkg = packages.find(p => p.id === levelingPkgId)
        const pkgBids = bidsForPackage(levelingPkgId).filter(b => b.status === 'submitted' || b.status === 'awarded' || b.status === 'revision_requested' || b.amount > 0)
        if (!pkg) return null
        return (
          <BidLevelingModal
            packageName={pkg.scope}
            packageTrade={pkg.trade}
            bids={pkgBids as any}
            onClose={() => setLevelingPkgId(null)}
            onAward={async (bidId) => {
              await awardBid(pkg.id, bidId)
              setLevelingPkgId(null)
            }}
            awardingBid={awardingBid}
            packageStatus={pkg.status}
          />
        )
      })()}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bids</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage bid packages, invitations, and received bids.</p>
        </div>
        <Button onClick={() => setShowNewPkg(true)}>
          <Plus className="h-4 w-4" />
          New Bid Package
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : packages.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No bid packages yet"
          description="Create bid packages to define scopes of work, attach plans, and invite subcontractors to submit pricing."
          action={{ label: 'New Bid Package', onClick: () => setShowNewPkg(true) }}
        />
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => {
            const pkgBids = bidsForPackage(pkg.id)
            const isExpanded = expandedPkg === pkg.id
            const tab = activeTab[pkg.id] ?? 'invitations'
            const lowestBid = pkgBids.length > 0
              ? pkgBids.reduce((a, b) => a.amount < b.amount ? a : b)
              : null
            const invitedCount = pkg.bid_invitations?.length ?? 0
            const attachCount = pkg.bid_package_attachments?.length ?? 0

            return (
              <div key={pkg.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Package header */}
                <div
                  className="w-full flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => setExpandedPkg(isExpanded ? null : pkg.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setExpandedPkg(isExpanded ? null : pkg.id) }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-semibold text-slate-900">{pkg.scope}</span>
                      {pkg.trade && (
                        <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{pkg.trade}</span>
                      )}
                      <Badge variant={getStatusVariant(pkg.status)}>{pkg.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{pkg.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0 text-sm text-slate-500">
                    {attachCount > 0 && (
                      <span className="flex items-center gap-1">
                        <Paperclip className="h-3.5 w-3.5" />{attachCount}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />{invitedCount} invited
                    </span>
                    <span>{pkgBids.length} {pkgBids.length === 1 ? 'bid' : 'bids'}</span>
                    {pkg.due_date && <span>Due {new Date(pkg.due_date).toLocaleDateString()}</span>}
                    {lowestBid && pkg.status !== 'awarded' && (
                      <span className="text-green-600 font-medium">Low: ${Number(lowestBid.amount).toLocaleString()}</span>
                    )}
                    {pkgBids.length >= 2 && (
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setLevelingPkgId(pkg.id) }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors"
                        title="Open bid leveling sheet"
                      >
                        <BarChart2 className="h-3.5 w-3.5" />
                        Level Bids
                      </button>
                    )}
                    <button type="button" onClick={e => { e.stopPropagation(); openEditPkg(pkg) }}
                      className="p-1 text-slate-400 hover:text-slate-600" title="Edit package">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={e => { e.stopPropagation(); handleDeletePkg(pkg.id) }}
                      className="p-1 text-red-400 hover:text-red-600" title="Delete package">
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {/* Attachments bar */}
                    {attachCount > 0 && (
                      <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                        <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-xs text-slate-500 mr-1">Attached plans:</span>
                        {pkg.bid_package_attachments.map(a => (
                          <span key={a.id} className="text-xs bg-white border border-slate-200 rounded-full px-2.5 py-0.5 text-slate-700">
                            {a.project_plans?.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Invite more button */}
                    {pkg.status !== 'awarded' && (
                      <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => { setInvitePkgId(pkg.id); setInviteSelected([]) }}>
                          <Users className="h-3.5 w-3.5" />
                          Invite More Subs
                        </Button>
                      </div>
                    )}

                    {/* Tabs */}
                    <div className="flex border-b border-slate-100">
                      {(['invitations', 'bids'] as const).map(t => (
                        <button
                          key={t}
                          onClick={() => setActiveTab(prev => ({ ...prev, [pkg.id]: t }))}
                          className={cn(
                            'px-5 py-2.5 text-sm font-medium transition-colors capitalize',
                            tab === t
                              ? 'border-b-2 border-orange-500 text-orange-600'
                              : 'text-slate-500 hover:text-slate-700'
                          )}
                        >
                          {t === 'invitations' ? `Invitations (${invitedCount})` : `Bids (${pkgBids.length})`}
                        </button>
                      ))}
                    </div>

                    {/* Invitations tab */}
                    {tab === 'invitations' && (
                      <>
                        {invitedCount === 0 ? (
                          <div className="px-5 py-8 text-center text-sm text-slate-400">No subcontractors invited yet.</div>
                        ) : (
                          <>
                          {/* Mobile invitation cards */}
                          <div className="md:hidden divide-y divide-slate-100">
                            {pkg.bid_invitations.map(inv => {
                              const hasBid = pkgBids.find(b => b.company_id === inv.company_id)
                              return (
                                <div key={inv.id} className="px-4 py-3 space-y-1.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium text-slate-800 text-sm">{inv.companies?.name}</p>
                                    {!hasBid && pkg.status !== 'awarded' && (
                                      <Button
                                        size="sm" variant="ghost"
                                        disabled={remindingCompany === inv.company_id}
                                        onClick={() => remindSub(pkg.id, inv.company_id)}
                                        title="Send reminder notification"
                                      >
                                        <Bell className="h-3.5 w-3.5" />
                                        {remindingCompany === inv.company_id ? 'Sent' : 'Remind'}
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                    <span className="flex items-center gap-1.5 text-slate-600">
                                      {invitationIcon(inv.status)}
                                      <span className="capitalize">{inv.status}</span>
                                    </span>
                                    {hasBid ? (
                                      <span className="text-green-600 font-medium">${Number(hasBid.amount).toLocaleString()}</span>
                                    ) : (
                                      <span className="text-slate-400">No bid yet</span>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          {/* Desktop invitation table */}
                          <div className="hidden md:block">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="text-left px-5 py-3 font-medium text-slate-600">Subcontractor</th>
                                <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                                <th className="text-left px-5 py-3 font-medium text-slate-600">Bid Submitted</th>
                              <th className="px-5 py-3" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {pkg.bid_invitations.map(inv => {
                                const hasBid = pkgBids.find(b => b.company_id === inv.company_id)
                                return (
                                  <tr key={inv.id} className="hover:bg-slate-50">
                                    <td className="px-5 py-3 font-medium text-slate-800">{inv.companies?.name}</td>
                                    <td className="px-5 py-3">
                                      <span className="flex items-center gap-1.5 text-slate-600">
                                        {invitationIcon(inv.status)}
                                        <span className="capitalize">{inv.status}</span>
                                      </span>
                                    </td>
                                    <td className="px-5 py-3">
                                      {hasBid ? (
                                        <span className="text-green-600 font-medium">${Number(hasBid.amount).toLocaleString()}</span>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3 text-right">
                                      {!hasBid && pkg.status !== 'awarded' && (
                                        <Button
                                          size="sm" variant="ghost"
                                          disabled={remindingCompany === inv.company_id}
                                          onClick={() => remindSub(pkg.id, inv.company_id)}
                                          title="Send reminder notification"
                                        >
                                          <Bell className="h-3.5 w-3.5" />
                                          {remindingCompany === inv.company_id ? 'Sent' : 'Remind'}
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                          </div>
                          </>
                        )}
                      </>
                    )}

                    {/* Bids tab */}
                    {tab === 'bids' && (
                      <>
                        {pkgBids.length === 0 ? (
                          <div className="px-5 py-8 text-center text-sm text-slate-400">No bids received yet.</div>
                        ) : (
                          <>
                          {/* Mobile bid cards */}
                          <div className="md:hidden divide-y divide-slate-100">
                            {pkgBids.map((bid, i) => {
                              const isBidExpanded = expandedBid === bid.id
                              const scopeCats = (bid as any).scope_categories
                              const hasDetails = bid.notes || bid.payment_terms || (scopeCats && scopeCats.length > 0)
                              return (
                                <div key={bid.id} className={cn('px-4 py-3 space-y-2', bid.status === 'awarded' && 'bg-green-50')}>
                                  <button
                                    type="button"
                                    className="w-full text-left space-y-2"
                                    onClick={() => setExpandedBid(isBidExpanded ? null : bid.id)}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-1.5 font-medium text-slate-800 min-w-0">
                                        <ChevronRight className={cn('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', isBidExpanded && 'rotate-90')} />
                                        <span className="truncate">{bid.companies?.name}</span>
                                        {i === 0 && pkg.status !== 'awarded' && pkgBids.length > 1 && (
                                          <span className="text-xs text-green-600 font-normal shrink-0">low</span>
                                        )}
                                      </div>
                                      <Badge variant={getStatusVariant(bid.status)}>{bid.status}</Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
                                      <span className="font-semibold text-slate-900">${Number(bid.amount).toLocaleString()}</span>
                                      <span>{bid.duration_days ? `${bid.duration_days}d` : '—'}</span>
                                      <span>{bid.earliest_start_date ? new Date(bid.earliest_start_date).toLocaleDateString() : '—'}</span>
                                      <span>Crew: {bid.crew_size ?? '—'}</span>
                                    </div>
                                  </button>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {bid.proposal_url && (
                                      <a href={bid.proposal_url} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1"><FileText className="h-3 w-3" />View Proposal</a>
                                    )}
                                    {pkg.status !== 'awarded' && bid.status !== 'rejected' && bid.status !== 'awarded' && (
                                      <div className="flex items-center gap-1.5 ml-auto">
                                        <Button
                                          size="sm" variant="ghost"
                                          onClick={() => { setRevisionBid(bid); setRevisionNote('') }}
                                          title="Request revision from sub"
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                          Revise
                                        </Button>
                                        <Button size="sm" disabled={awardingBid === bid.id} onClick={() => awardBid(pkg.id, bid.id)}>
                                          <Award className="h-3.5 w-3.5" />
                                          {awardingBid === bid.id ? 'Awarding...' : 'Award'}
                                        </Button>
                                      </div>
                                    )}
                                    {bid.status === 'awarded' && (
                                      <span className="text-xs font-medium text-green-600 ml-auto">Awarded ✓</span>
                                    )}
                                    {bid.status === 'revision_requested' && pkg.status !== 'awarded' && (
                                      <span className="text-xs text-amber-600 font-medium ml-auto">Revision Requested</span>
                                    )}
                                  </div>
                                  {/* Signatures section — mobile */}
                                  {bid.status === 'awarded' && (() => {
                                    const sub = subForBid(bid.id)
                                    if (!sub) return null
                                    return (
                                      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Signatures</p>
                                        {sub.fully_executed_at && (
                                          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs font-semibold text-green-700 flex items-center gap-1.5">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            Fully Executed — {new Date(sub.fully_executed_at).toLocaleDateString()}
                                          </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="rounded-md border border-slate-200 px-3 py-2 space-y-1">
                                            <p className="text-xs text-slate-500 font-medium">GC Signature</p>
                                            {sub.gc_signed_at ? (
                                              <div className="flex items-center gap-1 text-xs text-green-600">
                                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{sub.gc_signed_by}</span>
                                              </div>
                                            ) : (
                                              <Button size="sm" variant="outline" className="w-full text-xs h-7" onClick={() => setSignBidId(bid.id)}>
                                                <PenLine className="h-3 w-3" />Sign as GC
                                              </Button>
                                            )}
                                          </div>
                                          <div className="rounded-md border border-slate-200 px-3 py-2 space-y-1">
                                            <p className="text-xs text-slate-500 font-medium">Sub Signature</p>
                                            {sub.sub_signed_at ? (
                                              <div className="flex items-center gap-1 text-xs text-green-600">
                                                <CheckCircle2 className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{sub.sub_signed_by}</span>
                                              </div>
                                            ) : (
                                              <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs px-2 py-0.5">Awaiting sub</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                  {isBidExpanded && (
                                    <div className={cn('rounded-lg px-3 py-3 space-y-4', bid.status === 'awarded' ? 'bg-green-50/50' : 'bg-slate-50/50')}>
                                      {scopeCats && scopeCats.length > 0 && (
                                        <div className="space-y-2">
                                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Scope Breakdown</p>
                                          {scopeCats.map((cat: any) => (
                                            <div key={cat.id} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                                              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                                                <span className="text-xs font-semibold text-slate-700">{cat.category || 'Uncategorized'}</span>
                                                <span className="text-xs font-semibold text-slate-500">
                                                  ${cat.items?.filter((i: any) => i.included && i.qty && i.unit_price)
                                                    .reduce((s: number, i: any) => s + i.qty * i.unit_price, 0)
                                                    .toLocaleString()}
                                                </span>
                                              </div>
                                              <div className="divide-y divide-slate-50">
                                                {cat.items?.map((item: any) => {
                                                  const total = item.qty && item.unit_price ? item.qty * item.unit_price : null
                                                  return (
                                                    <div key={item.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 text-xs',
                                                      !item.included && 'opacity-50')}>
                                                      {item.included
                                                        ? <Check className="h-3 w-3 text-green-500 shrink-0" />
                                                        : <Ban className="h-3 w-3 text-red-400 shrink-0" />}
                                                      <span className={cn('text-slate-700 flex-1 min-w-0', !item.included && 'line-through')}>{item.item}</span>
                                                      <span className="text-slate-400">{item.qty ? `×${item.qty}` : ''}</span>
                                                      <span className="text-slate-400">{item.unit_price ? `$${item.unit_price.toLocaleString()}` : ''}</span>
                                                      <span className="text-slate-600 font-medium">{total ? `$${total.toLocaleString()}` : '—'}</span>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      {bid.payment_terms && (
                                        <div>
                                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Payment Terms</p>
                                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{bid.payment_terms}</p>
                                        </div>
                                      )}
                                      {bid.notes && (
                                        <div>
                                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
                                          <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{bid.notes}</p>
                                        </div>
                                      )}
                                      {!hasDetails && (
                                        <p className="text-sm text-slate-400">No additional details provided.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                          {/* Desktop bid table */}
                          <div className="hidden md:block">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                              <tr>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Sub</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Duration</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Start</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Crew</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Proposal</th>
                                <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                                <th className="px-4 py-3" />
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pkgBids.map((bid, i) => {
                                const isBidExpanded = expandedBid === bid.id
                                const scopeCats = (bid as any).scope_categories
                                const hasDetails = bid.notes || bid.payment_terms || (scopeCats && scopeCats.length > 0)
                                return (
                                  <>
                                    <tr
                                      key={bid.id}
                                      className={cn('hover:bg-slate-50 cursor-pointer transition-colors', bid.status === 'awarded' && 'bg-green-50 hover:bg-green-50/80')}
                                      onClick={() => setExpandedBid(isBidExpanded ? null : bid.id)}
                                    >
                                      <td className="px-4 py-3 font-medium text-slate-800">
                                        <div className="flex items-center gap-1.5">
                                          <ChevronRight className={cn('h-3.5 w-3.5 text-slate-400 transition-transform shrink-0', isBidExpanded && 'rotate-90')} />
                                          {bid.companies?.name}
                                          {i === 0 && pkg.status !== 'awarded' && pkgBids.length > 1 && (
                                            <span className="text-xs text-green-600 font-normal">low</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 font-semibold text-slate-900">${Number(bid.amount).toLocaleString()}</td>
                                      <td className="px-4 py-3 text-slate-600">{bid.duration_days ? `${bid.duration_days}d` : '—'}</td>
                                      <td className="px-4 py-3 text-slate-600">{bid.earliest_start_date ? new Date(bid.earliest_start_date).toLocaleDateString() : '—'}</td>
                                      <td className="px-4 py-3 text-slate-600">{bid.crew_size ?? '—'}</td>
                                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                        {bid.proposal_url
                                          ? <a href={bid.proposal_url} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1"><FileText className="h-3 w-3" />View</a>
                                          : <span className="text-slate-400 text-xs">—</span>}
                                      </td>
                                      <td className="px-4 py-3">
                                        <Badge variant={getStatusVariant(bid.status)}>{bid.status}</Badge>
                                      </td>
                                      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                        {pkg.status !== 'awarded' && bid.status !== 'rejected' && bid.status !== 'awarded' && (
                                          <div className="flex items-center gap-1.5 justify-end">
                                            <Button
                                              size="sm" variant="ghost"
                                              onClick={() => { setRevisionBid(bid); setRevisionNote('') }}
                                              title="Request revision from sub"
                                            >
                                              <RotateCcw className="h-3.5 w-3.5" />
                                              Revise
                                            </Button>
                                            <Button size="sm" disabled={awardingBid === bid.id} onClick={() => awardBid(pkg.id, bid.id)}>
                                              <Award className="h-3.5 w-3.5" />
                                              {awardingBid === bid.id ? 'Awarding...' : 'Award'}
                                            </Button>
                                          </div>
                                        )}
                                        {bid.status === 'awarded' && (
                                          <span className="text-xs font-medium text-green-600">Awarded ✓</span>
                                        )}
                                        {bid.status === 'revision_requested' && pkg.status !== 'awarded' && (
                                          <span className="text-xs text-amber-600 font-medium">Revision Requested</span>
                                        )}
                                      </td>
                                    </tr>
                                    {isBidExpanded && (
                                      <tr key={`${bid.id}-detail`} className={cn(bid.status === 'awarded' ? 'bg-green-50/50' : 'bg-slate-50/50')}>
                                        <td colSpan={8} className="px-6 pb-5 pt-2">
                                          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">

                                            {/* Scope Breakdown */}
                                            {scopeCats && scopeCats.length > 0 && (
                                              <div className="md:col-span-2 space-y-2">
                                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Scope Breakdown</p>
                                                {scopeCats.map((cat: any) => (
                                                  <div key={cat.id} className="rounded-lg border border-slate-200 overflow-hidden bg-white">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
                                                      <span className="text-xs font-semibold text-slate-700">{cat.category || 'Uncategorized'}</span>
                                                      <span className="text-xs font-semibold text-slate-500">
                                                        ${cat.items?.filter((i: any) => i.included && i.qty && i.unit_price)
                                                          .reduce((s: number, i: any) => s + i.qty * i.unit_price, 0)
                                                          .toLocaleString()}
                                                      </span>
                                                    </div>
                                                    <div className="divide-y divide-slate-50">
                                                      {cat.items?.map((item: any) => {
                                                        const total = item.qty && item.unit_price ? item.qty * item.unit_price : null
                                                        return (
                                                          <div key={item.id} className={cn('grid grid-cols-[16px_1fr_auto_auto_auto] gap-3 items-center px-3 py-1.5 text-xs',
                                                            !item.included && 'opacity-50')}>
                                                            {item.included
                                                              ? <Check className="h-3 w-3 text-green-500 shrink-0" />
                                                              : <Ban className="h-3 w-3 text-red-400 shrink-0" />}
                                                            <span className={cn('text-slate-700', !item.included && 'line-through')}>{item.item}</span>
                                                            <span className="text-slate-400">{item.qty ? `×${item.qty}` : ''}</span>
                                                            <span className="text-slate-400">{item.unit_price ? `$${item.unit_price.toLocaleString()}` : ''}</span>
                                                            <span className="text-slate-600 font-medium text-right">{total ? `$${total.toLocaleString()}` : '—'}</span>
                                                          </div>
                                                        )
                                                      })}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            )}

                                            {/* Notes + Payment Terms */}
                                            <div className="space-y-4">
                                              {bid.payment_terms && (
                                                <div>
                                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Payment Terms</p>
                                                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{bid.payment_terms}</p>
                                                </div>
                                              )}
                                              {bid.notes && (
                                                <div>
                                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
                                                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{bid.notes}</p>
                                                </div>
                                              )}
                                              {!hasDetails && (
                                                <p className="text-sm text-slate-400">No additional details provided.</p>
                                              )}
                                            </div>

                                            {/* Signatures section — desktop */}
                                            {bid.status === 'awarded' && (() => {
                                              const sub = subForBid(bid.id)
                                              if (!sub) return null
                                              return (
                                                <div className="md:col-span-3 rounded-lg border border-slate-200 bg-white px-4 py-3 space-y-3">
                                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Signatures</p>
                                                  {sub.fully_executed_at && (
                                                    <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm font-semibold text-green-700 flex items-center gap-2">
                                                      <CheckCircle2 className="h-4 w-4" />
                                                      Fully Executed — {new Date(sub.fully_executed_at).toLocaleDateString()}
                                                    </div>
                                                  )}
                                                  <div className="grid grid-cols-2 gap-4">
                                                    <div className="space-y-1">
                                                      <p className="text-xs font-medium text-slate-500">GC Signature</p>
                                                      {sub.gc_signed_at ? (
                                                        <div className="flex items-center gap-1.5 text-sm text-green-600">
                                                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                          <span className="font-medium">{sub.gc_signed_by}</span>
                                                          <span className="text-xs text-slate-400">{new Date(sub.gc_signed_at).toLocaleDateString()}</span>
                                                        </div>
                                                      ) : (
                                                        <Button size="sm" variant="outline" onClick={() => setSignBidId(bid.id)}>
                                                          <PenLine className="h-3.5 w-3.5" />Sign as GC
                                                        </Button>
                                                      )}
                                                    </div>
                                                    <div className="space-y-1">
                                                      <p className="text-xs font-medium text-slate-500">Sub Signature</p>
                                                      {sub.sub_signed_at ? (
                                                        <div className="flex items-center gap-1.5 text-sm text-green-600">
                                                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                          <span className="font-medium">{sub.sub_signed_by}</span>
                                                          <span className="text-xs text-slate-400">{new Date(sub.sub_signed_at).toLocaleDateString()}</span>
                                                        </div>
                                                      ) : (
                                                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs px-2.5 py-1">Awaiting sub signature</span>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                              )
                                            })()}
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                )
                              })}
                            </tbody>
                          </table>
                          </div>
                          </>
                        )}
                      </>
                    )}
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
