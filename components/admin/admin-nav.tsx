'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

// NO PROJECTS TAB. It was a flat list of every project on the platform, which
// answers nothing anybody acts on - "it's nothing for me" was the report, and
// at any real size it is unreadable rather than merely useless. The Overview
// now answers who has actually been here instead.
//
// `/api/admin/projects` is deliberately LEFT IN PLACE: removing a tab is a
// decision about this console, and deleting a working route on the way past is
// a different change nobody asked for.
const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/access-requests', label: 'Access & invites' },
  { href: '/admin/companies', label: 'Companies' },
  { href: '/admin/billing', label: 'Billing' },
  { href: '/admin/marketing', label: 'Emails' },
  { href: '/admin/audit', label: 'Audit Log' },
  { href: '/admin/demo', label: 'Demo' },
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
