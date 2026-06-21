'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard, FolderKanban, Building2, CheckSquare,
  Settings, LogOut, HardHat, ClipboardList, Briefcase, FolderOpen, X, UsersRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

const GC_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Customers', href: '/customers', icon: UsersRound },
  { label: 'Directory', href: '/directory', icon: Building2 },
  { label: 'Files', href: '/files', icon: FolderOpen },
  { label: 'Approvals', href: '/approvals', icon: CheckSquare },
  { label: 'Settings', href: '/settings', icon: Settings },
]

const SUB_NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'My Jobs', href: '/my-jobs', icon: Briefcase },
  { label: 'My Bids', href: '/my-bids', icon: ClipboardList },
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
  const [navItems, setNavItems] = useState(GC_NAV)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Listen for the open event from TopNav's hamburger
  useEffect(() => {
    const handler = () => setMobileOpen(true)
    window.addEventListener(OPEN_SIDEBAR_EVENT, handler)
    return () => window.removeEventListener(OPEN_SIDEBAR_EVENT, handler)
  }, [])

  // Close sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    async function detectRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id, companies(type)')
        .eq('id', user.id)
        .single()
      const companyType = (profile?.companies as any)?.type
      if (companyType === 'subcontractor') setNavItems(SUB_NAV)
      else setNavItems(GC_NAV)
    }
    detectRole()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const navContent = (
    <>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between gap-2 px-5 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-orange-500">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div className="flex items-baseline gap-0.5">
            <span className="text-lg font-bold text-orange-400 leading-none">WorkOS</span>
            <span className="text-lg font-medium text-white leading-none">Navigator</span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          className="sm:hidden text-slate-400 hover:text-white p-1"
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
                isActive ? 'bg-orange-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              )}>
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-slate-800 p-3 shrink-0">
        <button onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors">
          <LogOut className="h-4 w-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden sm:flex fixed inset-y-0 left-0 z-30 w-60 flex-col bg-slate-900 text-white">
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
        'sm:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-slate-900 text-white transition-transform duration-300 ease-in-out',
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {navContent}
      </aside>
    </>
  )
}
