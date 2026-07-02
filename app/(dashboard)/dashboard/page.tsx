'use client'

import { useEffect, useState } from 'react'
import { FolderKanban, AlertCircle, ShieldAlert, MessageSquare, Package, CheckSquare, DollarSign, Briefcase, FileText, Receipt, Activity, FileUp, ClipboardList, CalendarCheck, ScrollText, UploadCloud, UserPlus, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/stat-card'
import { AdminOverview, type OverviewData } from '@/components/dashboard/admin-overview'
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

interface ActivityItem {
  id: string
  type: string
  message: string
  actor_name: string
  created_at: string
  project_id: string
  projects: { name: string } | null
}

interface GcStats {
  isSub: false
  activeProjects: number
  openRfis: number
  pendingApprovals: number
  openTasks: number
  expiringCompliance: number
  totalContractValue: number
}

interface SubStats {
  isSub: true
  activeJobs: number
  pendingInvoices: number
  paidThisMonth: number
  openRfis: number
  expiringCompliance: number
  totalContractValue: number
}

type Stats = GcStats | SubStats

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  plan_uploaded: FileUp,
  permit_added: ScrollText,
  permit_updated: ScrollText,
  inspection_added: CalendarCheck,
  inspection_updated: CalendarCheck,
  subcontractor_added: UserPlus,
  subcontractor_updated: UserPlus,
  daily_log_submitted: ClipboardList,
  rfi_submitted: MessageSquare,
  rfi_responded: MessageSquare,
  submittal_added: UploadCloud,
  submittal_updated: UploadCloud,
  task_created: CheckSquare,
  task_updated: CheckSquare,
  change_order_created: AlertCircle,
  change_order_updated: AlertCircle,
  compliance_added: ShieldAlert,
  compliance_updated: ShieldAlert,
  invoice_created: Receipt,
  invoice_updated: Receipt,
  file_uploaded: FileText,
  member_added: UserPlus,
}

function getActivityIcon(type: string): React.ElementType {
  return ACTIVITY_ICONS[type] ?? Activity
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function DashboardPage() {
  const supabase = createClient()
  const [newBidNotifications, setNewBidNotifications] = useState<Notification[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [activityIsAdmin, setActivityIsAdmin] = useState(false)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [firstName, setFirstName] = useState('')
  const [loading, setLoading] = useState(true)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  useEffect(() => {
    async function load() {
      const token = await getToken()

      const [notifRes, projRes, statsRes, activityRes, overviewRes, userRes] = await Promise.all([
        fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/dashboard/activity', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/dashboard/overview', { headers: { Authorization: `Bearer ${token}` } }),
        supabase.auth.getUser(),
      ])

      // Admin-only overview (403 for other roles → keep the standard layout)
      if (overviewRes.ok) {
        const ov = await overviewRes.json()
        setOverview(ov)
        // Prefer the profile's real name; fall back to auth metadata. Never the email.
        const meta = (userRes.data.user?.user_metadata?.full_name as string) ?? ''
        setFirstName(ov.first_name || meta.trim().split(/\s+/)[0] || '')
      }

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

      if (statsRes.ok) {
        setStats(await statsRes.json())
      }

      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.activity ?? [])
        setActivityIsAdmin(data.isAdmin ?? false)
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

  const v = (n: number | undefined) => loading || !stats ? '—' : String(n ?? 0)
  const money = (n: number | undefined) => loading || !stats ? '—' : n && n >= 1000000
    ? `$${(n / 1000000).toFixed(1)}M`
    : n && n >= 1000 ? `$${(n / 1000).toFixed(0)}K` : `$${(n ?? 0).toLocaleString()}`
  const isSub = stats?.isSub === true

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* New Bid Banner */}
      {newBidNotifications.length > 0 && (
        <div className="rounded-xl bg-accent text-accent-ink px-4 sm:px-5 py-4 flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <Package className="h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {newBidNotifications.length === 1
                  ? 'You have a new bid invitation'
                  : `You have ${newBidNotifications.length} new bid invitations`}
              </p>
              <p className="text-sm text-accent-ink/80 mt-0.5 line-clamp-1">
                {newBidNotifications[0].message}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={dismissBidBanners}
              className="text-sm text-accent-ink/70 hover:text-accent-ink transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">
          {overview && firstName ? `${greeting()}, ${firstName}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-fg mt-0.5">
          {isSub
            ? "Welcome back. Here's a summary of your active jobs and financials."
            : "Here's what's happening across your jobs."}
        </p>
      </div>

      {/* Stat cards */}
      {stats?.isSub ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Active Jobs" value={v((stats as SubStats).activeJobs)} icon={Briefcase} iconColor="text-accent-fg" />
          <StatCard label="Pending Invoices" value={v((stats as SubStats).pendingInvoices)} icon={FileText} iconColor="text-yellow-500" />
          <StatCard label="Paid This Month" value={money((stats as SubStats).paidThisMonth)} icon={Receipt} iconColor="text-success" />
          <StatCard label="Open RFIs" value={v((stats as SubStats).openRfis)} icon={MessageSquare} iconColor="text-info" />
          <StatCard label="Expiring Docs" value={v((stats as SubStats).expiringCompliance)} icon={ShieldAlert} iconColor="text-danger" />
          <StatCard label="Contract Value" value={money((stats as SubStats).totalContractValue)} icon={DollarSign} iconColor="text-muted-fg" />
        </div>
      ) : overview ? (
        <>
          {/* Admin tiles — each links to its page */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active Projects', value: v((stats as GcStats | null)?.activeProjects), icon: FolderKanban, cls: 'text-accent-fg', href: '/projects' },
              { label: 'Under Contract', value: money((stats as GcStats | null)?.totalContractValue), icon: DollarSign, cls: 'text-success', href: '/master-money' },
              { label: 'Open Tasks', value: v((stats as GcStats | null)?.openTasks), icon: CheckSquare, cls: 'text-info', href: '/master-calendar' },
              { label: 'Due This Week', value: loading ? '—' : String(overview.dueThisWeek), icon: Clock, cls: 'text-warn', href: '/master-calendar' },
            ].map(t => (
              <Link key={t.label} href={t.href}
                className="rounded-xl border border-line bg-panel px-4 py-4 transition-colors hover:border-accent hover:bg-surface">
                <div className="flex items-center gap-2 mb-2">
                  <t.icon className={`h-4 w-4 ${t.cls}`} />
                  <span className={`text-xs font-semibold ${t.cls}`}>{t.label}</span>
                </div>
                <p className={`text-2xl font-extrabold ${t.cls}`}>{t.value}</p>
              </Link>
            ))}
          </div>

          {/* Needs-attention strip (only when something needs it) */}
          {((stats as GcStats | null)?.pendingApprovals || (stats as GcStats | null)?.openRfis || (stats as GcStats | null)?.expiringCompliance) ? (
            <div className="flex flex-wrap gap-2">
              {((stats as GcStats)?.pendingApprovals ?? 0) > 0 && (
                <Link href="/approvals" className="inline-flex items-center gap-1.5 rounded-full bg-warn-tint text-warn text-xs font-medium px-3 py-1.5 hover:opacity-80">
                  <AlertCircle className="h-3.5 w-3.5" /> {(stats as GcStats).pendingApprovals} pending approval{(stats as GcStats).pendingApprovals !== 1 ? 's' : ''}
                </Link>
              )}
              {((stats as GcStats)?.openRfis ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-info-tint text-info text-xs font-medium px-3 py-1.5">
                  <MessageSquare className="h-3.5 w-3.5" /> {(stats as GcStats).openRfis} open RFI{(stats as GcStats).openRfis !== 1 ? 's' : ''}
                </span>
              )}
              {((stats as GcStats)?.expiringCompliance ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-tint text-danger text-xs font-medium px-3 py-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> {(stats as GcStats).expiringCompliance} compliance doc{(stats as GcStats).expiringCompliance !== 1 ? 's' : ''} expiring
                </span>
              )}
            </div>
          ) : null}

          {/* Cash chart + this week + recent projects */}
          <AdminOverview data={overview} />
        </>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Projects" value={v((stats as GcStats | null)?.activeProjects)} icon={FolderKanban} iconColor="text-accent-fg" />
          <StatCard label="Open RFIs" value={v((stats as GcStats | null)?.openRfis)} icon={MessageSquare} iconColor="text-info" />
          <StatCard label="Pending Approvals" value={v((stats as GcStats | null)?.pendingApprovals)} icon={AlertCircle} iconColor="text-yellow-500" />
          <StatCard label="Open Tasks" value={v((stats as GcStats | null)?.openTasks)} icon={CheckSquare} iconColor="text-purple-500" />
          <StatCard label="Expiring Compliance" value={v((stats as GcStats | null)?.expiringCompliance)} icon={ShieldAlert} iconColor="text-danger" />
          <StatCard label="Total Under Contract" value={money((stats as GcStats | null)?.totalContractValue)} icon={DollarSign} iconColor="text-success" />
        </div>
      )}

      {/* Master views — admin quick links (hidden when the overview layout covers it) */}
      {activityIsAdmin && !isSub && !overview && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/master-calendar" className="group rounded-xl border border-line bg-panel p-4 hover:border-accent hover:bg-surface transition-colors flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-accent-tint flex items-center justify-center shrink-0"><CalendarCheck className="h-5 w-5 text-accent-fg" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-soft">Master Calendar</p>
              <p className="text-xs text-faint">All projects' schedules &amp; due dates in one view</p>
            </div>
          </Link>
          <Link href="/master-money" className="group rounded-xl border border-line bg-panel p-4 hover:border-accent hover:bg-surface transition-colors flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success-tint flex items-center justify-center shrink-0"><DollarSign className="h-5 w-5 text-success" /></div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink-soft">Master Money</p>
              <p className="text-xs text-faint">Budget, commitments &amp; billing across every project</p>
            </div>
          </Link>
        </div>
      )}

      {/* Projects + Activity side by side (overview layout already shows recent projects) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* Recent Projects */}
        <div className={overview ? 'hidden' : 'lg:col-span-3'}>
          <Card>
            <CardHeader>
              <CardTitle>{isSub ? 'Recent Jobs' : 'Recent Projects'}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-10 text-center text-sm text-faint">Loading...</div>
              ) : projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create your first project to get started."
                  action={{ label: 'New Project', onClick: () => window.location.href = '/projects/new' }}
                />
              ) : (
                <>
                {/* Mobile */}
                <div className="md:hidden divide-y divide-line-soft">
                  {projects.slice(0, 5).map(p => (
                    <Link key={p.id} href={`/projects/${p.id}/plans`} className="block p-4 hover:bg-surface transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-ink">{p.name}</span>
                        <Badge variant={getStatusVariant(p.status)}>{p.status.replace('_', ' ')}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-fg">{new Date(p.start_date).toLocaleDateString()}</p>
                    </Link>
                  ))}
                </div>
                {/* Desktop */}
                <table className="w-full text-sm hidden md:table">
                  <thead className="bg-surface border-b border-line">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium text-muted-fg">Name</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-fg">Status</th>
                      <th className="text-left px-5 py-3 font-medium text-muted-fg">Start Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {projects.slice(0, 5).map(p => (
                      <tr key={p.id} className="hover:bg-surface">
                        <td className="px-5 py-3">
                          <Link href={`/projects/${p.id}/plans`} className="font-medium text-ink hover:text-accent-fg transition-colors">
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          <Badge variant={getStatusVariant(p.status)}>{p.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="px-5 py-3 text-muted-fg">{new Date(p.start_date).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <div className={overview ? 'lg:col-span-5' : 'lg:col-span-2'}>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Recent Activity</CardTitle>
              {activityIsAdmin && (
                <span className="text-xs bg-accent-tint text-accent-fg font-medium px-2 py-0.5 rounded-full">All users</span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="py-10 text-center text-sm text-faint">Loading...</div>
              ) : activity.length === 0 ? (
                <div className="py-10 text-center text-sm text-faint">No activity yet</div>
              ) : (
                <div className="divide-y divide-line-soft max-h-[440px] overflow-y-auto">
                  {activity.map(item => {
                    const Icon = getActivityIcon(item.type)
                    return (
                      <div key={item.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface transition-colors">
                        <div className="mt-0.5 h-7 w-7 rounded-full bg-accent-tint flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-accent-fg" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-ink-soft leading-snug line-clamp-2">{item.message}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {activityIsAdmin && item.actor_name && (
                              <span className="text-xs font-medium text-muted-fg">{item.actor_name}</span>
                            )}
                            {item.projects?.name && (
                              <>
                                {activityIsAdmin && <span className="text-xs text-faint">·</span>}
                                <Link
                                  href={`/projects/${item.project_id}/plans`}
                                  className="text-xs text-accent-fg hover:underline truncate max-w-[130px]"
                                >
                                  {item.projects.name}
                                </Link>
                              </>
                            )}
                            <span className="text-xs text-faint ml-auto shrink-0">{timeAgo(item.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
