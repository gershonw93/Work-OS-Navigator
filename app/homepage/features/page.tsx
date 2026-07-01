import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight } from 'lucide-react'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { ProjectsMock } from '@/components/marketing/projects-mock'
import { FeatureWall } from '@/components/marketing/feature-wall'
import { UploadAISection } from '@/components/marketing/upload-ai-section'
import { TeamSection } from '@/components/marketing/team-section'

export const metadata: Metadata = { title: 'Features, SyteNav' }

export default function FeaturesPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Features</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-ink max-w-3xl mx-auto leading-tight">One app from the first quote to the final payment</h1>
        <p className="mt-4 text-lg text-muted-fg max-w-2xl mx-auto">Built for the way contractors actually work, office and field, GC and sub.</p>
        <div className="mt-10 max-w-5xl mx-auto"><BrowserMock url="app.sytenav.com/projects"><div className="h-[460px] overflow-hidden"><ProjectsMock /></div></BrowserMock></div>
      </section>

      {/* Easy upload + AI scans everything (dark-colored band) */}
      <UploadAISection />

      {/* The full feature wall */}
      <FeatureWall />

      {/* Team & management */}
      <TeamSection />

      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold text-ink">The boss’s-eye view</h2>
            <p className="mt-3 text-muted-fg">Every job, every dollar, one screen, then drill into any project for the detail.</p>
            <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90">Start free <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
        </div>
      </section>
    </>
  )
}
