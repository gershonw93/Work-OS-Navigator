import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, Send, Scale, Landmark, CalendarDays, LayoutDashboard, Users,
  Receipt, ShieldCheck, Quote as QuoteIcon, BookOpen,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { CompareMock } from '@/components/marketing/compare-mock'
import { MoneyMock } from '@/components/marketing/money-mock'
import { Reveal } from '@/components/marketing/reveal'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'SyteNav for general contractors',
  description:
    'Run every job, sub, and dollar from one place. RFQs out, bids compared with AI, invoices in, escrow tracked, and master calendar and money views across all your projects.',
  path: '/homepage/contractors',
})

const DAY = [
  { time: '6:40a', text: 'Coffee and the dashboard. Eighteen jobs, two things need you: an inspection Thursday and a draw due on Linden Ave.' },
  { time: '8:15a', text: 'The electrician’s bid came in overnight on the RFQ link. AI has it scanned and lined up against the other two.' },
  { time: '10:30a', text: 'Award the work from the comparison. The winning quote becomes the sub’s budget, schedule, and payment stages.' },
  { time: '1:20p', text: 'Field super files the daily log from Maple St with photos. You see it before lunch is over.' },
  { time: '3:45p', text: 'Client releases the escrow draw. Fee earned updates, vendor payments queue up.' },
  { time: '5:05p', text: 'Tomorrow is already scheduled. You go home instead of doing paperwork.' },
]

const PILLARS = [
  {
    icon: Send,
    title: 'RFQs out, without the email chase',
    body: 'Send plans and scope to your subs in one move. They bid on a private link, no account needed, and every bid lands scanned and structured.',
  },
  {
    icon: Scale,
    title: 'Bids compared, gaps exposed',
    body: 'AI lines up every quote: totals, line items, payment terms, exclusions. You see who skipped the permit fees before it becomes your problem.',
  },
  {
    icon: Landmark,
    title: 'Escrow and client money, tracked to the dollar',
    body: 'Client funds in, your fee earned, escrow held, vendors owed. Every draw and stage payment reconciled per job, and rolled up across all of them.',
  },
  {
    icon: Receipt,
    title: 'Invoices in, approvals routed',
    body: 'Sub and vendor invoices are scanned, matched to the job, and routed for approval. Nothing gets paid twice, nothing gets lost.',
  },
  {
    icon: CalendarDays,
    title: 'The field on schedule',
    body: 'Milestones, deliveries, inspections, and crew dates per job, with daily logs and photos flowing back from the site.',
  },
  {
    icon: Users,
    title: 'Roles for the whole operation',
    body: 'Office, PMs, supers, and crew each get the right view. Approvals stay with the people who should approve.',
  },
]

export default function ContractorsPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 sm:pb-20">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <Eyebrow>For general contractors</Eyebrow>
            <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
              Every job. Every sub. Every dollar.
            </h1>
            <p className="mt-6 text-lg text-muted-fg leading-relaxed">
              You&apos;re not running a project, you&apos;re running twelve, with forty subs and a few million dollars moving between them. SyteNav is the one screen that holds it all: bids out, invoices in, escrow balanced, field reporting daily.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/homepage/why" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
                Why switch
              </Link>
            </div>
          </div>
          <Reveal delay={150} className="min-w-0">
            <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
          </Reveal>
        </div>
      </section>

      {/* Pillars, borderless two-column */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="The GC workflow"
              title="From buyout to closeout, one system"
              lead="Six things a GC does every week, and how SyteNav does the heavy lifting on each."
              className="mb-14 sm:mb-16"
            />
          </Reveal>
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-12">
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={(i % 2) * 100}>
                <div className="flex items-start gap-4">
                  <span className="h-11 w-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <p.icon className="h-5 w-5 text-accent-ink" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-ink">{p.title}</h3>
                    <p className="mt-2 text-muted-fg leading-relaxed">{p.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Bid comparison split */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <Reveal className="min-w-0 order-2 lg:order-1"><CompareMock /></Reveal>
        <Reveal delay={120} className="order-1 lg:order-2">
          <Eyebrow>Buyout</Eyebrow>
          <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
            Award with the whole picture, not just the bottom line.
          </h2>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">
            Every RFQ response comes back scanned into the same structure, so comparing three electricians takes minutes, not an evening. When you award, the winning quote becomes that sub&apos;s live budget and payment schedule. No re-entry, no drift.
          </p>
          <Link href="/homepage/ai" className="mt-7 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:gap-2.5 transition-all">
            How the AI comparison works <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </section>

      {/* Money split */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <Reveal>
            <Eyebrow>Client money & escrow</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
              Know your escrow balance without doing math.
            </h2>
            <p className="mt-5 text-lg text-muted-fg leading-relaxed">
              Cost-plus or fixed price, SyteNav keeps the client&apos;s money, your fee, and vendor obligations separated and current. Each stage payment reconciles automatically, and the master money view rolls it up across every job you&apos;re running.
            </p>
            <ul className="mt-7 space-y-3.5">
              {[
                'Stage payments tracked from invoice to release',
                'Escrow held vs fee earned vs vendors owed, per job',
                'Material receipts scanned straight into job costs',
                'Company-wide cash picture in the master money view',
              ].map(t => (
                <li key={t} className="flex items-start gap-3 text-ink-soft">
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-accent shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150} className="min-w-0"><MoneyMock /></Reveal>
        </div>
      </section>

      {/* Day in the life, dark band */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
            <Reveal>
              <SectionHead
                center
                eyebrow="A Tuesday on SyteNav"
                title="What running 18 jobs feels like when the system works"
                className="mb-14 sm:mb-16"
              />
            </Reveal>
            <ol className="relative max-w-2xl mx-auto space-y-10 border-l border-line pl-8">
              {DAY.map((d, i) => (
                <Reveal key={d.time} delay={i * 80}>
                  <li className="relative">
                    <span aria-hidden className="absolute -left-[2.44rem] top-1 h-3 w-3 rounded-full bg-accent border-2 border-surface" />
                    <p className="font-mono text-xs text-accent-fg mb-1.5">{d.time}</p>
                    <p className="text-ink-soft leading-relaxed">{d.text}</p>
                  </li>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Master views + logs strip */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <div className="grid sm:grid-cols-3 gap-10 sm:gap-8 text-center">
          {[
            { icon: LayoutDashboard, title: 'Master dashboard', body: 'Every job’s health on one screen, every morning.' },
            { icon: BookOpen, title: 'Field, reporting in', body: 'Daily logs, photos, and time from every site, live.' },
            { icon: ShieldCheck, title: 'Compliance covered', body: 'Permits and COIs tracked, inspections requested, booked, and resulted on the master calendar.' },
          ].map((x, i) => (
            <Reveal key={x.title} delay={i * 100}>
              <div>
                <x.icon className="h-8 w-8 text-accent-fg mx-auto mb-4" />
                <h3 className="text-lg font-bold text-ink">{x.title}</h3>
                <p className="mt-2 text-sm text-muted-fg leading-relaxed max-w-xs mx-auto">{x.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonial */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28 text-center">
        <Reveal>
          <figure>
            <QuoteIcon className="h-7 w-7 text-accent-fg mx-auto mb-5" aria-hidden />
            <blockquote className="text-xl sm:text-2xl text-ink font-medium leading-relaxed">
              &ldquo;I used to spend Sunday nights building a master spreadsheet from six other spreadsheets. Now the master view just exists. It&apos;s Tuesday and I know my numbers.&rdquo;
            </blockquote>
            <figcaption className="mt-6 text-sm">
              <span className="font-semibold text-ink">Marcus T.</span>{' '}
              <span className="text-faint">· General contractor, 18 active jobs · Newark, NJ</span>
            </figcaption>
          </figure>
        </Reveal>
      </section>

      <CtaBand title="Run every job from one screen" body="Bring one project or bring the whole company. Setup takes minutes, not a migration." />
    </>
  )
}
