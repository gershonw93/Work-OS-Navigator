'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Gift, Loader2, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useNotice } from '@/components/ui/notice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fetchProblem } from '@/lib/fetch-error'

// ─────────────────────────────────────────────────────────────────────────────
// Who is paying, who is on a trial, and who we have given the product to.
//
// THE FREE-ACCESS CONTROL IS THE POINT OF THIS SCREEN. It is also the one that
// needs a reason typed against it: the row it writes is the only thing that
// can answer "why has this company never been charged" six weeks from now,
// and nobody types a reason into a field that does not ask for one. The route
// refuses a blank one, so this form does too - at the FIELD, before sending.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  company_id: string
  company_name: string
  status: string
  plan_name: string | null
  state: string
  writable: boolean
  reason: string
  days_left: number | null
  comped_reason: string | null
  comped_by_name: string | null
  stripe_subscription_id: string | null
}

interface Price { plan_key: string; interval: string; stripe_price_id: string }
interface PlanRow { key: string; name: string; monthly: number }

const STATE_TONES: Record<string, string> = {
  paid: 'bg-success-tint text-success',
  trial: 'bg-muted text-ink-soft',
  comped: 'bg-info-tint text-info',
  overdue: 'bg-danger-tint text-danger',
  locked: 'bg-danger-tint text-danger',
  unmetered: 'bg-muted text-faint',
}

async function headers(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const t = data?.session?.access_token
  return t ? { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` } : { 'Content-Type': 'application/json' }
}

export default function AdminBillingPage() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [problem, setProblem] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [stripe, setStripe] = useState<{ configured: boolean; mode: string | null; webhook: boolean } | null>(null)
  const [comping, setComping] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const notice = useNotice()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/billing', { headers: await headers() })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(body?.error ?? 'Could not load billing.'); setState('failed'); return }
      setRows(body.companies ?? [])
      setPrices(body.prices ?? [])
      setPlans(body.plans ?? [])
      setStripe(body.stripe ?? null)
      setState('ready')
    } catch (e) {
      setProblem(fetchProblem(e, 'load billing')); setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function post(body: unknown, done: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/billing', { method: 'POST', headers: await headers(), body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { notice(out?.error ?? 'That did not save.'); return false }
      notice(done, { tone: 'success' })
      await load()
      return true
    } catch (e) {
      notice(fetchProblem(e, 'save that')); return false
    } finally { setBusy(false) }
  }

  if (state === 'loading') {
    return <p className="flex items-center gap-2 text-sm text-muted-fg"><Loader2 className="h-4 w-4 animate-spin" /> Loading billing...</p>
  }
  if (state === 'failed') {
    return (
      <div className="rounded-xl border border-warn/30 bg-warn-tint p-4">
        <p className="text-sm text-ink">{problem}</p>
        <Button variant="outline" onClick={load} className="mt-3 gap-2"><RefreshCw className="h-4 w-4" /> Try again</Button>
      </div>
    )
  }

  const priceFor = (key: string, interval: string) =>
    prices.find(p => p.plan_key === key && p.interval === interval)?.stripe_price_id ?? ''

  return (
    <div className="space-y-8">
      {/* ── the connection ─────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink">Stripe</h2>
        {/* TEST vs LIVE is said out loud. "Connected" over a test key is the
            most expensive thing this screen could imply - real customers
            paying into a mode that will never settle. */}
        {!stripe?.configured ? (
          <div className="rounded-xl border border-warn/30 bg-warn-tint p-4 text-sm text-ink">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <span>
                No Stripe key on this environment, so nothing can be charged and the
                app hides every checkout button. Add <code className="rounded bg-muted px-1">STRIPE_SECRET_KEY</code> and{' '}
                <code className="rounded bg-muted px-1">STRIPE_WEBHOOK_SECRET</code> in Vercel, then redeploy.
              </span>
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-panel p-4 text-sm">
            <p className="flex items-center gap-2 text-ink">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Connected in
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${stripe.mode === 'live' ? 'bg-success-tint text-success' : 'bg-warn-tint text-warn'}`}>
                {stripe.mode === 'live' ? 'LIVE' : 'TEST'} mode
              </span>
            </p>
            {!stripe.webhook && (
              <p className="mt-2 text-xs text-warn">
                No webhook secret, so nothing Stripe says will be written back - a customer could pay
                and stay on a trial. Point a webhook at /api/stripe/webhook and set STRIPE_WEBHOOK_SECRET.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── plan → price mapping ───────────────────────────────────────── */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-ink">Which Stripe price is which plan</h2>
        <p className="mb-3 text-xs text-muted-fg">
          Create the prices in Stripe, then paste the ids here - no deploy needed. A plan with no price
          cannot be bought, and the app says so rather than failing at the till.
        </p>
        <div className="space-y-3">
          {plans.map(plan => (
            <div key={plan.key} className="rounded-xl border border-line bg-panel p-4">
              <p className="mb-2 text-sm font-semibold text-ink">{plan.name} <span className="font-normal text-muted-fg">- ${plan.monthly}/mo</span></p>
              <div className="grid gap-3 sm:grid-cols-2">
                {(['month', 'year'] as const).map(interval => (
                  <div key={interval}>
                    <Label className="lg:text-xs">{interval === 'month' ? 'Monthly' : 'Yearly'} price id (optional)</Label>
                    <Input
                      defaultValue={priceFor(plan.key, interval)}
                      placeholder="price_..."
                      onBlur={e => {
                        const v = e.target.value.trim()
                        if (v === priceFor(plan.key, interval)) return
                        post({ action: 'price', plan_key: plan.key, interval, stripe_price_id: v },
                          v ? 'Price saved.' : 'Price cleared.')
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── the companies ──────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-1 text-sm font-semibold text-ink">Companies</h2>
        <p className="mb-3 text-xs text-muted-fg">
          Only real tenants appear - a Directory row for a sub or an inspector has no billing record
          and is never metered.
        </p>
        <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel">
          {rows.map(r => (
            <div key={r.company_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                    <span className="truncate">{r.company_name}</span>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONES[r.state] ?? 'bg-muted text-ink-soft'}`}>
                      {r.state}
                    </span>
                    {!r.writable && (
                      <span className="whitespace-nowrap rounded-full bg-danger-tint px-2 py-0.5 text-xs font-medium text-danger">
                        read-only
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-fg">{r.reason || r.plan_name || '-'}</p>
                  {r.comped_reason && (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-faint">
                      <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{r.comped_reason}{r.comped_by_name ? ` - ${r.comped_by_name}` : ''}</span>
                    </p>
                  )}
                </div>
                <div className="row-even lg:flex lg:flex-wrap gap-2">
                  {r.state === 'comped' ? (
                    <Button variant="outline" disabled={busy}
                      onClick={() => post({ action: 'uncomp', company_id: r.company_id }, 'Free access ended - they are on a fresh trial.')}>
                      End free access
                    </Button>
                  ) : (
                    <Button variant="outline" disabled={busy}
                      onClick={() => { setComping(r.company_id); setReason('') }}>
                      Give free access
                    </Button>
                  )}
                  <Button variant="outline" disabled={busy}
                    onClick={() => post({ action: 'extend', company_id: r.company_id, days: 15 }, 'Trial extended by 15 days.')}>
                    +15 days
                  </Button>
                </div>
              </div>

              {comping === r.company_id && (
                <div className="mt-3 rounded-lg border border-line bg-surface p-3">
                  <Label htmlFor={`why-${r.company_id}`}>Why are they getting it free? *</Label>
                  <Input id={`why-${r.company_id}`} value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Design partner, ran the beta with us, paying by invoice..." />
                  <p className="mt-1 text-xs text-faint">
                    This is the only record of the decision - it is what answers the question in six weeks.
                  </p>
                  <div className="row-even lg:flex lg:flex-wrap mt-3 gap-2">
                    <Button disabled={busy} onClick={async () => {
                      // Asked at the FIELD with the same rule the route uses, so
                      // the refusal is on the control rather than arriving as a
                      // failed request.
                      if (!reason.trim()) { notice('Say why - the row is the only record of it.'); return }
                      const ok = await post({ action: 'comp', company_id: r.company_id, reason: reason.trim() }, 'Free access granted.')
                      if (ok) setComping(null)
                    }}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Give free access
                    </Button>
                    <Button variant="outline" onClick={() => setComping(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && <p className="p-4 text-sm text-muted-fg">No companies have a billing record yet.</p>}
        </div>
      </section>
    </div>
  )
}
