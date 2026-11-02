import { ok, done, read, code, walk, readCombined, migrationFiles } from './_helpers'
import { canSignUpHere, canShowPricing } from '../use-native'
import { HELP_ARTICLES, getArticle, helpArticleAllowed } from '../help/articles'
import { MARKETING_PATHS } from '../hosts'
import { RELEASES, releasesFor } from '../whats-new'
import { NOTIFICATION_TYPES, shownOnThisBuild, wantsPush } from '../notifications'
import { IOS_LOCKED, lockSentence } from '../../components/layout/billing-banner'
import { IOS_LOCKED as SHARED_LOCKED, IOS_UA_TOKEN, IOS_SHELL_COOKIE, isIosShellRequest, iosShellCookie } from '../native-request'
import { projectLimitProblem, scanLimitProblem } from '../plan-limits'

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

// ── AND THE SHELL MUST NOT BE ABLE TO RENDER THE SHOP ───────────────────────
// How the reviewer actually got there. `allowNavigation` carried the marketing
// hosts, so an app-side link to a MARKETING_PATHS entry - middleware redirects
// those to sytenav.com - came back INSIDE the webview, and the Pricing page
// with its three prices and a CTA per card read as a screen of the app. Build
// 1.0 (14) was rejected under 3.1.1 off that walk.
//
// TWO HALVES, because the config alone protects nothing: it is a native file
// that only reaches a phone through a Codemagic build, while the link scan
// below ships with a Vercel deploy and is what guards the regression today.
const cap = read('capacitor.config.ts')
const navLine = /allowNavigation:\s*\[([^\]]*)\]/.exec(cap)
ok(!!navLine, 'the shell declares an allowNavigation list at all')
const hosts = (navLine?.[1] ?? '').split(',').map(h => h.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
ok(!hosts.includes('sytenav.com') && !hosts.includes('www.sytenav.com'),
  `the marketing host cannot render inside the shell${hosts.length ? ` - [${hosts.join(', ')}]` : ''}`)
// Asserted POSITIVELY as well, or emptying the list passes the line above while
// breaking sign-in: an allowlist with nothing on it is not the fix.
ok(hosts.includes('app.sytenav.com'), '...while the product itself still loads in it')
ok(hosts.includes('*.supabase.co'), '...and so does the auth hop')

// The half that ships now: no app-side file points at a marketing path. Read
// off MARKETING_PATHS rather than retyped, so a new marketing page is covered
// the day somebody adds one. '/' is excluded - it is every logo link, and the
// scan would be useless rather than strict.
const marketing = MARKETING_PATHS.filter(p => p !== '/')
ok(marketing.length >= 10, `marketing paths were read from lib/hosts.ts (${marketing.length})`)
const appSide = [...walk('app'), ...walk('components')].filter(f =>
  (f.endsWith('.tsx') || f.endsWith('.ts'))
  && !f.includes('(marketing)')
  && !f.startsWith('components/marketing')
  && !f.startsWith('app/admin'))
ok(appSide.length >= 100, `app-side files were walked (${appSide.length})`)
const leaks: string[] = []
for (const f of appSide) {
  const src = code(f)
  for (const path of marketing) {
    // An href, a push/replace, or a location assignment - the three ways a tap
    // leaves the app. Bounded so '/about' does not match '/aboutface'.
    const re = new RegExp(`(href=|router\\.(push|replace)\\(|location\\.href\\s*=\\s*)['"\`]${path}(['"\`?#]|/)`)
    if (re.test(src)) leaks.push(`${f} -> ${path}`)
  }
}
ok(leaks.length === 0,
  `nothing in the app links to the marketing site${leaks.length ? ` - ${leaks.join(', ')}` : ''}`)

// ─────────────────────────────────────────────────────────────────────────────
// 1.0 (15), REJECTED AGAIN UNDER 3.1.1 - AND THE SCREENS THAT SAID SO.
//
// Everything above hid the CONTROLS. The reviewer, signed in as the demo
// company's admin, still found the subscription in three places that were not
// controls at all:
//   - What's New, which read "Settings > Billing and the pricing page now show
//     what each plan will cost: $99, $299 or $499 a month", linked to Settings
//     - kept on the theory that a changelog is history, not an offer;
//   - Settings -> Billing itself, "Free access - Beta, free while you're in it"
//     over an allowance of projects and AI scans - kept on the theory that
//     usage is a fact about your account;
//   - and, for any account on a trial, a countdown banner, a "trial ending"
//     bell entry and PUSH, each ending in "Choose a plan".
// 3.1.3(f) wants no purchasing and no call to purchase ANYWHERE in the app.
// A reviewer does not read our distinctions; they read the screen.
// ─────────────────────────────────────────────────────────────────────────────

// The language that marks something as being about buying SyteNav. Construction
// words ("price", "allowance", "upgrade") are deliberately absent - a selection
// upgrade and a sale price are the product, not the subscription.
const BUYING = /\$\d[\d,]*(?:\.\d+)?\s*(?:a|per|\/)\s*(?:month|year|mo\b)|pricing page|\/pricing|free trial|\btrial\b|subscription|\bstripe\b|settings\s*(?:>|→)\s*billing|\bbeta\b|choose a plan|card on file|your plan|which plan|plans and prices|AI scans|(?<![@.\w])sytenav\.com/i

// What's New.
const iosReleases = releasesFor(false)
const iosItems = iosReleases.flatMap(r => r.items)
const leaky = iosItems.filter(i => BUYING.test(`${i.title} ${i.text}`))
ok(leaky.length === 0,
  `What's New in the iOS app says nothing about buying SyteNav${leaky.length ? ` - mark webOnly: ${leaky.map(i => i.title).join(' / ')}` : ''}`)
ok(iosItems.every(i => !i.webOnly), 'every webOnly item is dropped on iOS')
ok(iosReleases.every(r => r.items.length > 0), 'a release left empty is dropped, not printed as a bare heading')
ok(releasesFor(true) === RELEASES, 'the web still reads the whole changelog')
ok(RELEASES.flatMap(r => r.items).filter(i => i.webOnly).length >= 10,
  'the priced entries are still there for the web')
ok(!/\$\d/.test(iosItems.filter(i => /plan/i.test(i.title)).map(i => i.text).join(' ')),
  'no entry titled about plans prints a dollar figure on iOS')
// Mutation check: the specific sentence the reviewer could read.
ok(!iosItems.some(i => /\$99/.test(i.text)), 'the $99 / $299 / $499 entry is not on iOS')
const wnPage = code('app/(dashboard)/whats-new/page.tsx')
ok(/releasesFor\(pricingAllowed\)\.map/.test(wnPage), 'the page renders the filtered list')
ok(!/\bRELEASES\b/.test(wnPage), '...and never the unfiltered one')

// Settings -> Billing.
const settings = code('app/(dashboard)/settings/page.tsx')
ok(/const billingShown = useCanShowPricing\(\)/.test(settings), 'the Billing tab asks the pricing gate')
ok(/if \(id === 'billing' && !billingShown\) return false/.test(settings),
  '...inside tabAllowed, which the tab strip and the ?tab= deep link both ask')
ok(/activeTab === 'billing' && billingShown && <BillingPanel/.test(settings),
  '...and the panel cannot render without it either')

// The banner.
ok(!BUYING.test(IOS_LOCKED) && !/plan/i.test(IOS_LOCKED), 'a locked iOS account is told the fact with no plan in it')
ok(/lockSentence\(access\.reason, canBuy\)/.test(banner), 'the lock banner swaps the sentence on iOS')
ok(lockSentence('Choose a plan.', false) === IOS_LOCKED && lockSentence('Choose a plan.', true) === 'Choose a plan.',
  '...to the plain one there, and only there')
const bailAt = banner.indexOf('if (!canBuy) return null')
ok(bailAt > 0 && bailAt < banner.indexOf("access.state === 'trial'"),
  'no trial countdown or failed-card warning renders on iOS')

// Notifications.
const trial = NOTIFICATION_TYPES.find(t => t.key === 'trial_ending')
ok(!!trial, 'the trial notification is in the catalog')
ok(trial?.webOnly === true, '...marked webOnly')
ok(wantsPush({} as any, 'trial_ending') === false, '...and never pushed, since every phone is a native app')
ok(shownOnThisBuild('trial_ending', false) === false, '...nor shown in the iOS bell')
ok(shownOnThisBuild('trial_ending', true) === true, '...while the web bell still has it')
ok(shownOnThisBuild('rfi', false) === true, 'everything else rings on iOS as before')
const bell = code('components/layout/notification-bell.tsx')
ok(/fetched\.filter\(n => shownOnThisBuild\(n\.type, pricingAllowed\)\)/.test(bell), 'the bell filters before counting')
for (const t of NOTIFICATION_TYPES) {
  if (t.webOnly) continue
  ok(!/\btrial\b|subscription|choose a plan/i.test(`${t.label} ${t.description}`),
    `${t.key} is not about the subscription, or it would be webOnly`)
}

// Help, apart from the one web-only article.
const helpLeaks = HELP_ARTICLES.filter(a => !a.webOnly)
  .filter(a => BUYING.test(JSON.stringify([a.title, a.summary, a.blocks])))
ok(helpLeaks.length === 0,
  `no Help article the iOS app shows talks about buying SyteNav${helpLeaks.length ? ` - ${helpLeaks.map(a => a.slug).join(', ')}` : ''}`)

// ─────────────────────────────────────────────────────────────────────────────
// AND THE SENTENCES THE SERVER WRITES. A locked save, the project cap and the
// scan cap are error strings the page prints as it gets them, and on the web
// every one ends in a plan to buy. The server learns it is talking to the iOS
// app from a UA token (needs a rebuild) or a cookie the shell sets (does not).
// ─────────────────────────────────────────────────────────────────────────────

ok(SHARED_LOCKED === IOS_LOCKED, 'the banner and the server print ONE locked sentence')
ok(isIosShellRequest(`Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 ${IOS_UA_TOKEN}`, null), 'the UA token says iOS')
ok(isIosShellRequest('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15', `a=1; ${IOS_SHELL_COOKIE}=ios; b=2`), '...so does the cookie, alone')
ok(!isIosShellRequest('Mozilla/5.0 (iPhone) Safari/604.1', null), 'Safari on an iPhone is the WEB - it may be sold to')
ok(!isIosShellRequest(null, `${IOS_SHELL_COOKIE}=android`), 'only the iOS value counts')
ok(!isIosShellRequest(null, `x${IOS_SHELL_COOKIE}=ios`), 'a cookie name is matched exactly')
ok(iosShellCookie().startsWith(`${IOS_SHELL_COOKIE}=ios;`) && /secure/.test(iosShellCookie()), 'the cookie the shell writes is the one the server reads')

const capCfg = read('capacitor.config.ts')
ok(new RegExp(`appendUserAgent:\\s*'${IOS_UA_TOKEN.replace('/', '\\/')}'`).test(capCfg),
  'the iOS build appends the token the server reads')
ok(capCfg.indexOf('appendUserAgent') > capCfg.indexOf('ios: {'), '...inside the ios block, so Android keeps selling')
const shell = code('components/layout/native-shell.tsx')
ok(/useShellCookie\(\)/.test(shell) && /document\.cookie = iosShellCookie\(\)/.test(shell),
  'the shell sets the cookie, reaching builds shipped before the token')
ok(/platform !== 'ios'\) return/.test(shell), '...on iOS only')

const ent = { projects: 3, scans: 50, source: 'plan' } as any
const iosProject = projectLimitProblem(ent, 3, 1, true) ?? ''
const iosBatch = projectLimitProblem(ent, 2, 4, true) ?? ''
const iosScan = scanLimitProblem(ent, 50, new Date(2026, 10, 2), true) ?? ''
for (const [name, text] of [['project cap', iosProject], ['batch cap', iosBatch], ['scan cap', iosScan]] as const) {
  ok(text.length > 0, `the iOS ${name} still refuses, with a sentence`)
  ok(!/\bplan\b|upgrade|move up|covers|includes/i.test(text) && !BUYING.test(text), `the iOS ${name} names no plan: "${text}"`)
}
ok(/3 of 3|3 active jobs/.test(iosProject) && /room for 1 more/.test(iosBatch), 'the numbers stay - it is the same fact')
ok(/move up a plan/.test(projectLimitProblem(ent, 3, 1) ?? ''), 'the web project cap still names the remedy')
ok(/on your plan/.test(scanLimitProblem(ent, 50, new Date(2026, 10, 2)) ?? ''), 'the web scan cap is unchanged')

const guard = code('lib/api-guard.ts')
ok(/error: requestIsIosShell\(\) \? IOS_LOCKED : reason/.test(guard), 'every 402 from requirePermission/billingLock asks which shell')
const scanGuard = code('lib/scan-guard.ts')
ok(/error: requestIsIosShell\(\) \? IOS_LOCKED : access\.reason/.test(scanGuard), 'the scan route lock asks too')
ok(/scanLimitProblem\(ent, usage\.scansThisMonth, now, requestIsIosShell\(\)\)/.test(scanGuard), '...and the scan cap')
ok(/projectLimitProblem\(ent, usage\.activeProjects, adding, requestIsIosShell\(\)\)/.test(code('lib/billing-read.ts')),
  'the project cap (both doors go through projectSlotProblem) asks too')
// No OTHER spelling of a lock response can bypass it.
const lockSites = [...walk('app'), ...walk('lib')].filter(f => f.endsWith('.ts') && !f.includes('__tests__'))
  .filter(f => /billing: 'locked'/.test(code(f)))
ok(lockSites.every(f => /requestIsIosShell\(\)/.test(code(f))),
  `every file building a locked response asks which shell (${lockSites.join(', ')})`)
ok(!/native-request-server/.test(read('lib/native-request.ts').replace(/\/\/.*$/gm, '')), 'the pure half never imports next/headers')

done()
