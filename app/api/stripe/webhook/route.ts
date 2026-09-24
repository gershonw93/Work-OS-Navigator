import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type Stripe from 'stripe'
import { stripe, stripeConfigured, stripeTime, webhookConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const maxDuration = 30
// The signature is computed over the EXACT bytes Stripe sent. Any framework
// that parses and re-serialises the body first invalidates it.
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// What Stripe tells us, and the only thing that moves a company onto a plan.
//
// THE APP NEVER MARKS ITSELF PAID. A checkout that returns to a success URL
// proves the browser came back, not that money moved - the customer can close
// the tab, the card can fail on the first invoice, and a subscription can end
// months later with nobody looking. Stripe is the system of record and this is
// the one route that writes what it says.
//
// AN UNVERIFIED BODY IS NOT AN EVENT. This endpoint is public - it has to be -
// so without a signature check anybody who knows the URL could POST a
// subscription into existence for any company id they liked. If the signing
// secret is not configured the route refuses everything rather than trusting
// what it is sent.
// ─────────────────────────────────────────────────────────────────────────────

/** The one place a Stripe subscription is turned into our columns. */
function subscriptionUpdate(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0]
  return {
    status: sub.status === 'active' || sub.status === 'trialing' ? 'active'
      : sub.status === 'past_due' ? 'past_due'
      : 'canceled',
    plan_key: (sub.metadata?.plan_key as string) || null,
    stripe_subscription_id: sub.id,
    stripe_price_id: item?.price?.id ?? null,
    // Stripe moved the period on to the ITEM. Reading it off the subscription
    // returns undefined, which lands as a null renewal date - a screen that
    // then says nothing about when the plan renews.
    current_period_end: stripeTime((item as unknown as { current_period_end?: number })?.current_period_end),
    cancel_at_period_end: !!sub.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }
}

async function companyFor(db: ReturnType<typeof admin>, sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = (sub.metadata?.company_id as string) || null
  if (fromMeta) return fromMeta
  // A subscription created in the Stripe dashboard by hand carries no metadata
  // of ours, so fall back to the customer - which we DID mint, with the
  // company on it.
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  if (!customer) return null
  const { data } = await db.from('company_billing').select('company_id').eq('stripe_customer_id', customer).maybeSingle()
  return (data as { company_id?: string } | null)?.company_id ?? null
}

export async function POST(request: Request) {
  if (!stripeConfigured() || !webhookConfigured()) {
    console.error('[stripe] webhook arrived with no secret configured - refusing')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Unsigned' }, { status: 400 })

  const raw = await request.text()
  let event: Stripe.Event
  try {
    event = stripe()!.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (e: any) {
    console.error('[stripe] signature did not verify', e?.message)
    return NextResponse.json({ error: 'Bad signature' }, { status: 400 })
  }

  const db = admin()

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const companyId = await companyFor(db, sub)
        if (!companyId) {
          // Logged rather than swallowed: a subscription we cannot attribute is
          // money arriving for nobody, and it is invisible unless said here.
          console.error('[stripe] subscription with no company', { id: sub.id })
          break
        }
        const update = event.type === 'customer.subscription.deleted'
          ? { status: 'canceled', cancel_at_period_end: true, updated_at: new Date().toISOString() }
          : subscriptionUpdate(sub)
        const { error } = await db.from('company_billing')
          .upsert({ company_id: companyId, ...update }, { onConflict: 'company_id' })
        if (error) console.error('[stripe] could not write the subscription', error.message)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (!customer) break
        // Only the STATUS moves. A failed payment is not a cancellation, and
        // `billingAccess` keeps a past_due account writable on purpose while
        // Stripe retries - see the comment there.
        const { error } = await db.from('company_billing')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_customer_id', customer)
        if (error) console.error('[stripe] could not mark past due', error.message)
        break
      }

      default:
        break
    }
  } catch (e: any) {
    // A 500 makes Stripe retry, which is right for a transient failure and
    // wrong for a bug - so it is logged with the event id either way.
    console.error('[stripe] handler threw', { type: event.type, id: event.id, message: e?.message })
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
