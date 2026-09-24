import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { readBilling } from '@/lib/billing-read'
import { stripe, stripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const maxDuration = 30

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The card, the invoices and cancelling - all of it is Stripe's own portal.
//
// Deliberately not rebuilt in here. A card form of our own means PCI scope,
// and a cancel button of our own means a second place that has to agree with
// Stripe about what a subscription's state is.
export async function POST(request: Request) {
  const gate = await requirePermission(admin(), request, 'settings_billing', 'edit')
  if (denied(gate)) return gate.denied

  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company on this account.' }, { status: 400 })
  if (!stripeConfigured()) {
    return NextResponse.json({ error: 'Card payments are not switched on for this environment yet.' }, { status: 503 })
  }

  const row = await readBilling(admin(), companyId)
  // NOT the same sentence as "not configured". A company that has never paid
  // has no customer record to open, and telling them the portal is broken
  // would send them chasing us instead of choosing a plan.
  if (!row?.stripe_customer_id) {
    return NextResponse.json({ error: 'There is nothing to manage yet - this account has never been billed.' }, { status: 400 })
  }

  const origin = new URL(request.url).origin
  try {
    const session = await stripe()!.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${origin}/settings?tab=billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('[stripe] portal session failed', e?.message)
    return NextResponse.json({ error: 'Stripe would not open the billing portal. Nothing has changed on the account.' }, { status: 502 })
  }
}
