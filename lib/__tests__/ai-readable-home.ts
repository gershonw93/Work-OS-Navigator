// The homepage as a crawler or a language model reads it.
//
// Reported from a crawl of the live site, four things at once:
//   - the h1 is a tagline, so nothing on the page said WHAT SyteNav is;
//   - the hero's Projects screen sat ABOVE the h1 in the DOM, so the first
//     words read were "Maple Street Residences";
//   - that screen rendered TWICE (a phone hero and a desktop hero, swapped by
//     CSS), so the invented project list - addresses and client names, among
//     them "Summit Medical Group" - was the page's longest run of body copy,
//     and a model could list an invented client as a customer;
//   - no FAQ, so the questions people actually ask had no answer to lift.
// Each of those is pinned below, and checked to be able to fail.

import { ok, done, read, code, walk } from './_helpers'
import { SYTENAV_DEFINITION } from '../definition'
import { HOME_FAQ, faqJsonLd, FAQ_PRICING, FAQ_AI_SCAN } from '../marketing-faq'
import { PLANS, TRIAL_DAYS } from '../plans'

// ── the definition: one sentence, one home, every surface ────────────────────
ok(/^SyteNav is construction management software for general contractors and subcontractors/.test(SYTENAV_DEFINITION),
  'the definition names the category in its first words')
for (const f of ['components/marketing/scroll-hero.tsx', 'app/(marketing)/about/page.tsx', 'app/(marketing)/layout.tsx', 'app/(marketing)/page.tsx']) {
  ok(/SYTENAV_DEFINITION/.test(code(f)), `${f} prints the one definition`)
}
ok(!walk('app').concat(walk('components')).some(f => /\.tsx?$/.test(f) && read(f).includes('turns quotes into budgets, schedules the field')),
  'nobody retyped the definition - it is imported, never copied')

// ── the hero: words first, one screen, and the screen is not content ─────────
const hero = code('components/marketing/scroll-hero.tsx')
const h1At = hero.indexOf('<h1')
const defAt = hero.indexOf('{SYTENAV_DEFINITION}')
const ctaAt = hero.indexOf('Request access')
const mockAt = hero.indexOf('<ProjectsMock')
ok(h1At > 0 && mockAt > 0, 'the hero has an h1 and the Projects screen (the scan can see both)')
ok(h1At < defAt && defAt < ctaAt && ctaAt < mockAt, 'DOM order is h1, definition, buttons, THEN the screen')
ok(hero.match(/<h1/g)?.length === 1, 'exactly one h1 in the hero - no phone/desktop twin')
ok(hero.match(/<ProjectsMock/g)?.length === 1, 'exactly one Projects screen - no phone/desktop twin')
const mockWrap = hero.slice(ctaAt, mockAt)
ok(/aria-hidden="true"\s+data-nosnippet/.test(mockWrap),
  'the screen sits inside an aria-hidden, data-nosnippet wrapper')

// No real-sounding customers in any picture of the app.
const mocks = walk('components/marketing').filter(f => f.endsWith('.tsx'))
const named = ['Summit Medical', 'Maple Street', 'Harborview', 'Nassau Street', 'Bergen Logistics']
ok(mocks.length > 5, 'the mock scan can see the marketing components')
// code(), not read(): the comments explaining why a name went may say it.
for (const n of named) ok(!mocks.some(f => code(f).includes(n)), `no mock names "${n}"`)
// No headings inside a mock: a heading is what a crawler treats as structure.
for (const f of mocks.filter(f => /-mock\.tsx$/.test(f))) {
  ok(!/<h[1-6][\s>]/.test(code(f)), `${f} has no real headings`)
}
for (const f of ['quote-scan', 'money', 'schedule', 'compare'].map(n => `components/marketing/${n}-mock.tsx`)) {
  ok(/aria-hidden="true" data-nosnippet/.test(code(f)), `${f} is hidden from crawlers`)
}

// ── the FAQ: on both pages, with schema built from what is shown ────────────
ok(/<FaqSection items=\{HOME_FAQ\}/.test(code('app/(marketing)/page.tsx')), 'the homepage renders the FAQ')
ok(/<FaqSection items=\{FAQ\}/.test(code('app/(marketing)/pricing/page.tsx')), 'the pricing page renders its FAQ through the same block')
ok(/faqJsonLd\(items\)/.test(code('components/marketing/faq.tsx')) && /\{f\.a\}/.test(code('components/marketing/faq.tsx')),
  'the block prints the answer and the schema from the same items')
const ld = faqJsonLd(HOME_FAQ)
ok(ld['@type'] === 'FAQPage' && ld.mainEntity.length === HOME_FAQ.length, 'FAQPage carries every question')
ok(ld.mainEntity.every((e, i) => e.acceptedAnswer.text === HOME_FAQ[i].a), 'each schema answer IS the visible answer')
const asks = HOME_FAQ.map(f => f.q.toLowerCase()).join(' | ')
for (const t of ['what is sytenav', 'who is', 'cost', 'offline', 'ai scanning', 'procore', 'buildertrend']) {
  ok(asks.includes(t), `the homepage FAQ answers "${t}"`)
}
// Numbers are derived. Moving a price must move the answer.
ok(PLANS.every(p => FAQ_PRICING.a.includes(`$${p.monthly}`)), 'the price answer prints every plan price from lib/plans.ts')
ok(FAQ_PRICING.a.includes(`${TRIAL_DAYS} days`), 'the price answer names the trial from TRIAL_DAYS')
ok(PLANS.every(p => FAQ_AI_SCAN.a.includes(String(p.scans))), 'the scanning answer prints every allowance from lib/plans.ts')
ok(!/\$\d/.test(read('lib/marketing-faq.ts').replace(/\$\{/g, '')), 'no price is typed into lib/marketing-faq.ts')
ok(/^No\./.test(HOME_FAQ.find(f => /offline/i.test(f.q))!.a), 'offline is answered honestly: no')
ok(!/coming soon/i.test(read('lib/marketing-faq.ts').replace(/\/\/.*$/gm, '')), 'no "coming soon" in the FAQ')

// ── structured data and robots ───────────────────────────────────────────────
const layout = code('app/(marketing)/layout.tsx')
ok(/'@type': 'Organization'/.test(layout) && /'@type': 'SoftwareApplication'/.test(layout),
  'Organization and SoftwareApplication nodes ship on every marketing page')
const robots = code('app/robots.ts')
for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
  ok(robots.includes(`'${bot}'`), `robots names ${bot}...`)
}
ok(/userAgent: AI_CRAWLERS, allow: \['\/'\], disallow \}/.test(robots), '...and ALLOWS them, with the same private-path list as everyone')
ok(!/disallow: '\/'/.test(robots.slice(robots.indexOf('isHelpHost(host)'))), 'nothing past the non-canonical-host branch refuses the whole site')

done()
