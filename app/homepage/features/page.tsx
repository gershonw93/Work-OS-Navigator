import Link from 'next/link'
import type { Metadata } from 'next'
import type { ComponentType, ReactNode } from 'react'
import {
  ArrowRight, ScanLine, Scale, Sparkles, FileText, Wallet, Banknote, Receipt, Send,
  GitPullRequest, BarChart2, CalendarDays, BookOpen, CheckSquare, Clock, Camera,
  ShieldCheck, Wrench, ClipboardCheck, UsersRound, FolderOpen, Users, Lock, Smartphone,
  LayoutDashboard, DollarSign,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { QuoteScanMock } from '@/components/marketing/quote-scan-mock'
import { MoneyMock } from '@/components/marketing/money-mock'
import { ScheduleMock } from '@/components/marketing/schedule-mock'
import { SideNav } from '@/components/marketing/side-nav'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'Features · SyteNav',
  description:
    'Every SyteNav capability in detail: AI document scanning, budgets, escrow and payments, invoices, RFQs, scheduling, daily logs, time clock, permits, inspections, RFIs, and team roles.',
  path: '/homepage/features',
})

type Feature = { icon: ComponentType<{ className?: string }>; title: string; body: string }

const SECTIONS: {
  id: string
  eyebrow: string
  title: string
  lead: string
  features: Feature[]
  visual?: ReactNode
}[] = [
  {
    id: 'ai',
    eyebrow: 'AI & documents',
    title: 'The paperwork reads itself',
    lead: 'Construction runs on documents nobody has time to retype. SyteNav’s AI turns quotes, invoices, permits, and plans into structured data you can actually run a job on. You always review before anything is saved.',
    features: [
      { icon: ScanLine, title: 'AI quote scanning', body: 'Upload a PDF or a phone photo. SyteNav reads sections, line items, quantities, unit rates, totals, and the payment schedule, then builds the job from them.' },
      { icon: Scale, title: 'Bid comparison with gap analysis', body: 'Drop in competing quotes and get a side-by-side breakdown: totals, scope coverage, payment terms, and exactly what each bid leaves out.' },
      { icon: FileText, title: 'Invoice & permit reading', body: 'Vendor invoices and permits are scanned for amounts, dates, permit numbers, and terms, straight into the right project.' },
      { icon: Sparkles, title: 'Smart recommendations', body: 'The AI flags the bid that best fits your requirements and warns you about missing scope before you award the work.' },
    ],
    visual: <QuoteScanMock />,
  },
  {
    id: 'money',
    eyebrow: 'Money',
    title: 'Every dollar, accounted for',
    lead: 'From the client’s first deposit to the last vendor payment, the money side of the job stays visible, current, and honest.',
    features: [
      { icon: Wallet, title: 'Budgets & line items', body: 'Budgeted versus committed versus actual for GCs, or quote-driven line items for subs. The budget updates as the job moves.' },
      { icon: Banknote, title: 'Client payments & escrow', body: 'Track client funds in, your fee earned, the escrow balance held, and what’s still owed to vendors, per stage and per job.' },
      { icon: Receipt, title: 'Invoices & approvals', body: 'Create invoices from progress, route them for approval, and track payment, with the client-versus-escrow split handled for you.' },
      { icon: Send, title: 'Request for quotes (RFQ)', body: 'Send plans and scope to your subs. They bid on a private link, no account required, and the bids land ready to compare.' },
      { icon: GitPullRequest, title: 'Change orders', body: 'Capture scope changes with pricing and approval, so the contract and the budget never drift apart.' },
      { icon: BarChart2, title: 'Financials & reports', body: 'Job-level profitability and company-wide rollups. See which jobs earn and which ones eat.' },
    ],
    visual: <MoneyMock />,
  },
  {
    id: 'field',
    eyebrow: 'The field',
    title: 'Built for phones with gloves on',
    lead: 'The crew should log it once, on the spot, and the office should see it live. Every field tool works on the device already in your pocket.',
    features: [
      { icon: CalendarDays, title: 'Scheduling', body: 'Plan milestones, deliveries, and crew dates per job, and see conflicts across jobs before they cost you a day.' },
      { icon: BookOpen, title: 'Daily logs', body: 'Weather, crew counts, work performed, photos, and notes, filed from the jobsite in a couple of minutes.' },
      { icon: CheckSquare, title: 'Tasks & progress', body: 'Track progress against each line item and spin off assignable tasks with priority and due dates.' },
      { icon: Clock, title: 'Time clock', body: 'Crew clocks in and out with location. You approve timesheets and export clean hours to payroll.' },
      { icon: Camera, title: 'Plans & photos', body: 'Current drawings and site photos organized by job, so the crew never builds off the old set.' },
    ],
    visual: <ScheduleMock />,
  },
  {
    id: 'compliance',
    eyebrow: 'Compliance & office',
    title: 'Nothing expires quietly',
    lead: 'Permits, inspections, insurance, submittals, and RFIs, the paperwork that can stop a job, tracked with reminders that fire before deadlines do.',
    features: [
      { icon: ShieldCheck, title: 'Permits & inspections', body: 'Track application, approval, and inspection dates for every permit, with reminders ahead of each one.' },
      { icon: Wrench, title: 'Submittals & RFIs', body: 'Submittals routed for approval, questions answered in one thread with the drawings attached. No email archaeology.' },
      { icon: ClipboardCheck, title: 'Insurance & licenses', body: 'COIs and licenses tracked per sub with expiry warnings, so nobody works uncovered.' },
      { icon: UsersRound, title: 'Directory & customers', body: 'Subs, suppliers, and clients in one company-wide address book, linked to their jobs, bids, and paperwork.' },
      { icon: FolderOpen, title: 'Files', body: 'Contracts, drawings, photos, and scans organized by project and searchable in seconds.' },
    ],
  },
  {
    id: 'team',
    eyebrow: 'Team & control',
    title: 'The right access for every hard hat',
    lead: 'Invite the office, the PMs, and the crew, then control exactly what each person sees and can do.',
    features: [
      { icon: Users, title: 'Roles & permissions', body: 'Admin, project manager, office, field supervisor, and crew roles, each with granular access.' },
      { icon: CheckSquare, title: 'Assignments & approvals', body: 'Assign tasks, approve timesheets, invoices, and change orders, with a clear record of who approved what.' },
      { icon: Lock, title: 'Delete protection', body: 'A secret key guards destructive actions on money and files. Fat fingers can’t erase a job.' },
      { icon: Smartphone, title: 'Any device', body: 'Phone, tablet, or PC. Nothing to install, nothing to sync, always the same job.' },
    ],
  },
  {
    id: 'master',
    eyebrow: 'Master views',
    title: 'The boss’s-eye view',
    lead: 'When you run more than one job, the question isn’t how one project is doing. It’s how all of them are doing, together, this week.',
    features: [
      { icon: LayoutDashboard, title: 'Company dashboard', body: 'Active jobs, contract value, open tasks, and what’s due this week, on one screen every morning.' },
      { icon: CalendarDays, title: 'Master calendar', body: 'Every milestone, inspection, and delivery across every job, in one calendar the whole office shares.' },
      { icon: DollarSign, title: 'Master money', body: 'Cash in versus out across the company, escrow balances by job, and invoices outstanding, without opening a spreadsheet.' },
    ],
    visual: <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>,
  },
]

const NAV_ITEMS = SECTIONS.map(s => ({ id: s.id, label: s.eyebrow }))

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
        <Eyebrow className="justify-center">Features</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink max-w-4xl mx-auto leading-[1.04]">
          Everything it takes to run the job. Nothing you have to duct-tape on.
        </h1>
        <p className="mt-6 text-lg text-muted-fg max-w-2xl mx-auto leading-relaxed">
          Six product areas that share one source of truth: the AI that reads your documents, the money, the field, compliance, your team, and the views that tie every job together.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
            Start free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/homepage/ai" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
            See the AI
          </Link>
        </div>
        </div>
      </section>

      {/* Body with sticky side nav */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-12 pb-8">
        <SideNav items={NAV_ITEMS} />

        <div className="flex-1 min-w-0">
          {SECTIONS.map((s, idx) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className={`scroll-mt-28 py-16 sm:py-20 ${idx > 0 ? 'border-t border-line' : ''}`}
            >
              <Reveal>
                <Eyebrow>{s.eyebrow}</Eyebrow>
                <h2 id={`${s.id}-title`} className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink leading-[1.08]">{s.title}</h2>
                <p className="mt-4 text-lg text-muted-fg leading-relaxed max-w-2xl">{s.lead}</p>
              </Reveal>

              {s.visual && (
                <Reveal delay={120}>
                  <div className="mt-10">{s.visual}</div>
                </Reveal>
              )}

              <div className="mt-10 grid sm:grid-cols-2 gap-x-10 gap-y-9">
                {s.features.map((f, i) => (
                  <Reveal key={f.title} delay={i * 60}>
                    <div className="flex items-start gap-4">
                      <span className="h-10 w-10 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                        <f.icon className="h-5 w-5 text-accent-fg" />
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-ink">{f.title}</h3>
                        <p className="mt-1.5 text-sm text-muted-fg leading-relaxed">{f.body}</p>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <CtaBand title="See it with your own jobs" body="Start free, upload one quote, and watch the job build itself." />
    </>
  )
}
