'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, Activity, UserX, Inbox } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'
import { timeAgo, absoluteTime } from '@/lib/time-ago'

// The platform overview: who has been here, not how many rows exist.
//
// It used to be four counts - companies, users, projects, active projects -
// with the two project numbers linking to a flat list of every project on the
// platform. A total across every company answers nothing anybody acts on, and
// the list behind it was unreadable at any real size. "Who's been active" is
// the question those tiles were being asked to answer and could not.

interface ActivePerson {
  id: string
  name: string | null
  email: string | null
  role: string | null
  company: string | null
  last_sign_in_at: string | null
}

interface Stats {
  companies: number
  users: number
  pendingRequests: number
  activeWeek: number
  activeMonth: number
  neverSignedIn: number
  active: ActivePerson[]
  signInsComplete: boolean
}

export default function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminGet<Stats>('/api/admin/stats').then(({ data, error: e }) => {
      setStats(data)
      setError(e)
      setLoading(false)
    })
  }, [])

  const cards = [
    // FIRST, and amber when it is not zero. Everything else here is a statistic
    // about us; this one is a person waiting, having been told they would hear
    // back. It used to be absent entirely, so the only thing that brought
    // anybody to the approvals screen was remembering it existed.
    {
      label: 'Waiting for review', value: stats?.pendingRequests, icon: Inbox, href: '/admin/access-requests',
      color: stats?.pendingRequests ? 'text-warn bg-warn-tint' : 'text-faint bg-muted',
    },
    { label: 'Active this week', value: stats?.activeWeek, icon: Activity, href: '/admin/users', color: 'text-success bg-success-tint' },
    { label: 'Active this month', value: stats?.activeMonth, icon: Users, href: '/admin/users', color: 'text-info bg-info-tint' },
    { label: 'Never signed in', value: stats?.neverSignedIn, icon: UserX, href: '/admin/access-requests', color: 'text-warn bg-warn-tint' },
    { label: 'Companies', value: stats?.companies, icon: Building2, href: '/admin/companies', color: 'text-special bg-special-tint' },
  ]

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-ink-soft">Platform Overview</h2>

      {/* A failed stats call used to paint four confident zeros - the same
          "empty and broken look identical" fault as the Users tab. */}
      {!loading && error && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger-tint px-4 py-3">
          <p className="text-sm font-medium text-danger">Could not load the platform totals.</p>
          <p className="mt-0.5 text-xs text-danger">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="rounded-xl border border-line bg-panel p-4 transition-shadow hover:shadow-sm">
            <div className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg ${c.color}`}>
              <c.icon className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-ink-soft">{loading || error ? '-' : c.value ?? 0}</p>
            <p className="text-xs font-medium text-muted-fg">{c.label}</p>
          </Link>
        ))}
      </div>

      {/* A page-through that stopped early would undercount every tile above,
          and a quietly-wrong number is worse than one that says it is unsure. */}
      {!loading && !error && stats && !stats.signInsComplete && (
        <p className="mt-3 text-xs text-warn">
          Sign-in data is incomplete - the accounts list did not page through fully, so these
          counts are a floor rather than a total.
        </p>
      )}

      <h3 className="mb-2 mt-8 text-sm font-semibold text-ink-soft">Who&apos;s been active</h3>
      {loading ? (
        <p className="py-8 text-center text-sm text-faint">Loading…</p>
      ) : error ? null : !stats?.active?.length ? (
        <p className="rounded-xl border border-line bg-panel py-8 text-center text-sm text-faint">
          Nobody has signed in yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="divide-y divide-line-soft">
            {stats.active.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-medium text-ink">{p.name ?? p.email ?? 'Unknown account'}</span>
                {p.company && <span className="text-sm text-faint">{p.company}</span>}
                {p.role && (
                  <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 text-xs text-muted-fg">
                    {p.role.replace(/_/g, ' ')}
                  </span>
                )}
                {/* A relative time carries the absolute one on hover - when the
                    stored value and the arithmetic are both right, what is left
                    is the reader's clock. */}
                {p.last_sign_in_at && (
                  <span
                    className="ml-auto whitespace-nowrap text-xs text-muted-fg"
                    title={absoluteTime(p.last_sign_in_at)}
                  >
                    {timeAgo(p.last_sign_in_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-sm text-muted-fg">
        Use the tabs above to browse accounts and companies, invite someone or review an access
        request, log in as any user for support, and read the impersonation audit log.
      </p>
    </div>
  )
}
