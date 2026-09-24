import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { billingAccess, trialEnd } from '@/lib/billing-state'
import { PLANS, planByKey, TRIAL_DAYS } from '@/lib/plans'
import { stripeConfigured, stripeMode, webhookConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// Who is paying, who is not, and who we have decided does not have to.
//
// SUPER ADMIN ONLY, and gated BEFORE the body is read - no field in a request
// is a permission. Same rule as the demo console, and for a sharper reason:
// this route can hand a company the product for nothing, or take it away.
//
// EVERY GRANT CARRIES A NAME AND A REASON, and neither is optional. Six weeks
// later somebody asks why this account has never been charged, and a row
// reading `comped` with nothing against it cannot answer. The reason is asked
// for at the door rather than encouraged in a comment.
// ─────────────────────────────────────────────────────────────────────────────

async function gate(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isSuperAdmin(user.email)) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, user }
}

export async function GET(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied
  const { db } = g

  const [{ data: rows }, { data: companies }, { data: prices }] = await Promise.all([
    db.from('company_billing').select('*'),
    db.from('companies').select('id, name'),
    db.from('billing_plan_prices').select('plan_key, interval, stripe_price_id'),
  ])

  const names: Record<string, string> = {}
  for (const c of (companies ?? []) as { id: string; name: string }[]) names[c.id] = c.name

  // Only companies that ARE tenants appear. A Directory row has no billing
  // record and is not a customer; listing every sub in the product here would
  // bury the twenty accounts that matter under hundreds that never will.
  const list = ((rows ?? []) as any[]).map(r => {
    const access = billingAccess(r)
    return {
      company_id: r.company_id,
      company_name: names[r.company_id] ?? '(deleted company)',
      status: r.status,
      plan_key: r.plan_key,
      plan_name: planByKey(r.plan_key)?.name ?? null,
      state: access.state,
      writable: access.writable,
      reason: access.reason,
      days_left: access.daysLeft,
      trial_ends_at: r.trial_ends_at,
      current_period_end: r.current_period_end,
      comped_reason: r.comped_reason,
      comped_by_name: r.comped_by_name,
      comped_until: r.comped_until,
      stripe_customer_id: r.stripe_customer_id,
      stripe_subscription_id: r.stripe_subscription_id,
    }
  }).sort((a, b) => a.company_name.localeCompare(b.company_name))

  return NextResponse.json({
    companies: list,
    prices: prices ?? [],
    plans: PLANS.map(p => ({ key: p.key, name: p.name, monthly: p.monthly })),
    trialDays: TRIAL_DAYS,
    // The connection, said plainly. "Connected" over a TEST key is the single
    // most expensive thing this screen could imply.
    stripe: {
      configured: stripeConfigured(),
      mode: stripeMode(),
      webhook: webhookConfigured(),
    },
  })
}

export async function POST(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied
  const { db, user } = g

  const body = await request.json().catch(() => ({} as any))
  const action = String(body.action ?? '')

  // ── give a company the product for nothing ────────────────────────────────
  if (action === 'comp') {
    const companyId = String(body.company_id ?? '')
    const reason = String(body.reason ?? '').trim()
    if (!companyId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })
    // Asked for at the door, not hoped for. This is the whole audit trail.
    if (!reason) return NextResponse.json({ error: 'Say why this company is getting free access - it is the only record of it.' }, { status: 400 })

    const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const until = typeof body.until === 'string' && body.until ? new Date(body.until).toISOString() : null

    const { error } = await db.from('company_billing').upsert({
      company_id: companyId,
      status: 'comped',
      comped_by: user.id,
      comped_by_name: (me as { full_name?: string } | null)?.full_name ?? user.email ?? null,
      comped_reason: reason,
      comped_at: new Date().toISOString(),
      comped_until: until,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── take it away again ────────────────────────────────────────────────────
  //
  // Back onto a TRIAL, not straight to locked. Ending a favour is a
  // conversation, and dropping somebody into a read-only app the instant a
  // toggle moves is not one. The reason is kept - the record of what we did
  // has to outlive the doing of it.
  if (action === 'uncomp') {
    const companyId = String(body.company_id ?? '')
    if (!companyId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })
    const days = Number.isFinite(Number(body.days)) && Number(body.days) > 0 ? Number(body.days) : TRIAL_DAYS
    const now = new Date()
    const { error } = await db.from('company_billing').update({
      status: 'trialing',
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnd(now, days).toISOString(),
      comped_until: now.toISOString(),
      updated_at: now.toISOString(),
    }).eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, days })
  }

  // ── give somebody longer ──────────────────────────────────────────────────
  if (action === 'extend') {
    const companyId = String(body.company_id ?? '')
    const days = Number(body.days)
    if (!companyId) return NextResponse.json({ error: 'Which company?' }, { status: 400 })
    if (!Number.isFinite(days) || days <= 0) return NextResponse.json({ error: 'How many days?' }, { status: 400 })
    const now = new Date()
    const { error } = await db.from('company_billing').upsert({
      company_id: companyId,
      status: 'trialing',
      trial_ends_at: trialEnd(now, days).toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: 'company_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ── which Stripe price is which plan ──────────────────────────────────────
  if (action === 'price') {
    const planKey = String(body.plan_key ?? '')
    const interval = body.interval === 'year' ? 'year' : 'month'
    const priceId = String(body.stripe_price_id ?? '').trim()
    if (!planByKey(planKey)) return NextResponse.json({ error: 'That is not a plan.' }, { status: 400 })
    if (!priceId) {
      const { error } = await db.from('billing_plan_prices').delete().eq('plan_key', planKey).eq('interval', interval)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, cleared: true })
    }
    // A price id, not a product id. They differ by one letter at the front and
    // a checkout built on the wrong one fails at the till rather than here.
    if (!priceId.startsWith('price_')) {
      return NextResponse.json({ error: 'A Stripe price id starts with price_ - prod_ is the product it belongs to.' }, { status: 400 })
    }
    const { error } = await db.from('billing_plan_prices').upsert(
      { plan_key: planKey, interval, stripe_price_id: priceId, updated_at: new Date().toISOString() },
      { onConflict: 'plan_key,interval' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
