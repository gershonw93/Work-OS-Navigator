'use client'

import { useEffect, useState } from 'react'
import { Package, Plus, X, ChevronDown, ChevronUp, Award, Paperclip, Users, CheckCircle2, Clock, XCircle, Bell, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
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
  bid_packages: { scope: string; project_id: string }
  companies: { name: string }
}

interface Plan { id: string; name: string; plan_type: string }
interface Company { id: string; name: string; trade: string | null; contact_email: string }

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

  const [awardingBid, setAwardingBid] = useState<string | null>(null)

  // Invite to existing package
  const [invitePkgId, setInvitePkgId] = useState<string | null>(null)
  const [inviteSelected, setInviteSelected] = useState<string[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  const [remindingCompany, setRemindingCompany] = useState<string | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
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

  async function awardBid(packageId: string, bidId: string) {
    setAwardingBid(bidId)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/bids/${packageId}/award`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ bid_id: bidId }),
    })
    setAwardingBid(null)
    fetchData()
  }

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
    <div className="p-6 space-y-6">

      {/* Invite to Existing Package Modal */}
      {invitePkgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Invite Subcontractors</h2>
              <button onClick={() => { setInvitePkgId(null); setInviteSelected([]); setInviteSearch('') }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={inviteToPackage}>
              <div className="px-6 py-4 space-y-3">
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
              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">New Bid Package</h2>
              <button onClick={() => { setShowNewPkg(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={createPackage}>
              <div className="px-6 py-5 space-y-5">

                {/* Scope + Trade */}
                <div className="grid grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1">
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

              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowNewPkg(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={pkgLoading}>
                  {pkgLoading ? 'Creating...' : `Create Package${selectedCompanies.length > 0 ? ` & Invite ${selectedCompanies.length}` : ''}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
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
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => setExpandedPkg(isExpanded ? null : pkg.id)}
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
                  <div className="flex items-center gap-5 shrink-0 text-sm text-slate-500">
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
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

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
                        )}
                      </>
                    )}

                    {/* Bids tab */}
                    {tab === 'bids' && (
                      <>
                        {pkgBids.length === 0 ? (
                          <div className="px-5 py-8 text-center text-sm text-slate-400">No bids received yet.</div>
                        ) : (
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
                            <tbody className="divide-y divide-slate-50">
                              {pkgBids.map((bid, i) => (
                                <tr key={bid.id} className={cn('hover:bg-slate-50', bid.status === 'awarded' && 'bg-green-50')}>
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                    {bid.companies?.name}
                                    {i === 0 && pkg.status !== 'awarded' && pkgBids.length > 1 && (
                                      <span className="ml-1.5 text-xs text-green-600 font-normal">low</span>
                                    )}
                                    {bid.notes && (
                                      <p className="text-xs text-slate-400 mt-0.5 max-w-[160px] truncate" title={bid.notes}>{bid.notes}</p>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-semibold text-slate-900">${Number(bid.amount).toLocaleString()}</td>
                                  <td className="px-4 py-3 text-slate-600">{bid.duration_days ? `${bid.duration_days}d` : '—'}</td>
                                  <td className="px-4 py-3 text-slate-600">{bid.earliest_start_date ? new Date(bid.earliest_start_date).toLocaleDateString() : '—'}</td>
                                  <td className="px-4 py-3 text-slate-600">{bid.crew_size ?? '—'}</td>
                                  <td className="px-4 py-3">
                                    {bid.proposal_url
                                      ? <a href={bid.proposal_url} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline flex items-center gap-1"><FileText className="h-3 w-3" />View</a>
                                      : <span className="text-slate-400 text-xs">—</span>}
                                  </td>
                                  <td className="px-4 py-3">
                                    <Badge variant={getStatusVariant(bid.status)}>{bid.status}</Badge>
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    {pkg.status !== 'awarded' && bid.status !== 'rejected' && (
                                      <Button size="sm" disabled={awardingBid === bid.id} onClick={() => awardBid(pkg.id, bid.id)}>
                                        <Award className="h-3.5 w-3.5" />
                                        {awardingBid === bid.id ? 'Awarding...' : 'Award'}
                                      </Button>
                                    )}
                                    {bid.status === 'awarded' && (
                                      <span className="text-xs font-medium text-green-600">Awarded ✓</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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
