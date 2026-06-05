'use client'

import { usePathname } from 'next/navigation'
import { User } from 'lucide-react'
import { NotificationBell } from './notification-bell'

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
    if (parts.length >= 4) {
      const sectionMap: Record<string, string> = {
        plans: 'Plans', bids: 'Bids', team: 'Team', schedule: 'Schedule',
        tasks: 'Tasks', progress: 'Progress', 'daily-logs': 'Daily Logs',
        rfis: 'RFIs', invoices: 'Invoices', financials: 'Financials',
        permits: 'Permits', inspections: 'Inspections', compliance: 'Compliance',
      }
      return `Projects / ${sectionMap[parts[3]] ?? 'Project'}`
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

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-6">
      <p className="text-sm font-medium text-slate-600">{getBreadcrumb(pathname)}</p>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <button className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
