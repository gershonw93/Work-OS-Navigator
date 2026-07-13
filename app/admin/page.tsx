'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, FolderKanban, Activity } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'

interface Stats { companies: number; users: number; projects: number; activeProjects: number }

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminGet<Stats>('/api/admin/stats').then(s => { setStats(s); setLoading(false) })
  }, [])

  const cards = [
    { label: 'Companies', value: stats?.companies, icon: Building2, href: '/admin/companies', color: 'text-info bg-info-tint' },
    { label: 'Users', value: stats?.users, icon: Users, href: '/admin/users', color: 'text-success bg-success-tint' },
    { label: 'Projects', value: stats?.projects, icon: FolderKanban, href: '/admin/projects', color: 'text-special bg-special-tint' },
    { label: 'Active Projects', value: stats?.activeProjects, icon: Activity, href: '/admin/projects', color: 'text-warn bg-warn-tint' },
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink-soft">Platform Overview</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="rounded-xl border border-line bg-panel p-4 hover:shadow-sm transition-shadow">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-ink-soft">{loading ? '-' : c.value ?? 0}</p>
            <p className="text-xs font-medium text-muted-fg">{c.label}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-fg">
        Use the tabs above to browse all accounts, companies, and projects across the platform, log in as any user for
        support, and review the impersonation audit log.
      </p>
    </div>
  )
}
