'use client'

import { useEffect, useState } from 'react'
import { Package, Clock, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'
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

export default function MyBidsPage() {
  const supabase = createClient()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [loading, setLoading] = useState(true)

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

  const open = invitations.filter(i => (i.bid_packages?.status === 'open' && !i.my_bid) || i.my_bid?.status === 'revision_requested')
  const submitted = invitations.filter(i => i.my_bid && i.my_bid.status !== 'revision_requested')
  const closed = invitations.filter(i => i.bid_packages?.status !== 'open' && !i.my_bid)

  const statusIcon = (inv: Invitation) => {
    if (inv.my_bid?.status === 'awarded') return <CheckCircle2 className="h-5 w-5 text-green-500" />
    if (inv.my_bid?.status === 'rejected') return <XCircle className="h-5 w-5 text-red-400" />
    if (inv.my_bid) return <CheckCircle2 className="h-5 w-5 text-blue-500" />
    if (inv.bid_packages?.status === 'open') return <Clock className="h-5 w-5 text-amber-400" />
    return <XCircle className="h-5 w-5 text-slate-300" />
  }

  const statusLabel = (inv: Invitation) => {
    if (inv.my_bid?.status === 'awarded') return { label: 'Awarded', color: 'success' as const }
    if (inv.my_bid?.status === 'rejected') return { label: 'Not Selected', color: 'danger' as const }
    if (inv.my_bid?.status === 'revision_requested') return { label: 'Revision Requested', color: 'warning' as const }
    if (inv.my_bid) return { label: 'Bid Submitted', color: 'default' as const }
    if (inv.bid_packages?.status === 'open') return { label: 'Action Required', color: 'warning' as const }
    return { label: 'Closed', color: 'muted' as const }
  }

  function renderGroup(title: string, items: Invitation[]) {
    if (items.length === 0) return null
    return (
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{title}</p>
        <div className="space-y-2">
          {items.map(inv => {
            const pkg = inv.bid_packages
            const { label, color } = statusLabel(inv)
            return (
              <Link key={inv.id} href={`/my-bids/${pkg.id}`}
                className="flex items-center gap-4 bg-white rounded-xl border border-slate-200 px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all group">
                <div className="shrink-0">{statusIcon(inv)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-semibold text-slate-900">{pkg.scope}</span>
                    {pkg.trade && <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{pkg.trade}</span>}
                    <Badge variant={color}>{label}</Badge>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5">{pkg.projects?.name} · {pkg.projects?.address}</p>
                  {pkg.due_date && (
                    <p className="text-xs text-slate-400 mt-1">
                      Bid due {new Date(pkg.due_date).toLocaleDateString()}
                    </p>
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
          })}
        </div>
      </div>
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
        <div className="space-y-7">
          {renderGroup('Action Required', open)}
          {renderGroup('Submitted', submitted)}
          {renderGroup('Closed', closed)}
        </div>
      )}
    </div>
  )
}
