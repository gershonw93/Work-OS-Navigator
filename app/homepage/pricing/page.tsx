import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, HardHat, Building2, Landmark } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'Pricing · SyteNav',
  description:
    'Simple plans for solo subs, growing crews, and multi-project companies. Free to start, priced for the way contractors actually grow. Full pricing shown at signup.',
  path: '/homepage/pricing',
})

const TIERS = [
  {
    icon: HardHat,
    name: 'Crew',
    who: 'For solo subs and small crews',
    blurb: 'Everything you need to turn quotes into running jobs and get paid on time.',
    features: [
      'AI quote scanning',
      'Line-item budgets & progress',
      'Scheduling with overlap warnings',
      'Daily logs, tasks & photos',
      'Stage invoicing',
      'Time clock for your crew',
    ],
    cta: 'Start free',
    featured: false,
  },
  {
    icon: Building2,
    name: 'Company',
    who: 'For GCs and growing teams',
    blurb: 'Run multiple jobs and subs with the master views, RFQs, and approvals that keep a company straight.',
    features: [
      'Everything in Crew',
      'RFQs out & AI bid comparison',
      'Client payments & escrow tracking',
      'Master calendar & money views',
      'Roles & approval workflows',
      'Permits, inspections & compliance',
    ],
    cta: 'Start free',
    featured: true,
  },
  {
    icon: Landmark,
    name: 'Scale',
    who: 'For high-volume operations',
    blurb: 'For companies running serious volume, with the controls, support, and onboarding to match.',
    features: [
      'Everything in Company',
      'Unlimited projects & storage',
      'Priority support & onboarding',
      'Advanced permissions & audit trail',
      'Company-wide reporting',
      'Dedicated success contact',
    ],
    cta: 'Talk to us',
    featured: false,
  },
]

const FAQ = [
  {
    q: 'How much does it cost?',
    a: 'Plans are priced per company, sized by team and project volume. You see full pricing at signup, before you enter a card, and the free tier is genuinely free.',
  },
  {
    q: 'What does free include?',
    a: 'Enough to run a real job: AI quote scanning, budgets, scheduling, daily logs, and invoicing for a limited number of active projects. Upgrade when the volume does.',
  },
  {
    q: 'Do my subs and clients need paid seats?',
    a: 'No. Subs bid on RFQ links without an account, and clients view and approve on a portal link. You only pay for your own team.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. No contracts, no cancellation calls. Export your data whenever you want, it stays yours.',
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
        <Eyebrow className="justify-center">Pricing</Eyebrow>
        <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
          Priced like a tool, not a tax.
        </h1>
        <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
          Start free, pay when the volume justifies it, and never pay for seats your subs and clients use. Full pricing is shown at signup, before you ever enter a card.
        </p>
      </section>

      {/* Tiers */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20 sm:pb-28">
        <div className="grid md:grid-cols-3 gap-5 items-stretch">
          {TIERS.map((t, i) => (
            <Reveal key={t.name} delay={i * 100} className="h-full">
              <div
                className={[
                  'h-full flex flex-col rounded-3xl p-7 sm:p-8',
                  t.featured
                    ? 'bg-ink text-surface dark:bg-panel dark:text-ink border-2 border-accent relative'
                    : 'border border-line bg-panel',
                ].join(' ')}
              >
                {t.featured && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-accent text-accent-ink text-[11px] font-bold px-3 py-1">
                    Most popular
                  </span>
                )}
                <t.icon className={`h-8 w-8 mb-4 ${t.featured ? 'text-accent' : 'text-accent-fg'}`} />
                <h2 className={`text-2xl font-extrabold tracking-tight ${t.featured ? '' : 'text-ink'}`}>{t.name}</h2>
                <p className={`mt-1 text-sm font-medium ${t.featured ? 'opacity-70' : 'text-muted-fg'}`}>{t.who}</p>
                <p className={`mt-4 text-sm leading-relaxed ${t.featured ? 'opacity-80' : 'text-muted-fg'}`}>{t.blurb}</p>
                <ul className="mt-6 space-y-2.5 flex-1">
                  {t.features.map(f => (
                    <li key={f} className={`flex items-start gap-2.5 text-sm ${t.featured ? 'opacity-90' : 'text-ink-soft'}`}>
                      <Check className={`h-4 w-4 mt-0.5 shrink-0 ${t.featured ? 'text-accent' : 'text-success'}`} /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={t.cta === 'Talk to us' ? '/homepage/contact' : '/signup'}
                  className={[
                    'mt-8 inline-flex items-center justify-center gap-2 rounded-xl font-bold px-6 py-3 transition-colors',
                    t.featured
                      ? 'bg-accent text-accent-ink hover:bg-accent/90'
                      : 'border border-line text-ink hover:bg-muted',
                  ].join(' ')}
                >
                  {t.cta} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-faint">
          Every plan includes AI document scanning, unlimited client and sub links, and both light and dark mode. Obviously.
        </p>
      </section>

      {/* FAQ */}
      <section className="bg-panel border-y border-line">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-ink text-center mb-12">
              Fair questions
            </h2>
          </Reveal>
          <div className="divide-y divide-line">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <div className="py-7">
                  <h3 className="text-lg font-bold text-ink">{f.q}</h3>
                  <p className="mt-2.5 text-muted-fg leading-relaxed">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <CtaBand title="Start where you are" body="One free job is all it takes to see whether this replaces the stack." />
    </>
  )
}
