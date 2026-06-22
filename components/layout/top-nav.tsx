'use client'

import { usePathname } from 'next/navigation'
import { Menu, User } from 'lucide-react'
import { NotificationBell } from './notification-bell'
import { OPEN_SIDEBAR_EVENT } from './sidebar'
import { ViewAsSwitcher } from './view-as-switcher'

const sectionLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/projects': 'Projects',
  '/directory': 'Directory',
  '/files': 'Files',
  '/approvals': 'Approvals',
  '/settings': 'Settings',
  '/my-jobs': 'My Jobs',
  '/my-bids': 'My Bids',
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
        submittals: 'Submittals',
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
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          className="sm:hidden flex items-center justify-center w-8 h-8 rounded-md text-slate-600 hover:bg-slate-100 transition-colors"
          onClick={() => window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT))}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium text-slate-600">{getBreadcrumb(pathname)}</p>
      </div>
      <div className="flex items-center gap-2">
        <ViewAsSwitcher />
        <NotificationBell />
        <button className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 transition-colors">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
