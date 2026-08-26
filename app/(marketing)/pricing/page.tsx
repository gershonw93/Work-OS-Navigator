import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, HardHat, Building2, Landmark, Users, FolderKanban, ScanLine, Equal } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow, SectionHead } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'

export const metadata: Metadata = marketingMeta({
  title: 'Pricing · SyteNav construction management',
  description:
    'One system instead of four. Book a setup and we will scope the right plan for your crew. SyteNav is in an invite-only beta, free while you are in it, and your subs and clients never need paid seats.',
  path: '/pricing',
})

const TIERS = [
  {
    icon: HardHat,
    name: 'Crew',
    who: 'For solo subs and small crews',
    blurb: 'Everything you need to turn quotes into running jobs and get paid on time.',
    limits: [
      { icon: Users, t: '5 team members' },
      { icon: FolderKanban, t: '5 active projects' },
      { icon: ScanLine, t: '50 AI scans / mo' },
    ],
    features: [
      'AI quote & receipt scanning',
      'Line-item budgets & progress',
      'Scheduling with overlap warnings',
      'Daily logs, tasks & photos',
      'Stage invoicing',
      'Time clock for your crew',
    ],
    cta: 'Book a setup',
    featured: false,
  },
  {
    icon: Building2,
    name: 'Company',
    who: 'For GCs and growing teams',
    blurb: 'Run multiple jobs and subs with the master views, RFQs, and approvals that keep a company straight.',
    limits: [
      { icon: Users, t: '15 team members' },
      { icon: FolderKanban, t: 'Unlimited projects' },
      { icon: ScanLine, t: '300 AI scans / mo' },
    ],
    features: [
      'Everything in Crew',
      'RFQs out & AI bid comparison',
      'Client payments & escrow tracking',
      'Master calendar & money views',
      'Roles & approval workflows',
      'Permits, inspections & compliance',
    ],
    cta: 'Book a setup',
    featured: true,
  },
  {
    icon: Landmark,
    name: 'Scale',
    who: 'For high-volume operations',
    blurb: 'For companies running serious volume, with the controls, support, and onboarding to match.',
    limits: [
      { icon: Users, t: 'Unlimited team' },
      { icon: FolderKanban, t: 'Unlimited projects' },
      { icon: ScanLine, t: '1,000 AI scans / mo' },
    ],
    features: [
      'Everything in Company',
      'Priority support & onboarding',
      'Advanced permissions & audit trail',
      'Company-wide reporting',
      'Dedicated success contact',
      'Custom scan volume available',
    ],
    cta: 'Book a setup',
    featured: false,
  },
]

// The replacement math, no competitor names, honest ranges.
const STACK = [
  { tool: 'Project management suite', price: '$299 to $499' },
  { tool: 'Daily log & field app', price: '$150 to $400', note: 'priced per user, so it grows with your crew' },
  { tool: 'Invoicing software', price: '$35 to $90' },
  { tool: 'Cloud storage for plans & photos', price: '$10 to $20' },
]

const FAQ = [
  {
    q: 'Why is there no price on this page?',
    a: 'Because the honest answer depends on your crew size and how many documents you run through the AI, and a number on a page is usually wrong in one direction or the other. Book a setup, tell us how you work, and you get a flat monthly rate the same day. It is a real conversation, not a sales process.',
  },
  {
    q: 'What counts as an AI scan?',
    a: 'One document read by the AI: a quote, an invoice, a receipt, or a permit. A failed read never counts against you. The caps sit above what a busy month actually uses; on Crew, 50 scans is more than two every working day.',
  },
  {
    q: 'What happens if I hit my scan limit?',
    a: 'Nothing breaks. You can keep entering documents by hand, top up scans for that month, or move up a tier. We will warn you well before you get close.',
  },
  {
    q: 'Do my subs and clients need paid seats?',
    a: 'No. Subs bid on RFQ links without an account, and clients view and approve on a portal link. You only pay for your own team.',
  },
  {
    q: 'What does the beta cost?',
    a: 'Nothing while you are in it. SyteNav is invite-only right now, so you get the full feature set on a real job with no card on file. When we open up, the plan we scoped on your setup call is the one you move onto - no surprise.',
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
          One system. Instead of four.
        </h1>
        <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
          SyteNav replaces the PM tool, the field app, the invoicing software, and the storage plan, for less than most crews pay for the first one. Book a setup and we&apos;ll scope the right plan for how you actually work. Your subs and clients never need paid seats.
        </p>
      </section>

      {/* Tiers */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-20">
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
                {/* Explicit color needed: the global h2 base style is text-ink,
                    which disappears on the featured card's dark background. */}
                <h2 className={`text-2xl font-extrabold tracking-tight ${t.featured ? 'text-surface dark:text-ink' : 'text-ink'}`}>{t.name}</h2>
                <p className={`mt-1 text-sm font-medium ${t.featured ? 'opacity-70' : 'text-muted-fg'}`}>{t.who}</p>

                {/* No number here on purpose - what a crew actually needs
                    varies enough that a quoted list price is usually wrong in
                    one direction or the other. We scope it on the call. */}
                <p className={`mt-5 font-display font-bold text-3xl tracking-tight ${t.featured ? '' : 'text-ink'}`}>
                  Let&apos;s scope it
                </p>
                <p className={`mt-1 text-xs ${t.featured ? 'opacity-50' : 'text-faint'}`}>
                  Flat monthly rate · no per-seat billing · cancel anytime
                </p>

                {/* Limits */}
                <div className={`mt-5 rounded-xl px-4 py-3 space-y-2 ${t.featured ? 'bg-surface/10 dark:bg-muted' : 'bg-surface border border-line-soft'}`}>
                  {t.limits.map(l => (
                    <p key={l.t} className={`flex items-center gap-2.5 font-mono text-xs ${t.featured ? 'opacity-85' : 'text-ink-soft'}`}>
                      <l.icon className={`h-3.5 w-3.5 shrink-0 ${t.featured ? 'text-accent' : 'text-accent-fg'}`} /> {l.t}
                    </p>
                  ))}
                </div>

                <p className={`mt-5 text-sm leading-relaxed ${t.featured ? 'opacity-80' : 'text-muted-fg'}`}>{t.blurb}</p>
                <ul className="mt-5 space-y-2.5 flex-1">
                  {t.features.map(f => (
                    <li key={f} className={`flex items-start gap-2.5 text-sm ${t.featured ? 'opacity-90' : 'text-ink-soft'}`}>
                      <Check className={`h-4 w-4 mt-0.5 shrink-0 ${t.featured ? 'text-accent' : 'text-success'}`} /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
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
        <p className="mt-8 text-center text-sm text-faint max-w-2xl mx-auto">
          Invite-only beta: full features on a real job, no card required, while you are in it. Unlimited client and sub links on every plan.
        </p>
      </section>

      {/* Do the math, dark band */}
      <section className="dark">
        <div className="bg-surface text-ink border-y border-line">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
            <Reveal>
              <SectionHead
                center
                eyebrow="Do the math"
                title="What the stack you replace costs"
                lead="No competitor names, just what crews around here actually pay each month for the tools SyteNav folds into one."
                className="mb-12 sm:mb-14"
              />
            </Reveal>
            <Reveal delay={120}>
              <div className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
                <div className="divide-y divide-line-soft">
                  {STACK.map(s => (
                    <div key={s.tool} className="py-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-ink">{s.tool}</p>
                        {s.note && <p className="text-xs text-muted-fg mt-0.5">{s.note}</p>}
                      </div>
                      <p className="font-mono text-sm text-ink-soft shrink-0 pt-0.5">{s.price} <span className="text-faint">/mo</span></p>
                    </div>
                  ))}
                </div>
                <div className="mt-2 pt-5 border-t-2 border-line flex items-center justify-between gap-4">
                  <p className="font-bold text-ink flex items-center gap-2"><Equal className="h-4 w-4 text-danger" /> Four tools, four logins</p>
                  <p className="font-mono font-bold text-ink shrink-0">$494 to $1,009 <span className="text-faint font-normal">/mo</span></p>
                </div>
                <div className="mt-4 rounded-2xl bg-accent text-accent-ink px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold flex items-center gap-2">
                    <Check className="h-5 w-5" /> SyteNav, all of it in one system
                  </p>
                  <p className="font-display font-bold text-xl shrink-0">Less than the first line on this list</p>
                </div>
                <p className="mt-4 text-xs text-muted-fg text-center">
                  And that&apos;s before counting the hours nobody bills for retyping quotes into budgets and progress into invoices.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
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

      <CtaBand title="Book a setup" body="Twenty minutes, we scope your plan, and you start on a free job to see whether this replaces the stack." />
    </>
  )
}
