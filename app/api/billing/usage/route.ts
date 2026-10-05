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
    // A company we have comped is told so. A screen that simply showed no
    // charge would leave somebody wondering whether billing was broken.
    //
    // AND THE NAME IS ONLY SENT WHEN A PERSON IS BEHIND IT. `comped_by` is the
    // FK to profiles: the platform console sets it along with the name, and
    // migration 118 left it NULL while writing 'Migration 118' into the name
    // column - so every one of our customers read "set up by Migration 118",
    // on the web as well as the phone. The attribution is still OURS to see:
    // /admin/billing prints `comped_by_name` whatever this does, which is
    // where the audit answer to "why has this company never been charged"
    // belongs. A machine's name is not an answer a customer can use.
    comped: access.state === 'comped'
      ? {
        reason: row?.comped_reason ?? null,
        by: row?.comped_by ? (row?.comped_by_name ?? null) : null,
        until: row?.comped_until ?? null,
      }
      : null,
    // Whether there is anywhere to send them. A "Choose a plan" button with no
    // Stripe behind it is a verb the product cannot honour.
    stripeReady: stripeConfigured(),
    hasSubscription: !!row?.stripe_subscription_id,
  })
}
