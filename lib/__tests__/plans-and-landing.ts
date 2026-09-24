// Two small ones the tester found, both the same shape as everything else:
// two sources for one fact.
//
// 1. Opening a job from the Projects list landed on Plans - a file list as the
//    front door of a live job. /projects/<id> has redirected to the Overview for
//    a while; the one screen everybody opens jobs from was linking past it.
// 2. The website offered Crew / Company / Scale with NO prices and an FAQ headed
//    "Why is there no price on this page?". The app's Settings -> Billing
//    offered Starter / Pro / Enterprise and put $49 / mo on the middle one. The
//    product was quoting a price the business had decided not to publish.
//
//    Prices are published now - three tiers that meter ACTIVE PROJECTS, same
//    product on all of them - which does not retire that bug, it sharpens it.
//    Two screens print the same numbers, the annual figures are arithmetic
//    rather than copy, and the product is still free in a beta whose door is a
//    waitlist. So this suite pins three things: one list, derived annual maths,
//    and no button whose verb the product cannot honour. The draft pricing copy
//    arrived carrying "Start free trial - 14 days. No card." and "Poke around
//    the live demo", neither of which exists.

import {
  PLANS, PLAN_FEATURES, PLAN_CTA_HREF, PLAN_CTA_APP, PLAN_CTA_WEB, PLAN_CTA_WEB_HREF,
  PRICING_STATUS, ANNUAL_MONTHS_CHARGED, annualTotal, annualPerMonth, annualSaving, planPrice,
} from '../plans'
import { ok, done, code, read } from './_helpers'

// ── opening a job lands on the overview ──────────────────────────────────────
const list = code('app/(dashboard)/projects/page.tsx')
ok(/is_site \? `\/projects\/\$\{p\.id\}\/units` : `\/projects\/\$\{p\.id\}`/.test(list),
  'the projects list opens a job at /projects/<id>, which redirects to the overview')
ok(!/`\/projects\/\$\{p\.id\}\/plans`/.test(list), '...and no longer links straight to Plans')

const index = code('app/(dashboard)/projects/[id]/page.tsx')
ok(/redirect\(`\/projects\/\$\{params\.id\}\/overview`\)/.test(index), 'that redirect still points at the overview')

// The overview sends a subcontractor or a site on to Plans itself, which is why
// the list can link to /projects/<id> without knowing who is looking.
const overview = code('app/(dashboard)/projects/[id]/overview/page.tsx')
ok(/router\.replace\(`\/projects\/\$\{params\.id\}\/plans`\)/.test(overview),
  'and anyone without an overview is still sent on to Plans')

const created = code('app/(dashboard)/projects/new/page.tsx')
ok(/router\.push\(`\/projects\/\$\{project\.id\}`\)/.test(created), 'a job you just created opens there too')

// ── ONE plans list, and every screen reads the same numbers ─────────────────
// It used to name no price at all, because the website named none and the app
// invented $49. Now it names three, and the risk moves: two screens printing
// the same number, and a third place quietly restating it as prose.
ok(PLANS.length === 3, 'there are three plans')
ok(PLANS.map(p => p.monthly).join(',') === '99,299,499',
  'they are the published ones - $99, $299, $499 a month')
ok(!/\bPro\b|Starter|Enterprise|Crew|Company|Scale/.test(JSON.stringify(PLANS.map(p => p.name))),
  'and the old invented tier names are gone - the tiers are capacity, not feature sets')
ok(PLANS.filter(p => p.featured).length === 1, 'exactly one plan is highlighted')

// THE TIERS SELL CAPACITY, NOT FEATURES. There is one product, so there is one
// feature list. A per-plan `features` array is how a "$99 plan is not a
// stripped-down version" promise quietly stops being true.
ok(!('features' in (PLANS[0] as any)) && !('limits' in (PLANS[0] as any)),
  'a plan carries no feature list of its own')
ok(PLAN_FEATURES.length > 0, '...there is one shared list instead')

// ── the annual arithmetic is DERIVED ────────────────────────────────────────
// The copy quotes "$82.50/month" and "Save $198 a year". Both fall out of the
// monthly price; a stored copy of either goes stale silently on the next price
// change, the same way a stored "6 min read" does.
ok(ANNUAL_MONTHS_CHARGED === 10, 'annual is ten months charged for twelve served')
for (const p of PLANS) {
  ok(annualTotal(p) === p.monthly * 10, `${p.monthly}: the annual total is ten months`)
  ok(annualSaving(p) === p.monthly * 12 - annualTotal(p),
    `${p.monthly}: the saving is twelve monthly charges minus the annual one`)
  ok(Math.abs(annualPerMonth(p) - annualTotal(p) / 12) < 1e-9,
    `${p.monthly}: the per-month figure divides the annual total by twelve, not by ten`)
}
// The three figures the draft copy hardcoded, checked against the arithmetic
// that now produces them.
ok(planPrice(annualPerMonth(PLANS[0])) === '$82.50', 'the $99 plan reads $82.50 a month annually')
ok(planPrice(annualTotal(PLANS[1])) === '$2,990', '...the $299 plan is $2,990 a year')
ok(planPrice(annualSaving(PLANS[2])) === '$998', '...and the $499 plan saves $998')
// A per-month figure that does NOT divide evenly - $2,990 over twelve is
// $249.1666... - is the case the rounding rule exists for, and the one a
// hand-typed copy gets wrong. It was absent while every plan divided neatly.
ok(planPrice(annualPerMonth(PLANS[1])) === '$249.17',
  '...and a price that does not divide by twelve keeps its cents, rounded UP to the customer\'s favour')

// Money prints its cents only when it has some - $99, not $99.00; but $82.50,
// never $83. Rounding a saving DOWN is a number a customer can catch you on.
ok(planPrice(99) === '$99' && planPrice(82.5) === '$82.50' && planPrice(3990) === '$3,990',
  'prices print cents only when there are cents, with thousands separated')

// ── no screen restates a number it could read ───────────────────────────────
const settings = code('app/(dashboard)/settings/page.tsx')
const pricing = code('app/(marketing)/pricing/page.tsx')
const cards = code('components/marketing/pricing-plans.tsx')
const layout = code('app/(marketing)/layout.tsx')

for (const [src, name] of [[settings, 'Settings'], [pricing, '/pricing'], [cards, 'the cards'], [layout, 'the JSON-LD']] as const) {
  ok(/from '@\/lib\/plans'/.test(src), `${name} reads the shared list`)
}
ok(!/\$49/.test(settings), 'Settings no longer prints the $49 it invented')
for (const [src, name] of [[settings, 'Settings'], [cards, 'the cards']] as const) {
  ok(!/\$\s?\d{2,}/.test(src),
    `${name} prints no price of its own - every number comes off the plan`)
}
// The hero's "start at $99" is prose about the cheapest plan, so it is allowed
// to say so - but nowhere may restate the annual figures, which are computed.
ok(!/82\.50|249\.17|415\.83|2,990|4,990|\$198|\$598|\$998/.test(pricing + cards + settings),
  'THE DERIVED ONES: no screen hardcodes a per-month or a saving')

// ── a button promises what pressing it does ─────────────────────────────────
// The draft copy carried "Start free trial - 14 days. No card." four times and
// "Poke around the live demo. No signup." three. Neither exists: /signup is a
// Request Access form behind a waitlist, and the only thing called demo in this
// repo is /api/dev/seed-demo, which seeds a database. A verb on a button is a
// promise about what happens when it is pressed.
const signup = code('app/(auth)/signup/page.tsx')
ok(/RequestAccessForm/.test(signup),
  'the door really is a request form, so this check is about the product and not the copy')
// The forbidden claims are AFFIRMATIVE ones. Denying them is fine, and in fact
// what the page does - "no card on file and no trial clock running" is the
// honest sentence. An earlier version of this check flagged that very line for
// sitting near the word "card", and the version before THAT was `!/No card/`,
// which passed only because the page writes it lower-case mid-sentence: an
// assertion that could not fail for the thing it named.
const FORBIDDEN = [
  { re: /\bfree trial\b/i, why: 'offers a free trial, and there is no trial to start' },
  { re: /\bstart (?:your |a )?(?:free )?trial\b/i, why: 'tells somebody to start a trial' },
  { re: /\b14[- ]day\b/i, why: 'names a trial length' },
  { re: /\blive demo\b/i, why: 'offers a live demo, and there is not one' },
  { re: /\bno signup\b/i, why: 'promises something reachable without signing up' },
]
for (const [src, name] of [[pricing, '/pricing'], [cards, 'the cards']] as const) {
  for (const f of FORBIDDEN) ok(!f.re.test(src), `${name} ${f.why}`)
}
// And the page still says the TRUE version, so this suite cannot be passed by
// deleting every mention of what the beta costs.
ok(/no card/i.test(pricing) && /invite-only beta/i.test(pricing),
  '...while still saying plainly that the beta takes no card, which is the honest half of what the draft was reaching for')
ok(PLAN_CTA_WEB === 'Request access' && PLAN_CTA_WEB_HREF === '/signup',
  'the website button names the door that exists, and points at it')
ok(PLAN_CTA_HREF === '/contact' && PLAN_CTA_APP === 'Book a setup',
  'and somebody already inside the beta is sent to talk to us, not to request access again')

// ── the price and what it means today travel together ───────────────────────
// A published price inside a product that is free is the $49 bug wearing a
// different hat. One sentence, one home, printed wherever a number is.
ok(/beta/i.test(PRICING_STATUS.line) && /will cost/.test(PRICING_STATUS.line),
  'the status line says both halves: free in beta now, this is what it will cost')
for (const [src, name] of [[pricing, '/pricing'], [cards, 'the cards'], [settings, 'Settings']] as const) {
  ok(/PRICING_STATUS/.test(src), `${name} prints the status beside the numbers`)
}
// `code()` strips `//` to end of line, which eats most of an https:// URL - so
// this one reads the raw file. Same trap that made two assertions in the
// project-site suite unfailable.
ok(/LimitedAvailability/.test(read('app/(marketing)/layout.tsx')),
  'and the structured data still says limited availability rather than advertising a plan you can buy')
ok(/lowPrice/.test(layout) && !/don't publish a list price/.test(layout),
  "...while no longer claiming we publish no price, which stopped being true")

done()
