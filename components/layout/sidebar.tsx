'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, Building2, CheckSquare,
  Settings, LogOut, ClipboardList, Briefcase, FolderOpen, X, UsersRound,
  CalendarDays, DollarSign, Wrench, HelpCircle, ShoppingCart, Sparkles,
  ChevronsLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { unregisterThisDevice } from '@/lib/use-push'
import { SEEN_KEY, unreadCount } from '@/lib/whats-new'
import { SyteNavLogo } from '@/components/ui/logo'
import { SIDEBAR_COLLAPSED_CLASS, SIDEBAR_COLLAPSED_KEY, SIDEBAR_COLLAPSED_ON } from '@/lib/sidebar-collapse'
import { useEffect, useState } from 'react'

// GC nav items mapped to permission resource keys. Settings has no resource -
// everyone can reach Settings (at minimum their own profile).
const GC_NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, resource: 'dashboard' },
  { label: 'Projects', href: '/projects', icon: FolderKanban, resource: 'projects' },
  { label: 'Customers', href: '/customers', icon: UsersRound, resource: 'customers' },
  { label: 'Directory', href: '/directory', icon: Building2, resource: 'directory' },
  { label: 'Files', href: '/files', icon: FolderOpen, resource: 'files' },
  { label: 'Equipment', href: '/equipment', icon: Wrench, resource: 'equipment' },
  { label: 'Materials', href: '/materials', icon: ShoppingCart, resource: 'materials' },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare, resource: 'approvals' },
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
]

// Every clickable row in the sidebar, in one string.
//
// `nav-row` is what globals.css centres when the rail is collapsed, and it is
// on this constant rather than typed per row so a row added later cannot be the
// one that stays left-aligned in a 72px column. The label beside the icon is
// always wrapped in `.nav-label`, which is CLIPPED - not removed - when
// collapsed, so the link keeps its accessible name.
const ROW = 'nav-row flex items-center gap-3 rounded-lg text-sm font-medium transition-colors'
const ROW_ON = 'bg-accent text-accent-ink'
const ROW_OFF = 'text-muted-fg hover:bg-muted hover:text-ink'

// TopNav dispatches this event to open the drawer on mobile
export const OPEN_SIDEBAR_EVENT = 'workos:open-sidebar'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { can, role, companyType, loading: permsLoading, error: permsError, reload: reloadPerms } = usePermissions()
  // Subcontractors get a different nav entirely. This arrives with the
  // permissions rather than from a second query the browser makes itself.
  const isSubcontractor = companyType === 'subcontractor'
  const [mobileOpen, setMobileOpen] = useState(false)

  // COLLAPSED IS A CLASS ON <html>, NOT REACT STATE, and this mirror exists for
  // exactly two attributes: the toggle's label and its aria-expanded. Nothing
  // VISUAL reads it - the width, the labels and the chevron are all CSS off
  // that class, which a script in <head> has already set before the first
  // paint. So the one frame where this is still `false` is a frame nobody can
  // see, and there is nothing to flash. Read after mount for the same reason
  // `newCount` below is: the server and the first client render must agree.
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => {
    setCollapsed(document.documentElement.classList.contains(SIDEBAR_COLLAPSED_CLASS))
  }, [])

  function toggleCollapsed() {
    const el = document.documentElement
    const next = !el.classList.contains(SIDEBAR_COLLAPSED_CLASS)
    el.classList.toggle(SIDEBAR_COLLAPSED_CLASS, next)
    // A preference that does not survive a reload is not a preference. Wrapped
    // because localStorage throws outright in some privacy modes, and losing
    // the memory is not a reason to lose the toggle.
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? SIDEBAR_COLLAPSED_ON : '0') } catch { /* fine */ }
    setCollapsed(next)
  }

  // Releases they haven't looked at yet. Read from localStorage after mount so
  // the server and first client render agree.
  const [newCount, setNewCount] = useState(0)
  useEffect(() => {
    const read = () => {
      try { setNewCount(unreadCount(localStorage.getItem(SEEN_KEY))) }
      catch { setNewCount(0) }
    }
    read()
    window.addEventListener('sytenav:whats-new-seen', read)
    return () => window.removeEventListener('sytenav:whats-new-seen', read)
  }, [pathname])

  // Listen for the open event from TopNav's hamburger
  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener(OPEN_SIDEBAR_EVENT, handler)
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, handler)
  }, [])

  // Close sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Build nav from permissions (Settings always available)
  //
  // `role`, not `realRole`. Role preview exists to answer "what does a Field
  // Supervisor actually see", and gating this on realRole meant an admin
  // previewing one still had the Master section - cross-project money - sitting
  // in their sidebar. The preview reported the wrong answer to the exact
  // question it was built to answer, and it was the money half it got wrong.
  //
  // The server does NOT rely on this: /api/master/money and /api/dashboard/
  // overview both check the real role from the database and 403 anybody else,
  // so a real supervisor is refused the data whatever the nav renders.
  const isAdmin = role === 'admin' || role === 'manager'
  const navItems = isSubcontractor
    ? SUB_NAV
    : GC_NAV_ITEMS.filter(item => item.resource === null || (!permsLoading && can(item.resource, 'view')))

  async function handleLogout() {
    // Before signOut, not after: releasing this phone needs the session that
    // is about to end. Otherwise the row stays on the person leaving, and the
    // next person to sign in on a shared tablet is still reachable at their
    // address.
    await unregisterThisDevice()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="sidebar-head flex h-16 items-center justify-between gap-2 px-5 border-b border-line shrink-0">
        <span className="nav-label"><SyteNavLogo size={26} /></span>
        {/* Collapse to a rail of icons - desktop only. The drawer has no width
            to give back and gets the close button in this slot instead. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-faint hover:bg-muted hover:text-ink transition-colors"
        >
          <ChevronsLeft className="sidebar-toggle-icon h-4 w-4 transition-transform" />
        </button>
        {/* Close button - mobile only */}
        <button
          className="lg:hidden text-faint hover:text-ink p-1"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {/* A menu that cannot be loaded is not an empty menu.
            While permissions are in flight every item with a resource is
            filtered out, and if the call FAILS they stay filtered out - which
            rendered an app with four links, no explanation and no way back.
            Say which it is. */}
        {permsLoading && (
          <div className="space-y-1" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-muted/60 animate-pulse" />
            ))}
          </div>
        )}
        {/* `nav-label`, so it is clipped in the rail: three lines of prose and a
            Try again button do not fit in 72px. The fact is not lost - a failed
            permissions call is announced once for the session by
            PermissionsBanner in the chrome, which carries its own retry. */}
        {permsError && (
          <div className="nav-label rounded-lg border border-warn/30 bg-warn-tint px-3 py-2.5 text-xs text-warn space-y-2">
            <p className="font-medium">Couldn&apos;t load your menu.</p>
            <p className="text-[11px] opacity-90">{permsError}</p>
            <button onClick={reloadPerms}
              className="rounded-md border border-warn/40 px-2 py-1 text-[11px] font-semibold hover:bg-warn/10">
              Try again
            </button>
          </div>
        )}
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} title={item.label}
              className={cn(ROW, 'px-3 py-2.5', isActive ? ROW_ON : ROW_OFF)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="nav-label">{item.label}</span>
            </Link>
          )
        })}

        {/* Master (admin-only, cross-project - works for GC and sub on their own jobs) */}
        {isAdmin && (
          <div className="pt-3 mt-2 border-t border-line">
            <p className="nav-label px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Master</p>
            {MASTER_NAV_ITEMS.map(item => {
              const Icon = item.icon
              const isActive = pathname.startsWith(item.href)
              return (
                <Link key={item.href} href={item.href} title={item.label}
                  className={cn(ROW, 'px-3 py-2.5', isActive ? ROW_ON : ROW_OFF)}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="nav-label">{item.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="border-t border-line p-3 shrink-0 space-y-1">
        <Link href="/whats-new" title="What's new"
          className={cn(ROW, 'px-3 py-2',
            pathname.startsWith('/whats-new') ? ROW_ON : ROW_OFF)}>
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="nav-label flex-1">What&apos;s new</span>
          {newCount > 0 && !pathname.startsWith('/whats-new') && (
            <span className="nav-badge shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-accent-ink">
              {newCount}
            </span>
          )}
        </Link>
        <Link href="/help" title="Help & Support"
          className={cn(ROW, 'px-3 py-2', pathname.startsWith('/help') ? ROW_ON : ROW_OFF)}>
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span className="nav-label">Help &amp; Support</span>
        </Link>
        <Link href="/settings" title="Settings"
          className={cn(ROW, 'px-3 py-2', pathname.startsWith('/settings') ? ROW_ON : ROW_OFF)}>
          <Settings className="h-4 w-4 shrink-0" />
          <span className="nav-label">Settings</span>
        </Link>
        <button onClick={handleLogout} title="Sign Out"
          className={cn(ROW, 'w-full px-3 py-2', ROW_OFF)}>
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="nav-label">Sign Out</span>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar - hidden on mobile */}
      {/* No `w-60`. The width is `--sidebar-w` in globals.css, which the content
          column beside it reads too - see app/(dashboard)/layout.tsx. */}
      <aside className="app-sidebar hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-panel text-ink border-r border-line pt-safe pb-safe">
        {navContent}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="overlay-full lg:hidden z-40 bg-black/60" data-overlay
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside className={cn(
        'lg:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-panel text-ink border-r border-line transition-transform duration-300 ease-in-out pt-safe pb-safe',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {navContent}
      </aside>
    </>
  )
}
