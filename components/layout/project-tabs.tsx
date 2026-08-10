'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/lib/use-permissions'
import { createClient } from '@/lib/supabase/client'
import {
  FileText, Users, Calendar, CheckSquare, TrendingUp, BookOpen,
  MessageSquare, Receipt, DollarSign, GitPullRequest, Shield,
  ClipboardCheck, FileCheck, BarChart2, X, LayoutGrid,
  Wrench, Wallet, Clock, Send, ShoppingCart, FileSpreadsheet, Building2,
} from 'lucide-react'

const groups = [
  {
    label: 'Field',
    color: 'text-info',
    bg: 'bg-info-tint',
    tabs: [
      { label: 'Estimate', slug: 'quote', icon: ClipboardCheck },
      { label: 'Plans', slug: 'plans', icon: FileText },
      { label: 'Schedule', slug: 'schedule', icon: Calendar },
      { label: 'Tasks', slug: 'tasks', icon: CheckSquare },
      { label: 'Progress', slug: 'progress', icon: TrendingUp },
      { label: 'Daily Logs', slug: 'daily-logs', icon: BookOpen },
      { label: 'Time Clock', slug: 'time', icon: Clock },
    ],
  },
  {
    label: 'Docs & Legal',
    color: 'text-accent-fg',
    bg: 'bg-accent-tint',
    tabs: [
      { label: 'Permits', slug: 'permits', icon: FileCheck },
      { label: 'Inspections', slug: 'inspections', icon: ClipboardCheck },
      { label: 'Submittals', slug: 'submittals', icon: Wrench },
      { label: 'Compliance', slug: 'compliance', icon: Shield },
      { label: 'Sharing', slug: 'sharing', icon: Send },
    ],
  },
  {
    label: 'Financials',
    color: 'text-success',
    bg: 'bg-success-tint',
    tabs: [
      { label: 'Budget', slug: 'budget', icon: Wallet },
      { label: 'Materials', slug: 'materials', icon: ShoppingCart },
      { label: 'Quotes', slug: 'request-quotes', icon: Send },
      { label: 'Invoices', slug: 'invoices', icon: Receipt },
      { label: 'Pay Apps', slug: 'pay-apps', icon: FileSpreadsheet },
      { label: 'Payments', slug: 'payments', icon: Wallet },
      { label: 'Summary', slug: 'financials', icon: DollarSign },
      { label: 'Change Orders', slug: 'change-orders', icon: GitPullRequest },
      { label: 'Reports', slug: 'reports', icon: BarChart2 },
    ],
  },
  {
    label: 'Site',
    color: 'text-info',
    bg: 'bg-info-tint',
    tabs: [
      { label: 'Jobs', slug: 'units', icon: Building2 },
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
]

const allTabs = groups.flatMap(g => g.tabs)

// When a subcontractor opens a GC-owned project they were awarded, restrict to
// their own lane (plans/schedule to do the work + their field items) - never the
// GC's private money/people tabs.
const SUB_AWARDED_ALLOWED = new Set(['plans', 'schedule', 'tasks', 'progress', 'daily-logs', 'time', 'rfis', 'compliance'])
// On a sub's OWN job they get the full set except: submittals (a sub→GC
// artifact) and the RFQ/compare-quotes tabs (their own quote lives on "Quote").
const SUB_OWN_HIDDEN = new Set(['submittals', 'request-quotes', 'quotes'])

// A job in planning hasn't broken ground: nobody is on site, nothing is built,
// and there is nothing to bill. Hide the tabs that only mean something once
// work starts so preconstruction reads as its own stage. They come back the
// moment the project is set to active.
// A site is a container - the building or the street, not a job. It holds the
// address, the client, the plans and the permits; the budget, schedule and
// crew all live on the units underneath it. Anything else would be a second
// place to track the same work.
const SITE_ALLOWED = new Set(['units', 'plans', 'permits', 'submittals', 'compliance', 'team', 'rfis', 'sharing'])

const PLANNING_HIDDEN = new Set([
  'time', 'daily-logs', 'progress',
  'invoices', 'pay-apps', 'payments', 'change-orders',
  'materials', 'inspections', 'reports', 'financials',
])

// A few tabs aren't their own permission resource. Sending documents out is a
// files action, so it borrows those rights rather than inventing a new toggle
// nobody would know to set.
const PERMISSION_RESOURCE: Record<string, string> = { sharing: 'files' }

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { can, loading } = usePermissions()
  const [ctx, setCtx] = useState<{ companyType: string; owns: boolean; billingMode?: string; status?: string; isSite?: boolean } | null>(null)

  useEffect(() => {
    let active = true
    async function loadCtx() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/projects/${projectId}/viewer-context`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok && active) setCtx(await res.json())
    }
    loadCtx()
    // Status and billing method decide which tabs exist, and both are editable
    // from Project Settings - refetch when that saves instead of waiting for a
    // full page load.
    window.addEventListener('sytenav:project-updated', loadCtx)
    return () => { active = false; window.removeEventListener('sytenav:project-updated', loadCtx) }
  }, [projectId])

  const isSub = ctx?.companyType === 'subcontractor'
  // Subcontractor visibility rules layered on top of role permissions.
  const subAllows = (slug: string) => {
    if (!isSub) return true
    return ctx?.owns ? !SUB_OWN_HIDDEN.has(slug) : SUB_AWARDED_ALLOWED.has(slug)
  }
  // Billing mode set at project setup decides which money flow is shown, so a
  // job isn't cluttered with both. AIA jobs bill via Pay Apps; simple jobs use
  // Invoices + Payments.
  const billingMode = ctx?.billingMode ?? 'simple'
  const billingAllows = (slug: string) => {
    if (slug === 'pay-apps') return billingMode === 'aia'
    if (slug === 'invoices' || slug === 'payments') return billingMode !== 'aia'
    return true
  }
  // Preconstruction: planning jobs get the estimating/approvals lane only.
  const isPlanning = ctx?.status === 'planning'
  const isSite = !!ctx?.isSite
  const statusAllows = (slug: string) => {
    if (isSite) return SITE_ALLOWED.has(slug)
    if (slug === 'units') return false // only a site has jobs underneath it
    return !isPlanning || !PLANNING_HIDDEN.has(slug)
  }

  // The "Quote" tab is the sub's own-job starting point - only there.
  const tabAllowed = (slug: string) => {
    if (slug === 'quote') return isSub && !!ctx?.owns
    return can(PERMISSION_RESOURCE[slug] ?? slug, 'view') && subAllows(slug) && billingAllows(slug) && statusAllows(slug)
  }

  // Wait for both permissions and viewer-context before deciding (avoids flashing
  // tabs a sub shouldn't see). ctx === null means still loading.
  const ready = !loading && ctx !== null
  const filteredGroups = !ready
    ? []
    : groups
        .map(g => ({ ...g, tabs: g.tabs.filter(t => tabAllowed(t.slug)) }))
        .filter(g => g.tabs.length > 0)
  const visibleTabs = filteredGroups.flatMap(g => g.tabs)

  // Block direct-URL access to a tab a sub isn't allowed to see on this project.
  useEffect(() => {
    if (!ready) return
    const current = allTabs.find(t => pathname.includes(`/${t.slug}`))
    if (current && (!statusAllows(current.slug) || (isSub && !subAllows(current.slug)))) {
      const fallback = visibleTabs[0]?.slug ?? 'plans'
      router.replace(`/projects/${projectId}/${fallback}`)
    }
  }, [ready, isSub, isPlanning, isSite, pathname])

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

        {/* Desktop: row 1 = groups */}
        <nav className="hidden sm:flex overflow-x-auto scrollbar-hide px-4 sm:px-6 gap-1" aria-label="Project sections">
          {filteredGroups.map((g) => {
            const isActiveGroup = g.label === activeGroup?.label
            return (
              <button
                key={g.label}
                onClick={() => navigate(g.tabs[0].slug)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap',
                  isActiveGroup ? 'bg-surface text-ink' : 'text-muted-fg hover:text-ink-soft'
                )}
              >
                {g.label}
              </button>
            )
          })}
          {isSite && (
            <span
              title="This is a site: the building or street itself. Budgets, schedules and crews live on the jobs underneath it."
              className="ml-auto self-center shrink-0 rounded-full bg-info-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-info"
            >
              Site
            </span>
          )}
          {isPlanning && !isSite && (
            <span
              title="Site, billing and inspection tabs unlock when this job is set to Active."
              className="ml-auto self-center shrink-0 rounded-full bg-info-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-info"
            >
              Preconstruction
            </span>
          )}
        </nav>
      </div>

      {/* Desktop: row 2 = sub-tabs of the active group */}
      {activeGroup && activeGroup.tabs.length > 0 && (
        <div className="hidden sm:block border-b border-line bg-surface">
          <nav className="flex overflow-x-auto scrollbar-hide -mb-px px-4 sm:px-6" aria-label={`${activeGroup.label} pages`}>
            {activeGroup.tabs.map((tab) => {
              const href = `/projects/${projectId}/${tab.slug}`
              const isActive = pathname.endsWith(`/${tab.slug}`)
              const Icon = tab.icon
              return (
                <Link
                  key={tab.slug}
                  href={href}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-accent text-accent-fg'
                      : 'border-transparent text-muted-fg hover:border-muted2 hover:text-ink-soft'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

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
              {isPlanning && !isSite && (
                <p className="rounded-lg bg-info-tint px-3 py-2 text-xs text-info">
                  <span className="font-semibold uppercase tracking-wide">Preconstruction</span>
                  {' · '}Site, billing and inspection tabs unlock when this job is set to Active.
                </p>
              )}
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
