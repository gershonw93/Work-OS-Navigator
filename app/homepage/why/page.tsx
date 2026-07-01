import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, X, Check, Table2, MessageSquare, KanbanSquare, Receipt,
  Wallet2, Keyboard, FileQuestion,
} from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { SectionHead, Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'
import { BlueprintGrid } from '@/components/marketing/blueprint'

export const metadata: Metadata = marketingMeta({
  title: 'Why SyteNav · Replace the spreadsheet stack',
  description:
    'Why contractors replace spreadsheets, group texts, generic PM tools, and standalone invoicing apps with SyteNav: one system where the quote, the money, the schedule, and the field share the same data.',
  path: '/homepage/why',
})

// The honest comparison: the tool you're using vs what changes. No competitor names.
const REPLACEMENTS = [
  {
    icon: Table2,
    tool: 'The spreadsheet stack',
    them: [
      'One master file only you understand',
      'Budget, schedule, and progress in separate tabs that disagree',
      'Every quote retyped by hand, every formula one keystroke from wrong',
      'Version seventeen, final, FINAL2, actually-final',
    ],
    us: [
      'One live system the whole company reads',
      'Budget, schedule, and progress fed by the same line items',
      'Quotes scanned in by AI, numbers born correct',
      'One current truth, with history kept for you',
    ],
  },
  {
    icon: MessageSquare,
    tool: 'The group text',
    them: [
      'Decisions buried between memes and thumbs-ups',
      'Photos that die in someone’s camera roll',
      'The new guy can’t scroll back three months',
      'No record when a dispute lands',
    ],
    us: [
      'Daily logs, tasks, and RFIs on the job they belong to',
      'Photos filed to the project, findable in seconds',
      'The whole history onboard for every new hire',
      'A time-stamped trail when it matters',
    ],
  },
  {
    icon: KanbanSquare,
    tool: 'The generic PM tool',
    them: [
      'Cards and boards that don’t know what a draw is',
      'No line items, no escrow, no payment stages',
      'The field never opens it, so it’s always stale',
      'Money still lives somewhere else',
    ],
    us: [
      'Built around quotes, budgets, and payment schedules',
      'Escrow, draws, and retainage are first-class',
      'Field tools the crew actually uses from a phone',
      'The work and the money in the same system',
    ],
  },
  {
    icon: Receipt,
    tool: 'The standalone invoicing app',
    them: [
      'Invoices disconnected from the work performed',
      'Progress retyped into line items every month',
      'No idea what’s in escrow versus earned',
      'Another subscription, another login, another export',
    ],
    us: [
      'Invoices generated from line-item progress',
      'Stage payments that follow the extracted schedule',
      'Escrow, fee, and vendor balances always current',
      'One system, one login, no exports',
    ],
  },
]

const STOP = [
  {
    icon: Wallet2,
    title: 'What you stop paying for',
    items: ['A PM tool the field ignores', 'An invoicing app that can’t see the job', 'A storage plan for lost photos', 'The Sunday-night hours that never hit an invoice'],
  },
  {
    icon: Keyboard,
    title: 'What you stop retyping',
    items: ['Quote line items into the budget', 'Progress into the invoice', 'Invoices into the money sheet', 'Permit numbers into the calendar'],
  },
  {
    icon: FileQuestion,
    title: 'What you stop losing',
    items: ['The photo that proves the wall was right', 'The bid that quietly excluded permit fees', 'The COI that expired mid-job', 'The Thursday two GCs both booked'],
  },
]

export default function WhyPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-14 sm:pb-20 text-center">
        <Eyebrow className="justify-center">Why SyteNav</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
          You already have a system. It&apos;s just five systems.
        </h1>
        <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
          A spreadsheet for the money. A group text for the field. A PM tool the crew won&apos;t open. An invoicing app that can&apos;t see the job. And a filing cabinet, digital or otherwise, for everything that falls between them. Each one works. Together, they leak time, money, and facts.
        </p>
        </div>
      </section>

      {/* Replacement comparisons */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
          <Reveal>
            <SectionHead
              eyebrow="The honest comparison"
              title="What each tool costs you, and what changes"
              lead="No competitor bashing, no fine print. Just the four tools most crews run on today, next to what happens when the job lives in one place."
              className="mb-14 sm:mb-20"
            />
          </Reveal>

          <div className="space-y-16 sm:space-y-24">
            {REPLACEMENTS.map((r, idx) => (
              <Reveal key={r.tool}>
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <span className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <r.icon className="h-5 w-5 text-muted-fg" />
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">{r.tool}</h3>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
                    {/* Them */}
                    <div className="rounded-2xl border border-line bg-surface p-6 sm:p-7">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-5">How it goes today</p>
                      <ul className="space-y-3.5">
                        {r.them.map(t => (
                          <li key={t} className="flex items-start gap-3 text-sm text-muted-fg leading-relaxed">
                            <X className="h-4 w-4 text-danger mt-0.5 shrink-0" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {/* Us */}
                    <div className="rounded-2xl border border-accent/40 bg-accent-tint/40 p-6 sm:p-7">
                      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent-fg mb-5">With SyteNav</p>
                      <ul className="space-y-3.5">
                        {r.us.map(t => (
                          <li key={t} className="flex items-start gap-3 text-sm text-ink-soft leading-relaxed">
                            <Check className="h-4 w-4 text-accent-fg mt-0.5 shrink-0" /> {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Stop paying / retyping / losing, dark band */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
            <Reveal>
              <SectionHead
                center
                eyebrow="The switch, in plain terms"
                title="Three lists worth reading twice"
                className="mb-14 sm:mb-16"
              />
            </Reveal>
            <div className="grid md:grid-cols-3 gap-12 md:gap-8">
              {STOP.map((col, i) => (
                <Reveal key={col.title} delay={i * 110}>
                  <div>
                    <span className="h-12 w-12 rounded-2xl bg-accent flex items-center justify-center mb-5">
                      <col.icon className="h-6 w-6 text-accent-ink" />
                    </span>
                    <h3 className="text-xl font-bold text-ink">{col.title}</h3>
                    <ul className="mt-4 space-y-3">
                      {col.items.map(t => (
                        <li key={t} className="flex items-start gap-2.5 text-sm text-muted-fg leading-relaxed">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" /> {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Switching is easy */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <Reveal>
            <Eyebrow>Switching</Eyebrow>
            <h2 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.06]">
              You don&apos;t migrate. You upload.
            </h2>
            <p className="mt-5 text-lg text-muted-fg leading-relaxed">
              Switching software usually means a lost weekend and a consultant. SyteNav&apos;s setup is the AI doing what it always does: reading your existing paperwork. Start with one job, upload its quote, and you&apos;re running by the second coffee. Bring the rest when you&apos;re convinced.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90 transition-colors">
                Start with one job <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <ol className="space-y-6">
              {[
                ['Day one', 'Create your company, upload the current job’s quote. AI builds the budget and schedule.'],
                ['Week one', 'The crew files daily logs from their phones. The office stops asking “where are we on” questions.'],
                ['Month one', 'Every active job is in. The master views replace the Sunday spreadsheet ritual.'],
              ].map(([when, what], i) => (
                <li key={when} className="flex items-start gap-4">
                  <span className="font-display font-bold text-lg text-accent-fg w-24 shrink-0 pt-0.5">{when}</span>
                  <p className="text-muted-fg leading-relaxed flex-1 border-l border-line pl-5">{what}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </section>

      <CtaBand title="One job. One upload. See for yourself." body="The comparison above is easy to write. The product is easier to try." />
    </>
  )
}
