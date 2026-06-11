'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

const tabs = [
  { label: 'Plans', slug: 'plans' },
  { label: 'Bids', slug: 'bids' },
  { label: 'Team', slug: 'team' },
  { label: 'Schedule', slug: 'schedule' },
  { label: 'Tasks', slug: 'tasks' },
  { label: 'Progress', slug: 'progress' },
  { label: 'Daily Logs', slug: 'daily-logs' },
  { label: 'RFIs', slug: 'rfis' },
  { label: 'Invoices', slug: 'invoices' },
  { label: 'Financials', slug: 'financials' },
  { label: 'Change Orders', slug: 'change-orders' },
  { label: 'Permits', slug: 'permits' },
  { label: 'Inspections', slug: 'inspections' },
  { label: 'Submittals', slug: 'submittals' },
  { label: 'Compliance', slug: 'compliance' },
]

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname()
  const router = useRouter()

  const activeTab = tabs.find(t => pathname.includes(`/${t.slug}`))

  return (
    <div className="border-b border-slate-200 bg-white">
      {/* Mobile: dropdown section picker */}
      <div className="sm:hidden px-4 py-2.5">
        <div className="relative">
          <select
            value={activeTab?.slug ?? ''}
            onChange={e => router.push(`/projects/${projectId}/${e.target.value}`)}
            className="w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 py-2.5 text-sm font-semibold text-slate-800 focus:border-orange-500 focus:outline-none"
          >
            {!activeTab && <option value="" disabled>Go to section…</option>}
            {tabs.map(tab => (
              <option key={tab.slug} value={tab.slug}>{tab.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>
      </div>

      {/* Desktop: underline tabs */}
      <nav className="hidden sm:flex overflow-x-auto scrollbar-hide -mb-px px-4 sm:px-6" aria-label="Project tabs">
        {tabs.map((tab) => {
          const href = `/projects/${projectId}/${tab.slug}`
          const isActive = pathname.endsWith(`/${tab.slug}`)
          return (
            <Link
              key={tab.slug}
              href={href}
              className={cn(
                'flex shrink-0 items-center border-b-2 px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap',
                isActive
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              )}
            >
              {tab.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
