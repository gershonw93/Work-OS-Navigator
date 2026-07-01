import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, ScanLine, Wallet, HardHat, Building2, Quote as QuoteIcon, Star, Upload,
  Sparkles, CircleDollarSign,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { ScrollHero } from '@/components/marketing/scroll-hero'
import { StatMarquee } from '@/components/marketing/stat-marquee'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { QuoteScanMock } from '@/components/marketing/quote-scan-mock'
import { FeatureTabs } from '@/components/marketing/feature-tabs'
import { Reveal } from '@/components/marketing/reveal'
import { CountUp } from '@/components/marketing/count-up'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'SyteNav · Construction management built for the field',
  description:
    'Run the whole build from one place. AI quote scanning, budgets, client payments and escrow, invoices, scheduling, daily logs, and compliance, for GCs and subs.',
  path: '/homepage',
})

const STEPS = [
  {
    n: '01',
    icon: Upload,
    title: 'Upload the quote',
    body: 'Drop in a PDF or snap a photo from the truck. Quotes, invoices, permits, plans, anything on paper.',
  },
  {
    n: '02',
    icon: Sparkles,
    title: 'AI builds the job',
    body: 'Line items, quantities, rates, and the payment schedule become a live budget and progress tracker. You review, then approve.',
  },
  {
    n: '03',
    icon: CircleDollarSign,
    title: 'Run it and get paid',
    body: 'Schedule the crew, file the logs, pass the inspections, invoice each stage, and watch the money land.',
  },
]

const STATS = [
  { end: 2400, suffix: '+', label: 'contractors building on SyteNav' },
  { end: 1.9, prefix: '$', suffix: 'B', decimals: 1, label: 'in contracts tracked' },
  { end: 48000, suffix: '+', label: 'jobs managed' },
  { end: 310000, suffix: '+', label: 'documents scanned by AI' },
]

const TESTIMONIALS = [
  { q: 'We killed three spreadsheets and a group chat in the first week. Everything about the job lives in SyteNav now.', n: 'Marcus T.', r: 'General contractor · Newark, NJ' },
  { q: 'Uploading a quote and watching it turn into the whole job tracker is wild. My setup time went from an evening to a coffee break.', n: 'Dani R.', r: 'Electrical sub · Brooklyn, NY' },
  { q: 'I finally know my escrow balance and my fee on every job without doing math on the tailgate.', n: 'Sal P.', r: 'Remodeler · Linden, NJ' },
]

export default function HomePage() {
  return (
    <>
      {/* Signature scroll hero */}
      <ScrollHero />

      {/* Everything below overlaps the hero's empty tail on desktop, so the
          page flows straight from the settled headline into the marquee with
          no dead scroll. Disabled under reduced motion, where the hero is a
          normal content-sized section. */}
      <div className="relative z-10 motion-safe:md:-mt-[18vh] bg-surface">

      {/* Proof-point marquee */}
      <StatMarquee />

      {/* How it works, three borderless steps */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            center
            eyebrow="How it works"
            title="From a pile of PDFs to a running job"
            lead="Most software makes you type the job in. SyteNav reads it in, then keeps every trade, dollar, and deadline on the same page."
          />
        </Reveal>
        <div className="mt-14 sm:mt-20 grid md:grid-cols-3 gap-12 md:gap-8">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="relative">
                <span aria-hidden className="font-display font-bold text-7xl sm:text-8xl text-ink/[0.07] dark:text-ink/[0.09] absolute -top-6 -left-1 select-none">
                  {s.n}
                </span>
                <div className="relative pt-8">
                  <span className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-5">
                    <s.icon className="h-6 w-6 text-accent-ink" />
                  </span>
                  <h3 className="text-xl font-bold text-ink">{s.title}</h3>
                  <p className="mt-2.5 text-muted-fg leading-relaxed">{s.body}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dashboard split row */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <Reveal>
            <Eyebrow>See the whole company</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
              Every job, every dollar, one screen.
            </h2>
            <p className="mt-5 text-lg text-muted-fg leading-relaxed">
              Cash in versus cash out. What&apos;s due this week. Which jobs are ahead and which are bleeding. The master calendar and master money views roll every project into one picture, then let you drill into any of them.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                'Master calendar and money views across all jobs',
                'Quote to budget to progress, one source of truth',
                'Role-based views for the office, PMs, and crew',
              ].map(t => (
                <li key={t} className="flex items-start gap-3 text-ink-soft">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/homepage/contractors" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:gap-2.5 transition-all">
              How GCs run on SyteNav <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={150} className="min-w-0">
            <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
          </Reveal>
        </div>
      </section>

      {/* Dark AI band */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
              <Eyebrow>AI does the data entry</Eyebrow>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
                Snap it. Upload it. It&apos;s in the system.
              </h2>
              <p className="mt-5 text-lg text-muted-fg leading-relaxed">
                Take a photo on the jobsite or drop in a PDF. SyteNav reads quotes, invoices, permits, and plans into clean structured data: line items, quantities, totals, and payment terms. Then it compares bids for you and flags what each one leaves out.
              </p>
              <ul className="mt-7 space-y-3.5">
                {[
                  { icon: ScanLine, t: 'Quotes, invoices, permits, and plans, from PDF or photo' },
                  { icon: Sparkles, t: 'Bid comparison with gap analysis before you award' },
                  { icon: Wallet, t: 'Payment schedules extracted straight into the budget' },
                ].map(x => (
                  <li key={x.t} className="flex items-start gap-3 text-ink-soft">
                    <x.icon className="h-5 w-5 text-accent-fg mt-0.5 shrink-0" /> {x.t}
                  </li>
                ))}
              </ul>
              <Link
                href="/homepage/ai"
                className="mt-9 inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors"
              >
                See the AI in depth <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
            <Reveal delay={150} className="min-w-0">
              <QuoteScanMock />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Feature explorer */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            center
            eyebrow="Everything in the box"
            title="One app from the first quote to the final payment"
            lead="Five product areas, zero duct tape. Pick one to see how it works."
            className="mb-12 sm:mb-16"
          />
        </Reveal>
        <FeatureTabs />
      </section>

      {/* Audience split, borderless */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead center eyebrow="Who it's for" title="Two sides of the same job" className="mb-14 sm:mb-20" />
          </Reveal>
          <div className="grid md:grid-cols-2 gap-14 md:gap-10 lg:gap-20">
            <Reveal>
              <Link href="/homepage/contractors" className="group block">
                <Building2 className="h-9 w-9 text-accent-fg mb-5" />
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink group-hover:text-accent-fg transition-colors">
                  General contractors
                </h3>
                <p className="mt-3 text-muted-fg leading-relaxed">
                  Send RFQs, compare bids with AI, award the work, and track every sub, invoice, and escrow dollar across all your jobs at once.
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg group-hover:gap-2.5 transition-all">
                  The GC story <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <Link href="/homepage/subcontractors" className="group block">
                <HardHat className="h-9 w-9 text-accent-fg mb-5" />
                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink group-hover:text-accent-fg transition-colors">
                  Subcontractors
                </h3>
                <p className="mt-3 text-muted-fg leading-relaxed">
                  Upload your quote and the job builds itself. Track line-item progress, schedule around your other jobs with overlap warnings, invoice each stage, get paid.
                </p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg group-hover:gap-2.5 transition-all">
                  The sub story <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Count-up stats */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-12 text-center">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <p className="font-display font-bold text-4xl sm:text-5xl text-ink tracking-tight">
                <CountUp end={s.end} prefix={s.prefix} suffix={s.suffix} decimals={s.decimals} />
              </p>
              <p className="text-sm text-muted-fg mt-2 max-w-[180px] mx-auto">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="flex items-center justify-center gap-1 mb-3" aria-label="Five star rating">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-warn text-warn" />
              ))}
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
              Crews that switched aren&apos;t going back
            </h2>
          </div>
        </Reveal>
        <div className="grid md:grid-cols-3 gap-10 md:gap-6">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.n} delay={i * 120}>
              <figure className="text-center px-2">
                <QuoteIcon className="h-6 w-6 text-accent-fg mx-auto mb-4" aria-hidden />
                <blockquote className="text-base sm:text-lg text-ink-soft leading-relaxed">&ldquo;{t.q}&rdquo;</blockquote>
                <figcaption className="mt-5 text-sm">
                  <span className="font-semibold text-ink">{t.n}</span>{' '}
                  <span className="text-faint">· {t.r}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand />
      </div>
    </>
  )
}
