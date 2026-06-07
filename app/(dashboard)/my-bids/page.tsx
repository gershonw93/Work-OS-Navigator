'use client'

import { useEffect, useState } from 'react'
import { Package, Clock, CheckCircle2, XCircle, ChevronRight, ChevronDown, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import Link from 'next/link'

interface Invitation {
  id: string
  status: string
  invited_at: string
  bid_packages: {
    id: string
    scope: string
    description: string
    trade: string | null
    due_date: string | null
    status: string
    projects: { id: string; name: string; address: string; type: string }
  }
  my_bid: { id: string; amount: number; status: string } | null
}

type Tab = 'new' | 'revisions' | 'awarded'

export default function MyBidsPage() {
  const supabase = createClient()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('new')
  const [expandedJob, setExpandedJob] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const res = await fetch('/api/my-bids', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setInvitations(data.invitations)
      }
      setLoading(false)
    }
    load()
  }, [])

  // Tab grouping
  const newBids = invitations.filter(i =>
    i.bid_packages?.status === 'open' && !i.my_bid
  )
  const revisions = invitations.filter(i => i.my_bid?.status === 'revision_requested')
  const awarded = invitations.filter(i => i.my_bid?.status === 'awarded')

  // Auto-switch to tab with content if 'new' is empty
  const tabItems: Record<Tab, Invitation[]> = { new: newBids, revisions, awarded }
  const activeItems = tabItems[activeTab]

  // Group by project
  function groupByProject(items: Invitation[]) {
    const map = new Map<string, { projectName: string; projectAddress: string; projectId: string; items: Invitation[] }>()
    for (const inv of items) {
      const proj = inv.bid_packages?.projects
      const key = proj?.id ?? 'unknown'
      if (!map.has(key)) {
        map.set(key, { projectName: proj?.name ?? 'Unknown Project', projectAddress: proj?.address ?? '', projectId: proj?.id ?? '', items: [] })
      }
      map.get(key)!.items.push(inv)
    }
    return Array.from(map.values())
  }

  const grouped = groupByProject(activeItems)

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'new', label: 'New Bids', count: newBids.length },
    { key: 'revisions', label: 'Revisions', count: revisions.length },
    { key: 'awarded', label: 'Awarded', count: awarded.length },
  ]

  function BidCard({ inv }: { inv: Invitation }) {
    const pkg = inv.bid_packages
    return (
      <Link href={`/my-bids/${pkg.id}`}
        className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
        <div className="shrink-0">
          {activeTab === 'awarded' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          {activeTab === 'revisions' && <AlertCircle className="h-5 w-5 text-amber-400" />}
          {activeTab === 'new' && <Clock className="h-5 w-5 text-orange-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{pkg.scope}</span>
            {pkg.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{pkg.trade}</span>}
          </div>
          {pkg.due_date && (
            <p className="text-xs text-slate-400 mt-0.5">Bid due {new Date(pkg.due_date).toLocaleDateString()}</p>
          )}
          {activeTab === 'revisions' && (
            <p className="text-xs text-amber-600 mt-0.5 font-medium">Revision requested — update and resubmit</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3">
          {inv.my_bid && (
            <span className="text-sm font-semibold text-slate-700">${Number(inv.my_bid.amount).toLocaleString()}</span>
          )}
          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
        </div>
      </Link>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Bids</h1>
        <p className="text-sm text-slate-500 mt-0.5">Bid invitations and your submitted proposals.</p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : invitations.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No bid invitations yet"
          description="When a general contractor invites you to bid on a project, it will appear here."
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  'px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-2',
                  activeTab === t.key
                    ? 'border-b-2 border-orange-500 text-orange-600 -mb-px'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={cn(
                    'text-xs rounded-full px-1.5 py-0.5 font-semibold min-w-[20px] text-center',
                    activeTab === t.key ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-500'
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeItems.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">
              {activeTab === 'new' && 'No new bid invitations.'}
              {activeTab === 'revisions' && 'No revisions requested.'}
              {activeTab === 'awarded' && 'No awarded contracts yet.'}
            </div>
          ) : (
            <div className="space-y-3">
              {grouped.map(group => {
                const isSingle = group.items.length === 1
                const isExpanded = expandedJob === group.projectId

                if (isSingle) {
                  // Single bid for this job — direct card, show project name under scope
                  const inv = group.items[0]
                  const pkg = inv.bid_packages
                  return (
                    <Link key={group.projectId} href={`/my-bids/${pkg.id}`}
                      className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
                      <div className="shrink-0">
                        {activeTab === 'awarded' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {activeTab === 'revisions' && <AlertCircle className="h-5 w-5 text-amber-400" />}
                        {activeTab === 'new' && <Clock className="h-5 w-5 text-orange-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">{pkg.scope}</span>
                          {pkg.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{pkg.trade}</span>}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{group.projectName} · {group.projectAddress}</p>
                        {pkg.due_date && (
                          <p className="text-xs text-slate-400 mt-0.5">Bid due {new Date(pkg.due_date).toLocaleDateString()}</p>
                        )}
                        {activeTab === 'revisions' && (
                          <p className="text-xs text-amber-600 mt-0.5 font-medium">Revision requested — update and resubmit</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        {inv.my_bid && (
                          <span className="text-sm font-semibold text-slate-700">${Number(inv.my_bid.amount).toLocaleString()}</span>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
                      </div>
                    </Link>
                  )
                }

                // Multiple bids for same job — collapsible group
                const totalValue = group.items.reduce((s, i) => s + (i.my_bid?.amount ?? 0), 0)
                return (
                  <div key={group.projectId} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <button
                      onClick={() => setExpandedJob(isExpanded ? null : group.projectId)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="shrink-0">
                        {activeTab === 'awarded' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                        {activeTab === 'revisions' && <AlertCircle className="h-5 w-5 text-amber-400" />}
                        {activeTab === 'new' && <Clock className="h-5 w-5 text-orange-400" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-slate-900">{group.projectName}</span>
                        <p className="text-sm text-slate-500 mt-0.5">{group.projectAddress}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-3 text-sm text-slate-500">
                        <span className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded-full px-2.5 py-0.5 font-medium">
                          {group.items.length} proposals
                        </span>
                        {totalValue > 0 && (
                          <span className="font-semibold text-slate-700">${totalValue.toLocaleString()}</span>
                        )}
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4 text-slate-400" />
                          : <ChevronRight className="h-4 w-4 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-100 divide-y divide-slate-50 px-4 py-2 space-y-2 pb-3">
                        {group.items.map(inv => {
                          const pkg = inv.bid_packages
                          return (
                            <Link key={inv.id} href={`/my-bids/${pkg.id}`}
                              className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-orange-50 transition-colors group">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-slate-800 text-sm">{pkg.scope}</span>
                                  {pkg.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{pkg.trade}</span>}
                                </div>
                                {pkg.due_date && (
                                  <p className="text-xs text-slate-400 mt-0.5">Bid due {new Date(pkg.due_date).toLocaleDateString()}</p>
                                )}
                                {activeTab === 'revisions' && (
                                  <p className="text-xs text-amber-600 mt-0.5 font-medium">Revision requested</p>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-2">
                                {inv.my_bid && (
                                  <span className="text-sm font-semibold text-slate-700">${Number(inv.my_bid.amount).toLocaleString()}</span>
                                )}
                                <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-orange-400 transition-colors" />
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
