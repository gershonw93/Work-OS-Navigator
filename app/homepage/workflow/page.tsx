import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  ArrowRight, Search, Map, ScanLine, Scale, FileCheck2, Wallet, Landmark,
  CalendarDays, ClipboardList, Camera, Clock, MessageSquare, ShieldCheck,
  ScrollText, ClipboardCheck, LayoutDashboard, TrendingUp, CheckCircle2,
  MousePointerClick, Zap,
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
import { PhoneFan } from '@/components/marketing/phone-fan'
import { SideNav } from '@/components/marketing/side-nav'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'How it works · A construction project, start to finish · SyteNav',
  description:
    'Walk your job from the first lead to the final invoice and see exactly where SyteNav takes over: you do one thing, and the budget, notifications, schedule, and paperwork update themselves for the office, the field, and your subs.',
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

// Who a given automatic effect touches. Rendered as a small chip per line so
// the reader sees the office, the field, and the subs pulled in without anyone
// forwarding anything.
type Role = 'You' | 'Office' | 'Field crew' | 'Site manager' | 'Sub' | 'Client'
const ROLE_TONE: Record<Role, string> = {
  You: 'bg-accent-tint text-accent-fg',
  Office: 'bg-info-tint text-info',
  'Field crew': 'bg-success-tint text-success',
  'Site manager': 'bg-warn-tint text-warn',
  Sub: 'bg-muted text-muted-fg',
  Client: 'bg-muted text-muted-fg',
}

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

type AutoEffect = { text: string; who: Role[] }

type Step = {
  id: string
  step: string
  eyebrow: string
  title: string
  lead: string
  /** The italic "old way": which apps and files you hop between today. */
  without: string
  /** The one thing you actually do in SyteNav. */
  youDo: string
  /** What fires automatically after it, in order, with who it touches. */
  auto: AutoEffect[]
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
    title: 'Find your job in two clicks, not two apps',
    lead: 'You\'re running a dozen live jobs and chasing a handful more. The first problem of your morning is simply finding the right one and seeing where it stands before the phone starts ringing.',
    without: 'The old way: you open a job-list spreadsheet to remember what\'s active, scroll a text thread for the address, then open a maps app to figure out which site to visit first. Three windows before your first coffee.',
    youDo: 'You click Projects and type three letters, or flip to the map view.',
    auto: [
      { text: 'Every job card shows live progress, contract value, and what\'s due next, pulled from the real budget and schedule', who: ['You'] },
      { text: 'Your site managers see only the jobs they\'re assigned to, already filtered', who: ['Site manager'] },
      { text: 'The office sees the same list you do, so "which address is that job again" stops being a phone call', who: ['Office'] },
    ],
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
    title: 'Whip out your phone. Take the picture. Move on.',
    lead: 'Your new job starts as a pile of PDFs: your own estimate, or three sub bids that all describe the same scope differently. Getting them into numbers you can compare used to be your evening.',
    without: 'The old way: you open each PDF, retype line items into an estimating spreadsheet, build a second bid-leveling sheet to compare subs, and hope you didn\'t fat-finger a quantity in row 40.',
    youDo: 'You snap a photo of the quote, or upload the PDF. That\'s it.',
    auto: [
      { text: 'AI reads sections, line items, quantities, unit rates, totals, and the payment schedule', who: ['You'] },
      { text: 'Competing bids line up side by side, with gaps flagged: who skipped permit fees, who excluded the panel upgrade', who: ['You', 'Office'] },
      { text: 'A draft job is staged and waiting for your review. Nothing saves until you confirm it', who: ['You'] },
    ],
    details: [
      { icon: ScanLine, title: 'AI quote scanning', body: 'A PDF or a phone photo, either works. SyteNav extracts every line item and proposes a payment schedule you can adjust before anything saves.' },
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
    title: 'You click Award. The whole job assembles itself.',
    lead: 'The moment you accept a bid, someone has to turn it into a budget, a contract, and a payment plan. That handoff is where your numbers used to get retyped for the third time, and where the first errors crept in.',
    without: 'The old way: you copy the winning quote into a budget spreadsheet line by line, draft a subcontract in a documents app, set payment reminders in your calendar, and email the sub the good news yourself.',
    youDo: 'You click Award on the winning quote. One click.',
    auto: [
      { text: 'Every scanned line item becomes a budget line, or links to one that already exists', who: ['You'] },
      { text: 'A subcontract is created for the awarded company with the contract amount committed', who: ['Sub'] },
      { text: 'The payment schedule is staged from the quote\'s terms: deposit, rough-in, inspection, final', who: ['Office', 'Client'] },
      { text: 'Your office sees the committed cost hit the budget instantly, no re-entry', who: ['Office'] },
      { text: 'The losing bids stay on file, so next job you know who bid what', who: ['You'] },
    ],
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
    title: 'One calendar that already knows your whole week',
    lead: 'Scheduling trades is a puzzle where the pieces live in different boxes. Your framer\'s dates are in one thread, your electrician\'s in another, and the conflict between them is invisible until both crews show up Thursday.',
    without: 'The old way: you keep a scheduling app for your own jobs, a shared calendar for the office, and a text thread per sub. Nobody sees the whole week, so double-bookings surface on site, not on screen.',
    youDo: 'You drag the sub\'s dates onto the schedule.',
    auto: [
      { text: 'The booking is checked against every other job that crew is on. Overlaps get flagged before you save', who: ['You'] },
      { text: 'The sub sees the dates on their own SyteNav calendar, across all the GCs they work for', who: ['Sub'] },
      { text: 'Your site manager\'s week view updates, so Thursday holds no surprises', who: ['Site manager'] },
      { text: 'Tasks punched from plan pins or daily logs land on the same calendar automatically', who: ['Field crew'] },
    ],
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
    title: 'Your crew taps twice. The record writes itself.',
    lead: 'None of this matters if your field crew won\'t use it. The real record of your job is created on site, in the minute the work happens, or it isn\'t created at all.',
    without: 'The old way: photos pile up in someone\'s camera roll, hours go on a paper timesheet the office re-enters later, and the daily log gets written from memory at 9pm. If it gets written.',
    youDo: 'Your crew whips out a phone: clock in with a selfie, snap the pour, file the log. Seconds each.',
    auto: [
      { text: 'The clock-in is GPS-checked against the job site. Off-site punches get flagged for review, not silently accepted', who: ['Office'] },
      { text: 'Photos file to the right project the moment they\'re taken, searchable months later', who: ['You', 'Site manager'] },
      { text: 'The daily log posts to the project feed, so you and the office see today\'s crew, weather, and work without calling anyone', who: ['You', 'Office'] },
      { text: 'A question from the field becomes an RFI on the job, time-stamped, with the photo attached', who: ['Site manager', 'Office'] },
    ],
    details: [
      { icon: Camera, title: 'Daily logs with photos', body: 'Weather, crew count, work performed, and photos filed straight to the project. Searchable months later, not lost in a camera roll.' },
      { icon: Clock, title: 'GPS-checked time clock', body: 'Clock in and out from the job site with a selfie and location check, so payroll hours match where the crew actually was.' },
      { icon: MessageSquare, title: 'RFIs and tasks from the field', body: 'A question or a change doesn\'t wait for a call back to the office. It\'s logged against the job the moment it comes up.' },
    ],
    visual: (
      <PhoneFan
        items={[
          { key: 'log', label: 'Daily log', node: <PhoneMock><LogScreen /></PhoneMock> },
          { key: 'clock', label: 'Time clock', node: <PhoneMock><ClockScreen /></PhoneMock> },
          { key: 'scan', label: 'AI scan', node: <PhoneMock><ScanScreen /></PhoneMock> },
        ]}
      />
    ),
  },
  {
    id: 'money',
    step: 'Step 6',
    eyebrow: 'The part everyone actually cares about',
    title: 'Snap the receipt. The money math is already done.',
    lead: 'Month end is where the tool-hopping gets expensive for you. Progress lives in one place, invoices in another, and the escrow math lives in your head. Reconciling them used to be your Sunday.',
    without: 'The old way: you read progress off the schedule, retype it into an invoicing app, log the client\'s payment in an accounting app, and keep a separate spreadsheet for what\'s in escrow versus what your vendors are owed.',
    youDo: 'You snap the material receipt at the register, and click Invoice when a stage finishes.',
    auto: [
      { text: 'AI reads the receipt: store, amount, tax, line items. You just confirm which job and whether the customer already paid', who: ['You'] },
      { text: 'The cost rolls into the right budget line and into what the client owes, instantly', who: ['Office'] },
      { text: 'The invoice generates from real line-item progress, not from memory', who: ['Office', 'Client'] },
      { text: 'Approving it moves the budget\'s Actual column and updates escrow, fee, and vendor balances in the same second', who: ['You', 'Office'] },
    ],
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
    title: 'Store the inspection once. Everything downstream updates.',
    lead: 'A lapsed certificate of insurance or a missed inspection window only gets noticed when it\'s already your problem, and usually an expensive one.',
    without: 'The old way: permits live in a binder or a file share, COIs sit in an email folder, and inspection dates are on whoever\'s calendar booked them. Expirations are discovered, not tracked.',
    youDo: 'You log the inspection result, or request a COI from your sub. One click each.',
    auto: [
      { text: 'The inspection lands on the project timeline and the schedule, pass or fail', who: ['You', 'Site manager'] },
      { text: 'A pass can trigger the next payment stage that was waiting on it', who: ['Office', 'Client'] },
      { text: 'The sub gets a secure upload link for their COI. No account needed, no email chain', who: ['Sub'] },
      { text: 'Expiring documents surface on your dashboard weeks ahead, not the day the auditor asks', who: ['You', 'Office'] },
    ],
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
    title: 'You ask "how did we do." The answer is already there.',
    lead: 'When the punch list clears and the final invoice goes out, you want to know what the job actually made you. If the data lived in five tools, that answer used to take you a week to assemble.',
    without: 'The old way: you export the accounting app, cross-reference the invoicing app, dig the change orders out of email, and rebuild the job\'s story in a spreadsheet one more time. After the fact.',
    youDo: 'You open the dashboard.',
    auto: [
      { text: 'Margin is already computed: budgeted vs. committed vs. actual were tracked from day one', who: ['You'] },
      { text: 'Every log, photo, approval, and payment is attached to the job, a time-stamped record if a dispute ever lands', who: ['You', 'Office'] },
      { text: 'The finished budget is one click away from becoming the template for your next similar job', who: ['You', 'Office'] },
    ],
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

// The italic "old way" panel.
function OldWay({ without }: { without: string }) {
  return (
    <div className="mt-6 rounded-xl border border-line bg-surface px-4 py-3.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-1.5">The old way</p>
      <p className="text-sm text-muted-fg leading-relaxed italic">{without}</p>
    </div>
  )
}

// "You do one thing" plus the numbered chain of what fires automatically,
// with chips for everyone it touches: office, field, site managers, subs.
function AutoChain({ youDo, auto }: { youDo: string; auto: AutoEffect[] }) {
  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent-tint/40 px-4 py-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-fg mb-2 flex items-center gap-1.5">
        <MousePointerClick className="h-3 w-3" /> You do one thing
      </p>
      <p className="text-sm font-semibold text-ink leading-relaxed">{youDo}</p>

      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-fg mt-4 mb-2.5 flex items-center gap-1.5">
        <Zap className="h-3 w-3" /> Then, on auto
      </p>
      <ol className="space-y-2.5">
        {auto.map((a, i) => (
          <li key={a.text} className="flex items-start gap-2.5">
            <span className="h-5 w-5 rounded-full bg-accent text-accent-ink text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-sm text-ink-soft leading-relaxed">{a.text}</p>
              <span className="mt-1 flex flex-wrap gap-1">
                {a.who.map(w => (
                  <span key={w} className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 ${ROLE_TONE[w]}`}>{w}</span>
                ))}
              </span>
            </div>
          </li>
        ))}
      </ol>
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
            You do one thing. SyteNav does the next five.
          </h1>
          <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
            Here&apos;s your job, start to finish. At every step: the one thing you actually do, then the list of what happens automatically for your office, your field crew, your site managers, and your subs. Nobody forwards anything.
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
                /* Wide app screenshots: narrative + auto chain on top, full-width visual below. */
                <>
                  <div className="grid lg:grid-cols-2 gap-10 lg:gap-14">
                    <Reveal>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{s.step}</p>
                      <Eyebrow>{s.eyebrow}</Eyebrow>
                      <h2 id={`${s.id}-title`} className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.1]">{s.title}</h2>
                      <p className="mt-4 text-base sm:text-lg text-muted-fg leading-relaxed">{s.lead}</p>
                      <OldWay without={s.without} />
                    </Reveal>
                    <Reveal delay={100}>
                      <AutoChain youDo={s.youDo} auto={s.auto} />
                    </Reveal>
                  </div>
                  <Reveal delay={140}>
                    <div className="mt-10">{s.visual}</div>
                  </Reveal>
                  <StepDetails details={s.details} cols3 />
                </>
              ) : (
                /* Card and phone mocks: alternating two-column layout, with the
                   three detail points side by side across the full width below. */
                <>
                  <div className={`grid lg:grid-cols-2 gap-10 lg:gap-14 items-start ${s.reverse ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                    <Reveal>
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2">{s.step}</p>
                      <Eyebrow>{s.eyebrow}</Eyebrow>
                      <h2 id={`${s.id}-title`} className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink leading-[1.1]">{s.title}</h2>
                      <p className="mt-4 text-base sm:text-lg text-muted-fg leading-relaxed">{s.lead}</p>
                      <OldWay without={s.without} />
                      <AutoChain youDo={s.youDo} auto={s.auto} />
                    </Reveal>
                    <Reveal delay={140}>
                      <div className="lg:sticky lg:top-28">{s.visual}</div>
                    </Reveal>
                  </div>
                  <StepDetails details={s.details} cols3 />
                </>
              )}
            </section>
          ))}
        </div>
      </div>

      <CtaBand title="Run your next job this way" body="Upload one quote and watch the budget, schedule, and paperwork build themselves." />
    </>
  )
}
