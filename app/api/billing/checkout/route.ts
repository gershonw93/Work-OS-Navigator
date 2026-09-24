import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { readBilling } from '@/lib/billing-read'
import { planByKey } from '@/lib/plans'
import { stripe, stripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const maxDuration = 30

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Start paying for a plan.
//
// THE PRICE IS LOOKED UP, NEVER TAKEN FROM THE BODY. A caller that could send
// a price id could send any price in the Stripe account, including one for a
// dollar - the same class of hole as taking a role out of a request body.
// The body names a PLAN and an interval; what that costs is ours to say.
export async function POST(request: Request) {
  const gate = await requirePermission(admin(), request, 'settings_billing', 'edit')
  if (denied(gate)) return gate.denied

  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company on this account.' }, { status: 400 })

  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: 'Card payments are not switched on for this environment yet. Talk to us and we will set the plan up by hand.' },
      { status: 503 },
    )
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const planKey = typeof body.plan === 'string' ? body.plan : ''
  const interval = body.interval === 'year' ? 'year' : 'month'

  const plan = planByKey(planKey)
  if (!plan) return NextResponse.json({ error: 'That is not a plan.' }, { status: 400 })

  const db = admin()
  const { data: priceRow } = await db
    .from('billing_plan_prices')
    .select('stripe_price_id')
    .eq('plan_key', plan.key)
    .eq('interval', interval)
    .maybeSingle()

  const priceId = (priceRow as { stripe_price_id?: string } | null)?.stripe_price_id
  // NAMES WHICH ONE IS MISSING. "Could not start checkout" over an unmapped
  // yearly price sends somebody to look at their card.
  if (!priceId) {
    return NextResponse.json(
      { error: `No ${interval === 'year' ? 'yearly' : 'monthly'} price is set up for this plan yet. We will sort it out - nothing has been charged.` },
      { status: 503 },
    )
  }

  const s = stripe()!
  const existing = await readBilling(db, companyId)

  const { data: company } = await db.from('companies').select('name, contact_email').eq('id', companyId).maybeSingle()
  const c = (company as { name?: string; contact_email?: string } | null) ?? null

  // One Stripe customer per company, reused for ever. Minting a second on the
  // next checkout would split one customer's history across two records and
  // leave the portal showing half of it.
  let customerId = existing?.stripe_customer_id ?? null
  if (!customerId) {
    const created = await s.customers.create({
      name: c?.name ?? undefined,
      email: c?.contact_email ?? undefined,
      metadata: { company_id: companyId },
    })
    customerId = created.id
    await db.from('company_billing')
      .upsert({ company_id: companyId, stripe_customer_id: customerId, updated_at: new Date().toISOString() },
        { onConflict: 'company_id' })
  }

  const origin = new URL(request.url).origin
  try {
    const session = await s.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?tab=billing&checkout=done`,
      cancel_url: `${origin}/settings?tab=billing`,
      // BOTH, and on purpose. The session's metadata answers the checkout
      // events; the subscription's answers every renewal, cancellation and
      // failed payment afterwards, which arrive with no session attached. A
      // webhook that cannot name the company is a webhook that does nothing.
      metadata: { company_id: companyId, plan_key: plan.key },
      subscription_data: { metadata: { company_id: companyId, plan_key: plan.key } },
      allow_promotion_codes: true,
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('[stripe] checkout session failed', e?.message)
    return NextResponse.json({ error: 'Stripe would not start the checkout. Nothing has been charged.' }, { status: 502 })
  }
}
