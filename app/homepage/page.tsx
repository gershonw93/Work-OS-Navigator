import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, CheckSquare, Hammer, Building2, HardHat, Quote as QuoteIcon, Star,
} from 'lucide-react'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { ScrollHero } from '@/components/marketing/scroll-hero'
import { FeatureWall } from '@/components/marketing/feature-wall'
import { UploadAISection } from '@/components/marketing/upload-ai-section'
import { TeamSection } from '@/components/marketing/team-section'

export const metadata: Metadata = { title: 'SyteNav, Construction management built for the field' }

const STATS = [
  { value: '2,400+', label: 'contractors building on SyteNav' },
  { value: '$1.9B', label: 'in contracts tracked' },
  { value: '48,000+', label: 'jobs managed' },
  { value: '120k+', label: 'daily logs filed' },
]

const AUDIENCE = [
  { icon: Building2, title: 'General contractors', body: 'Run every job, sub, and dollar from one place, bids out, invoices in, budgets on track.' },
  { icon: HardHat, title: 'Subcontractors', body: 'Quote, win, and run your own jobs, line-item progress, crew tasks, and getting paid.' },
  { icon: Hammer, title: 'Remodelers & specialty', body: 'Cost-plus or fixed price, escrow draws, and change orders, without the paperwork.' },
]

export default function HomePage() {
  return (
    <>
      {/* Scroll-driven hero: busy projects page → zooms into a monitor → fades to headline */}
      <ScrollHero />

      {/* Stats */}
      <section className="border-y border-line bg-panel">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {STATS.map(s => (
            <div key={s.label}>
              <p className="text-3xl sm:text-4xl font-extrabold text-ink">{s.value}</p>
              <p className="text-sm text-muted-fg mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature spotlight with screenshot */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">See the whole job</p>
            <h2 className="text-3xl font-bold text-ink">One dashboard. Every project, every dollar.</h2>
            <p className="mt-3 text-muted-fg">Cash in vs out, jobs at a glance, what’s due this week, the boss view across the whole company, and a focused view for each crew on the ground.</p>
            <ul className="mt-5 space-y-2.5">
              {['Master calendar & money across all jobs', 'Quote → budget → progress, one source of truth', 'Role-based access for office, PMs, and crew'].map(t => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-soft"><CheckSquare className="h-4 w-4 text-success mt-0.5 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
        </div>
      </section>

      {/* Easy upload + AI scans everything (dark-colored band) */}
      <UploadAISection />

      {/* Team & management */}
      <TeamSection />

      {/* The full feature wall */}
      <FeatureWall />

      {/* Who it's for */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Who it’s for</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink">Built for everyone on the project</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 text-center">
          {AUDIENCE.map(a => (
            <div key={a.title} className="flex flex-col items-center">
              <div className="h-12 w-12 rounded-full bg-accent-tint flex items-center justify-center mb-3"><a.icon className="h-6 w-6 text-accent-fg" /></div>
              <h3 className="font-bold text-ink">{a.title}</h3>
              <p className="text-sm text-muted-fg mt-1.5 max-w-xs">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="flex items-center justify-center gap-1 mb-2">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-warn text-warn" />)}</div>
          <h2 className="text-3xl font-bold text-ink">Crews that switched aren’t going back</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            { q: 'We killed three spreadsheets and a group chat. Everything’s in SyteNav now.', n: 'Marcus T.', r: 'GC · Newark, NJ' },
            { q: 'Uploading a quote and watching it turn into the whole job tracker is wild.', n: 'Dani R.', r: 'Electrical sub · Brooklyn, NY' },
            { q: 'I finally know my escrow balance and fee on every job without doing math.', n: 'Sal P.', r: 'Remodeler · Linden, NJ' },
          ].map(t => (
            <figure key={t.n} className="text-center px-2">
              <QuoteIcon className="h-6 w-6 text-accent-fg mx-auto mb-3" />
              <blockquote className="text-base text-ink-soft leading-relaxed">“{t.q}”</blockquote>
              <figcaption className="mt-4 text-sm"><span className="font-semibold text-ink">{t.n}</span> <span className="text-faint">· {t.r}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-3xl bg-accent text-accent-ink px-6 sm:px-12 py-14 text-center">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Run your next job on SyteNav</h2>
          <p className="mt-3 text-accent-ink/80 max-w-xl mx-auto">Set up your company, create a project, and bring the field and office onto one page.</p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-ink text-surface font-bold px-6 py-3 hover:opacity-90">Start free <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/homepage/contact" className="inline-flex items-center gap-2 rounded-xl border border-accent-ink/30 font-semibold px-6 py-3 hover:bg-accent-ink/10">Talk to us</Link>
          </div>
        </div>
      </section>
    </>
  )
}
