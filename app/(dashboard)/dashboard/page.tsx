'use client'

import { useEffect, useState } from 'react'
import { FolderKanban, AlertCircle, ShieldAlert, MessageSquare, Package } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/stat-card'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  message: string
  read: boolean
  created_at: string
}

interface Project {
  id: string
  name: string
  status: string
  start_date: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [newBidNotifications, setNewBidNotifications] = useState<Notification[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()

      const [notifRes, projRes] = await Promise.all([
        fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
      ])

      if (notifRes.ok) {
        const data = await notifRes.json()
        setNewBidNotifications(
          (data.notifications as Notification[]).filter(n => !n.read && n.type === 'new_bid')
        )
      }

      if (projRes.ok) {
        const data = await projRes.json()
        setProjects(data.projects ?? [])
      }

      setLoading(false)
    }
    load()
  }, [])

  async function dismissBidBanners() {
    const token = await getToken()
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mark_all_read: true }),
    })
    setNewBidNotifications([])
  }

  return (
    <div className="p-6 space-y-5">

      {/* New Bid Banner */}
      {newBidNotifications.length > 0 && (
        <div className="rounded-xl bg-orange-500 text-white px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {newBidNotifications.length === 1
                  ? 'You have a new bid invitation'
                  : `You have ${newBidNotifications.length} new bid invitations`}
              </p>
              <p className="text-sm text-orange-100 mt-0.5 line-clamp-1">
                {newBidNotifications[0].message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={dismissBidBanners}
              className="text-sm text-orange-200 hover:text-white transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Welcome back. Here's what's happening across your projects.</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active Projects" value={loading ? '—' : projects.filter(p => p.status === 'active').length.toString()} icon={FolderKanban} iconColor="text-orange-500" />
        <StatCard label="Pending Approvals" value="—" icon={AlertCircle} iconColor="text-yellow-500" />
        <StatCard label="Expiring Compliance" value="—" icon={ShieldAlert} iconColor="text-red-500" />
        <StatCard label="Open RFIs" value="—" icon={MessageSquare} iconColor="text-blue-500" />
      </div>

      {/* Recent Projects */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Projects</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description="Create your first project to get started."
              action={{ label: 'New Project', onClick: () => window.location.href = '/projects/new' }}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Name</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Status</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Start Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.slice(0, 5).map(p => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/projects/${p.id}/plans`} className="font-medium text-slate-900 hover:text-orange-600 transition-colors">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Badge variant={getStatusVariant(p.status)}>{p.status.replace('_', ' ')}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{new Date(p.start_date).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
