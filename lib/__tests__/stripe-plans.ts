// THE PLANS ARE WRITTEN INTO STRIPE FROM lib/plans.ts, NEVER TYPED.
//
// Six prices typed by hand into a second system is "one fact, one home" broken
// at the till. These check the amounts are the pricing page's own arithmetic,
// that pressing the button twice makes nothing new, that a moved price is
// replaced (old one archived, key transferred) rather than edited, and that the
// public door is still Request access.

import { PLANS, annualTotal, PLAN_CTA_WEB } from '../plans'
import { planPriceSpecs, syncPlansToStripe, lookupKeyFor, productIdFor, type StripeForPlans } from '../stripe-plans'
import { ok, done, code } from './_helpers'

// ── the amounts ─────────────────────────────────────────────────────────────
const specs = planPriceSpecs()
ok(specs.length === PLANS.length * 2, 'two prices per plan, monthly and yearly')
for (const p of PLANS) {
  const m = specs.find(s => s.planKey === p.key && s.interval === 'month')
  const y = specs.find(s => s.planKey === p.key && s.interval === 'year')
  ok(m?.unitAmount === p.monthly * 100, `${p.key} monthly is ${p.monthly} dollars, in cents`)
  ok(y?.unitAmount === annualTotal(p) * 100, `${p.key} yearly is annualTotal (${annualTotal(p)}), not twelve months`)
}
ok(specs.find(s => s.planKey === 'up-to-10' && s.interval === 'year')?.unitAmount === 299000,
  'anchored on a real number: $299 a month is $2,990 a year')

// ── a fake Stripe ───────────────────────────────────────────────────────────
function fake() {
  const products = new Map<string, { id: string; name: string; active: boolean }>()
  const prices: { id: string; product: string; unit_amount: number; currency: string; recurring: { interval: string }; lookup_key: string | null; active: boolean }[] = []
  let n = 0
  const s = {
    products: {
      retrieve: async (id: string) => {
        const p = products.get(id)
        if (!p) throw Object.assign(new Error('No such product'), { code: 'resource_missing', statusCode: 404 })
        return p
      },
      create: async (b: any) => { const p = { id: b.id, name: b.name, active: true }; products.set(b.id, p); return p },
      update: async (id: string, b: any) => { const p = { ...products.get(id)!, ...b }; products.set(id, p); return p },
    },
    prices: {
      list: async (q: any) => ({ data: prices.filter(p => q.lookup_keys.includes(p.lookup_key)) }),
      create: async (b: any) => {
        if (b.transfer_lookup_key) for (const p of prices) if (p.lookup_key === b.lookup_key) p.lookup_key = null
        const p = { id: `price_${++n}`, product: b.product, unit_amount: b.unit_amount, currency: b.currency, recurring: b.recurring, lookup_key: b.lookup_key, active: true }
        prices.push(p); return p
      },
      update: async (id: string, b: any) => { const p = prices.find(x => x.id === id)!; Object.assign(p, b); return p },
    },
  }
  return { s: s as unknown as StripeForPlans, products, prices }
}

;(async () => {
  const f = fake()
  const first = await syncPlansToStripe(f.s)
  ok(first.length === 6 && first.every(r => r.action === 'created'), 'a first press creates all six')
  ok(f.products.size === 3 && f.products.has(productIdFor('up-to-3')), 'one product per plan, under a fixed id')

  const second = await syncPlansToStripe(f.s)
  ok(second.every(r => r.action === 'reused'), 'a second press creates nothing')
  ok(f.prices.length === 6, 'still six prices after pressing twice')
  ok(second.every((r, i) => r.priceId === first[i].priceId), 'and maps the same ids')

  // A price moves in lib/plans.ts.
  const moved = PLANS.map(p => p.key === 'up-to-3' ? { ...p, monthly: 129 } : p)
  const third = await syncPlansToStripe(f.s, moved)
  const m3 = third.find(r => r.planKey === 'up-to-3' && r.interval === 'month')!
  ok(m3.action === 'replaced' && m3.unitAmount === 12900, 'a moved price is replaced with the new amount')
  const old = f.prices.find(p => p.id === first.find(r => r.planKey === 'up-to-3' && r.interval === 'month')!.priceId)!
  ok(!old.active && old.lookup_key === null, 'the old price is archived and gives up its key - existing subscribers keep it')
  ok(f.prices.filter(p => p.lookup_key === lookupKeyFor('up-to-3', 'month')).length === 1, 'the key names exactly one price')
  ok(third.filter(r => r.action === 'reused').length === 4, 'the prices that did not move are left alone')

  // A Stripe failure that is NOT "missing" must not be read as "create it".
  const broken = fake()
  ;(broken.s.products as any).retrieve = async () => { throw Object.assign(new Error('Invalid API key'), { statusCode: 401 }) }
  let threw = false
  try { await syncPlansToStripe(broken.s) } catch { threw = true }
  ok(threw && broken.products.size === 0, 'a bad key throws rather than creating products')

  // ── the route and the screens ─────────────────────────────────────────────
  const route = code('app/api/admin/billing/route.ts')
  const sync = route.slice(route.indexOf("action === 'sync_prices'"))
  ok(sync.indexOf('syncPlansToStripe') > 0 && sync.indexOf('syncPlansToStripe') < sync.indexOf("from('billing_plan_prices')"),
    'the console maps prices only after Stripe answered for all of them')
  ok(route.indexOf("action === 'sync_prices'") > route.indexOf('const g = await gate(request)', route.indexOf('export async function POST')),
    'and only behind the super-admin gate')

  const panel = code('components/settings/billing-panel.tsx')
  ok(/priced\?\.\[plan\.key\]\?\.includes\(interval\)/.test(panel),
    'Settings offers Choose this plan only where that plan has a price on that interval')
  ok(/go\('\/api\/billing\/checkout', \{ plan: plan\.key, interval \}\)/.test(panel), 'and checks out on the interval picked')
  ok(!/interval: 'month' \}\)/.test(panel), 'no longer hardcodes monthly')

  // THE DOOR. Wiring the plans must not open self-serve sign-up.
  ok(PLAN_CTA_WEB === 'Request access', 'the public button still says Request access')
  const cards = code('components/marketing/pricing-plans.tsx')
  ok(!/api\/billing\/checkout/.test(cards), 'the public pricing cards start no checkout')

  done()
})()
