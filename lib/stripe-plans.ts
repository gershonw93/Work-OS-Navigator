import type Stripe from 'stripe'
import { PLANS, annualTotal, type Plan, type PlanKey } from '@/lib/plans'

// ─────────────────────────────────────────────────────────────────────────────
// The plans, written into Stripe FROM lib/plans.ts.
//
// The platform console asked whoever set up billing to create six prices by
// hand in the Stripe dashboard and paste six ids back - $99, $299, $499 a
// month, and ten months of each for a year. Typed twice, by hand, into a
// second system: "one fact, one home" broken at the till, where a yearly price
// typed as $299 instead of $2,990 charges a customer a tenth of the price for a
// year, and nobody notices until the renewal.
//
// So the amounts are DERIVED here, exactly as the pricing page derives them
// (`annualTotal`), and one press of "Create the prices in Stripe" makes them.
//
// IDEMPOTENT, so pressing it twice is harmless:
//   - each plan's product has a FIXED id (`sytenav_up_to_3`), retrieved before
//     it is created;
//   - each price carries a lookup key (`sytenav_up-to-3_month`) and is found by
//     it. A Stripe price's amount can never change, so when lib/plans.ts moves
//     a price the old one is ARCHIVED and a new one takes over the lookup key.
//     Existing subscribers stay on what they agreed to - archiving a price does
//     not touch a subscription - and only new checkouts get the new number.
//
// WHAT THIS DOES NOT DO: open the door. `/signup` is still Request access;
// nothing here lets a stranger buy anything. These prices are what an approved
// company's trial converts on from Settings -> Billing.
// ─────────────────────────────────────────────────────────────────────────────

export type Interval = 'month' | 'year'

export interface PlanPriceSpec {
  planKey: PlanKey
  interval: Interval
  /** In CENTS, as Stripe takes it. */
  unitAmount: number
  lookupKey: string
  productId: string
  productName: string
}

export const productIdFor = (key: PlanKey): string => `sytenav_${key.replace(/-/g, '_')}`
export const lookupKeyFor = (key: PlanKey, interval: Interval): string => `sytenav_${key}_${interval}`

/** Dollars to cents without a float ever reaching Stripe. */
const cents = (dollars: number): number => Math.round(dollars * 100)

/** Every price the plans need, derived. Two per plan. */
export function planPriceSpecs(plans: Plan[] = PLANS): PlanPriceSpec[] {
  return plans.flatMap(p => (['month', 'year'] as const).map(interval => ({
    planKey: p.key,
    interval,
    unitAmount: cents(interval === 'month' ? p.monthly : annualTotal(p)),
    lookupKey: lookupKeyFor(p.key, interval),
    productId: productIdFor(p.key),
    productName: `SyteNav - ${p.name}`,
  })))
}

export interface SyncedPrice {
  planKey: PlanKey
  interval: Interval
  priceId: string
  unitAmount: number
  /** What happened, so the console can say it. */
  action: 'reused' | 'created' | 'replaced'
}

/** The narrow slice of the Stripe client this needs - small enough to fake. */
export type StripeForPlans = {
  products: Pick<Stripe['products'], 'retrieve' | 'create' | 'update'>
  prices: Pick<Stripe['prices'], 'list' | 'create' | 'update'>
}

async function ensureProduct(s: StripeForPlans, spec: PlanPriceSpec): Promise<void> {
  try {
    const existing = await s.products.retrieve(spec.productId)
    if (existing.name !== spec.productName || !existing.active) {
      await s.products.update(spec.productId, { name: spec.productName, active: true })
    }
  } catch (e: any) {
    // Only MISSING means create. Anything else (a bad key, Stripe down) must
    // stop here rather than be read as "there is no product".
    if (e?.code !== 'resource_missing' && e?.statusCode !== 404) throw e
    await s.products.create({ id: spec.productId, name: spec.productName })
  }
}

/**
 * Make every plan's prices exist in Stripe, and say what each one is.
 *
 * Throws on a Stripe failure - the caller writes nothing to the database
 * unless all six came back, so a half-made set is never mapped.
 */
export async function syncPlansToStripe(s: StripeForPlans, plans: Plan[] = PLANS): Promise<SyncedPrice[]> {
  const specs = planPriceSpecs(plans)
  const done = new Set<string>()
  for (const spec of specs) {
    if (done.has(spec.productId)) continue
    await ensureProduct(s, spec)
    done.add(spec.productId)
  }

  const out: SyncedPrice[] = []
  for (const spec of specs) {
    const { data } = await s.prices.list({ lookup_keys: [spec.lookupKey], limit: 1 })
    const current = data[0]
    const matches = current
      && current.active
      && current.unit_amount === spec.unitAmount
      && current.currency === 'usd'
      && current.recurring?.interval === spec.interval
      && (typeof current.product === 'string' ? current.product : current.product?.id) === spec.productId
    if (current && matches) {
      out.push({ planKey: spec.planKey, interval: spec.interval, priceId: current.id, unitAmount: spec.unitAmount, action: 'reused' })
      continue
    }
    const created = await s.prices.create({
      product: spec.productId,
      currency: 'usd',
      unit_amount: spec.unitAmount,
      recurring: { interval: spec.interval },
      lookup_key: spec.lookupKey,
      // Moves the key off the old price in the same call, so there is never a
      // moment where the key names nothing or names two.
      transfer_lookup_key: true,
      metadata: { plan_key: spec.planKey },
    })
    if (current && current.active) await s.prices.update(current.id, { active: false })
    out.push({
      planKey: spec.planKey, interval: spec.interval, priceId: created.id, unitAmount: spec.unitAmount,
      action: current ? 'replaced' : 'created',
    })
  }
  return out
}
