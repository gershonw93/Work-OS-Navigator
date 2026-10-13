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
  '/portal', '/share', '/shared-report', '/bid', '/bill', '/rfi', '/compliance', '/auth', '/admin', '/api',
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

// ── Events ───────────────────────────────────────────────────────────────────
//
// THE SCHEMA IS THE PRIVACY RULE. Every parameter an event may carry is listed
// here with the only values it may take: a closed set of words, a count, or a
// route template. `cleanParams` drops anything else - an unknown key, a value
// outside its set, a string where a count belongs - so an id, a name, an
// email, a filename or a search term cannot reach Google through a parameter
// nobody declared. There is no free-text parameter type, on purpose.
//
// EACH EVENT FIRES ON A SERVER-CONFIRMED OUTCOME, never a button press. The
// names were proposed against a product they had not been checked against;
// what they are attached to here is what the app actually does:
//   login           /login's signInWithPassword succeeded. Email is the only
//                   method the app has - there is no Google or magic-link door.
//   sign_up         complete-signup answered created:true (once per account).
//   trial_start     complete-signup answered trialStarted:true - the billing
//                   row was INSERTED, so once per trial. A new trial has no
//                   plan (plan_key is set by Stripe later), so no plan param:
//                   a fixed placeholder would be a value present and wrong.
//   project_created the projects routes answered with the new job(s).
//   quote_sent      a bid/RFQ invite EMAIL to a sub was sent by the server.
//                   Copying a bid link never reaches the server, so it is a
//                   ui_click, not a dispatch nobody can confirm.
//   sub_invited     /api/invite (vendor) answered emailSent:true. A recorded
//                   invite with no email is not an invitation sent.
// sign_up and trial_start are the GA4 key events; nothing else here is.

export const PROJECT_TYPES = ['residential', 'commercial', 'industrial', 'civil', 'renovation', 'mixed_use', 'other'] as const
export const PROJECT_ENTRY_POINTS = ['new_project', 'customer', 'bulk_add', 'lot_list', 'development', 'my_jobs'] as const
export const QUOTE_TYPES = ['new_request', 'added_invitee', 'invite', 'reminder'] as const
export const UI_ACTIONS = ['copy_link', 'copy_email_text', 'open_mailto', 'connect_calendar', 'copy_calendar_feed'] as const
export const UI_COMPONENTS = ['bid_invite', 'calendar_google', 'calendar_apple', 'calendar_outlook', 'calendar_feed'] as const
export const DOCUMENT_CATEGORIES = ['timesheet', 'daily_log'] as const
export const SEARCH_AREAS = ['global', 'help'] as const

type Spec = readonly string[] | 'count' | 'template'

export const EVENT_PARAMS = {
  login: { method: ['email'] },
  sign_up: { method: ['email'] },
  trial_start: { trial_days: 'count' },
  project_created: { entry_point: PROJECT_ENTRY_POINTS, project_type: PROJECT_TYPES, project_count: 'count' },
  quote_sent: { channel: ['email'], quote_type: QUOTE_TYPES, invitee_count: 'count' },
  sub_invited: { invitation_method: ['email'], role: ['vendor'], invite_count: 'count' },
  ui_click: { action: UI_ACTIONS, component: UI_COMPONENTS, page_template: 'template' },
  file_download: { file_type: ['csv', 'pdf'], document_category: DOCUMENT_CATEGORIES },
  search_used: { search_area: SEARCH_AREAS, results_count: 'count' },
} as const satisfies Record<string, Record<string, Spec>>

export type EventName = keyof typeof EVENT_PARAMS
type Value<S> = S extends readonly (infer V)[] ? V : S extends 'count' ? number : string
export type EventParams<E extends EventName> = {
  [K in keyof (typeof EVENT_PARAMS)[E]]?: Value<(typeof EVENT_PARAMS)[E][K]>
}

/** The parameters that should be GA4 custom dimensions (event scope). */
export const CUSTOM_DIMENSIONS = Array.from(new Set(
  Object.values(EVENT_PARAMS).flatMap(p => Object.entries(p)
    .filter(([, spec]) => spec !== 'count').map(([k]) => k)),
)).sort()

/** Only declared keys, only declared values. Null for an unknown event. */
export function cleanParams(event: string, raw: Record<string, unknown>): Record<string, string | number> | null {
  const spec = (EVENT_PARAMS as Record<string, Record<string, Spec>>)[event]
  if (!spec) return null
  const out: Record<string, string | number> = {}
  for (const [k, rule] of Object.entries(spec)) {
    const v = raw[k]
    if (v === undefined || v === null) continue
    if (rule === 'count') {
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 100_000) out[k] = v
    } else if (rule === 'template') {
      // Re-templated here, so a raw path handed in by mistake still leaves as
      // a template - and only if it is one of ours to measure at all.
      if (typeof v === 'string' && v.startsWith('/') && isTrackedPath(v)) out[k] = pageTemplate(v.split(/[?#]/)[0])
    } else if (typeof v === 'string' && (rule as readonly string[]).includes(v)) {
      out[k] = v
    }
  }
  return out
}

/** A stored project type is only sent when it is one the database allows. */
export function projectType(v: unknown): (typeof PROJECT_TYPES)[number] | undefined {
  return (PROJECT_TYPES as readonly unknown[]).includes(v) ? v as (typeof PROJECT_TYPES)[number] : undefined
}
