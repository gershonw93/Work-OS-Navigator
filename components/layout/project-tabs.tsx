'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

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

  return (
    <div className="border-b border-slate-200 bg-white">
      <nav className="flex overflow-x-auto scrollbar-hide -mb-px px-4 sm:px-6" aria-label="Project tabs">
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
