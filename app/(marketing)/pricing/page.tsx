import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowRight, Check, Archive } from 'lucide-react'
import { PLAN_FEATURES, PLAN_CTA_HREF, PLAN_CTA_WEB, PLAN_CTA_WEB_HREF, PRICING_STATUS, TRIAL_DAYS } from '@/lib/plans'
import { appHref } from '@/lib/hosts'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow, SectionHead } from '@/components/marketing/section'
import { PricingPlans } from '@/components/marketing/pricing-plans'

export const metadata: Metadata = marketingMeta({
  title: 'SyteNav Pricing | Pay by Active Project',
  description:
    `Run every part of the job in SyteNav. Plans start at $99 a month and include unlimited team members, subs and clients. SyteNav is invite-only and your first ${TRIAL_DAYS} days are free.`,
  path: '/pricing',
})

// The tiers and every number on this page come from lib/plans.ts, the same list
// Settings -> Billing renders. They used to be two hardcoded sets that disagreed
// about the tier names AND the price.
//
// TWO THINGS THIS PAGE MUST NOT SAY, both of which the draft copy said:
//
//   "Start free trial. 14 days. No card."  There is no trial. /signup is a
//   Request Access form behind a waitlist, so a button carrying that verb opens
//   something else - the same class of bug as a checklist step labelled "Share
//   the portal" that opened the document-sending page.
//
//   "Poke around the live demo. No signup."  There is no public demo. The only
//   thing named demo in this repo is /api/dev/seed-demo, which seeds a database.
//
// Both were replaced with Request access, which is the door that exists.
//
// A TRIAL SHIPPED, SO HALF OF THAT CHANGED - and the note above said this page
// was where it would go, and that the FAQ below would stop being true. Both
// happened. What did NOT change is the door: `/signup` is still a request form
// behind a waitlist, so the fifteen days are stated as what happens once you
// are approved, never as a button a stranger can press. The BUTTON still says
// Request access, because that is still what pressing it does.
const FAQ = [
  {
    q: 'What happens when I reach my project limit?',
    a: 'You can move up a plan or close out a finished job. Nothing is deleted either way, and a closed job stays fully readable. Planning and on-hold jobs count towards the limit; completed and cancelled ones do not.',
  },
  {
    // REWRITTEN BECAUSE THE PRODUCT CHANGED UNDER IT. This used to say "We
    // reach out. We do not cut you off in the middle of a job", written when
    // nothing counted a scan at all. Scans are metered now and the allowance
    // is a real stop, so the old answer would have been a promise the code no
    // longer keeps - the same failure as a button whose verb nothing honours.
    // The second half of it is still true and still worth saying: the stop is
    // on scanning, not on the job.
    q: 'What happens if I go over the scan allowance?',
    a: 'Scanning pauses until the allowance refills on the 1st, or you move up a plan. Everything else in SyteNav keeps working - the limit is on reading documents for you, not on running the job.',
  },
  {
    q: 'Do subs or clients cost extra?',
    a: 'No. Team members are unlimited. Subs and clients use links, not logins.',
  },
  {
    q: 'Can I cancel?',
    a: 'Yes. Monthly plans cancel anytime.',
  },
  {
    // The question the prices on this page raise, answered where they are.
    q: 'So what am I paying today?',
    a: `Nothing for your first ${TRIAL_DAYS} days. SyteNav is invite-only: once you are approved you get the whole product on a real job for ${TRIAL_DAYS} days, with no card taken and nothing to cancel. After that you pick one of the plans above. Anybody already in the beta stays free - we are not putting a clock on people who were here before billing was.`,
  },
]

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10 text-center">
        <Eyebrow className="justify-center">Pricing</Eyebrow>
        <h1 className="mt-3 text-4xl font-extrabold leading-[1.04] tracking-tight text-ink sm:text-5xl lg:text-6xl">
          Pricing that follows the work on your board.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-fg">
          Every plan has the full product. You only pay for how many projects are active at
          once. Finished jobs stay with you and do not count toward your limit.
        </p>
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-16 sm:pb-20">
        <PricingPlans />
      </section>

      {/* Finished jobs do not count */}
      <section className="border-y border-line bg-panel">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 sm:py-20">
          <Reveal>
            <div className="rounded-3xl border border-line bg-surface p-7 sm:p-10">
              <Archive className="h-8 w-8 text-accent-fg" />
              <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
                Finished jobs do not count.
              </h2>
              <p className="mt-4 leading-relaxed text-muted-fg">
                Complete a project and it stays fully readable forever. The budget, invoices,
                daily logs, photos, documents and Job History stay where they are. Only active
                projects use your plan.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Everything, on every plan */}
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-24">
        <Reveal>
          <SectionHead
            center
            eyebrow="What you get"
            title="Everything, on every plan."
            lead="The $99 plan is not a stripped-down version. Every plan gets the same product. You are only buying project capacity."
            className="mb-12 sm:mb-14"
          />
        </Reveal>
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {PLAN_FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 40}>
              <div className="flex items-start gap-3">
                <Check className="mt-1 h-4 w-4 shrink-0 text-success" />
                <div>
                  <p className="font-bold text-ink">{f.t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-fg">{f.d}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Run a real job before you decide. THE LENGTH COMES OFF `TRIAL_DAYS`,
          never typed: a hardcoded "15 days" here is one price change away from
          being the only place on the internet still saying fourteen. */}
      <section className="dark">
        <div className="border-y border-line bg-surface text-ink">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 sm:py-24 text-center">
            <Reveal>
              <h2 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
                Run a real job before you decide.
              </h2>
              <p className="mx-auto mt-5 max-w-xl leading-relaxed text-muted-fg">
                SyteNav is invite-only. Ask for access, tell us how you work, and your first{' '}
                {TRIAL_DAYS} days are free - the whole product on a real job, with no card taken
                and no cut-down plan.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href={appHref(PLAN_CTA_WEB_HREF)}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-accent px-7 py-3.5 font-bold text-accent-ink transition-opacity hover:opacity-90"
                >
                  {PLAN_CTA_WEB} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={PLAN_CTA_HREF}
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-line px-7 py-3.5 font-semibold text-ink transition-colors hover:bg-muted"
                >
                  Book a setup
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 sm:py-24">
          <Reveal>
            <h2 className="mb-12 text-center text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
              Fair questions
            </h2>
          </Reveal>
          <div className="divide-y divide-line">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <div className="py-7">
                  <h3 className="text-lg font-bold text-ink">{f.q}</h3>
                  <p className="mt-2.5 leading-relaxed text-muted-fg">{f.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section aria-label="Get started" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-3xl bg-accent px-6 py-16 text-center text-accent-ink sm:px-14 sm:py-20">
          <span aria-hidden className="bp-grid absolute inset-0" />
          <div className="relative">
            <h2 className="text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">
              One caught billing mistake pays for the year.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-accent-ink/75 sm:text-lg">
              Run the next job with the quote, budget, field record and billing on the same page.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={appHref(PLAN_CTA_WEB_HREF)}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-ink px-7 py-3.5 font-bold text-surface transition-opacity hover:opacity-90"
              >
                {PLAN_CTA_WEB} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={PLAN_CTA_HREF}
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-accent-ink/30 px-7 py-3.5 font-semibold transition-colors hover:bg-accent-ink/10"
              >
                Book a setup
              </Link>
            </div>
            <p className="mt-5 text-xs text-accent-ink/60">{PRICING_STATUS.line}</p>
          </div>
        </div>
      </section>
    </>
  )
}
