import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  ArrowRight, Search, Map, ScanLine, Scale, FileCheck2, Wallet, Landmark,
  CalendarDays, ClipboardList, Camera, Clock, MessageSquare, ShieldCheck,
  ScrollText, ClipboardCheck, LayoutDashboard, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { ProjectsMock } from '@/components/marketing/projects-mock'
import { QuoteScanMock } from '@/components/marketing/quote-scan-mock'
import { CompareMock } from '@/components/marketing/compare-mock'
import { ScheduleMock } from '@/components/marketing/schedule-mock'
import { MoneyMock } from '@/components/marketing/money-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { PhoneMock, LogScreen, ClockScreen, ScanScreen } from '@/components/marketing/phone-mock'
import { SideNav } from '@/components/marketing/side-nav'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'How it works · A construction project, start to finish · SyteNav',
  description:
    'Walk a real construction job from the first lead to the final invoice, and see exactly where SyteNav takes over: finding the project, scanning the quote, awarding the bid, budgeting, scheduling, the field, the money, compliance, and reporting.',
  path: '/homepage/workflow',
})

const NAV_ITEMS = [
  { id: 'find', label: '1. Find the job' },
  { id: 'quote', label: '2. Quote & bid' },
  { id: 'award', label: '3. Award & budget' },
  { id: 'schedule', label: '4. Schedule the work' },
  { id: 'field', label: '5. Run the field' },
  { id: 'money', label: '6. Get paid' },
  { id: 'compliance', label: '7. Stay compliant' },
  { id: 'report', label: '8. Close it out' },
]

type Step = {
  id: string
  step: string
  eyebrow: string
  title: string
  lead: string
  details: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[]
  visual: ReactNode
  reverse?: boolean
}

const STEPS: Step[] = [
  {
    id: 'find',
    step: 'Step 1',
    eyebrow: 'Before the first nail',
    title: 'Every job you have — and every job you\'re chasing — in one place',
    lead: 'A GC juggles a dozen live jobs and a handful of leads at once. Before SyteNav even touches a budget or a schedule, it\'s the place you go to answer "where are we, on everything." Type a name to jump straight to a job, or switch to the map to see what\'s active across town.',
    details: [
      { icon: Search, title: 'Search by name, address, or client', body: 'Every job is one search away — no more digging through folders or old text threads to find the right address.' },
      { icon: Map, title: 'Or drop into the map view', body: 'Toggle to a map to see every active job pinned by location — handy when you\'re deciding which site to swing by next.' },
      { icon: ClipboardList, title: 'Status, progress, and value at a glance', body: 'Each card shows percent complete, contract value, and what\'s due next, so a five-second glance tells you what needs attention.' },
    ],
    visual: (
      <BrowserMock url="app.sytenav.com/projects">
        <div className="relative">
          <div className="absolute right-4 top-2.5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-panel p-0.5 text-[10px] font-semibold shadow-sm">
            <span className="rounded-full bg-ink text-surface px-2.5 py-1 inline-flex items-center gap-1"><Search className="h-3 w-3" /> List</span>
            <span className="rounded-full px-2.5 py-1 text-muted-fg inline-flex items-center gap-1"><Map className="h-3 w-3" /> Map</span>
          </div>
          <div className="h-[420px]"><ProjectsMock /></div>
        </div>
      </BrowserMock>
    ),
  },
  {
    id: 'quote',
    step: 'Step 2',
    eyebrow: 'Winning the work',
    title: 'The quote reads itself, and the bids compare themselves',
    lead: 'A new job usually starts as a pile of PDFs: your own estimate, or a handful of competing sub bids. Instead of retyping line items into a spreadsheet, upload the document and let the AI structure it — sections, quantities, unit rates, totals, and the payment schedule.',
    details: [
      { icon: ScanLine, title: 'AI quote scanning', body: 'Drop in a PDF or a phone photo of a quote. SyteNav extracts every line item and proposes a payment schedule you can adjust before anything saves.' },
      { icon: Scale, title: 'Side-by-side bid comparison', body: 'Comparing three subs for the same scope? Line them up and see totals, coverage, and exactly what each one leaves out.' },
      { icon: FileCheck2, title: 'You always review first', body: 'Nothing the AI reads gets written to the job until you\'ve confirmed it — it\'s a first draft, not an autopilot.' },
    ],
    visual: (
      <div className="space-y-6">
        <QuoteScanMock />
        <CompareMock />
      </div>
    ),
    reverse: true,
  },
  {
    id: 'award',
    step: 'Step 3',
    eyebrow: 'Making it official',
    title: 'Award the bid, and the budget builds itself',
    lead: 'Pick a winning quote and SyteNav turns it into a live project: a budget line for every scanned item, a subcontract for the awarded company, and a payment schedule already staged. No re-entry, no second spreadsheet.',
    details: [
      { icon: Wallet, title: 'Budgeted vs. committed vs. actual', body: 'Every line starts from the quote\'s numbers, then tracks what you\'ve promised in contracts against what\'s actually been billed.' },
      { icon: CheckCircle2, title: 'Link to an existing line, or create one', body: 'Awarding a quote — or logging a material receipt later — can attach to a budget line that already exists, or spin up a new one on the spot.' },
      { icon: TrendingUp, title: 'Interior vs. exterior cost breakdown', body: 'Tag lines interior or exterior and see cost-per-square-foot next to your grand total, if you track square footage on the job.' },
    ],
    visual: (
      <BrowserMock url="app.sytenav.com/projects/budget">
        <DashboardMock />
      </BrowserMock>
    ),
  },
  {
    id: 'schedule',
    step: 'Step 4',
    eyebrow: 'Putting it on the calendar',
    title: 'Every trade, every job, one week view',
    lead: 'With a budget and a subcontract in place, the schedule follows. See a sub\'s whole week across every job they\'re on, catch crew overlaps before they become a Thursday-morning surprise, and keep the office and the field looking at the same dates.',
    details: [
      { icon: CalendarDays, title: 'One calendar across every project', body: 'A subcontractor\'s week spans multiple GCs\' jobs — see all of it in one view instead of five separate calendars.' },
      { icon: ShieldCheck, title: 'Crew-overlap warnings', body: 'If the same crew is booked on two jobs the same day, SyteNav flags it before it turns into a missed rough-in.' },
      { icon: ClipboardList, title: 'Tasks tied to the plan', body: 'Punch a task from a plan pin or a daily log, and it lands on the schedule automatically, no separate to-do list.' },
    ],
    visual: <ScheduleMock />,
    reverse: true,
  },
  {
    id: 'field',
    step: 'Step 5',
    eyebrow: 'Where the work actually happens',
    title: 'The crew runs it from their pocket',
    lead: 'None of this matters if the field won\'t use it. Daily logs, photos, time clock, and material receipts all happen from a phone, on site, in the minute the work happens — not retyped from memory back at the office that night.',
    details: [
      { icon: Camera, title: 'Daily logs with photos', body: 'Weather, crew count, work performed, and photos filed straight to the project — searchable months later, not lost in a camera roll.' },
      { icon: Clock, title: 'GPS-checked time clock', body: 'Clock in and out from the job site with a selfie and location check, so payroll hours match where the crew actually was.' },
      { icon: MessageSquare, title: 'RFIs and tasks from the field', body: 'A question or a change doesn\'t wait for a call back to the office — it\'s logged against the job the moment it comes up.' },
    ],
    visual: (
      <div className="flex flex-wrap items-end justify-center gap-6">
        <PhoneMock className="scale-90 origin-bottom"><LogScreen /></PhoneMock>
        <PhoneMock><ClockScreen /></PhoneMock>
        <PhoneMock className="scale-90 origin-bottom hidden sm:block"><ScanScreen /></PhoneMock>
      </div>
    ),
  },
  {
    id: 'money',
    step: 'Step 6',
    eyebrow: 'The part everyone actually cares about',
    title: 'Invoices generated from real progress, money tracked to the dollar',
    lead: 'As field progress rolls in, invoices generate from it instead of getting retyped from a spreadsheet at month end. Client payments, your fee, escrow held, and what\'s still owed to vendors all stay visible, per project, in real time.',
    details: [
      { icon: Landmark, title: 'Client payments & escrow', body: 'See what the client has paid in, what\'s sitting in escrow, and what\'s already gone out to vendors — no separate ledger to reconcile.' },
      { icon: FileCheck2, title: 'Invoices tied to progress', body: 'Approving an invoice — not just paying it — is what moves the Actual column, so the budget reflects reality the moment costs are accepted.' },
      { icon: Wallet, title: 'Material receipts, tracked to the job', body: 'Snap a receipt, mark whether the customer already paid for it, and it rolls straight into what they owe versus what\'s been covered.' },
    ],
    visual: <MoneyMock />,
    reverse: true,
  },
  {
    id: 'compliance',
    step: 'Step 7',
    eyebrow: 'The paperwork nobody enjoys',
    title: 'Permits, inspections, and insurance — tracked, not forgotten',
    lead: 'A lapsed COI or a missed inspection date is the kind of thing that only gets noticed when it\'s already a problem. SyteNav keeps every permit, inspection, and subcontractor compliance document attached to the job it belongs to, with expirations flagged before they lapse.',
    details: [
      { icon: ScrollText, title: 'Permits & inspections', body: 'Track permit numbers, inspection dates, and pass/fail status against the schedule, in the same place as everything else.' },
      { icon: ShieldCheck, title: 'Subcontractor compliance', body: 'Certificates of insurance and licenses live on the sub\'s record, with expiring documents surfaced automatically.' },
      { icon: ClipboardCheck, title: 'Submittals in the loop', body: 'Route submittals for approval and keep the paper trail with the project — useful the day someone asks "did we ever approve that?"' },
    ],
    visual: (
      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto lg:mx-0">
        {[
          ['Permit #PB-22140', 'Approved', 'text-success bg-success-tint'],
          ['GL insurance · Apex Electric', 'Expires in 12 days', 'text-warn bg-warn-tint'],
          ['Framing inspection', 'Passed', 'text-success bg-success-tint'],
          ['Submittal #14 · Windows', 'In review', 'text-info bg-info-tint'],
        ].map(([label, status, tone]) => (
          <div key={label} className="rounded-xl border border-line bg-panel p-3.5 text-left">
            <p className="text-xs font-semibold text-ink leading-tight">{label}</p>
            <span className={`mt-2 inline-block text-[10px] font-semibold rounded-full px-2 py-0.5 ${tone}`}>{status}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'report',
    step: 'Step 8',
    eyebrow: 'The last mile',
    title: 'One dashboard that answers "how did we do"',
    lead: 'When the punch list clears and the final invoice goes out, the same data that ran the job now tells the story of it — margin, schedule performance, and every dollar in and out — rolled up across one project or your whole book of work.',
    details: [
      { icon: LayoutDashboard, title: 'Master views across every job', body: 'Roll every active project up into one dashboard: contract value, progress, and what needs attention, company-wide.' },
      { icon: TrendingUp, title: 'Real margin, not a guess', body: 'Budgeted, committed, and actual costs were tracked from day one, so final margin is a number you already have, not one you have to reconstruct.' },
      { icon: CheckCircle2, title: 'A record, if it\'s ever needed', body: 'Every log, photo, approval, and payment stays attached to the job — a time-stamped record if a dispute ever lands.' },
    ],
    visual: (
      <BrowserMock url="app.sytenav.com/master-money">
        <DashboardMock />
      </BrowserMock>
    ),
    reverse: true,
  },
]

export default function WorkflowPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
          <Eyebrow className="justify-center">How it works</Eyebrow>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
            One job, start to finish, and where SyteNav shows up at every step
          </h1>
          <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
            Forget the feature list for a minute. Here&apos;s what actually happens on a real project — from finding it, to quoting it, to running the field, to getting paid — and exactly where the software takes the busywork off your plate.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/homepage/features" className="inline-flex items-center gap-2 rounded-xl border border-line text-ink-soft font-semibold px-6 py-3 hover:bg-panel transition-colors">
              See the full feature list
            </Link>
          </div>
        </div>
      </section>

      {/* Body with sticky side nav */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex gap-12 pb-8">
        <SideNav items={NAV_ITEMS} />

        <div className="flex-1 min-w-0">
          {STEPS.map((s, idx) => (
            <section
              key={s.id}
              id={s.id}
              aria-labelledby={`${s.id}-title`}
              className={`scroll-mt-28 py-16 sm:py-20 ${idx > 0 ? 'border-t border-line' : ''}`}
            >
              <div className={`grid lg:grid-cols-2 gap-10 lg:gap-14 items-center ${s.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <Reveal>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{s.step}</p>
                  <Eyebrow>{s.eyebrow}</Eyebrow>
                  <h2 id={`${s.id}-title`} className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.1]">{s.title}</h2>
                  <p className="mt-4 text-base sm:text-lg text-muted-fg leading-relaxed">{s.lead}</p>

                  <div className="mt-8 space-y-5">
                    {s.details.map(d => (
                      <div key={d.title} className="flex items-start gap-3.5">
                        <span className="h-9 w-9 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                          <d.icon className="h-[18px] w-[18px] text-accent-fg" />
                        </span>
                        <div>
                          <h3 className="text-sm font-bold text-ink">{d.title}</h3>
                          <p className="mt-1 text-sm text-muted-fg leading-relaxed">{d.body}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Reveal>

                <Reveal delay={140}>
                  <div>{s.visual}</div>
                </Reveal>
              </div>
            </section>
          ))}
        </div>
      </div>

      <CtaBand title="Run your next job this way" body="Upload one quote and watch the budget, schedule, and paperwork build themselves." />
    </>
  )
}
