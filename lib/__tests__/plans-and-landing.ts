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
  PRICING_STATUS, ANNUAL_MONTHS_CHARGED, TRIAL_DAYS, annualTotal, annualPerMonth, annualSaving,
  planPrice, planByKey, projectLimitLabel,
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
// The billing tab is its own component now. It moved when the three invented
// usage bars ("Projects 0 / 10", against a cap no plan has) were replaced with
// counted ones, and every assertion about what the APP prints follows it -
// checking the settings page for a price it no longer renders is an assertion
// that cannot fail.
const settings = code('components/settings/billing-panel.tsx')
const pricing = code('app/(marketing)/pricing/page.tsx')
const cards = code('components/marketing/pricing-plans.tsx')
const layout = code('app/(marketing)/layout.tsx')

for (const [src, name] of [[settings, 'Settings'], [pricing, '/pricing'], [cards, 'the cards'], [layout, 'the JSON-LD']] as const) {
  ok(/from '@\/lib\/plans'/.test(src), `${name} reads the shared list`)
}
ok(!/\$49/.test(settings), 'Settings no longer prints the $49 it invented')
ok(!/Starter Plan|Free during beta/.test(read('app/(dashboard)/settings/page.tsx')),
  '...nor the "Starter Plan" tier that never existed')
// THE BARS THAT MEASURED NOTHING. Three of them, drawn from literals: a cap of
// 5 team members and 10 projects matching no plan, and storage, which this
// product does not meter at all. The numbers are counted server-side now.
ok(!/Team Members|max: 10|max: 5/.test(read('app/(dashboard)/settings/page.tsx')),
  '...nor the hardcoded usage bars, whose caps belonged to no plan we sell')
ok(!/\bStorage\b/.test(settings), 'and nothing meters storage, which was never a thing we sell')
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
// "Poke around the live demo. No signup." three. Neither existed: /signup is a
// Request Access form behind a waitlist, and the only thing called demo in this
// repo is /api/dev/seed-demo, which seeds a database.
//
// A TRIAL EXISTS NOW, AND EXACTLY HALF OF THAT RULE SURVIVES. The fifteen days
// are real, so a page may say so - what has not changed is the DOOR. There is
// still no self-serve signup, so an imperative that tells a stranger to start
// one is still a verb the product cannot honour, and "no signup" and the demo
// are still promises about things that do not exist. This suite pins the
// difference rather than the words, because the words were never the point.
const signup = code('app/(auth)/signup/page.tsx')
ok(/RequestAccessForm/.test(signup),
  'the door really is a request form, which is why an imperative to start a trial is still forbidden')

const FORBIDDEN = [
  { re: /\bstart (?:your |a )?(?:free )?trial\b/i, why: 'tells somebody to start a trial, and there is no self-serve door to start one through' },
  { re: /\blive demo\b/i, why: 'offers a live demo, and there is not one' },
  { re: /\bno signup\b/i, why: 'promises something reachable without signing up' },
  { re: /\bno credit card required\b/i, why: 'implies a checkout somebody is being spared, rather than a door they have to be let through' },
]
for (const [src, name] of [[pricing, '/pricing'], [cards, 'the cards']] as const) {
  for (const f of FORBIDDEN) ok(!f.re.test(src), `${name} ${f.why}`)
}

// ── and any trial length named anywhere is OUR trial length ────────────────
// The check that would have caught the 14, and the one that catches the next
// drift. Not "is 14 absent" - that only ever knew about one wrong number.
//
// IT HAS TO BE ANCHORED ON THE TRIAL, THOUGH, and the first version was not.
// Reading every "N days" out of these files flagged the Help Centre's
// thirty-day insurance window, the two business days before an inspection and
// the three-day countdown - none of which are trials, all of which are correct.
// A check that cries wolf about seven true sentences gets the number changed to
// make it shut up. So the phrases below are the ones that actually CLAIM a
// trial length, and anything matching them is compared with the constant.
//
// The sources go through `code()` where they are modules: lib/plans.ts
// explains in a comment why "14 days" was banned, and a raw scan finds its own
// explanation - the same trap the schedule-cascade suite documents.
const TRIAL_CLAIMS = [
  /(\d+)[- ]days? free/gi,
  /free for (\d+)[- ]days?/gi,
  /(\d+)[- ]day (?:free )?trial/gi,
  /first (\d+) days/gi,
  /trial (?:of |lasts )?(\d+) days/gi,
]
const PUBLIC_COPY: [string, string][] = [
  ['/pricing', pricing],
  ['the cards', cards],
  ['the plans module', code('lib/plans.ts')],
  ['the help centre', code('lib/help/articles.ts')],
  ['the billing panel', settings],
  ['the small-contractor guide', code('lib/guides/articles/construction-management-software-small-contractors.ts')],
  ['the Procore guide', code('lib/guides/articles/procore-alternatives-small-gcs.ts')],
]
for (const [name, src] of PUBLIC_COPY) {
  const wrong: number[] = []
  for (const re of TRIAL_CLAIMS) {
    for (const m of Array.from(src.matchAll(re))) {
      const n = Number(m[1])
      if (Number.isFinite(n) && n !== TRIAL_DAYS) wrong.push(n)
    }
  }
  ok(wrong.length === 0,
    `${name} names no trial length but ours${wrong.length ? ` - found ${wrong.join(', ')} against ${TRIAL_DAYS}` : ''}`)
}
// ...and the number is actually SAID, so the check above cannot be passed by
// copy that has quietly stopped mentioning the trial at all.
ok(new RegExp(`${TRIAL_DAYS} days`).test(PRICING_STATUS.line),
  `the status line names the ${TRIAL_DAYS} days`)
ok(/TRIAL_DAYS/.test(pricing), '/pricing reads the length rather than typing it')
// ...AND A LENGTH SPELLED OUT IN WORDS IS NOT DERIVED FROM ANYTHING. The check
// above only asks whether the file mentions the constant ANYWHERE, so one
// sentence drifting to "fifteen days are free" while three others still
// interpolate slips straight past it - which it did, under a red-check.
// A digit can be interpolated; a word cannot, so a word is the tell.
const SPELLED = /\b(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|thirty)[- ]days?\b/i
for (const [name, src] of PUBLIC_COPY) {
  ok(!SPELLED.test(src),
    `${name} spells no trial length out in words - a word cannot be read from TRIAL_DAYS`)
}
ok(/\b15 days free|first 15 days\b/i.test(code('lib/guides/articles/procore-alternatives-small-gcs.ts')),
  'and a guide that names the price names the trial beside it')

ok(PLAN_CTA_WEB === 'Request access' && PLAN_CTA_WEB_HREF === '/signup',
  'the website button still names the door that exists, and points at it')
ok(PLAN_CTA_HREF === '/contact' && PLAN_CTA_APP === 'Book a setup',
  'and somebody already inside is sent to talk to us, not to request access again')

// ── the price and what it means today travel together ───────────────────────
// A published price inside a product that is free is the $49 bug wearing a
// different hat. One sentence, one home, printed wherever a number is.
// BOTH HALVES, and the halves changed when billing did. It used to have to say
// "free in beta now" and "this is what it will cost"; the first of those stopped
// being true for anybody arriving today, so it says what IS true - invite-only,
// fifteen free days, no card, and then these prices.
ok(/invite-only/i.test(PRICING_STATUS.line), 'the status line still says the door is invite-only')
ok(/no card/i.test(PRICING_STATUS.line), '...and that no card is taken')
ok(!/free while you are in it/i.test(PRICING_STATUS.line),
  '...and no longer claims the whole beta is free, which stopped being true for anybody arriving today')
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
