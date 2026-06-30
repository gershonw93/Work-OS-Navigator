'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, Building2, CheckSquare,
  Settings, LogOut, ClipboardList, Briefcase, FolderOpen, X, UsersRound, LayoutTemplate,
  CalendarDays, DollarSign,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useEffect, useState } from 'react'

// GC nav items mapped to permission resource keys. Settings has no resource —
// everyone can reach Settings (at minimum their own profile).
const GC_NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, resource: 'dashboard' },
  { label: 'Projects', href: '/projects', icon: FolderKanban, resource: 'projects' },
  { label: 'Customers', href: '/customers', icon: UsersRound, resource: 'customers' },
  { label: 'Directory', href: '/directory', icon: Building2, resource: 'directory' },
  { label: 'Files', href: '/files', icon: FolderOpen, resource: 'files' },
  { label: 'Budget Templates', href: '/budget-templates', icon: LayoutTemplate, resource: 'budget' },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare, resource: 'approvals' },
  { label: 'Settings', href: '/settings', icon: Settings, resource: null },
]

// Admin/owner-only cross-project ("master") views.
const MASTER_NAV_ITEMS = [
  { label: 'Master Calendar', href: '/master-calendar', icon: CalendarDays },
  { label: 'Master Money', href: '/master-money', icon: DollarSign },
]

const SUB_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Jobs', href: '/my-jobs', icon: Briefcase },
  { label: 'My Bids', href: '/my-bids', icon: ClipboardList },
  { label: 'Customers', href: '/customers', icon: UsersRound },
  { label: 'Directory', href: '/directory', icon: Building2 },
  { label: 'Files', href: '/files', icon: FolderOpen },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare },
  { label: 'Settings', href: '/settings', icon: Settings },
]

// TopNav dispatches this event to open the drawer on mobile
export const OPEN_SIDEBAR_EVENT = 'workos:open-sidebar'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { can, realRole, loading: permsLoading } = usePermissions()
  const [isSubcontractor, setIsSubcontractor] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Listen for the open event from TopNav's hamburger
  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener(OPEN_SIDEBAR_EVENT, handler)
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, handler)
  }, [])

  // Close sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Detect subcontractor company (uses a different nav entirely)
  useEffect(() => {
    async function detect() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('companies(type)')
        .eq('id', user.id)
        .single()
      if ((profile?.companies as any)?.type === 'subcontractor') setIsSubcontractor(true)
    }
    detect()
  }, [])

  // Build nav from permissions (Settings always available)
  const isAdmin = realRole === 'admin' || realRole === 'manager'
  const navItems = isSubcontractor
    ? SUB_NAV
    : GC_NAV_ITEMS.filter(item => item.resource === null || (!permsLoading && can(item.resource, 'view')))

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between gap-2 px-5 border-b border-line shrink-0">
        <SyteNavLogo size={26} />
        {/* Close button — mobile only */}
        <button
          className="sm:hidden text-faint hover:text-ink p-1"
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-muted hover:text-ink'
              )}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}

        {/* Master (admin-only, cross-project — works for GC and sub on their own jobs) */}
        {isAdmin && (
          <div className="pt-3 mt-2 border-t border-line">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Master</p>
            {MASTER_NAV_ITEMS.map(item => {
              const Icon = item.icon
              const isActive = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-muted hover:text-ink'
                  )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line p-3 shrink-0 space-y-1">
        <div className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm font-medium text-muted-fg">
          <span>Appearance</span>
          <ThemeToggle />
        </div>
        <button onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-fg hover:bg-muted hover:text-ink transition-colors">
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden sm:flex fixed inset-y-0 left-0 z-30 w-60 flex-col bg-panel text-ink border-r border-line">
        {navContent}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        'sm:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-panel text-ink border-r border-line transition-transform duration-300 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {navContent}
      </aside>
    </>
  )
}
