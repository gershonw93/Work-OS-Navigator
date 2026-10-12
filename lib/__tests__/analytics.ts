// Google Analytics: what a page is allowed to tell Google about itself, and
// who is never measured. The failure this guards is quiet - a record id, a
// portal token or a reset token in a page address reaches Google, and nothing
// on screen changes. So every rule here is checked against a REAL path shape.

import { ok, done, code } from './_helpers'
import {
  GA_ID, GTM_ID, isTrackedPath, pageTemplate, pageTitle, safeLocation, safeReferrer, utmQuery,
} from '../analytics'

const ORIGIN = 'https://app.sytenav.com'
const uuid = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c'

// ── page addresses become templates ──────────────────────────────────────────
ok(pageTemplate(`/projects/${uuid}/tasks`) === '/projects/[id]/tasks', 'a project uuid becomes [id]')
ok(pageTemplate('/projects/123/budget') === '/projects/[id]/budget', 'a numeric id becomes [id]')
ok(pageTemplate('/guides/how-to-track-change-orders') === '/guides/how-to-track-change-orders',
  'a guide slug is kept - it is our own word, and the report needs it')
ok(pageTemplate('/directory/AbC123xYz') === '/directory/[id]', 'a mixed-case token becomes [id]')
ok(pageTemplate('/x/a8f3k29d1m') === '/x/[id]', 'a lowercase id with a run of digits becomes [id]')
ok(pageTemplate('/') === '/', 'the root stays the root')

ok(pageTitle('/projects/[id]/tasks') === 'Tasks', 'the title comes from the template')
ok(pageTitle('/') === 'Home', 'the root is Home')
ok(pageTitle('/projects/[id]') === 'Projects', 'an [id] is never the title')

// ── query strings are dropped, UTMs survive by allowlist ─────────────────────
const loc = safeLocation(ORIGIN, '/reset-password', '?code=secret&utm_source=google')
ok(loc === `${ORIGIN}/reset-password?utm_source=google`, 'a token in the query is dropped, the UTM kept')
ok(!utmQuery('?utm_source=bob@example.com').includes('bob'), 'a UTM holding an address is refused')
ok(utmQuery('?q=kitchen&search=smith') === '', 'search terms never travel')

// ── token links and internal pages are not measured at all ───────────────────
for (const p of ['/portal/abc', '/share/abc', '/bid/abc', '/bill/abc', '/rfi/abc', '/compliance/abc', '/admin', '/admin/demo', '/auth/callback']) {
  ok(!isTrackedPath(p), `${p} is not measured`)
  ok(safeLocation(ORIGIN, p, '') === null, `${p} produces no page_location`)
}
ok(isTrackedPath('/projects') && isTrackedPath('/pricing') && isTrackedPath('/portals-guide'),
  'ordinary pages are measured, and a prefix match needs a whole segment')

// ── referrers ────────────────────────────────────────────────────────────────
ok(safeReferrer('https://www.google.com/search?q=sytenav+login') === 'https://www.google.com',
  'an outside referrer is reduced to its origin')
ok(safeReferrer('https://www.sytenav.com/pricing') === '', 'our own site is not a referral')
ok(safeReferrer('') === '', 'no referrer is no referrer')

// ── the wiring ───────────────────────────────────────────────────────────────
const client = code('lib/analytics-client.ts')
ok(GA_ID === 'G-LXC64H4W7J' && GTM_ID === 'GTM-MXB4F2W3', 'the IDs are the property set up for SyteNav')
ok(!/gtag\/js/.test(client) && !/'config'/.test(client),
  'no gtag.js loader and no config call - GTM owns configuration, a second one doubles every event')
ok(/isNativePlatform/.test(client), 'the native shell is excluded')
ok(/globalPrivacyControl/.test(client), 'Global Privacy Control is honoured')
ok(/ad_storage: 'denied'/.test(client) && /allow_google_signals: false/.test(client),
  'advertising signals are off before the tag loads')
ok(!/document\.title|location\.href/.test(client), 'never the raw title or URL')

const layout = code('app/layout.tsx')
ok(/<Analytics \/>/.test(layout), 'mounted once, from the root layout')

const signup = code('app/(auth)/signup/page.tsx')
ok(/done\.created\) queueOutcome\('sign_up'/.test(signup), 'sign_up fires off the route saying an account was CREATED')
ok(/done\.trialStarted\) queueOutcome\('trial_start'/.test(signup), 'trial_start fires off the route saying a trial began')
const route = code('app/api/complete-signup/route.ts')
ok(/created: false, trialStarted: false/.test(route), 'a returning account reports no outcome')
ok(/\.select\('company_id'\)/.test(route), 'trialStarted is read off the inserted row, not assumed')

// ── the disclosure travels with it ───────────────────────────────────────────
const cookies = code('app/(marketing)/cookies/page.tsx')
ok(!/We do not run Google Analytics/.test(cookies), 'the cookie policy no longer denies running it')
ok(/Google Analytics/.test(cookies) && /<AnalyticsOptOut \/>/.test(cookies), 'it names it and offers the off switch')
ok(/Google Analytics/.test(code('app/(marketing)/privacy/page.tsx')), 'the privacy policy names it')

done()
