// Google Analytics: what a page is allowed to tell Google about itself, and
// who is never measured. The failure this guards is quiet - a record id, a
// portal token or a reset token in a page address reaches Google, and nothing
// on screen changes. So every rule here is checked against a REAL path shape.

import { ok, done, code } from './_helpers'
import {
  cleanParams, CUSTOM_DIMENSIONS, EVENT_PARAMS,
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
ok(/done\.created\) trackAfterNavigation\('sign_up'/.test(signup), 'sign_up fires off the route saying an account was CREATED')
ok(/done\.trialStarted\) trackAfterNavigation\('trial_start'/.test(signup), 'trial_start fires off the route saying a trial began')
const route = code('app/api/complete-signup/route.ts')
ok(/created: false, trialStarted: false/.test(route), 'a returning account reports no outcome')
ok(/\.select\('company_id'\)/.test(route), 'trialStarted is read off the inserted row, not assumed')

// ── the disclosure travels with it ───────────────────────────────────────────
const cookies = code('app/(marketing)/cookies/page.tsx')
ok(!/We do not run Google Analytics/.test(cookies), 'the cookie policy no longer denies running it')
ok(/Google Analytics/.test(cookies) && /<AnalyticsOptOut \/>/.test(cookies), 'it names it and offers the off switch')
ok(/Google Analytics/.test(code('app/(marketing)/privacy/page.tsx')), 'the privacy policy names it')

// ── the event schema: only declared keys, only declared values ───────────────
ok(cleanParams('nope', { a: 1 }) === null, 'an undeclared event sends nothing')
const leaky = cleanParams('project_created', {
  entry_point: 'new_project', project_type: 'commercial', project_count: 1,
  name: 'Smith Residence', project_id: '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c', email: 'a@b.com',
})!
ok(JSON.stringify(leaky) === JSON.stringify({ entry_point: 'new_project', project_type: 'commercial', project_count: 1 }),
  'a name, an id and an email handed in beside the declared params are all dropped')
ok(!('project_type' in cleanParams('project_created', { project_type: 'Smith job' })!), 'a value outside the enum is dropped, not passed through')
ok(!('results_count' in cleanParams('search_used', { results_count: 'kitchen tile' })!), 'free text where a count belongs is dropped')
ok(!('results_count' in cleanParams('search_used', { results_count: -1 })!), '...and so is a negative count')
ok(cleanParams('ui_click', { action: 'copy_link', component: 'bid_invite', page_template: `/projects/${uuid}/request-quotes?x=1` })!.page_template === '/projects/[id]/request-quotes',
  'a raw path handed to page_template still leaves as a template')
ok(!('page_template' in cleanParams('ui_click', { page_template: '/portal/abc123token' })!), 'an excluded route is never a page_template')
for (const [event, params] of Object.entries(EVENT_PARAMS)) {
  for (const [key, spec] of Object.entries(params)) {
    ok(Array.isArray(spec) || spec === 'count' || spec === 'template', `${event}.${key} is an enum, a count or a template - there is no free-text type`)
  }
}
ok(!('plan' in EVENT_PARAMS.trial_start), 'trial_start carries no plan - a new trial has none, and a placeholder would be a value present and wrong')
ok(CUSTOM_DIMENSIONS.includes('entry_point') && !CUSTOM_DIMENSIONS.includes('results_count'), 'custom dimensions are the enum params, not the counts')

// ── every send is gated at the moment it goes ────────────────────────────────
ok(/function send\([^)]*\) \{\n  if \(!permitted\(\)\) return/.test(client), 'send() asks permitted() first')
ok(/queue\.splice\(0\)\) if \(permitted\(\)\)/.test(client), 'every queued event is re-checked as it is flushed')
ok(/started && !suspended && measured\(\) && isTrackedPath\(location\.pathname\)/.test(client),
  'permitted = running, not silenced, production host + not native + no GPC + not opted out, and not an excluded path')
ok(/function resume[\s\S]{0,600}'set', \{ page_location[\s\S]{0,200}ga-disable-/.test(client), 'resume sets the safe location BEFORE clearing the disable flag')

// ── each event is fired from the place the SERVER answered ───────────────────
const fired: [string, string, RegExp][] = [
  ['app/(auth)/login/page.tsx', 'login', /if \(authError\)[\s\S]*trackAfterNavigation\('login'/],
  ['components/projects/project-form.tsx', 'project_created', /await res\.json\(\)\n[\s\S]{0,120}track\('project_created'/],
  ['components/projects/bulk-add-modal.tsx', 'project_created', /const d = await res\.json\(\)\n\s*if \(d\.count > 0\) track\('project_created'/],
  ['components/projects/lot-list-builder.tsx', 'project_created', /if \(!res\.ok\)[^\n]*return \}\n\s*if \(d\.count > 0\) track\('project_created'/],
  ['components/projects/development-actions.tsx', 'project_created', /d\.project\.id\n\s*track\('project_created'/],
  ['app/(dashboard)/my-jobs/page.tsx', 'project_created', /if \(!res\.ok\)[^\n]*\n\s*track\('project_created'/],
  ['app/(dashboard)/projects/[id]/request-quotes/page.tsx', 'quote_sent', /r\.sent\)\.length\n\s*if \(sentCount\) track\('quote_sent'/],
  ['app/(dashboard)/projects/[id]/request-quotes/page.tsx', 'quote_sent', /if \(d\.sent\) \{[\s\S]{0,200}track\('quote_sent'/],
  ['app/(dashboard)/directory/page.tsx', 'sub_invited', /if \(body\.emailSent === true\) track\('sub_invited'/],
]
for (const [file, event, re] of fired) ok(re.test(code(file)), `${event} fires after the server's answer in ${file}`)
ok(!/trackClick\('copy_link'[^)]*\)[^\n]*quote_sent|track\('quote_sent'[^\n]*copy/.test(code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')),
  'copying a bid link is a ui_click, never a quote_sent - nothing reached the server')

done()
