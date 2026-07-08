import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  ArrowRight, Search, Map, ScanLine, Scale, FileCheck2, Wallet, Landmark,
  CalendarDays, ClipboardList, Camera, Clock, MessageSquare, ShieldCheck,
  ScrollText, ClipboardCheck, LayoutDashboard, TrendingUp, CheckCircle2, MousePointerClick,
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

// A compact budget "screenshot" for the award step. Wide-format, meant to sit
// inside a full-width BrowserMock.
function BudgetMock() {
  const rows = [
    ['Electrical', 'Panel upgrade & rough-in', 'Interior', '$12,850', '$12,850', '$4,200'],
    ['Plumbing', 'Rough-in, 2.5 baths', 'Interior', '$18,400', '$18,400', '$9,100'],
    ['Roofing', 'Tear-off & architectural shingle', 'Exterior', '$21,300', '$21,300', '$21,300'],
    ['Concrete', 'Driveway & walkway flatwork', 'Exterior', '$9,750', '$0', '$0'],
    ['Drywall', 'Hang, tape, level 4 finish', 'Interior', '$14,200', '$13,900', '$0'],
  ] as const
  const spaceTone: Record<string, string> = { Interior: 'bg-info-tint text-info', Exterior: 'bg-warn-tint text-warn' }
  return (
    <div className="bg-surface text-left">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-panel">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-accent-fg" />
          <span className="text-sm font-bold text-ink">Budget · Linden Ave Remodel</span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-semibold">
          <span className="rounded-full bg-info-tint text-info px-2.5 py-1">Interior $45,450</span>
          <span className="rounded-full bg-warn-tint text-warn px-2.5 py-1">Exterior $31,050</span>
          <span className="rounded-full bg-muted text-muted-fg px-2.5 py-1">Total $76,500</span>
        </div>
      </div>
      <div className="hidden md:grid grid-cols-[7rem_1fr_5.5rem_repeat(3,6rem)] gap-2 px-5 py-2 border-b border-line-soft text-[10px] font-semibold text-faint uppercase tracking-wide">
        <span>Category</span><span>Line item</span><span>Space</span>
        <span className="text-right">Budgeted</span><span className="text-right">Committed</span><span className="text-right">Actual</span>
      </div>
      <div className="divide-y divide-line-soft">
        {rows.map(r => (
          <div key={r[1]} className="grid grid-cols-2 md:grid-cols-[7rem_1fr_5.5rem_repeat(3,6rem)] gap-2 px-5 py-2.5 text-xs items-center">
            <span className="text-faint">{r[0]}</span>
            <span className="font-medium text-ink-soft truncate">{r[1]}</span>
            <span><span className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 ${spaceTone[r[2]]}`}>{r[2]}</span></span>
            <span className="text-right text-ink-soft hidden md:block">{r[3]}</span>
            <span className="text-right text-muted-fg hidden md:block">{r[4]}</span>
            <span className="text-right text-muted-fg hidden md:block">{r[5]}</span>
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 border-t border-line bg-panel flex items-center justify-between text-[11px]">
        <span className="text-faint">5 lines · linked to 3 subcontracts</span>
        <span className="font-semibold text-success">On budget</span>
      </div>
    </div>
  )
}

type Step = {
  id: string
  step: string
  eyebrow: string
  title: string
  lead: string
  /** The italic "old way": which apps and files a person hops between today. */
  without: string
  /** The SyteNav answer, framed in clicks. */
  withApp: string
  details: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }[]
  visual: ReactNode
  /** Wide app screenshots span the full row; cards and phones sit beside the text. */
  wide?: boolean
  reverse?: boolean
}

const STEPS: Step[] = [
  {
    id: 'find',
    step: 'Step 1',
    eyebrow: 'Before the first nail',
    title: 'Find the job in two clicks, not two apps',
    lead: 'A GC runs a dozen live jobs and a handful of leads at the same time. The first problem of every morning is simply finding the right one and seeing where it stands.',
    without: 'Without SyteNav: you open a job-list spreadsheet to remember what\'s active, scroll a text thread for the address, then open a maps app to figure out which site to visit first. Three windows before your first coffee.',
    withApp: 'In SyteNav: click Projects, type three letters of the name, and you\'re on the job. Or flip the same screen to a map and see every active site pinned across town. Two clicks either way.',
    details: [
      { icon: Search, title: 'Search by name, address, or client', body: 'Every job is one search away. No digging through folders or old text threads to find the right address.' },
      { icon: Map, title: 'Or drop into the map view', body: 'Toggle to a map and see every active job pinned by location. Handy when you\'re deciding which site to swing by next.' },
      { icon: ClipboardList, title: 'Status, progress, and value at a glance', body: 'Each card shows percent complete, contract value, and what\'s due next, so a five-second glance tells you what needs attention.' },
    ],
    wide: true,
    visual: (
      <BrowserMock url="app.sytenav.com/projects">
        <div className="relative">
          <div className="absolute right-4 top-2.5 z-10 flex items-center gap-0.5 rounded-full border border-line bg-panel p-0.5 text-[10px] font-semibold shadow-sm">
            <span className="rounded-full bg-ink text-surface px-2.5 py-1 inline-flex items-center gap-1"><Search className="h-3 w-3" /> List</span>
            <span className="rounded-full px-2.5 py-1 text-muted-fg inline-flex items-center gap-1"><Map className="h-3 w-3" /> Map</span>
          </div>
          <div className="h-[440px]"><ProjectsMock /></div>
        </div>
      </BrowserMock>
    ),
  },
  {
    id: 'quote',
    step: 'Step 2',
    eyebrow: 'Winning the work',
    title: 'Stop retyping quotes. Upload them.',
    lead: 'A new job starts as a pile of PDFs: your own estimate, or three competing sub bids that all describe the same scope differently. Getting them into numbers you can compare is an evening of data entry.',
    without: 'Without SyteNav: you open each PDF, retype line items into an estimating spreadsheet, build a second bid-leveling sheet to compare subs, and hope you didn\'t fat-finger a quantity somewhere in row 40.',
    withApp: 'In SyteNav: upload the PDF, or even a phone photo of it. The AI reads sections, line items, quantities, rates, and the payment schedule. Drop in the competing bids and the comparison builds itself. You review, click confirm, done.',
    details: [
      { icon: ScanLine, title: 'AI quote scanning', body: 'Drop in a PDF or a phone photo of a quote. SyteNav extracts every line item and proposes a payment schedule you can adjust before anything saves.' },
      { icon: Scale, title: 'Side-by-side bid comparison', body: 'Comparing three subs for the same scope? Line them up and see totals, coverage, and exactly what each one leaves out.' },
      { icon: FileCheck2, title: 'You always review first', body: 'Nothing the AI reads gets written to the job until you\'ve confirmed it. It\'s a first draft, not an autopilot.' },
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
    title: 'Award the bid. The budget builds itself.',
    lead: 'The moment a bid is accepted, someone has to turn it into a budget, a contract, and a payment plan. That handoff is where numbers usually get retyped for the third time, and where the first errors creep in.',
    without: 'Without SyteNav: you copy the winning quote into a budget spreadsheet line by line, draft a subcontract in a documents app, and set payment reminders in your calendar. Three tools, one afternoon, zero connection between them.',
    withApp: 'In SyteNav: click Award on the winning quote. Every scanned line item becomes a budget line, the subcontract is created for that company, and the payment schedule is already staged. One click, and the job is live.',
    details: [
      { icon: Wallet, title: 'Budgeted vs. committed vs. actual', body: 'Every line starts from the quote\'s numbers, then tracks what you\'ve promised in contracts against what\'s actually been billed.' },
      { icon: CheckCircle2, title: 'Link to an existing line, or create one', body: 'Awarding a quote, or logging a material receipt later, can attach to a budget line that already exists or spin up a new one on the spot.' },
      { icon: TrendingUp, title: 'Interior vs. exterior cost breakdown', body: 'Tag lines interior or exterior and see cost per square foot next to your grand total, if you track square footage on the job.' },
    ],
    wide: true,
    visual: (
      <BrowserMock url="app.sytenav.com/projects/linden-ave/budget">
        <BudgetMock />
      </BrowserMock>
    ),
  },
  {
    id: 'schedule',
    step: 'Step 4',
    eyebrow: 'Putting it on the calendar',
    title: 'One calendar that knows about every job',
    lead: 'Scheduling trades is a puzzle where the pieces live in different boxes. The framer\'s dates are in one thread, the electrician\'s in another, and the conflict between them is invisible until both crews show up Thursday.',
    without: 'Without SyteNav: you keep a scheduling app for your own jobs, a shared calendar for the office, and a text thread per sub. Nobody sees the whole week, so double-bookings surface on site, not on screen.',
    withApp: 'In SyteNav: open Schedule and the whole week is there, every trade, every job, one view. Book a crew that\'s already committed elsewhere and the overlap gets flagged before you save, not Thursday morning.',
    details: [
      { icon: CalendarDays, title: 'One calendar across every project', body: 'A subcontractor\'s week spans multiple GCs\' jobs. See all of it in one view instead of five separate calendars.' },
      { icon: ShieldCheck, title: 'Crew-overlap warnings', body: 'If the same crew is booked on two jobs the same day, SyteNav flags it before it turns into a missed rough-in.' },
      { icon: ClipboardList, title: 'Tasks tied to the plan', body: 'Punch a task from a plan pin or a daily log and it lands on the schedule automatically. No separate to-do list.' },
    ],
    visual: <ScheduleMock />,
    reverse: true,
  },
  {
    id: 'field',
    step: 'Step 5',
    eyebrow: 'Where the work actually happens',
    title: 'The crew runs it from their pocket',
    lead: 'None of this matters if the field won\'t use it. The real record of a job is created on site, in the minute the work happens, or it isn\'t created at all.',
    without: 'Without SyteNav: photos pile up in someone\'s camera roll, hours go on a paper timesheet or a time-tracking app the office re-enters later, and the daily log gets written from memory at 9pm, if it gets written.',
    withApp: 'In SyteNav: the crew opens the app on their phone. Two taps to clock in with a GPS and selfie check. Two taps to file a photo to the right job. The daily log takes a minute on site, and it\'s filed forever.',
    details: [
      { icon: Camera, title: 'Daily logs with photos', body: 'Weather, crew count, work performed, and photos filed straight to the project. Searchable months later, not lost in a camera roll.' },
      { icon: Clock, title: 'GPS-checked time clock', body: 'Clock in and out from the job site with a selfie and location check, so payroll hours match where the crew actually was.' },
      { icon: MessageSquare, title: 'RFIs and tasks from the field', body: 'A question or a change doesn\'t wait for a call back to the office. It\'s logged against the job the moment it comes up.' },
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
    title: 'Invoices from real progress, money tracked to the dollar',
    lead: 'Month end is where the tool-hopping gets expensive. Progress lives in one place, invoices in another, and the escrow math lives in your head. Reconciling them is a Sunday.',
    without: 'Without SyteNav: you read progress off the schedule, retype it into an invoicing app, log the client\'s payment in an accounting app, and keep a separate spreadsheet for what\'s in escrow versus what vendors are owed.',
    withApp: 'In SyteNav: click Invoice on the stage that just finished. It\'s generated from the actual line-item progress. Approving it moves the budget\'s Actual column, and the escrow, fee, and vendor balances update themselves.',
    details: [
      { icon: Landmark, title: 'Client payments & escrow', body: 'See what the client has paid in, what\'s sitting in escrow, and what\'s already gone out to vendors. No separate ledger to reconcile.' },
      { icon: FileCheck2, title: 'Invoices tied to progress', body: 'Approving an invoice, not just paying it, is what moves the Actual column, so the budget reflects reality the moment costs are accepted.' },
      { icon: Wallet, title: 'Material receipts, tracked to the job', body: 'Snap a receipt, mark whether the customer already paid for it, and it rolls straight into what they owe versus what\'s been covered.' },
    ],
    visual: <MoneyMock />,
    reverse: true,
  },
  {
    id: 'compliance',
    step: 'Step 7',
    eyebrow: 'The paperwork nobody enjoys',
    title: 'Permits, inspections, and insurance that flag themselves',
    lead: 'A lapsed certificate of insurance or a missed inspection window only gets noticed when it\'s already a problem, usually an expensive one.',
    without: 'Without SyteNav: permits live in a binder or a file share, COIs sit in an email folder, and inspection dates are on whoever\'s calendar booked them. Expirations are discovered, not tracked.',
    withApp: 'In SyteNav: every permit, inspection, and sub\'s insurance document is attached to the job it belongs to. Anything expiring gets surfaced ahead of time, and requesting an updated COI from a sub is one click.',
    details: [
      { icon: ScrollText, title: 'Permits & inspections', body: 'Track permit numbers, inspection dates, and pass or fail status against the schedule, in the same place as everything else.' },
      { icon: ShieldCheck, title: 'Subcontractor compliance', body: 'Certificates of insurance and licenses live on the sub\'s record, with expiring documents surfaced automatically.' },
      { icon: ClipboardCheck, title: 'Submittals in the loop', body: 'Route submittals for approval and keep the paper trail with the project. Useful the day someone asks "did we ever approve that?"' },
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
    lead: 'When the punch list clears and the final invoice goes out, someone asks what the job actually made. If the data lived in five tools, that answer takes a week to assemble.',
    without: 'Without SyteNav: you export the accounting app, cross-reference the invoicing app, dig the change orders out of email, and rebuild the job\'s story in a spreadsheet one more time, after the fact.',
    withApp: 'In SyteNav: the same data that ran the job already tells the story of it. Open the dashboard and the margin, the schedule performance, and every dollar in and out are just there, for one job or the whole company.',
    details: [
      { icon: LayoutDashboard, title: 'Master views across every job', body: 'Roll every active project up into one dashboard: contract value, progress, and what needs attention, company-wide.' },
      { icon: TrendingUp, title: 'Real margin, not a guess', body: 'Budgeted, committed, and actual costs were tracked from day one, so final margin is a number you already have, not one you have to reconstruct.' },
      { icon: CheckCircle2, title: 'A record, if it\'s ever needed', body: 'Every log, photo, approval, and payment stays attached to the job. A time-stamped record if a dispute ever lands.' },
    ],
    wide: true,
    visual: (
      <BrowserMock url="app.sytenav.com/dashboard">
        <DashboardMock />
      </BrowserMock>
    ),
  },
]

// The italic "old way" vs. the two-click answer, shown on every step.
function OldWayNewWay({ without, withApp }: { without: string; withApp: string }) {
  return (
    <div className="mt-6 space-y-3">
      <div className="rounded-xl border border-line bg-surface px-4 py-3.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-1.5">The old way</p>
        <p className="text-sm text-muted-fg leading-relaxed italic">{without}</p>
      </div>
      <div className="rounded-xl border border-accent/40 bg-accent-tint/40 px-4 py-3.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-fg mb-1.5 flex items-center gap-1.5">
          <MousePointerClick className="h-3 w-3" /> In SyteNav
        </p>
        <p className="text-sm text-ink-soft leading-relaxed">{withApp}</p>
      </div>
    </div>
  )
}

function StepDetails({ details, cols3 = false }: { details: Step['details']; cols3?: boolean }) {
  return (
    <div className={`mt-10 grid gap-x-8 gap-y-7 ${cols3 ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
      {details.map((d, i) => (
        <Reveal key={d.title} delay={i * 70}>
          <div className="flex items-start gap-3.5">
            <span className="h-9 w-9 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
              <d.icon className="h-[18px] w-[18px] text-accent-fg" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-ink">{d.title}</h3>
              <p className="mt-1 text-sm text-muted-fg leading-relaxed">{d.body}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

export default function WorkflowPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
          <Eyebrow className="justify-center">How it works</Eyebrow>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
            One job, start to finish. Same tab the whole way.
          </h1>
          <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
            Here&apos;s what actually happens on a real project, step by step. At each one: the problem, the app-hopping it usually causes, and the two clicks that replace it.
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
              {s.wide ? (
                /* Wide app screenshots: narrative on top, full-width visual below. */
                <>
                  <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
                    <Reveal>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{s.step}</p>
                      <Eyebrow>{s.eyebrow}</Eyebrow>
                      <h2 id={`${s.id}-title`} className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.1]">{s.title}</h2>
                      <p className="mt-4 text-base sm:text-lg text-muted-fg leading-relaxed">{s.lead}</p>
                    </Reveal>
                    <Reveal delay={100}>
                      <OldWayNewWay without={s.without} withApp={s.withApp} />
                    </Reveal>
                  </div>
                  <Reveal delay={140}>
                    <div className="mt-10">{s.visual}</div>
                  </Reveal>
                  <StepDetails details={s.details} cols3 />
                </>
              ) : (
                /* Card and phone mocks: classic alternating two-column layout. */
                <div className={`grid lg:grid-cols-2 gap-10 lg:gap-14 items-center ${s.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                  <Reveal>
                    <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{s.step}</p>
                    <Eyebrow>{s.eyebrow}</Eyebrow>
                    <h2 id={`${s.id}-title`} className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.1]">{s.title}</h2>
                    <p className="mt-4 text-base sm:text-lg text-muted-fg leading-relaxed">{s.lead}</p>
                    <OldWayNewWay without={s.without} withApp={s.withApp} />
                    <StepDetails details={s.details} />
                  </Reveal>
                  <Reveal delay={140}>
                    <div>{s.visual}</div>
                  </Reveal>
                </div>
              )}
            </section>
          ))}
        </div>
      </div>

      <CtaBand title="Run your next job this way" body="Upload one quote and watch the budget, schedule, and paperwork build themselves." />
    </>
  )
}
