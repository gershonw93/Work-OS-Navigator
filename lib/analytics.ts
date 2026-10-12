// Google Analytics, through Google Tag Manager. ONE HOME for the IDs, for which
// pages are measured, and for what a page is allowed to tell Google about itself.
//
// GTM OWNS THE CONFIGURATION. Container GTM-MXB4F2W3 carries the GA4 Google tag
// (G-LXC64H4W7J) with send_page_view=false, so this file never loads gtag.js
// and never sends a `config` for the measurement ID - doing either would count
// every page twice. Page views are sent by hand, once per committed route.
//
// WHAT GOES TO GOOGLE IS A ROUTE TEMPLATE, NEVER THE URL. `/projects/<uuid>/tasks`
// is sent as `/projects/[id]/tasks`, the query string and hash are dropped
// (reset links carry tokens there), and the title is derived from the template
// rather than read off `document.title`, which on an app page can carry a
// project or a customer name. The UTM tags are the one exception, by allowlist,
// because without them a campaign cannot be told from direct traffic.
//
// WHO IS NOT MEASURED AT ALL:
//   - the iOS/Android shell. The App Store privacy label says the app does not
//     track; that is a separate decision, not a side effect of a web deploy.
//   - every host that is not production (previews, localhost, the vercel.app
//     alias), so testing never lands in the reports.
//   - TOKEN LINKS - client portals, bid and bill links, RFIs, shared files. The
//     people opening them are our customers' clients and subs, not visitors to
//     SyteNav, and the path itself is the secret.
//   - /admin, which is us.
//   - a browser sending Global Privacy Control, or one that has turned analytics
//     off on the Cookie Policy page (`OPT_OUT_COOKIE`, set on the parent domain
//     so the choice made on www covers app too).
//
// Analytics is on by default with no banner: a decision for a US B2B audience,
// disclosed in the Cookie and Privacy policies. Advertising stays off - consent
// defaults deny every ad signal, and Google signals are disabled.

export const GA_ID = 'G-LXC64H4W7J'
export const GTM_ID = 'GTM-MXB4F2W3'

export const OPT_OUT_COOKIE = 'sn_analytics_optout'

export const ANALYTICS_HOSTS = new Set([
  'sytenav.com', 'www.sytenav.com', 'app.sytenav.com', 'help.sytenav.com',
])

/** Path prefixes never measured. See the list above for why each is here. */
export const UNTRACKED_PREFIXES = [
  '/portal', '/share', '/bid', '/bill', '/rfi', '/compliance', '/auth', '/admin', '/api',
]

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const WORDY = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export function isTrackedPath(pathname: string): boolean {
  return !UNTRACKED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Keep a segment only when it is plainly a word of ours (`tasks`,
 * `how-to-track-change-orders`). Anything else - a uuid, a number, a token,
 * anything with a capital or an odd character - becomes `[id]`. Deliberately
 * the strict way round: a slug wrongly collapsed costs a less specific report,
 * an id wrongly kept puts a customer's record key in Google.
 */
function templateSegment(seg: string): string {
  if (UUID.test(seg)) return '[id]'
  if (seg.length > 64 || !WORDY.test(seg)) return '[id]'
  // A long run with digits in it is an id that happens to be lowercase.
  if (/\d/.test(seg) && seg.replace(/[^0-9]/g, '').length >= 4) return '[id]'
  return seg
}

export function pageTemplate(pathname: string): string {
  const segs = pathname.split('/').filter(Boolean).map(templateSegment)
  return '/' + segs.join('/')
}

/** "Tasks" for /projects/[id]/tasks, "Home" for /. Never document.title. */
export function pageTitle(template: string): string {
  const last = template.split('/').filter(s => s && s !== '[id]').pop()
  if (!last) return 'Home'
  const words = last.replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** The allowlisted UTM tags, each capped and refused if it looks like an address. */
export function utmQuery(search: string): string {
  const params = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const k of UTM_KEYS) {
    const v = params.get(k)
    if (v && v.length <= 100 && !v.includes('@')) out.set(k, v)
  }
  const s = out.toString()
  return s ? `?${s}` : ''
}

/**
 * The page_location sent to Google: origin + template + allowlisted UTMs.
 * Null when the page is not measured.
 */
export function safeLocation(origin: string, pathname: string, search: string): string | null {
  if (!isTrackedPath(pathname)) return null
  return origin + pageTemplate(pathname) + utmQuery(search)
}

/**
 * The referrer, reduced to its origin. Our own hosts send nothing: www -> app
 * is one visit, and reporting it as a referral splits the funnel in two.
 */
export function safeReferrer(referrer: string): string {
  try {
    const u = new URL(referrer)
    if (u.hostname === 'sytenav.com' || u.hostname.endsWith('.sytenav.com')) return ''
    return u.origin
  } catch {
    return ''
  }
}

export type Outcome = 'sign_up' | 'trial_start'
