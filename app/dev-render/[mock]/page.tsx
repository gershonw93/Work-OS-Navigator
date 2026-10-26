import { notFound } from 'next/navigation'
import { ProjectsScreen } from '@/components/marketing/projects-mock'
import { QuoteScanScreen } from '@/components/marketing/quote-scan-mock'
import { MoneyScreen } from '@/components/marketing/money-mock'
import { ScheduleScreen } from '@/components/marketing/schedule-mock'
import { CompareScreen } from '@/components/marketing/compare-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'

// The stage scripts/render-mocks.mjs photographs the website's app pictures
// on. Development only: in any build that is deployed this is a 404, so the
// live HTML these pictures replaced is never served from a public URL.
export const dynamic = 'force-dynamic'

const SCREENS = {
  projects: ProjectsScreen,
  'quote-scan': QuoteScanScreen,
  money: MoneyScreen,
  schedule: ScheduleScreen,
  compare: CompareScreen,
  dashboard: DashboardMock,
} as const

export default function DevRender({ params, searchParams }: {
  params: { mock: string }
  searchParams: { w?: string; h?: string; theme?: string }
}) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const Screen = SCREENS[params.mock as keyof typeof SCREENS]
  if (!Screen) notFound()
  const w = Number(searchParams.w) || 560
  const h = Number(searchParams.h) || undefined
  return (
    <div className={searchParams.theme === 'dark' ? 'dark' : ''}>
      <div className="bg-surface p-6">
        <div id="mock" className="bg-surface" style={{ width: w, height: h, overflow: h ? 'hidden' : undefined }}>
          <Screen />
        </div>
      </div>
    </div>
  )
}
