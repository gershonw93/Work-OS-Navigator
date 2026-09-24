import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { billingPicture } from '@/lib/billing-read'
import { usageMeters, COUNTED_PROJECT_LABEL } from '@/lib/plan-limits'
import { accessBadge } from '@/lib/billing-state'
import { stripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Where a company actually IS - the numbers the billing screen draws.
//
// Every figure here is COUNTED at the moment it is asked. The card this
// replaces drew three bars from literals in the JSX: "Projects 0 / 10" on a
// company with nine live jobs, and a cap belonging to no plan we sell.
export async function GET(request: Request) {
  const gate = await requirePermission(admin(), request, 'settings_billing', 'view')
  if (denied(gate)) return gate.denied

  const companyId = gate.actor.companyId
  if (!companyId) {
    return NextResponse.json({ error: 'No company on this account.' }, { status: 400 })
  }

  const db = admin()
  const { row, access, entitlement, usage } = await billingPicture(db, companyId)

  return NextResponse.json({
    access: {
      state: access.state,
      writable: access.writable,
      reason: access.reason,
      daysLeft: access.daysLeft,
      planKey: access.plan?.key ?? null,
    },
    badge: accessBadge(access),
    entitlement,
    usage,
    meters: usageMeters(usage, entitlement),
    countedLabel: COUNTED_PROJECT_LABEL,
    trialEndsAt: row?.trial_ends_at ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: !!row?.cancel_at_period_end,
    // A company we have comped is told so, and told who by. A screen that
    // simply showed no charge would leave somebody wondering whether billing
    // was broken.
    comped: access.state === 'comped'
      ? { reason: row?.comped_reason ?? null, by: row?.comped_by_name ?? null, until: row?.comped_until ?? null }
      : null,
    // Whether there is anywhere to send them. A "Choose a plan" button with no
    // Stripe behind it is a verb the product cannot honour.
    stripeReady: stripeConfigured(),
    hasSubscription: !!row?.stripe_subscription_id,
  })
}
