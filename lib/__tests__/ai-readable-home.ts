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

import { ok, done, read, code, walk, exists } from './_helpers'
import { SYTENAV_DEFINITION } from '../definition'
import { HOME_FAQ, faqJsonLd, FAQ_PRICING, FAQ_AI_SCAN } from '../marketing-faq'
import { PLANS, TRIAL_DAYS } from '../plans'
import { MOCK_IMAGES } from '../../components/marketing/mock-images'
import { SAMPLE_PROJECTS, SAMPLE_SUMMARY } from '../../components/marketing/sample-company'
import { FLOWS } from '../flows'

// ── the definition: one sentence, one home, every surface ────────────────────
ok(/^SyteNav is construction management software for general contractors and subcontractors/.test(SYTENAV_DEFINITION),
  'the definition names the category in its first words')
for (const f of ['components/marketing/scroll-hero.tsx', 'app/(marketing)/about/page.tsx', 'app/(marketing)/layout.tsx', 'app/(marketing)/page.tsx']) {
  ok(/SYTENAV_DEFINITION/.test(code(f)), `${f} prints the one definition`)
}
ok(!walk('app').concat(walk('components')).some(f => /\.tsx?$/.test(f) && read(f).includes('turns quotes into budgets, schedules the field')),
  'nobody retyped the definition - it is imported, never copied')

// ── the hero: words first, one screen, and the screen is a PICTURE ─────────
// Round two of the report: aria-hidden + data-nosnippet did not take the mock
// out of a fetch, which still returned the sidebar and nine cards of "0, $0".
const hero = code('components/marketing/scroll-hero.tsx')
const h1At = hero.indexOf('<h1')
const defAt = hero.indexOf('{SYTENAV_DEFINITION}')
const ctaAt = hero.indexOf('Request access')
const mockAt = hero.indexOf('<ProjectsMock')
ok(h1At > 0 && mockAt > 0, 'the hero has an h1 and the Projects screen (the scan can see both)')
ok(h1At < defAt && defAt < ctaAt && ctaAt < mockAt, 'DOM order is h1, definition, buttons, THEN the screen')
ok(hero.match(/<h1/g)?.length === 1, 'exactly one h1 in the hero - no phone/desktop twin')
ok(hero.match(/<ProjectsMock/g)?.length === 1, 'exactly one Projects screen - no phone/desktop twin')
ok(!/ProjectsScreen/.test(hero), 'the hero never renders the live HTML screen')
// No stray words: the browser address and the scroll hint are drawn by CSS.
ok(!/>\s*Scroll\s*</.test(hero) && /content-\['Scroll'\]/.test(hero), '"Scroll" is not a word in the page')
ok(!/>\s*app\.sytenav\.com\/projects\s*</.test(hero), 'the fake address bar is not a word in the page')

// Every static mock the site shows is an image of its *Screen, with alt text.
const pictures: [string, string][] = [
  ['projects', 'ProjectsMock'], ['quote-scan', 'QuoteScanMock'], ['money', 'MoneyMock'],
  ['schedule', 'ScheduleMock'], ['compare', 'CompareMock'],
]
for (const [name, comp] of pictures) {
  const src = code(`components/marketing/${name}-mock.tsx`)
  const body = src.slice(src.indexOf(`export function ${comp}(`))
  ok(src.includes(`export function ${comp}(`) && /<MockImage\s+name="/.test(body.slice(0, 400)) && /alt="SyteNav /.test(body.slice(0, 400)),
    `${comp} renders the picture, with alt text`)
}
ok(/<DashboardImage \/>/.test(code('app/(marketing)/page.tsx')) && !/<DashboardMock/.test(code('app/(marketing)/page.tsx')),
  'the homepage shows the dashboard as a picture')
for (const name of Object.keys(MOCK_IMAGES)) {
  for (const v of ['desktop', 'mobile']) for (const t of ['light', 'dark']) {
    ok(exists(`public/marketing/mocks/${name}-${v}-${t}.webp`), `the ${name} ${v} ${t} render is committed`)
  }
}
ok(Object.keys(MOCK_IMAGES).length === 6, 'six mocks are rendered (the scan can see the manifest)')
ok(/MockImage[\s\S]*alt: theme === 'light' \? alt : ''/.test(code('components/marketing/mock-image.tsx')),
  'the dark copy of a picture carries no alt, so the description is read once')
ok(/NODE_ENV !== 'development'\) notFound\(\)/.test(code('app/dev-render/[mock]/page.tsx')),
  'the render stage is a 404 in any deployed build')

// One picture, once. The quote scan was on the homepage twice, word for word.
const homeAndTabs = code('app/(marketing)/page.tsx') + code('components/marketing/feature-tabs.tsx')
ok((homeAndTabs.match(/<QuoteScanMock/g) ?? []).length === 1, 'the quote scan appears once on the homepage')

// One company: the dashboard's numbers are the Projects screen's numbers.
const dash = code('components/marketing/dashboard-mock.tsx')
ok(/from '\.\/sample-company'/.test(dash) && /from '\.\/sample-company'/.test(code('components/marketing/projects-mock.tsx')),
  'both screens read the one sample company')
ok(!/'\$4\.2M'|value: '18'|· 18 /.test(dash), 'no hand-typed dashboard totals left')
ok(SAMPLE_SUMMARY.activeCount === SAMPLE_PROJECTS.filter(p => p.status === 'active').length && SAMPLE_SUMMARY.activeCount > 0,
  'active count is derived from the listed jobs')
ok(SAMPLE_PROJECTS.every(p => p.tasks > 0 && p.done <= p.tasks) && SAMPLE_PROJECTS.some(p => p.paid > 0),
  'the sample jobs have real progress and money - not an abandoned account')
for (const f of ['components/marketing/dashboard-mock.tsx', 'components/marketing/money-mock.tsx', 'app/(marketing)/workflow/page.tsx']) {
  const jobs = code(f).match(/(?:Sample|Demo) [A-Z][A-Za-z-]+(?: [A-Z][A-Za-z-]+)*/g) ?? []
  ok(jobs.every(j => SAMPLE_PROJECTS.some(p => p.name === j)), `${f} names only jobs the sample company has`)
}

// No real-sounding customers in any picture of the app.
const mocks = walk('components/marketing').filter(f => f.endsWith('.tsx'))
const named = ['Summit Medical', 'Maple Street', 'Harborview', 'Nassau Street', 'Bergen Logistics']
ok(mocks.length > 5, 'the mock scan can see the marketing components')
// code(), not read(): the comments explaining why a name went may say it.
for (const n of named) ok(!mocks.some(f => code(f).includes(n)), `no mock names "${n}"`)
for (const f of mocks.filter(f => /-mock\.tsx$/.test(f))) {
  ok(!/<h[1-6][\s>]/.test(code(f)), `${f} has no real headings`)
}

// ── the rest of the homepage text ───────────────────────────────────────────
const home = code('app/(marketing)/page.tsx')
ok(!/\$25k|8 apps|'Zero'|8\+ → 1/.test(home), 'no unsourced statistics in the problem section')
ok(!home.includes(`title="${FLOWS[0].title}"`), 'the flow section heading is not the flow card heading again')
ok(/All rights reserved\.<\/span>\s*\{' '\}/.test(code('components/marketing/marketing-footer.tsx')),
  'the footer text has a space between its two halves')

// One story about what it costs.
for (const f of ['components/marketing/cta-band.tsx', 'app/(marketing)/layout.tsx', 'lib/marketing-faq.ts', 'app/(marketing)/pricing/page.tsx']) {
  ok(!/free while (you'?(&apos;)?re in it|in beta)/i.test(code(f)), `${f} does not say "free while in beta"`)
}
ok(/\{TRIAL_DAYS\} days are free/.test(code('components/marketing/cta-band.tsx')), 'the CTA band states the trial from TRIAL_DAYS')

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
const offline = HOME_FAQ.find(f => /offline/i.test(f.q))!.a
ok(/^No\./.test(offline), 'offline is answered honestly: no')
ok(!/back in range|lose what you typed|installed app/i.test(offline), '...without advice not to use it, or an install claim iPhone cannot honour')
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
