'use client'

import Link from 'next/link'
import { useId, useState } from 'react'
import { ArrowRight, Check, HardHat, Building2, Landmark, FolderKanban, ScanLine } from 'lucide-react'
import {
  PLANS, projectLimitLabel, PLAN_CTA_HREF, PLAN_CTA_APP, PLAN_CTA_WEB, PLAN_CTA_WEB_HREF,
  PRICING_STATUS, annualTotal, annualPerMonth, annualSaving, planPrice,
} from '@/lib/plans'
import { appHref } from '@/lib/hosts'

const TIER_ICONS = { HardHat, Building2, Landmark } as const

type Cycle = 'monthly' | 'annual'

/**
 * The three cards and the billing toggle.
 *
 * A client component so the toggle can be state, while /pricing stays a server
 * component and keeps its `metadata`. Every number here is DERIVED from the
 * monthly price in lib/plans.ts - "$82.50/month" and "Save $198 a year" are
 * arithmetic, not copy, and a stored version of either goes stale silently the
 * first time a price moves.
 */
export function PricingPlans() {
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const groupId = useId()

  return (
    <>
      {/* ── The toggle ──────────────────────────────────────────────────── */}
      <div
        role="radiogroup"
        aria-label="Billing period"
        className="mx-auto mb-10 flex w-fit items-center gap-1 rounded-full border border-line bg-panel p-1"
      >
        {(['monthly', 'annual'] as const).map(c => (
          <button
            key={c}
            type="button"
            role="radio"
            id={`${groupId}-${c}`}
            aria-checked={cycle === c}
            onClick={() => setCycle(c)}
            className={[
              'whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold transition-colors',
              cycle === c ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:text-ink',
            ].join(' ')}
          >
            {c === 'monthly' ? 'Monthly' : 'Annual'}
            {c === 'annual' && (
              <span className={cycle === c ? 'opacity-80' : 'text-accent-fg'}> · 2 months free</span>
            )}
          </button>
        ))}
      </div>

      {/* ── The cards ───────────────────────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-3 items-stretch">
        {PLANS.map(p => {
          const Icon = TIER_ICONS[p.icon]
          return (
            <div
              key={p.name}
              className={[
                'h-full flex flex-col rounded-3xl p-7 sm:p-8',
                p.featured
                  ? 'bg-ink text-surface dark:bg-panel dark:text-ink border-2 border-accent relative'
                  : 'border border-line bg-panel',
              ].join(' ')}
            >
              {p.featured && (
                <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-accent-ink">
                  Most popular
                </span>
              )}

              <Icon className={`h-8 w-8 mb-4 ${p.featured ? 'text-accent' : 'text-accent-fg'}`} />
              {/* Explicit colour: the global h2 base style is text-ink, which
                  disappears on the featured card's dark background. */}
              <h2 className={`text-xl font-extrabold tracking-tight ${p.featured ? 'text-surface dark:text-ink' : 'text-ink'}`}>
                {p.name}
              </h2>
              <p className={`mt-1 text-sm font-medium ${p.featured ? 'opacity-70' : 'text-muted-fg'}`}>{p.who}</p>

              {/* The price. Both halves of the annual claim are computed. */}
              <div className="mt-6">
                {cycle === 'monthly' ? (
                  <>
                    <p className={`font-display text-4xl font-bold tracking-tight ${p.featured ? '' : 'text-ink'}`}>
                      {planPrice(p.monthly)}
                      <span className={`ml-1 text-base font-semibold ${p.featured ? 'opacity-60' : 'text-muted-fg'}`}>/month</span>
                    </p>
                    <p className={`mt-1 text-xs ${p.featured ? 'opacity-50' : 'text-faint'}`}>Billed monthly</p>
                  </>
                ) : (
                  <>
                    <p className={`font-display text-4xl font-bold tracking-tight ${p.featured ? '' : 'text-ink'}`}>
                      {planPrice(annualPerMonth(p))}
                      <span className={`ml-1 text-base font-semibold ${p.featured ? 'opacity-60' : 'text-muted-fg'}`}>/month</span>
                    </p>
                    <p className={`mt-1 text-xs ${p.featured ? 'opacity-50' : 'text-faint'}`}>
                      {planPrice(annualTotal(p))}/year, paid annually
                    </p>
                    <p className="mt-2 inline-block whitespace-nowrap rounded-full bg-success-tint px-2.5 py-1 text-xs font-bold text-success">
                      Save {planPrice(annualSaving(p))} a year
                    </p>
                  </>
                )}
              </div>

              {/* What the tier actually meters. */}
              <div className={`mt-6 space-y-2 rounded-xl px-4 py-3 ${p.featured ? 'bg-surface/10 dark:bg-muted' : 'border border-line-soft bg-surface'}`}>
                <p className={`flex items-center gap-2.5 font-mono text-xs ${p.featured ? 'opacity-85' : 'text-ink-soft'}`}>
                  <FolderKanban className={`h-3.5 w-3.5 shrink-0 ${p.featured ? 'text-accent' : 'text-accent-fg'}`} />
                  {projectLimitLabel(p)}
                </p>
                <p className={`flex items-center gap-2.5 font-mono text-xs ${p.featured ? 'opacity-85' : 'text-ink-soft'}`}>
                  <ScanLine className={`h-3.5 w-3.5 shrink-0 ${p.featured ? 'text-accent' : 'text-accent-fg'}`} />
                  {p.scans.toLocaleString('en-US')} AI scans / month
                </p>
              </div>

              <p className={`mt-5 flex items-start gap-2.5 text-sm leading-relaxed flex-1 ${p.featured ? 'opacity-80' : 'text-muted-fg'}`}>
                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${p.featured ? 'text-accent' : 'text-success'}`} />
                The full product. You are only buying project capacity.
              </p>

              {/* THE DOOR IS STILL A WAITLIST, so the button still says so -
                  and this is the bit that survives a trial shipping. There ARE
                  fifteen free days now, and `PRICING_STATUS` under these cards
                  says so; what there is not is a self-serve checkout, so a
                  primary action reading "Start free trial" would still open a
                  request form, which is still a promise the product cannot
                  keep. The trial is a fact about what happens after approval,
                  not a verb on a button. */}
              <Link
                href={appHref(PLAN_CTA_WEB_HREF)}
                className={[
                  'mt-8 inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-6 py-3 font-bold transition-colors',
                  p.featured
                    ? 'bg-accent text-accent-ink hover:bg-accent/90'
                    : 'border border-line text-ink hover:bg-muted',
                ].join(' ')}
              >
                {PLAN_CTA_WEB} <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href={PLAN_CTA_HREF}
                className={`mt-3 text-center text-sm font-semibold underline underline-offset-4 ${p.featured ? 'opacity-70 hover:opacity-100' : 'text-muted-fg hover:text-ink'}`}
              >
                {PLAN_CTA_APP}
              </Link>
            </div>
          )
        })}
      </div>

      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-faint">
        <span className="font-semibold text-muted-fg">{PRICING_STATUS.short}.</span> {PRICING_STATUS.line}
      </p>
    </>
  )
}
