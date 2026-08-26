import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, Wallet, Landmark, Receipt, FileSpreadsheet, GitPullRequest, Send,
  ShoppingCart, TrendingUp, Layers, Building2, ScanLine, Check, ShieldCheck, BarChart2, Palette,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow, SectionHead } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'
import { CountUp } from '@/components/marketing/count-up'
import { MoneyFlow } from '@/components/marketing/money-flow'
import { BudgetLineAnatomy } from '@/components/marketing/budget-line-anatomy'
import { MoneyMock } from '@/components/marketing/money-mock'

export const metadata: Metadata = marketingMeta({
  title: 'Construction budgets, invoices & payments · SyteNav',
  description:
    'Preconstruction and soft costs, hard cost budgets, sellout and projected profit, buy-out and line-by-line bid comparison, client selections and allowances, invoices, AIA pay applications, client payments and escrow - one system where every number carries from the estimate to the bank.',
  path: '/money',
})

// The money side is the part contractors are most burned by and most sceptical
// about, so this page is organised the way the money actually moves rather than
// by feature name.

// Concrete enough that a GC recognises their own week in it. Every one of these
// is a thing the app does off work already being done, not a new chore.
const HOOKS = [
  'Snap a receipt - it lands on the right budget line, coded',
  'Your profit today, not a number you find out at the end',
  'Two lumber quotes compared line by line, not total against total',
  'The client picks their own finishes on a link, no account',
  'An upgrade over allowance becomes a change order in one click',
  'Pay apps print as a real G702 and G703 with retainage carried',
]

const STAGES = [
  {
    icon: Layers,
    kicker: 'Before the ground breaks',
    title: 'Preconstruction and soft costs',
    body:
      'Not every dollar on a job is a trade. Plans and design, permit fees, builders risk, survey, legal and recording, loan origination and interest, contingency. They live on the same budget as the trades, in their own section with their own subtotal, so the job total is the real total.',
    points: [
      'One click adds the standard soft-cost list, blank, to fill in as numbers firm up',
      'Hard and soft split with subtotals, and what share of the job is soft',
      'A job still in planning shows only the tabs that matter before you break ground',
    ],
  },
  {
    icon: Wallet,
    kicker: 'The estimate',
    title: 'A budget that is also your bid',
    body:
      'Build the job at cost, line by line, in the trades you actually use. Add your markup and you have the client price. Generate the proposal as a branded PDF at whatever detail level you want the client to see. Win it, and that same budget is already your baseline.',
    points: [
      '49 trade categories in build order, plus any category you name yourself',
      'Import an existing estimate from Excel or CSV without losing what is already there',
      'Save any budget as a template and reuse it on the next job',
    ],
  },
  {
    icon: TrendingUp,
    kicker: 'Your profit',
    title: 'Sellout and projected profit',
    body:
      'Enter what the job sells for, or what you are contracted at, and your profit tracks itself: sellout minus cost, recalculated every time a budget line moves. Once costs land you also see profit against actual spend. Not a report you run at the end - a number that is right today.',
    points: [
      'Works on a spec build, where the sale price has nothing to do with your cost',
      'Falls back to cost plus markup on a cost-plus job, so there is nothing to enter',
      'Margin percentage alongside, and it turns red before you find out the hard way',
    ],
  },
  {
    icon: Send,
    kicker: 'Buy-out',
    title: 'Quotes out, bids compared, contracts signed',
    body:
      'Send an RFQ and subs bid on a link with no account. The AI reads what came back and tells you where the gaps are, so the cheapest number is not mistaken for the best one. Award it and the subcontract writes itself onto the budget line.',
    points: [
      'Trade templates so every bidder answers the same questions - no takeoff needed',
      'Buying the material yourself? Send the item list and compare line by line',
      'Awarding a bid creates the subcontract and links it to the budget',
      'Insurance and licence expiry tracked per sub, with reminders',
    ],
  },
  {
    icon: Palette,
    kicker: 'Allowances',
    title: 'The choices that are not yours to make',
    body:
      'Paint, tile, cabinets, fixtures, windows. You cannot start until somebody else decides, and the decision has a deadline set by lead time rather than your schedule. Your client picks on a link with no account, sees what each upgrade costs against your allowance before they commit, and the moment they go over you raise the change order in one click.',
    points: [
      'Decide-by dates driven by lead time, so a six-week window order is not decided in week five',
      'Every allowance hangs off a budget line - the overage lands where it belongs',
      'Order it and the cost books itself against the budget, priced from what they chose',
    ],
  },
  {
    icon: Receipt,
    kicker: 'Billing',
    title: 'Whichever way you bill',
    body:
      'Residential and smaller jobs bill on invoices and client payments. Commercial and bank-funded jobs bill by monthly pay application against a schedule of values, with retainage, and print as a real G702 and G703. You pick per job, and the app only shows you the one you chose.',
    points: [
      'Approving an invoice moves the budget, not just paying it',
      'Pay apps carry previous billings forward automatically',
      'Change orders flow into the contract total and the sub contract both',
    ],
  },
  {
    icon: Landmark,
    kicker: 'Getting paid',
    title: 'Payments, escrow, and your fee',
    body:
      'What the client has paid, what is sitting in escrow, what is still owed, and your contractor fee on top. Plus the answer to the question that keeps contractors up: can I pay my vendors this week without going into my own pocket.',
    points: [
      'Client payments recorded against stages you define',
      'Escrow balance and outstanding tracked per job',
      'A straight answer on whether you can cover what you owe right now',
    ],
  },
]

const ROLLUPS = [
  {
    icon: Building2,
    title: 'Across a building',
    body:
      'A forty-unit building is forty budgets. Set the sellout on each and the site totals it: full sellout against full cost, margin for the whole thing. Units you have not priced yet are flagged, so a half-priced building never reads as a finished number.',
  },
  {
    icon: BarChart2,
    title: 'Across the company',
    body:
      'Every job in one money view: contracted, billed, paid, outstanding. Which job is bleeding and which one is carrying you, without opening ten tabs and a spreadsheet.',
  },
  {
    icon: ScanLine,
    title: 'Without the retyping',
    body:
      'Quotes, invoices, receipts and permits are read by AI into structured line items and terms. The whole reason the numbers stay connected is that nobody had to key them in twice.',
  },
]

export default function MoneyPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-10 sm:pb-14 text-center">
        <Eyebrow className="justify-center">The money side</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
          You run the job.
          <br className="hidden sm:block" /> The numbers keep up.
        </h1>
        <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
          Construction money is genuinely complicated - soft costs, buy-out, allowances, retainage,
          change orders, escrow. Most software hands you that complexity as data entry. SyteNav does
          the bookkeeping in the background off the work you were already doing, so you can stay on
          the site and still know exactly where the job stands.
        </p>

        {/* The specifics, because a promise this size needs receipts. */}
        <ul className="mt-8 grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl mx-auto text-left">
          {HOOKS.map(h => (
            <li key={h} className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-accent-fg shrink-0 mt-0.5" />
              <span className="text-sm text-ink-soft leading-snug">{h}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Animated pipeline */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24">
        <Reveal>
          <MoneyFlow />
        </Reveal>
      </section>

      {/* The one idea the whole money side rests on */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <Reveal>
                <Eyebrow>One line, three numbers</Eyebrow>
                <h2 className="mt-3 text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-ink leading-[1.06]">
                  This is the whole model
                </h2>
                <p className="mt-5 text-base sm:text-lg text-muted-fg leading-relaxed">
                  Every budget line carries what you planned, what you are committed to, and what you
                  have actually spent. Signing a subcontract fills the second one. Approving an invoice
                  or assigning a receipt fills the third.
                </p>
                <p className="mt-4 text-base text-muted-fg leading-relaxed">
                  Nothing is typed twice, which is the only reason the numbers can be trusted at the
                  end of the job. Understand this one graphic and you understand the money side.
                </p>
                <ul className="mt-7 space-y-2.5">
                  {[
                    'Committed over budget is flagged the moment it happens',
                    'Materials receipts roll into the line they belong to',
                    'Variance per line and across the job, live',
                  ].map(t => (
                    <li key={t} className="flex items-start gap-2.5 text-sm text-ink-soft">
                      <Check className="h-4 w-4 mt-0.5 shrink-0 text-success" /> {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={140}>
                <BudgetLineAnatomy />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Stage by stage */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            center
            eyebrow="Stage by stage"
            title="How the money moves"
            lead="Organised the way the money actually flows on a job, not by feature name."
            className="mb-14 sm:mb-16"
          />
        </Reveal>

        <div className="space-y-5">
          {STAGES.map((s, i) => (
            <Reveal key={s.title} delay={i * 60}>
              <div className="grid md:grid-cols-[auto_1fr] gap-5 md:gap-8 rounded-3xl border border-line bg-panel p-6 sm:p-8">
                <div className="flex md:block items-center gap-4">
                  <span className="grid place-items-center h-14 w-14 rounded-2xl bg-accent-tint text-accent-fg shrink-0">
                    <s.icon className="h-7 w-7" />
                  </span>
                  <p className="md:mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-faint md:max-w-[9rem] leading-relaxed">
                    {s.kicker}
                  </p>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-extrabold tracking-tight text-ink">{s.title}</h3>
                  <p className="mt-3 text-muted-fg leading-relaxed">{s.body}</p>
                  <ul className="mt-5 grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
                    {s.points.map(p => (
                      <li key={p} className="flex items-start gap-2.5 text-sm text-ink-soft">
                        <Check className="h-4 w-4 mt-0.5 shrink-0 text-success" /> {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Payments visual + the counted numbers */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <Reveal>
              <MoneyMock />
            </Reveal>
            <Reveal delay={140}>
              <Eyebrow>Nothing owed, nothing forgotten</Eyebrow>
              <h2 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight text-ink leading-[1.06]">
                Know where you stand, on every job, today
              </h2>
              <p className="mt-5 text-muted-fg leading-relaxed">
                Stages you define, payments recorded against them, escrow tracked, and your fee
                calculated on top. The same numbers roll up across every job you are running.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-4">
                {[
                  { end: 42, prefix: '$', suffix: 'M', label: 'in contracts tracked' },
                  { end: 1800, suffix: '+', label: 'jobs managed' },
                  { end: 92, suffix: '%', label: 'invoices paid on schedule' },
                ].map(s => (
                  <div key={s.label}>
                    <p className="font-display font-bold text-3xl sm:text-4xl tracking-tight text-ink">
                      <CountUp end={s.end} prefix={s.prefix} suffix={s.suffix} />
                    </p>
                    <p className="mt-1 text-xs text-muted-fg leading-snug">{s.label}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Roll-ups */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <Reveal>
          <SectionHead
            center
            eyebrow="Zoom out"
            title="One job, one building, or all of it"
            className="mb-12 sm:mb-14"
          />
        </Reveal>
        <div className="grid md:grid-cols-3 gap-5">
          {ROLLUPS.map((r, i) => (
            <Reveal key={r.title} delay={i * 90} className="h-full">
              <div className="h-full rounded-3xl border border-line bg-panel p-7">
                <r.icon className="h-8 w-8 text-accent-fg mb-4" />
                <h3 className="text-lg font-extrabold tracking-tight text-ink">{r.title}</h3>
                <p className="mt-3 text-sm text-muted-fg leading-relaxed">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Honesty band - what it deliberately is not */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
        <Reveal>
          <div className="rounded-3xl border border-line bg-surface p-7 sm:p-9">
            <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              <ShieldCheck className="h-3.5 w-3.5" /> Straight about it
            </span>
            <h2 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              What this is not
            </h2>
            <p className="mt-4 text-muted-fg leading-relaxed">
              SyteNav tracks construction cost and the money moving between you, your subs and your
              client. It does not model a capital stack, a draw schedule, or an exit, and it is not
              your accounting system. If you run a full development pro-forma, keep running it, and
              use this to keep the construction side honest.
            </p>
            <p className="mt-4 text-muted-fg leading-relaxed">
              It does push to QuickBooks Online, so your bookkeeper is not re-entering the same
              invoices you already approved.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/features"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-ink hover:bg-muted transition-colors"
              >
                Everything else it does <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel px-5 py-2.5 text-sm font-semibold text-ink hover:bg-muted transition-colors"
              >
                What it costs
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <CtaBand
        title="Put one job through it"
        body="Bring a budget you already have, and see the whole money side of that job in one place."
      />
    </>
  )
}
