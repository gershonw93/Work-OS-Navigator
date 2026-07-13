'use client'

import { usePathname } from 'next/navigation'
import { Menu, User } from 'lucide-react'
import { NotificationBell } from './notification-bell'
import { OPEN_SIDEBAR_EVENT } from './sidebar'
import { ViewAsSwitcher } from './view-as-switcher'
import { ImpersonateSwitcher } from './impersonate-switcher'
import { GlobalSearch } from './global-search'

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
        tasks: 'Tasks', progress: 'Progress', 'daily-logs': 'Daily Logs', time: 'Time Clock',
        rfis: 'RFIs', invoices: 'Invoices', budget: 'Budget', 'request-quotes': 'Request Quotes', quotes: 'Compare Quotes', financials: 'Financials',
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
  return 'SyteNav'
}

export function TopNav() {
  const pathname = usePathname()

  return (
    <header className="flex h-14 items-center gap-3 border-b border-line bg-panel px-4 sm:px-6">
      <div className="flex items-center gap-3 shrink-0">
        {/* Hamburger - mobile only */}
        <button
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-muted-fg hover:bg-muted transition-colors"
          onClick={() => window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT))}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <p className="hidden md:block text-sm font-medium text-muted-fg">{getBreadcrumb(pathname)}</p>
      </div>

      {/* Global search - grows to fill the middle */}
      <div className="flex-1 flex justify-center min-w-0">
        <GlobalSearch />
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ImpersonateSwitcher />
        {/* View-as crowds the mobile top bar - desktop only */}
        <div className="hidden sm:block"><ViewAsSwitcher /></div>
        <NotificationBell />
        <button className="flex items-center justify-center w-8 h-8 rounded-full bg-muted2 text-muted-fg hover:bg-muted2 transition-colors">
          <User className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
