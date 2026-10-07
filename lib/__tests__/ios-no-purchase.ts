import { ok, done, read, code, walk, readCombined, migrationFiles } from './_helpers'
import { canSignUpHere, canShowPricing } from '../use-native'
import { HELP_ARTICLES, getArticle, helpArticleAllowed } from '../help/articles'

// ─────────────────────────────────────────────────────────────────────────────
// NO WAY TO BUY A PLAN INSIDE THE iOS APP.
//
// Apple's 3.1.1 wants anything that unlocks features in an app sold through
// In-App Purchase, and the anti-steering rules restrict pointing somewhere else
// instead. SyteNav sells on the web, so the iOS build offers no purchase, names
// no price, and shows no control that leads to one.
//
// `lib/use-native.ts` has carried this policy since the sign-up door was shut
// and had NO TEST FILE AT ALL - the module holding an App Store decision was
// the one thing nothing checked. This is that file.
//
// The half that was missed: the plan grid, $99 / $299 / $499 with a CTA on
// every card, rendered on iOS the whole time. Only the purchase VERBS were
// swapped.
// ─────────────────────────────────────────────────────────────────────────────

// ── the policy, and the one switch ──────────────────────────────────────────
ok(canSignUpHere('ios') === false, 'iOS cannot sign up or buy')
ok(canSignUpHere('web') === true, 'the web can')
ok(canSignUpHere('android') === true, 'and so can Android - this is an Apple rule')

const native = code('lib/use-native.ts')
ok((native.match(/IOS_SIGNUP_ALLOWED/g) ?? []).length >= 2,
  'IOS_SIGNUP_ALLOWED is declared and read, so flipping it is the whole change')
ok(/canSignUpHere\(platform\)/.test(native),
  'the pricing gate is built ON the sign-up answer rather than restating it')

// ── THE ASYMMETRY, which is why it is its own function ──────────────────────
// Detection can only answer after mount, so the first paint always believes it
// is on the web. Sign-up guesses permissively through that window; a PRICE
// cannot, because showing one inside the app is the mistake you cannot take
// back. This is the assertion a flash-of-prices bug trips.
ok(canShowPricing('web', false) === false,
  'THE POINT: no price until we KNOW the platform, even on the web')
ok(canShowPricing('web', true) === true, '...and then the web shows them')
ok(canShowPricing('ios', true) === false, 'iOS never shows them')
ok(canShowPricing('android', true) === true, 'Android does')
ok(canShowPricing('web', false) !== canSignUpHere('web'),
  'the two gates DISAGREE while unready - collapsing them makes one of them wrong')

// ── the billing screen ──────────────────────────────────────────────────────
const panel = code('components/settings/billing-panel.tsx')
ok(/useCanShowPricing\(\)/.test(panel), 'the billing screen asks the shared gate')

const gateAt = panel.indexOf('{showPlans && (')
ok(gateAt > 0, 'the plan grid is behind it')
ok(panel.indexOf('PLANS.map') > gateAt, '...and the grid itself is inside the gate')
ok(panel.indexOf('planPrice(plan.monthly)') > gateAt, '...prices included')
// The RENDER site, not the import at the top of the file - which sits above
// the gate and would satisfy this check while the grid was still showing.
ok(panel.indexOf('<PlanAction') > gateAt, '...and the CTA on every plan card')

// WHAT MUST STAY VISIBLE. Usage is a fact about your own account, not an offer,
// and on a phone it is the most useful thing on the screen.
ok(panel.indexOf('meters.map') < gateAt, 'the usage meters sit above the gate')
ok(panel.indexOf('access.reason') < gateAt, 'and so does what state the account is in')
// POSITION IS NOT ENOUGH: a second `showPlans &&` wrapped around the meters
// leaves them exactly where they were and hides them anyway, which the two
// checks above pass happily. So the gate is counted - its declaration and ONE
// use - and the meters are asserted to render unconditionally.
ok((panel.match(/showPlans/g) ?? []).length === 2,
  'there is ONE gate in the file, so nothing else got hidden behind it')
ok(/\{meters\.map\(/.test(panel), 'the meters render with no gate in front of them')

// And the WEB screen stays honest, which is what three other suites read this
// file for. Hidden, not extracted: a file that no longer renders a price also
// no longer fails a check about printing the wrong one.
ok(/from '@\/lib\/plans'/.test(panel), 'the prices still come off the shared list')
ok(/PRICING_STATUS/.test(panel), '...and still travel with the sentence saying what they mean')

// ── the banner that rides over every screen ─────────────────────────────────
const banner = code('components/layout/billing-banner.tsx')
ok(/useCanShowPricing\(\)/.test(banner), 'the banner asks the same gate')
// A CONTROL MUST LEAD TO THE THING IT NAMES. Every link into the billing tab
// is behind the gate - counted, because one of the two states is easy to miss.
const links = (banner.match(/href="\/settings\?tab=billing"/g) ?? []).length
const gates = (banner.match(/canBuy \?/g) ?? []).length
ok(links > 0 && links === gates,
  `every billing link in the banner is gated (${links} links, ${gates} gates)`)
// The worst of the three: it opens a screen where the card button is hidden.
const failedAt = banner.indexOf("'Update the card'")
ok(failedAt > 0 && banner.lastIndexOf('canBuy ?', failedAt) > 0,
  '"Update the card" is gated - it promises the one thing iOS cannot do')

// ── the Help article that prints prices ─────────────────────────────────────
const article = getArticle('plans-and-pricing')
ok(!!article, 'the pricing article is still there')
ok(article?.webOnly === true, '...and marked web-only')
ok(HELP_ARTICLES.filter(a => a.webOnly).length === 1,
  'exactly one article is web-only, so the flag means what it says')

ok(helpArticleAllowed(article, true) === true, 'the web may read it')
ok(helpArticleAllowed(article, false) === false, 'iOS may not')
ok(helpArticleAllowed(getArticle('client-portal'), false) === true,
  'and every other article is unaffected')
ok(helpArticleAllowed(undefined, true) === false, 'an unknown slug is not allowed by default')

// FIVE DOORS, ASSERTED ONE BY ONE. A hide that covers the browse list and not
// the deep link is a price list one URL away - so each is checked on its own
// rather than in aggregate, which any single working door would satisfy.
const help = code('app/(dashboard)/help/page.tsx')
ok(/useCanShowPricing\(\)/.test(help), 'the help page asks the gate')
ok(/allowed\(getArticle\(a\)\)/.test(help), 'door 1: the ?a= deep link')
ok(/searchArticles\(query\)\.filter\(allowed\)/.test(help), 'door 2: search results')
ok(/allowed\(open_\) \? open_ : null/.test(help), 'door 3: the article on screen')
ok(/articlesByCategory\(cat\.key\)\.filter\(allowed\)/.test(help), 'door 4: the category list')
ok(/HELP_ARTICLES\.filter\(allowed\)\.length/.test(help),
  'door 5: the count under them, which would otherwise disagree with the list')
// Anchored on the `related` expression, not merely on the helper's name being
// somewhere in the file - the `allowed` callback above mentions it too, so a
// loose match passes with the related list wide open.
ok(/const related = [\s\S]{0,200}helpArticleAllowed/.test(help),
  'and a related link cannot reach it either')

// Six release notes link straight at it.
const whatsNew = code('app/(dashboard)/whats-new/page.tsx')
ok(/item\.help && helpArticleAllowed\(getArticle\(item\.help\), pricingAllowed\)/.test(whatsNew),
  "What's new cannot link into a hidden article")

// ── AND IT DOES NOT NAME THE WEBSITE EITHER ─────────────────────────────────
// Hiding the prices and then printing directions to the shop is the steering
// the rules are actually about, and it undoes the whole change in one sentence.
// The panel used to say "Manage your plan at sytenav.com" and the banner "At
// sytenav.com" in each of its two states.
//
// AND SO DID THE TWO AUTH SCREENS, which this check used to exempt. The
// carve-out was written here in as many words - that signup and login name the
// domain DELIBERATELY, because getting an ACCOUNT is not buying anything - and
// Apple ruled against it: build 1.0 (14) came back under 3.1.1 while /signup
// still read "Head to sytenav.com on a computer or in your browser to get
// started". The exemption the whole arrangement rests on is 3.1.3(f) (Free
// Stand-alone Apps), which holds only while there is no purchasing in the app
// AND NO CALL TO ACTION TO PURCHASE OUTSIDE IT - and a reviewer does not have
// to accept our distinction between "create an account" and "buy". It was
// false as well as risky: that door is a Request Access waitlist behind an
// invite token, so nobody ever "got started" there. All four surfaces now.
//
// `code()` STRIPS COMMENTS, which is what makes this readable at all: each of
// the four files explains the sentence it no longer prints.
const authFiles = [
  ['app/(auth)/signup/page.tsx', 'the signup screen'],
  ['app/(auth)/login/page.tsx', 'the login screen'],
] as const
const noWebsite = [
  [panel, 'the billing card'],
  [banner, 'the banner'],
  ...authFiles.map(([f, n]) => [code(f), n] as const),
] as const

for (const [src, name] of noWebsite) {
  ok(!/sytenav\.com/.test(src), `${name} does not send anybody to the website`)
  ok(!/\bon the web\b|in your browser|on a computer/i.test(src),
    `${name} does not describe the way round either`)
}

// Asserted via what the auth screens DO still say, so a screen that has lost
// its explanation cannot pass this by printing nothing. The way in is an
// invitation, and that is the sentence standing where the domain used to be.
for (const [file, name] of authFiles) {
  ok(/invitation|invite you/i.test(code(file)),
    `${name} still says how somebody actually gets in`)
}
// It says NOTHING rather than something wrong: `settings_billing` is denied to
// every role but admin, so the only reader is the person who set the billing
// up. Asserted via what is still there, so an empty card cannot pass.
ok(/access\.reason/.test(panel) && /meters\.map/.test(panel),
  'the card still states the plan and the usage - silence about buying is not silence')

// ── A MACHINE'S NAME IS NOT AN ATTRIBUTION ──────────────────────────────────
// Migration 118 comped every pre-billing company and wrote 'Migration 118'
// into `comped_by_name`, leaving `comped_by` NULL. All 20 rows carried it, so
// every customer read "set up by Migration 118" - on the web too, because this
// note renders above the native gate.
const usage = code('app/api/billing/usage/route.ts')
ok(/by: row\?\.comped_by \? \(row\?\.comped_by_name \?\? null\) : null/.test(usage),
  'the comp attribution is sent ONLY when a person granted it')
ok(/comped_by\?: string \| null/.test(code('lib/billing-read.ts')),
  '...and the actor column is declared, not merely selected')
// The audit is untouched - it just lives where staff read it.
ok(/comped_by_name/.test(code('app/admin/billing/page.tsx')),
  'the platform console still prints who comped a company')
ok(/comped\.reason/.test(panel), 'and the customer still gets told why they are free')

// The sentence itself was written for the staff console and shown to customers.
const OLD_REASON = 'in the product before billing existed'
ok(!readCombined().includes(OLD_REASON),
  'a fresh install no longer writes the staff sentence into a customer-facing column')
ok(readCombined().includes("Beta - free while you''re in it"),
  '...it writes the one addressed to the reader')
ok(migrationFiles().some(f => /^125_/.test(f)),
  'and migration 125 repaired the rows the old one already made')

// ── CLAIM VS CAPABILITY, over the whole app ─────────────────────────────────
// The generalising pin: a screen printing a purchase verb must read the gate.
// Written as a scan rather than a list so a NEW screen with an Upgrade button
// fails this suite instead of shipping. Marketing is excluded on purpose -
// selling is what that site is for - and so is the staff console.
const VERBS = /Choose a plan|Choose this plan|See plans|Update the card|Manage billing|PLAN_CTA_APP|\bUpgrade\b/
const surfaces = [...walk('app'), ...walk('components')].filter(f =>
  f.endsWith('.tsx')
  && !f.includes('(marketing)')
  && !f.startsWith('components/marketing')
  && !f.startsWith('app/admin')
  && VERBS.test(read(f)))
const ungated = surfaces.filter(f => !/use-native/.test(read(f)))
ok(surfaces.length >= 2, `screens printing a purchase verb were found (${surfaces.length})`)
ok(ungated.length === 0,
  `every one of them reads the native gate${ungated.length ? ` - ${ungated.join(', ')}` : ''}`)

done()
