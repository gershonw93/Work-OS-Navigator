'use client'

import { useEffect, useState } from 'react'
import { Package, Plus, X, ChevronDown, ChevronUp, Award } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

interface BidPackage {
  id: string
  scope: string
  description: string
  due_date: string | null
  status: string
  bid_invitations: { count: number }[]
  bids: { count: number }[]
}

interface Bid {
  id: string
  bid_package_id: string
  company_id: string
  amount: number
  notes: string | null
  status: string
  submitted_at: string | null
  bid_packages: { scope: string; project_id: string }
  companies: { name: string }
}

export default function BidsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [packages, setPackages] = useState<BidPackage[]>([])
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null)

  const [showNewPkg, setShowNewPkg] = useState(false)
  const [scope, setScope] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [pkgLoading, setPkgLoading] = useState(false)
  const [pkgError, setPkgError] = useState<string | null>(null)

  const [awardingBid, setAwardingBid] = useState<string | null>(null)

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
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  async function createPackage(e: React.FormEvent) {
    e.preventDefault()
    setPkgError(null)
    setPkgLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/bids`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scope, description, due_date: dueDate }),
    })
    if (!res.ok) {
      const body = await res.json()
      setPkgError(body.error)
      setPkgLoading(false)
      return
    }
    setScope(''); setDescription(''); setDueDate('')
    setShowNewPkg(false)
    setPkgLoading(false)
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
    fetchData()
  }

  const bidsForPackage = (pkgId: string) => bids.filter(b => b.bid_package_id === pkgId)

  return (
    <div className="p-6 space-y-6">
      {/* New Package Modal */}
      {showNewPkg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-900">New Bid Package</h2>
              <button onClick={() => { setShowNewPkg(false); setPkgError(null) }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createPackage} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="scope">Scope of Work</Label>
                <Input id="scope" placeholder="e.g. Electrical" value={scope} onChange={e => setScope(e.target.value)} required autoFocus />
              </div>
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
              <div className="space-y-1.5">
                <Label htmlFor="dueDate">Bid Due Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                <Input id="dueDate" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              {pkgError && <p className="text-sm text-red-600">{pkgError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="secondary" onClick={() => setShowNewPkg(false)}>Cancel</Button>
                <Button type="submit" disabled={pkgLoading}>{pkgLoading ? 'Creating...' : 'Create Package'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bids</h1>
          <p className="text-sm text-slate-500 mt-0.5">Manage bid packages and review received bids.</p>
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
          description="Create bid packages to define scopes of work and invite subcontractors to submit pricing."
          action={{ label: 'New Bid Package', onClick: () => setShowNewPkg(true) }}
        />
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => {
            const pkgBids = bidsForPackage(pkg.id)
            const isExpanded = expandedPkg === pkg.id
            const lowestBid = pkgBids.length > 0
              ? pkgBids.reduce((a, b) => a.amount < b.amount ? a : b)
              : null

            return (
              <div key={pkg.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Package header row */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                  onClick={() => setExpandedPkg(isExpanded ? null : pkg.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-slate-900">{pkg.scope}</span>
                      <Badge variant={getStatusVariant(pkg.status)}>{pkg.status}</Badge>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{pkg.description}</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0 text-sm text-slate-500">
                    <span>{pkgBids.length} {pkgBids.length === 1 ? 'bid' : 'bids'}</span>
                    {pkg.due_date && <span>Due {new Date(pkg.due_date).toLocaleDateString()}</span>}
                    {lowestBid && pkg.status !== 'awarded' && (
                      <span className="text-green-600 font-medium">Low: ${Number(lowestBid.amount).toLocaleString()}</span>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {/* Expanded bids */}
                {isExpanded && (
                  <div className="border-t border-slate-100">
                    {pkgBids.length === 0 ? (
                      <div className="px-5 py-8 text-center text-sm text-slate-400">
                        No bids received yet for this package.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-100">
                          <tr>
                            <th className="text-left px-5 py-3 font-medium text-slate-600">Subcontractor</th>
                            <th className="text-left px-5 py-3 font-medium text-slate-600">Amount</th>
                            <th className="text-left px-5 py-3 font-medium text-slate-600">Notes</th>
                            <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                            <th className="text-left px-5 py-3 font-medium text-slate-600">Submitted</th>
                            <th className="px-5 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {pkgBids
                            .sort((a, b) => a.amount - b.amount)
                            .map((bid, i) => (
                            <tr key={bid.id} className={cn('hover:bg-slate-50', bid.status === 'awarded' && 'bg-green-50')}>
                              <td className="px-5 py-3 font-medium text-slate-800">
                                {bid.companies?.name}
                                {i === 0 && pkg.status !== 'awarded' && pkgBids.length > 1 && (
                                  <span className="ml-2 text-xs text-green-600 font-normal">lowest</span>
                                )}
                              </td>
                              <td className="px-5 py-3 font-semibold text-slate-900">${Number(bid.amount).toLocaleString()}</td>
                              <td className="px-5 py-3 text-slate-500 max-w-xs truncate">{bid.notes ?? '—'}</td>
                              <td className="px-5 py-3">
                                <Badge variant={getStatusVariant(bid.status)}>{bid.status}</Badge>
                              </td>
                              <td className="px-5 py-3 text-slate-500">
                                {bid.submitted_at ? new Date(bid.submitted_at).toLocaleDateString() : '—'}
                              </td>
                              <td className="px-5 py-3 text-right">
                                {pkg.status !== 'awarded' && bid.status !== 'rejected' && (
                                  <Button
                                    size="sm"
                                    disabled={awardingBid === bid.id}
                                    onClick={() => awardBid(pkg.id, bid.id)}
                                  >
                                    <Award className="h-3.5 w-3.5" />
                                    {awardingBid === bid.id ? 'Awarding...' : 'Award'}
                                  </Button>
                                )}
                                {bid.status === 'awarded' && (
                                  <span className="text-xs font-medium text-green-600">Awarded</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
