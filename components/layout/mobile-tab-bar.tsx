'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, CheckSquare, Briefcase,
  ClipboardList, Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/use-permissions'
import { OPEN_SIDEBAR_EVENT } from './sidebar'

// ─────────────────────────────────────────────────────────────────────────────
// The bottom bar on a phone.
//
// WHY IT EXISTS. The iOS app is a native shell around this same web app -
// `server.url` points at app.sytenav.com and Capacitor opens a WKWebView. So
// whatever the site does on a phone IS what the app does, and what it did was:
// Field Mode had a bottom bar, and everybody else got the sidebar as a drawer
// behind a hamburger. That is the clearest tell there is that something is a
// website in a wrapper, and MOBILE.md already names Apple's rule 4.2 "minimum
// functionality" as the real rejection risk for this shape of app.
//
// FOUR TABS AND A MORE. The GC sidebar has ten destinations and a phone bar
// holds four or five before the labels stop being readable. So the ones that
// carry the traffic, and More dispatches the event the sidebar already listens
// for - nothing is taken away, the drawer just stops being the only way in.
//
// FOLLOWS THE ROLE AND THE PERMISSIONS, both. A subcontractor's work is My Jobs
// and My Bids, not Projects and Approvals - they are different products sharing
// a login. And a tab is dropped when the permission model says the person cannot
// open it, because a tab leading to a locked screen is worse than no tab. Same
// `can()` the sidebar filters with, so the two cannot come to disagree.
//
// NOT ON DESKTOP (`lg:hidden`), and nothing at all inside Field Mode - the
// layout there has its own bar and two would stack.
// ─────────────────────────────────────────────────────────────────────────────

interface Tab {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /** Permission resource, when the sidebar gates this destination. */
  resource?: string
  exact?: boolean
}

const GC_TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, resource: 'dashboard', exact: true },
  { href: '/projects', label: 'Projects', icon: FolderKanban, resource: 'projects' },
  { href: '/approvals', label: 'Approvals', icon: CheckSquare, resource: 'approvals' },
]

const SUB_TABS: Tab[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard, exact: true },
  { href: '/my-jobs', label: 'My Jobs', icon: Briefcase },
  { href: '/my-bids', label: 'My Bids', icon: ClipboardList },
]

export function MobileTabBar() {
  const pathname = usePathname()
  const { can, companyType, loading, error } = usePermissions()

  // Field Mode has its own bar. Two of them would sit on top of each other.
  if (pathname.startsWith('/field')) return null

  // Never guess at the tabs. While the answer is unknown, or if the permissions
  // call failed, draw nothing rather than a bar that might offer a screen the
  // person cannot open - the hamburger is still there either way, so nobody is
  // stranded. Loading, failed and answered are three different facts.
  if (loading || error) return null

  const tabs = (companyType === 'subcontractor' ? SUB_TABS : GC_TABS)
    .filter(t => !t.resource || can(t.resource, 'view'))

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80 pb-safe px-safe print:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg">
        {tabs.map(t => {
          const active = t.exact ? pathname === t.href : pathname.startsWith(t.href)
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-accent-fg' : 'text-muted-fg',
              )}
            >
              <Icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
              {t.label}
            </Link>
          )
        })}

        {/* Everything else. The drawer is the full navigation and stays the
            complete answer - this bar is a shortcut to the busy screens, not a
            replacement for it. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT))}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted-fg transition-colors"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </div>
    </nav>
  )
}
