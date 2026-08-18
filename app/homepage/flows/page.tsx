import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, TrendingUp, TrendingDown } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { SectionHead } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'
import { FlowCard } from '@/components/marketing/flow-card'
import { FLOWS } from '@/lib/flows'

export const metadata: Metadata = marketingMeta({
  title: 'Where jobs leak money · SyteNav',
  description:
    'Six real flows, start to finish: a client picking an upgrade over allowance, bringing a sub on from quote to first bill, a supplier invoice split across two trades, cost-plus billed per invoice, a bill that does not match its quote, and where a budget line got its number.',
  path: '/homepage/flows',
})

// Deliberately NOT the same page as /homepage/workflow. That one walks the
// project lifecycle top to bottom - find the job, price it, award it, close it
// out. This one is six specific scenarios where money actually goes missing,
// with the loss spelled out beside the fix. Lifecycle answers "what does it
// cover"; this answers "why would I switch".
export default function FlowsPage() {
  return (
    <>
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <Reveal>
          <SectionHead
            eyebrow="Six flows, start to finish"
            title={<>Six places a job leaks money<br className="hidden sm:block" /> - and what stops it.</>}
            lead="Every product has change orders and a budget. What matters is the twenty minutes between a client tapping an upgrade and $3,500 landing on the right line. Here is each of those, step by step, with what it costs you today written next to what fixes it."
          />
        </Reveal>

        {/* Says what the colours mean before the reader meets them, and does it
            in words as well as colour. */}
        <Reveal delay={0.05}>
          <div className="mt-8 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/25 bg-success-tint px-3 py-1.5 font-semibold text-success">
              <TrendingUp className="h-3.5 w-3.5" /> Win — what you get
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-danger/25 bg-danger-tint px-3 py-1.5 font-semibold text-danger">
              <TrendingDown className="h-3.5 w-3.5" /> Without it — what it costs
            </span>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {FLOWS.map((flow, i) => (
            <Reveal key={flow.slug} delay={Math.min(i * 0.04, 0.2)}>
              {/* The first one opens on arrival, so nobody has to guess that
                  these expand. The rest stay closed - a page of six open flows
                  is a wall. */}
              <FlowCard flow={flow} defaultOpen={i === 0} />
            </Reveal>
          ))}
        </div>

        <Reveal>
          <p className="mt-10 text-sm text-muted-fg">
            Every one of these is running today, not on a roadmap.{' '}
            <Link href="/homepage/features" className="font-semibold text-accent-fg hover:underline">
              See the full feature list
            </Link>{' '}
            if you would rather check it off against your own.
          </p>
        </Reveal>
      </section>

      <CtaBand
        title="See one of these on your own job"
        body="Bring a job you are already running into SyteNav and watch the first sub bill land on the right budget line."
      />
    </>
  )
}
