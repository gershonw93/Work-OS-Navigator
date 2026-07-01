import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, FileText, ScanLine, Sparkles, Scale, Camera, Smartphone, Check,
  Receipt, ShieldCheck, Map, ListChecks, Percent, CalendarClock, Layers, Eye,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { QuoteScanMock } from '@/components/marketing/quote-scan-mock'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { CompareMock } from '@/components/marketing/compare-mock'
import { Reveal } from '@/components/marketing/reveal'
import { CountUp } from '@/components/marketing/count-up'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'AI document scanning & bid comparison · SyteNav',
  description:
    'SyteNav AI reads quotes, invoices, permits, and plans into structured jobs: line items, quantities, and payment terms. Compare bids with gap analysis and get smart recommendations.',
  path: '/homepage/ai',
})

const READS = [
  {
    icon: FileText,
    title: 'Quotes & proposals',
    out: ['Sections & line items', 'Quantities & unit rates', 'Payment schedule', 'Exclusions & terms'],
  },
  {
    icon: Receipt,
    title: 'Vendor invoices',
    out: ['Amounts & due dates', 'Line-item detail', 'Matched to the job', 'Retainage & terms'],
  },
  {
    icon: ShieldCheck,
    title: 'Permits',
    out: ['Permit numbers', 'Issue & expiry dates', 'Scope covered', 'Inspection requirements'],
  },
  {
    icon: Map,
    title: 'Plans & drawings',
    out: ['Sheet index', 'Key quantities', 'Linked to RFQs', 'Shared with subs'],
  },
]

const BEFORE = [
  'A 14-page proposal PDF in someone’s inbox',
  'Quantities retyped into a spreadsheet, twice',
  'Payment terms buried on page 11',
  'Three bids compared by squinting at totals',
  'A permit expiry nobody wrote down',
]

const AFTER = [
  'Every line item, quantity, and rate in the budget',
  'A payment schedule tracked stage by stage',
  'Bids compared line by line, gaps flagged',
  'The best-fit bid recommended with reasons',
  'Permit dates on the calendar with reminders',
]

export default function AiPage() {
  return (
    <>
      {/* Hero: before / after */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-24">
        <div className="text-center max-w-3xl mx-auto">
          <Eyebrow className="justify-center">SyteNav AI</Eyebrow>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
            A pile of PDFs goes in. A structured job comes out.
          </h1>
          <p className="mt-6 text-lg text-muted-fg leading-relaxed">
            Every job starts as paperwork: quotes, plans, permits, invoices. SyteNav&apos;s AI reads all of it into clean, structured data, so the job is set up in minutes and nobody retypes a number again.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
              Scan your first quote free <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        {/* Before / after panel */}
        <Reveal delay={150}>
          <div className="mt-14 sm:mt-20 grid md:grid-cols-2 gap-4 sm:gap-6 items-stretch">
            <div className="rounded-2xl border border-line bg-panel p-6 sm:p-8">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-faint mb-5">Before · the pile</p>
              <ul className="space-y-3.5">
                {BEFORE.map(t => (
                  <li key={t} className="flex items-start gap-3 text-sm text-muted-fg leading-relaxed">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-faint shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-accent/40 bg-accent-tint/40 p-6 sm:p-8 relative">
              <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent text-accent-ink text-[11px] font-bold px-2.5 py-1">
                <Sparkles className="h-3 w-3" /> After · the job
              </span>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-fg mb-5 mt-1">One scan later</p>
              <ul className="space-y-3.5">
                {AFTER.map(t => (
                  <li key={t} className="flex items-start gap-3 text-sm text-ink-soft leading-relaxed">
                    <Check className="h-4 w-4 text-accent-fg mt-0.5 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
        </div>
      </section>

      {/* Scan numbers strip */}
      <section className="border-y border-line bg-panel">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-3 gap-6 text-center">
          {[
            { end: 14, suffix: 's', label: 'average quote scan' },
            { end: 310000, suffix: '+', label: 'documents scanned' },
            { end: 98, suffix: '%', label: 'line items captured on first pass' },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i * 100}>
              <p className="font-display font-bold text-3xl sm:text-5xl text-ink tracking-tight">
                <CountUp end={s.end} suffix={s.suffix} />
              </p>
              <p className="text-xs sm:text-sm text-muted-fg mt-1.5">{s.label}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Deep dive: quote scanning */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal>
          <Eyebrow>Document scanning</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
            It reads the quote the way an estimator would.
          </h2>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">
            Not just text extraction. SyteNav understands the structure of construction paperwork: which lines are scope, which are pricing, where the sections break, and how the payment schedule maps to the work.
          </p>
          <ul className="mt-7 space-y-4">
            {[
              { icon: Layers, t: 'Sections and line items, kept in the order the trade wrote them' },
              { icon: ListChecks, t: 'Quantities, units, and rates parsed into real numbers, not strings' },
              { icon: CalendarClock, t: 'Payment terms and stage percentages extracted into a schedule' },
              { icon: Eye, t: 'You review everything before it becomes the job. AI drafts, you approve.' },
            ].map(x => (
              <li key={x.t} className="flex items-start gap-3 text-ink-soft leading-relaxed">
                <x.icon className="h-5 w-5 text-accent-fg mt-0.5 shrink-0" /> {x.t}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal delay={150} className="min-w-0"><QuoteScanMock /></Reveal>
      </section>

      {/* What it reads, grid */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead
              center
              eyebrow="Every document type"
              title="If it shows up on a job, it scans"
              lead="Four document types, each read for the fields that actually matter downstream."
              className="mb-14"
            />
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
            {READS.map((d, i) => (
              <Reveal key={d.title} delay={i * 90}>
                <div>
                  <span className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center mb-4">
                    <d.icon className="h-5 w-5 text-accent-ink" />
                  </span>
                  <h3 className="text-lg font-bold text-ink">{d.title}</h3>
                  <ul className="mt-3 space-y-2">
                    {d.out.map(o => (
                      <li key={o} className="flex items-center gap-2 text-sm text-muted-fg">
                        <Check className="h-3.5 w-3.5 text-success shrink-0" /> {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bid comparison */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal className="min-w-0 order-2 lg:order-1"><CompareMock /></Reveal>
        <Reveal delay={120} className="order-1 lg:order-2">
          <Eyebrow>Bid comparison</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
            The lowest bid isn&apos;t always the cheapest.
          </h2>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">
            Drop in every quote you received and SyteNav lines them up: totals, line-item coverage, payment terms, and, most importantly, the gaps. The bid that skipped permit fees and the panel upgrade looks cheap right up until change-order season.
          </p>
          <ul className="mt-7 space-y-4">
            {[
              { icon: Scale, t: 'Side-by-side comparison across every scanned bid' },
              { icon: Percent, t: 'Gap analysis: what each bid excludes, and the estimated true cost' },
              { icon: Sparkles, t: 'A recommendation ranked against your stated requirements' },
            ].map(x => (
              <li key={x.t} className="flex items-start gap-3 text-ink-soft leading-relaxed">
                <x.icon className="h-5 w-5 text-accent-fg mt-0.5 shrink-0" /> {x.t}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* Dark band: from the field */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
            <Reveal>
              <Eyebrow className="justify-center">Built for the truck, not the desk</Eyebrow>
              <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06] max-w-3xl mx-auto">
                Scan it from the tailgate before you leave the site.
              </h2>
              <p className="mt-5 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
                The sub hands you a paper quote. You photograph it, and by the time you&apos;re back in the truck it&apos;s line items in the budget. No scanner, no laptop, no &ldquo;I&apos;ll type it up Friday.&rdquo;
              </p>
            </Reveal>
            <div className="mt-12 grid sm:grid-cols-3 gap-10 sm:gap-6 max-w-3xl mx-auto">
              {[
                { icon: Camera, title: 'Photograph it', body: 'Crumpled, coffee-stained, handwritten margins. It reads.' },
                { icon: ScanLine, title: 'AI structures it', body: 'Line items, quantities, terms, in about 14 seconds.' },
                { icon: Smartphone, title: 'Review and approve', body: 'Fix anything it got wrong, tap approve, done.' },
              ].map((s, i) => (
                <Reveal key={s.title} delay={i * 110}>
                  <div>
                    <span className="mx-auto h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-4">
                      <s.icon className="h-6 w-6 text-accent-ink" />
                    </span>
                    <h3 className="font-bold text-ink">{s.title}</h3>
                    <p className="mt-2 text-sm text-muted-fg leading-relaxed">{s.body}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust note */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24 text-center">
        <Reveal>
          <Eyebrow className="justify-center">Your data, your call</Eyebrow>
          <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">AI drafts. You approve. Always.</h2>
          <p className="mt-4 text-muted-fg leading-relaxed">
            Every scan lands as a draft you can edit before it touches the job. Your documents are processed only to extract your data, are never used to train third-party models, and stay yours. Read more on our{' '}
            <Link href="/homepage/security" className="text-accent-fg font-semibold hover:underline">security page</Link>.
          </p>
        </Reveal>
      </section>

      <CtaBand title="Retire the retyping" body="Upload one real quote from a real job and watch it become the whole tracker." />
    </>
  )
}
