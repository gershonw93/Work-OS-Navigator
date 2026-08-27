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
  Wrench, Wallet, Clock, Send, ShoppingCart, FileSpreadsheet, Building2, Palette,
} from 'lucide-react'

/**
 * The project tabs, grouped by WHAT YOU ARE DOING rather than by where the
 * code happened to live.
 *
 * What this replaces, and why each move:
 *
 *   * "Bids" was under PEOPLE and "Quotes" was under FINANCIALS - the two
 *     halves of buying out a job, in different groups, under different names,
 *     in different colours. They are now one tab, because underneath they are
 *     now one system.
 *   * "RFIs" was under PEOPLE. An RFI is a formal question about the drawings;
 *     it belongs with Submittals and Permits.
 *   * PEOPLE therefore held three things, one of which was people.
 *   * SITE was a group containing exactly one tab.
 *   * "Estimate" was under FIELD, but it is the price you hand the client.
 *   * Compliance moves to BUYOUT: it is the insurance and licences of the subs
 *     you are buying from, not general paperwork.
 *
 * Keep the `group` strings in lib/permissions.ts RESOURCES in step with these.
 * Two lists describing the same app in different words is what produced the
 * mess above.
 */
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
      { label: 'Time Clock', slug: 'time', icon: Clock },
      { label: 'Jobs', slug: 'units', icon: Building2 },
    ],
  },
  {
    label: 'Buyout',
    color: 'text-special',
    bg: 'bg-special-tint',
    tabs: [
      // One tab. "Bids" and "Quotes" were the same job under two names.
      { label: 'Quotes & Bids', slug: 'request-quotes', icon: Send },
      { label: 'Subs & Team', slug: 'team', icon: Users },
      { label: 'Compliance', slug: 'compliance', icon: Shield },
    ],
  },
  {
    label: 'Money',
    color: 'text-success',
    bg: 'bg-success-tint',
    tabs: [
      { label: 'Estimate', slug: 'quote', icon: ClipboardCheck },
      { label: 'Budget', slug: 'budget', icon: Wallet },
      { label: 'Materials', slug: 'materials', icon: ShoppingCart },
      { label: 'Selections', slug: 'selections', icon: Palette },
      // Money OUT and money IN, said in the label. "Invoices" and "Payments"
      // never told you whose invoices or whose payments, and the bills a sub
      // sends you and the bills you send a client are the two things people
      // most often cannot find.
      { label: 'Bills from subs', slug: 'invoices', icon: Receipt },
      { label: 'Pay Apps', slug: 'pay-apps', icon: FileSpreadsheet },
      { label: 'Billing the client', slug: 'payments', icon: Wallet },
      { label: 'Change Orders', slug: 'change-orders', icon: GitPullRequest },
      { label: 'Summary', slug: 'financials', icon: DollarSign },
      { label: 'Reports', slug: 'reports', icon: BarChart2 },
    ],
  },
  {
    label: 'Docs',
    color: 'text-accent-fg',
    bg: 'bg-accent-tint',
    tabs: [
      { label: 'Permits', slug: 'permits', icon: FileCheck },
      { label: 'Inspections', slug: 'inspections', icon: ClipboardCheck },
      { label: 'Submittals', slug: 'submittals', icon: Wrench },
      { label: 'RFIs', slug: 'rfis', icon: MessageSquare },
      { label: 'Sharing', slug: 'sharing', icon: Send },
    ],
  },
]

const allTabs = groups.flatMap(g => g.tabs)

// When a subcontractor opens a GC-owned project they were awarded, restrict to
// their own lane (plans/schedule to do the work + their field items) - never the
// GC's private money/people tabs.
const SUB_AWARDED_ALLOWED = new Set(['plans', 'schedule', 'tasks', 'progress', 'daily-logs', 'time', 'rfis', 'compliance'])
// On a sub's OWN job they get the full set except: submittals (a sub→GC
// artifact) and the buying-out tab (their own quote lives on "Estimate").
// 'bids' and 'quotes' stay listed because both are still reachable URLs that
// redirect into request-quotes - hiding the destination but not its aliases
// would leave a way back in.
const SUB_OWN_HIDDEN = new Set(['submittals', 'request-quotes', 'quotes', 'bids'])

// A job in planning hasn't broken ground: nobody is on site, nothing is built,
// and there is nothing to bill. Hide the tabs that only mean something once
// work starts so preconstruction reads as its own stage. They come back the
// moment the project is set to active.
// A site is a container - the building or the street, not a job. It holds the
// address, the client, the plans and the permits; the budget, schedule and
// crew all live on the units underneath it. Anything else would be a second
// place to track the same work.
const SITE_ALLOWED = new Set(['units', 'plans', 'permits', 'submittals', 'compliance', 'team', 'rfis', 'sharing'])

//
// 'payments' IS NOT IN THIS LIST, and that is deliberate.
//
// It used to be, and it created a deadlock. The readiness checklist gates
// "ready to go active?" on "Deposit or first payment received" and links to
// the payments tab to record one - but the tab was hidden until the job was
// already active. Following that link rendered Billing the client for a moment
// and then the guard below bounced you to the first visible tab, which is
// Plans. The app asked for a deposit and hid the only place to enter it.
//
// A deposit is not progress billing. It is the money you take BEFORE breaking
// ground, so preconstruction is exactly when it belongs.
const PLANNING_HIDDEN = new Set([
  'time', 'daily-logs', 'progress',
  'invoices', 'pay-apps', 'change-orders',
  'materials', 'inspections', 'reports', 'financials',
])

// A few tabs aren't their own permission resource. Sending documents out is a
// files action, so it borrows those rights rather than inventing a new toggle
// nobody would know to set.
// Client selections are allowances against budget lines - whoever can see the
// money can see what the client has and hasn't picked.
const PERMISSION_RESOURCE: Record<string, string> = { sharing: 'files', selections: 'budget' }

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
  // Billing mode decides how you RAISE what the client owes. Pay Apps is the
  // AIA way of doing that, so it only exists on AIA jobs.
  //
  // It does NOT decide whether money can come in. Two tabs were hidden here on
  // that reasoning and both were mistakes of the same shape - a tab does more
  // than one thing, one half is superseded, and hiding the tab takes the other
  // half with it:
  //
  //   * Invoices holds bills your subs and suppliers sent YOU - money out,
  //     nothing to do with how money comes in. Hiding it on AIA jobs left the
  //     job type with the most subcontractors on it with nowhere to record a
  //     single sub's bill.
  //   * Billing the client is where you RECORD MONEY RECEIVED, and it is the
  //     only place in the app that writes a client payment at all. An AIA job
  //     still takes deposits and still banks draws, so hiding it meant an AIA
  //     job could not record a payment by any route - while the go-live
  //     checklist demanded one before the job could be set active.
  //
  // So only pay-apps is gated now. The payments page hides its own "raise an
  // invoice" half on AIA jobs and points at Pay Apps instead, which is the
  // narrow thing that was actually true here.
  const billingMode = ctx?.billingMode ?? 'simple'
  const billingAllows = (slug: string) => {
    if (slug === 'pay-apps') return billingMode === 'aia'
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

  // Block direct-URL access to a tab that does not exist for this project.
  //
  // `billingAllows` is checked here too. It was not, so a tab hidden purely by
  // billing mode still RENDERED when you reached it by link - no tab
  // highlighted, no group selected, an orphan page with no way back. Whatever
  // decides a tab is invisible has to be the same thing that decides it is
  // unreachable, or the two disagree and the user is the one who finds out.
  useEffect(() => {
    if (!ready) return
    const current = allTabs.find(t => pathname.includes(`/${t.slug}`))
    if (current && (!statusAllows(current.slug) || !billingAllows(current.slug) || (isSub && !subAllows(current.slug)))) {
      const fallback = visibleTabs[0]?.slug ?? 'plans'
      router.replace(`/projects/${projectId}/${fallback}`)
    }
  }, [ready, isSub, isPlanning, isSite, billingMode, pathname])

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
