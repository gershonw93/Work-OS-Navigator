'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/access-requests', label: 'Access Requests' },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/projects', label: 'Projects' },
  { href: '/admin/audit', label: 'Audit Log' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-line bg-panel p-1">
      {TABS.map(t => {
        const active = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-slate-800 text-white' : 'text-muted-fg hover:bg-muted'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
