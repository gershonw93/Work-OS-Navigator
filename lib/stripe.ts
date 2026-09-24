import Stripe from 'stripe'

// ─────────────────────────────────────────────────────────────────────────────
// Stripe, which is OURS - the platform's account, not a customer's.
//
// NOT TO BE CONFUSED WITH THE QUICKBOOKS CONNECTION, which is per company and
// points the other way: a GC connects their own QuickBooks file and SyteNav
// pushes their invoices into it. This is one account, ours, and it is how
// SyteNav gets paid. Two integrations, two directions, and the word
// "connected" means something different in each - which is exactly the kind of
// pair of near-identical names this codebase has been bitten by before.
//
// THE SECRET LIVES IN THE ENVIRONMENT. The price IDs do not: they are not
// secret, they are created in the Stripe dashboard by whoever sets the prices,
// and putting them in `billing_plan_prices` means adding a plan is a paste
// into the platform console rather than a deploy.
//
// NOT CONFIGURED IS A NORMAL STATE, not an error. Every environment that is
// not production runs without a key, and every caller has to cope - the same
// rule the QuickBooks push follows.
// ─────────────────────────────────────────────────────────────────────────────

let client: Stripe | null = null

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}

export function stripe(): Stripe | null {
  if (!stripeConfigured()) return null
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // Pinned deliberately. Stripe changes response shapes between versions,
      // and "whatever the account default is today" is a shape that can move
      // under a deployed app without anybody touching this repo.
      apiVersion: '2026-08-26.dahlia',
      appInfo: { name: 'SyteNav' },
    })
  }
  return client
}

/** Whether the app can verify that a webhook really came from Stripe. */
export function webhookConfigured(): boolean {
  return !!process.env.STRIPE_WEBHOOK_SECRET
}

/**
 * Is this a live key or a test one?
 *
 * Shown in the platform console beside the connection, because the one thing
 * worse than not being connected is being connected to the wrong account and
 * watching real customers pay into a test mode that will never settle.
 */
export function stripeMode(): 'live' | 'test' | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  return key.startsWith('sk_live_') || key.startsWith('rk_live_') ? 'live' : 'test'
}

/** Seconds since the epoch, as Stripe sends dates, into an ISO timestamp. */
export function stripeTime(seconds: number | null | undefined): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return null
  return new Date(seconds * 1000).toISOString()
}
