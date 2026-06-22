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
    { label: 'Companies', value: stats?.companies, icon: Building2, href: '/admin/companies', color: 'text-blue-600 bg-blue-50' },
    { label: 'Users', value: stats?.users, icon: Users, href: '/admin/users', color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Projects', value: stats?.projects, icon: FolderKanban, href: '/admin/projects', color: 'text-violet-600 bg-violet-50' },
    { label: 'Active Projects', value: stats?.activeProjects, icon: Activity, href: '/admin/projects', color: 'text-amber-600 bg-amber-50' },
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Platform Overview</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm transition-shadow">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-800">{loading ? '—' : c.value ?? 0}</p>
            <p className="text-xs font-medium text-slate-500">{c.label}</p>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-sm text-slate-500">
        Use the tabs above to browse all accounts, companies, and projects across the platform, log in as any user for
        support, and review the impersonation audit log.
      </p>
    </div>
  )
}
