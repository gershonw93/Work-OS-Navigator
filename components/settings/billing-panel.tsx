'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CreditCard, Gift, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useNotice } from '@/components/ui/notice'
import type { Meter } from '@/lib/plan-limits'
import { fetchProblem } from '@/lib/fetch-error'
import {
  PLANS, PLAN_FEATURES, PLAN_CTA_HREF, PLAN_CTA_APP, PRICING_STATUS,
  annualTotal, annualSaving, planPrice, projectLimitLabel, type Plan,
} from '@/lib/plans'
import { Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Where this company actually is: what it is entitled to, and what it has used.
//
// WHAT WAS HERE BEFORE. A card reading "Starter Plan / Free during beta" over
// a tier that does not exist, and three progress bars: "Team Members 3 / 5",
// "Projects 0 / 10", "Storage 0 / 5 GB". The 0s were literals in the JSX, the
// caps matched no plan we sell, and storage is not something this product
// meters at all. Somebody with nine live jobs saw an empty bar.
//
// Every number below is counted server-side at the moment it is asked, and a
// number we could not get is NOT drawn as zero - see the three states.
// ─────────────────────────────────────────────────────────────────────────────

interface Access {
  state: 'unmetered' | 'trial' | 'paid' | 'comped' | 'overdue' | 'locked'
  writable: boolean
  reason: string
  daysLeft: number | null
  planKey: string | null
}

interface Picture {
  access: Access
  badge: { label: string; tone: 'ok' | 'warn' | 'danger' | 'quiet' } | null
  meters: Meter[]
  countedLabel: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  comped: { reason: string | null; by: string | null; until: string | null } | null
  stripeReady: boolean
  hasSubscription: boolean
}

const BADGE_TONES = {
  ok: 'bg-success-tint text-success',
  warn: 'bg-warn-tint text-warn',
  danger: 'bg-danger-tint text-danger',
  quiet: 'bg-muted text-ink-soft',
} as const

const BAR_TONES = { ok: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger' } as const

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const token = data?.session?.access_token
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function MeterRow({ meter }: { meter: Meter }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink-soft">{meter.label}</span>
        <span className={`font-semibold tabular-nums ${meter.tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
          {meter.used.toLocaleString('en-US')}
          {meter.limit === null
            ? <span className="ml-1 font-normal text-muted-fg">of unlimited</span>
            : <span className="ml-1 font-normal text-muted-fg">/ {meter.limit.toLocaleString('en-US')}</span>}
        </span>
      </div>
      {/* No bar where there is no limit. A full-width bar under "unlimited"
          invents a ceiling to be measured against. */}
      {meter.pct !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full transition-all ${BAR_TONES[meter.tone]}`} style={{ width: `${meter.pct}%` }} />
        </div>
      )}
      <p className="mt-1 text-xs text-faint">{meter.note}</p>
    </div>
  )
}

export function BillingPanel({ canBuy }: { canBuy: boolean }) {
  // THREE FACTS, not one falsy value. "Still asking" and "could not ask" render
  // differently on purpose: a failed read that drew an empty meter would tell
  // somebody they had used none of their allowance.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [picture, setPicture] = useState<Picture | null>(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')
  const notice = useNotice()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/billing/usage', { headers: await authHeaders() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setProblem(body?.error ?? 'We could not read your plan just now.')
        setState('failed')
        return
      }
      setPicture(body as Picture)
      setState('ready')
    } catch (e) {
      setProblem(fetchProblem(e, 'read your plan'))
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function go(path: string, body?: unknown) {
    setBusy(path)
    try {
      const res = await fetch(path, { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body ?? {}) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out?.url) {
        notice(out?.error ?? 'We could not open the payment page. Nothing has been charged.')
        return
      }
      window.location.href = out.url as string
    } catch (e) {
      notice(fetchProblem(e, 'open the payment page'))
    } finally {
      setBusy('')
    }
  }

  if (state === 'loading') {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-fg">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking your plan...
        </CardContent>
      </Card>
    )
  }

  if (state === 'failed' || !picture) {
    return (
      <Card className="border-warn/30">
        <CardContent className="py-6">
          <p className="flex items-start gap-2 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            {/* Says what it does NOT know. The old card would have drawn
                "0 / 10" here and looked entirely confident about it. */}
            <span>{problem} Your plan and your usage are unchanged - this screen just could not read them.</span>
          </p>
          <Button variant="outline" onClick={load} className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Try again
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { access, badge, meters, comped } = picture

  return (
    <div className="space-y-6">
      <Card className={access.state === 'locked' || access.state === 'overdue' ? 'border-danger/40' : undefined}>
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-ink">
                  {access.state === 'comped' ? 'Free access'
                    : access.state === 'trial' ? 'Free trial'
                    : picture.access.planKey ? 'On a plan'
                    : access.state === 'locked' ? 'No plan' : 'Your account'}
                </p>
                {badge && (
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_TONES[badge.tone]}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              {/* The sentence and the badge come off ONE answer, so a calm
                  badge can never sit over an alarming sentence. */}
              <p className="mt-1 text-sm text-muted-fg">{access.reason}</p>
              {comped?.reason && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-faint">
                  <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{comped.reason}{comped.by ? ` - set up by ${comped.by}` : ''}</span>
                </p>
              )}
            </div>
          </div>

          {/* No route to buying anything inside the iOS app - see
              lib/use-native.ts. Plan changes happen on the web. */}
          {canBuy ? (
            <div className="row-even lg:flex lg:flex-wrap gap-2">
              {picture.hasSubscription ? (
                <Button variant="outline" onClick={() => go('/api/billing/portal')} disabled={busy !== ''} className="gap-2">
                  {busy === '/api/billing/portal' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  Manage billing
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-faint">Manage your plan at sytenav.com</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where you are up to</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {meters.map(m => <MeterRow key={m.key} meter={m} />)}
        </CardContent>
      </Card>

      {/* Plans. FROM lib/plans.ts, the same list the pricing page renders.
          This used to be its own hardcoded set - Starter / Pro / Enterprise,
          different limits, and $49 / mo on the middle one. */}
      <div>
        <h3 className="mb-1 text-base font-semibold text-ink">Plans</h3>
        {/* THE NUMBERS AND WHAT THEY MEAN TRAVEL TOGETHER - one sentence, from
            lib/plans.ts, so the app and the website cannot drift. */}
        <p className="mb-4 text-sm text-muted-fg">{PRICING_STATUS.line}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map(plan => (
            <div key={plan.key}
              className={`rounded-xl border p-5 ${plan.featured ? 'border-accent bg-accent-tint' : 'border-line bg-panel'}`}>
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="font-semibold text-ink">{plan.name}</p>
                {plan.featured && (
                  <span className="whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-fg">
                    Most popular
                  </span>
                )}
              </div>
              <p className="mb-3 text-sm text-muted-fg">{plan.who}</p>
              <p className="text-2xl font-bold tracking-tight text-ink">
                {planPrice(plan.monthly)}
                <span className="ml-1 text-sm font-semibold text-muted-fg">/month</span>
              </p>
              {/* Derived, both of them - see lib/plans.ts. */}
              <p className="mt-0.5 text-xs text-faint">
                or {planPrice(annualTotal(plan))}/year, saving {planPrice(annualSaving(plan))}
              </p>
              <ul className="mt-3 space-y-1.5">
                <li className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent-fg" />
                  {projectLimitLabel(plan)}
                </li>
                <li className="flex items-center gap-2 text-sm font-medium text-ink-soft">
                  <Check className="h-3.5 w-3.5 shrink-0 text-accent-fg" />
                  {plan.scans.toLocaleString('en-US')} AI scans / month
                </li>
              </ul>
              <PlanAction
                plan={plan}
                canBuy={canBuy}
                stripeReady={picture.stripeReady}
                current={access.planKey === plan.key}
                busy={busy}
                onChoose={() => go('/api/billing/checkout', { plan: plan.key, interval: 'month' })}
              />
            </div>
          ))}
        </div>
        {/* ONE product, so the features are a shared list rather than a
            per-plan one. Printing them inside each card implied the cheapest
            tier was missing something. */}
        <div className="mt-4 rounded-xl border border-line bg-panel p-5">
          <p className="mb-3 text-sm font-semibold text-ink">
            Every plan is the whole product - you are only buying project capacity.
          </p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {PLAN_FEATURES.map(f => (
              <li key={f.t} className="flex items-start gap-2 text-sm text-muted-fg">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                {f.t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/**
 * The button on a plan card, and what it can honestly say.
 *
 * FOUR ANSWERS, because a verb on a button is a promise about what pressing it
 * does. Inside the iOS app there is no route to buying anything at all; with
 * no Stripe key there is nothing behind a checkout and the honest door is the
 * one that has always been there; on the plan you are already on there is
 * nothing to press. Only the last case can say "Choose this plan" - and it
 * says so because pressing it really opens a checkout.
 */
function PlanAction({ plan, canBuy, stripeReady, current, busy, onChoose }: {
  plan: Plan
  canBuy: boolean
  stripeReady: boolean
  current: boolean
  busy: string
  onChoose: () => void
}) {
  if (current) {
    return (
      <p className="mt-4 rounded-lg border border-line bg-surface py-2 text-center text-sm font-medium text-ink-soft">
        Your plan
      </p>
    )
  }
  if (!canBuy || !stripeReady) {
    return (
      <a href={PLAN_CTA_HREF}
        className="mt-4 block w-full rounded-lg border border-line py-2 text-center text-sm font-medium text-ink-soft hover:bg-surface">
        {PLAN_CTA_APP}
      </a>
    )
  }
  return (
    <Button onClick={onChoose} disabled={busy !== ''} variant={plan.featured ? 'default' : 'outline'}
      className="mt-4 w-full gap-2">
      {busy === '/api/billing/checkout' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      Choose this plan
    </Button>
  )
}
