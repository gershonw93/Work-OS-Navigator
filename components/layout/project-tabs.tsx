'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/use-permissions'
import {
  FileText, Users, Calendar, CheckSquare, TrendingUp, BookOpen,
  MessageSquare, Receipt, DollarSign, GitPullRequest, Shield,
  ClipboardCheck, FileCheck, BarChart2, X, LayoutGrid,
  Wrench, Wallet,
} from 'lucide-react'

const groups = [
  {
    label: 'Field',
    color: 'text-info',
    bg: 'bg-info-tint',
    tabs: [
      { label: 'Plans', slug: 'plans', icon: FileText },
      { label: 'Schedule', slug: 'schedule', icon: Calendar },
      { label: 'Tasks', slug: 'tasks', icon: CheckSquare },
      { label: 'Progress', slug: 'progress', icon: TrendingUp },
      { label: 'Daily Logs', slug: 'daily-logs', icon: BookOpen },
    ],
  },
  {
    label: 'People',
    color: 'text-special',
    bg: 'bg-special-tint',
    tabs: [
      { label: 'Team', slug: 'team', icon: Users },
      { label: 'Bids', slug: 'bids', icon: GitPullRequest },
      { label: 'RFIs', slug: 'rfis', icon: MessageSquare },
    ],
  },
  {
    label: 'Money',
    color: 'text-success',
    bg: 'bg-success-tint',
    tabs: [
      { label: 'Invoices', slug: 'invoices', icon: Receipt },
      { label: 'Budget', slug: 'budget', icon: Wallet },
      { label: 'Financials', slug: 'financials', icon: DollarSign },
      { label: 'Change Orders', slug: 'change-orders', icon: GitPullRequest },
    ],
  },
  {
    label: 'Compliance',
    color: 'text-accent-fg',
    bg: 'bg-accent-tint',
    tabs: [
      { label: 'Permits', slug: 'permits', icon: FileCheck },
      { label: 'Inspections', slug: 'inspections', icon: ClipboardCheck },
      { label: 'Submittals', slug: 'submittals', icon: Wrench },
      { label: 'Compliance', slug: 'compliance', icon: Shield },
      { label: 'Reports', slug: 'reports', icon: BarChart2 },
    ],
  },
]

const allTabs = groups.flatMap(g => g.tabs)

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { can, loading } = usePermissions()

  // While permissions load, show nothing (avoids flashing tabs the user can't see)
  const filteredGroups = loading
    ? []
    : groups
        .map(g => ({ ...g, tabs: g.tabs.filter(t => can(t.slug, 'view')) }))
        .filter(g => g.tabs.length > 0)
  const visibleTabs = filteredGroups.flatMap(g => g.tabs)

  const activeTab = visibleTabs.find(t => pathname.includes(`/${t.slug}`))
  const activeGroup = filteredGroups.find(g => g.tabs.some(t => t.slug === activeTab?.slug))

  function navigate(slug: string) {
    setOpen(false)
    router.push(`/projects/${projectId}/${slug}`)
  }

  return (
    <>
      <div className="border-b border-line bg-panel">
        {/* Mobile: active tab pill + grid button */}
        <div className="sm:hidden flex items-center gap-2 px-4 py-2.5">
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 flex-1 min-w-0 rounded-xl border border-line bg-surface px-3 py-2.5 text-left"
          >
            {activeTab ? (
              <>
                <activeTab.icon className={cn('h-4 w-4 shrink-0', activeGroup?.color ?? 'text-muted-fg')} />
                <span className="flex-1 min-w-0 text-sm font-semibold text-ink-soft truncate">{activeTab.label}</span>
                {activeGroup && (
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0', activeGroup.bg, activeGroup.color)}>
                    {activeGroup.label}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-faint">Go to section…</span>
            )}
          </button>
          <button
            onClick={() => setOpen(true)}
            className="rounded-xl border border-line bg-surface p-2.5 shrink-0"
          >
            <LayoutGrid className="h-4 w-4 text-muted-fg" />
          </button>
        </div>

        {/* Desktop: underline tabs */}
        <nav className="hidden sm:flex overflow-x-auto scrollbar-hide -mb-px px-4 sm:px-6" aria-label="Project tabs">
          {visibleTabs.map((tab) => {
            const href = `/projects/${projectId}/${tab.slug}`
            const isActive = pathname.endsWith(`/${tab.slug}`)
            return (
              <Link
                key={tab.slug}
                href={href}
                className={cn(
                  'flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-accent text-accent-fg'
                    : 'border-transparent text-muted-fg hover:border-muted2 hover:text-ink-soft'
                )}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Mobile bottom sheet */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Sheet */}
          <div className="relative bg-panel rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <h2 className="text-base font-bold text-ink">Project Sections</h2>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-faint hover:text-muted-fg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pb-8 space-y-4">
              {filteredGroups.map(group => (
                <div key={group.label}>
                  <p className={cn('text-xs font-bold uppercase tracking-widest mb-2 px-1', group.color)}>
                    {group.label}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.tabs.map(tab => {
                      const isActive = activeTab?.slug === tab.slug
                      return (
                        <button
                          key={tab.slug}
                          onClick={() => navigate(tab.slug)}
                          className={cn(
                            'flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors',
                            isActive
                              ? cn('border-2', group.bg, group.color, 'border-current font-semibold')
                              : 'border border-line bg-panel text-ink-soft hover:bg-surface'
                          )}
                        >
                          <tab.icon className={cn('h-4 w-4 shrink-0', isActive ? group.color : 'text-faint')} />
                          <span className="text-sm truncate">{tab.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
