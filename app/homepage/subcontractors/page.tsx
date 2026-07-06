import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, Upload, ListChecks, CalendarDays, Receipt, Quote as QuoteIcon,
  Sparkles, Check, Clock, Camera, ReceiptText,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { QuoteScanMock } from '@/components/marketing/quote-scan-mock'
import { ScheduleMock } from '@/components/marketing/schedule-mock'
import { Reveal } from '@/components/marketing/reveal'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'SyteNav for subcontractors',
  description:
    'Upload your quote and AI turns it into the job: line-item progress, crew scheduling with overlap warnings across your other jobs, stage invoicing, and getting paid.',
  path: '/homepage/subcontractors',
})

const STEPS = [
  {
    icon: Upload,
    title: 'Upload the quote you already wrote',
    body: 'The proposal you sent the GC is the whole setup. PDF or photo, AI reads every section, line item, quantity, and payment stage into a live job. No forms, no templates, no evening of data entry.',
  },
  {
    icon: ListChecks,
    title: 'Track progress line by line',
    body: 'Mark up progress against the exact line items you quoted. Twenty-four receptacle points, eighteen done. The percent complete, the invoice backup, and the crew’s task list all come from the same numbers.',
  },
  {
    icon: CalendarDays,
    title: 'Schedule around your other jobs',
    body: 'You’re never on one job. SyteNav sees your whole week across every project and warns you when two GCs both think Thursday belongs to them, before you promise a crew you don’t have.',
  },
  {
    icon: Receipt,
    title: 'Invoice each stage, get paid',
    body: 'When a payment stage hits, the invoice is one tap, backed by the line-item progress the GC can see. Fewer arguments, faster releases, money that lands when the work does.',
  },
]

const EXTRAS = [
  { icon: Clock, title: 'Time clock', body: 'Crew clocks in with location. Payroll gets clean hours.' },
  { icon: Camera, title: 'Daily logs & photos', body: 'Two minutes at the tailgate covers you on every job.' },
  { icon: ReceiptText, title: 'Materials & receipts', body: 'Snap the receipt at the counter, the cost lands on the right job.' },
  { icon: Sparkles, title: 'Bid on GC RFQs', body: 'GCs on SyteNav send you plans. You bid on a link, no account needed.' },
]

export default function SubcontractorsPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Eyebrow>For subcontractors</Eyebrow>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
              Upload your quote. That&apos;s the setup.
            </h1>
            <p className="mt-6 text-lg text-muted-fg leading-relaxed">
              You already did the hard part when you priced the job. SyteNav&apos;s AI turns that quote into your budget, your task list, and your payment schedule, then keeps your crew, your calendar, and your invoices straight across every job you&apos;re on.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/homepage/ai" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
                See the AI scan
              </Link>
            </div>
            <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              Electrical · Plumbing · HVAC · Framing · Finish · Every trade
            </p>
          </div>
          <Reveal delay={150} className="min-w-0"><QuoteScanMock /></Reveal>
        </div>
      </section>

      {/* The four steps, alternating numbered rows */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="Quote to paid"
              title="Four steps, zero office nights"
              className="mb-14 sm:mb-20"
            />
          </Reveal>
          <div className="space-y-14 sm:space-y-20">
            {STEPS.map((s, i) => (
              <Reveal key={s.title}>
                <div className="grid md:grid-cols-12 gap-6 md:gap-10 items-start">
                  <div className="md:col-span-2 flex md:justify-end">
                    <span className="font-display font-bold text-6xl sm:text-7xl text-ink/[0.12] leading-none select-none" aria-hidden>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="md:col-span-10 max-w-2xl">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                        <s.icon className="h-5 w-5 text-accent-ink" />
                      </span>
                      <h3 className="text-xl sm:text-2xl font-bold text-ink">{s.title}</h3>
                    </div>
                    <p className="text-muted-fg leading-relaxed sm:text-lg">{s.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Overlap schedule split */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal>
          <Eyebrow>Cross-job scheduling</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
            Two GCs. One Thursday. Caught on Monday.
          </h2>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">
            The most expensive mistake a sub makes isn&apos;t on the wall, it&apos;s on the calendar. SyteNav plans each job by when, how long, and how many crew, then checks every job against the others and flags the collisions while they&apos;re still cheap to fix.
          </p>
          <ul className="mt-7 space-y-3.5">
            {[
              'One week view across every job and GC',
              'Overlap warnings when crews are double-booked',
              'Suggestions that resolve the clash without slipping milestones',
            ].map(t => (
              <li key={t} className="flex items-start gap-3 text-ink-soft">
                <Check className="h-5 w-5 text-success mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={150} className="min-w-0"><ScheduleMock /></Reveal>
      </section>

      {/* Dark band: extras */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
            <Reveal>
              <SectionHead
                center
                eyebrow="And the rest of the day job"
                title="Small crew. Full toolkit."
                className="mb-12 sm:mb-16"
              />
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-8 text-center max-w-5xl mx-auto">
              {EXTRAS.map((x, i) => (
                <Reveal key={x.title} delay={i * 100}>
                  <div>
                    <span className="mx-auto h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
                      <x.icon className="h-6 w-6 text-accent-ink" />
                    </span>
                    <h3 className="font-bold text-ink text-lg">{x.title}</h3>
                    <p className="mt-2 text-sm text-muted-fg leading-relaxed max-w-[240px] mx-auto">{x.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <Reveal>
          <figure>
            <QuoteIcon className="h-7 w-7 text-accent-fg mx-auto mb-5" aria-hidden />
            <blockquote className="text-xl sm:text-2xl text-ink font-medium leading-relaxed">
              &ldquo;Uploading a quote and watching it turn into the whole job tracker is wild. I run three crews across five jobs and I haven&apos;t double-booked a Thursday since March.&rdquo;
            </blockquote>
            <figcaption className="mt-6 text-sm">
              <span className="font-semibold text-ink">Dani R.</span>{' '}
              <span className="text-faint">· Electrical subcontractor · Brooklyn, NY</span>
            </figcaption>
          </figure>
        </Reveal>
      </section>

      <CtaBand title="Your next quote is the whole job" body="Upload it free. If the scan doesn't blow your mind, you lost four minutes." />
    </>
  )
}
