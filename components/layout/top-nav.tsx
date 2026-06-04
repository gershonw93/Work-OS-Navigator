'use client'

import { usePathname } from 'next/navigation'
import { Bell, User } from 'lucide-react'

const sectionLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/directory': 'Directory',
  '/approvals': 'Approvals',
  '/settings': 'Settings',
}

function getBreadcrumb(pathname: string): string {
  if (pathname.startsWith('/projects/') && pathname !== '/projects') {
    const parts = pathname.split('/')
    // /projects/[id]/section
    if (parts.length >= 4) {
      const section = parts[3]
      const sectionMap: Record<string, string> = {
        plans: 'Plans',
        bids: 'Bids',
        team: 'Team',
        schedule: 'Schedule',
        tasks: 'Tasks',
        progress: 'Progress',
        'daily-logs': 'Daily Logs',
        rfis: 'RFIs',
        invoices: 'Invoices',
        financials: 'Financials',
        permits: 'Permits',
        inspections: 'Inspections',
        compliance: 'Compliance',
      }
      return `Projects / ${sectionMap[section] ?? 'Project'}`
    }
    return 'Projects / Detail'
  }
  for (const [key, label] of Object.entries(sectionLabels)) {
    if (pathname.startsWith(key)) return label
  }
  return 'WorkOS Navigator'
}

export function TopNav() {
  const pathname = usePathname()
  const breadcrumb = getBreadcrumb(pathname)

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <p className="text-sm font-medium text-slate-600">{breadcrumb}</p>
      <div className="flex items-center gap-3">
        <button className="relative rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-orange-500" />
        </button>
        <button className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
