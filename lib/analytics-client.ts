'use client'

import {
  ANALYTICS_HOSTS, GA_ID, GTM_ID, OPT_OUT_COOKIE, type EventName, type EventParams,
  cleanParams, isTrackedPath, pageTemplate, pageTitle, safeLocation, safeReferrer,
} from '@/lib/analytics'

// The browser half of lib/analytics.ts. ONE entry point, `routeChanged`, called
// on every committed route; nothing loads until it decides this browser AND
// this page are measured.
//
// AN EXCLUDED ROUTE IS NOT A PAGE WE SKIP COUNTING - IT IS A PAGE THE TAG MUST
// NOT BE RUNNING ON. The first version only refused the manual page_view, so a
// cold load of /portal/<token> still loaded GTM, and the tag's own automatic
// events (scroll, engagement) went out carrying the raw URL with the token in
// it. So: a cold load of an excluded route never loads the tag at all, and
// navigating INTO one sets `ga-disable-<id>`, which the Google tag checks on
// every hit, automatic ones included, until the route is left again.

type GtagWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
  google_tag_manager?: Record<string, unknown>
  Capacitor?: { isNativePlatform?: () => boolean }
  [k: `ga-disable-${string}`]: boolean | undefined
}

const PENDING_KEY = 'sn_analytics_pending'

let started = false
let ready = false
let suspended = false
/** The last safe location sent - the referrer for the next one. */
let lastLocation = ''
let lastTitle = ''
/** Dedupe key; cleared on suspend so coming back to a page counts again. */
let lastSent = ''
const queue: [string, Record<string, unknown>][] = []

function win(): GtagWindow { return window as unknown as GtagWindow }

export function optedOut(): boolean {
  if (typeof document === 'undefined') return true
  if ((navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl) return true
  return document.cookie.split('; ').some(c => c === `${OPT_OUT_COOKIE}=1`)
}

/** Set on the parent domain so a choice made on www also covers app. */
export function setOptOut(off: boolean) {
  const domain = location.hostname.endsWith('sytenav.com') ? '; domain=.sytenav.com' : ''
  document.cookie = off
    ? `${OPT_OUT_COOKIE}=1; path=/; max-age=63072000; samesite=lax${domain}`
    : `${OPT_OUT_COOKIE}=; path=/; max-age=0; samesite=lax${domain}`
  // Stops a tag that is already running from sending anything further.
  win()[`ga-disable-${GA_ID}`] = off
}

function measured(): boolean {
  if (!ANALYTICS_HOSTS.has(location.hostname)) return false
  if (win().Capacitor?.isNativePlatform?.()) return false
  return !optedOut()
}

/**
 * May anything be sent RIGHT NOW? Asked at every send and again for every
 * queued item as it is flushed - an event queued on a measured page must not
 * leave from a token link the visitor has since navigated to, or after they
 * pressed the opt-out, just because it was queued before either happened.
 */
function permitted(): boolean {
  return started && !suspended && measured() && isTrackedPath(location.pathname)
}

function send(name: string, params: Record<string, unknown>) {
  if (!permitted()) return
  if (!ready) { queue.push([name, params]); return }
  win().gtag?.('event', name, { send_to: GA_ID, ...params })
}

/**
 * An event sent before GTM has initialised the Google tag goes nowhere, so
 * everything waits for the tag to register itself and then flushes in order.
 * Ten seconds, then give up quietly: a blocked script is the visitor's choice.
 */
function waitForTag() {
  const t0 = Date.now()
  const tick = () => {
    if (win().google_tag_manager?.[GA_ID]) {
      ready = true
      for (const [n, p] of queue.splice(0)) if (permitted()) win().gtag?.('event', n, { send_to: GA_ID, ...p })
      return
    }
    if (Date.now() - t0 < 10_000) setTimeout(tick, 100)
  }
  tick()
}

/**
 * Load the tag for a page that is measured. The page's SAFE location, title
 * and referrer are set before GTM is pushed, so nothing the tag sends on its
 * own - before or after the first page_view - can fall back to the raw URL.
 */
function start(pathname: string, search: string): boolean {
  if (typeof window === 'undefined' || !isTrackedPath(pathname) || !measured()) return false
  const loc = safeLocation(location.origin, pathname, search)
  if (!loc) return false
  const w = win()
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag() { w.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
  // Analytics only. Every advertising signal is denied before the tag loads.
  w.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  })
  w.gtag('set', {
    allow_google_signals: false, allow_ad_personalization_signals: false,
    page_location: loc, page_title: pageTitle(pageTemplate(pathname)),
    page_referrer: safeReferrer(document.referrer),
  })
  w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
  document.head.appendChild(s)
  started = true
  waitForTag()
  return true
}

/** Silence a running tag - every hit, automatic ones included. */
function suspend() {
  if (!started || suspended) return
  win()[`ga-disable-${GA_ID}`] = true
  suspended = true
  lastSent = ''
}

/**
 * Wake a silenced tag for a measured page. The page's SAFE location, title and
 * referrer are set while the tag is still disabled, so the first hit after
 * waking - automatic or not - can never carry the excluded route it came from.
 */
function resume(pathname: string, search: string) {
  if (!suspended) return
  const loc = safeLocation(location.origin, pathname, search)
  if (loc) win().gtag?.('set', { page_location: loc, page_title: pageTitle(pageTemplate(pathname)), page_referrer: lastLocation })
  // An opt-out pressed meanwhile keeps it off.
  win()[`ga-disable-${GA_ID}`] = optedOut()
  suspended = false
}

/**
 * THE entry point, once per committed route. Excluded route: never start, and
 * silence a tag already running. Measured route: start or resume, then one
 * page_view, then any outcome parked across the redirect.
 */
export function routeChanged(pathname: string, search: string) {
  if (typeof window === 'undefined') return
  if (!isTrackedPath(pathname)) { suspend(); return }
  if (!started) { if (!start(pathname, search)) return } else resume(pathname, search)
  pageView(pathname, search)
  flushParked()
}

/** Once per measured route. Repeats of the same template are dropped. */
function pageView(pathname: string, search: string) {
  const loc = safeLocation(location.origin, pathname, search)
  if (!loc || loc === lastSent) return
  const referrer = lastLocation || safeReferrer(document.referrer)
  const title = pageTitle(pageTemplate(pathname))
  // Defaults for anything GTM sends on its own (scrolls, engagement), so no
  // automatic event reports the raw URL either.
  win().gtag?.('set', { page_location: loc, page_title: title, page_referrer: referrer })
  send('page_view', { page_location: loc, page_title: title, page_referrer: referrer })
  lastLocation = loc
  lastSent = loc
  lastTitle = title
}

/**
 * THE ONE WAY AN EVENT LEAVES. Call it after the server has confirmed the
 * outcome, never from a click handler before the response. Parameters are
 * filtered through the schema in lib/analytics.ts, and the send re-checks
 * host, native shell, GPC, opt-out and excluded path at the moment it goes.
 */
export function track<E extends EventName>(event: E, params: EventParams<E> = {}) {
  if (typeof window === 'undefined') return
  const clean = cleanParams(event, params as Record<string, unknown>)
  if (!clean) return
  send(event, clean)
}

/** A click worth counting: fixed action and component, plus where it happened. */
export function trackClick(action: EventParams<'ui_click'>['action'], component: EventParams<'ui_click'>['component']) {
  if (typeof window === 'undefined') return
  track('ui_click', { action, component, page_template: location.pathname })
}

/**
 * A confirmed outcome followed by a FULL-PAGE navigation - signup and login
 * both end in `location.href = ...`, which unloads the page before a request
 * leaves it. Parked in sessionStorage (cleaned first, so nothing unsafe is
 * even stored) and sent by the next measured page through `track`, which
 * checks everything again there. The ROUTE decided it happened; this only
 * carries the answer. Removed as it is read, so one outcome is one event.
 */
export function trackAfterNavigation<E extends EventName>(event: E, params: EventParams<E> = {}) {
  if (!started) return
  const clean = cleanParams(event, params as Record<string, unknown>)
  if (!clean) return
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as [string, Record<string, unknown>][]
    list.push([event, clean])
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch { /* storage blocked: the outcome is lost, nothing else is */ }
}

function flushParked() {
  if (!permitted()) return
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as [string, Record<string, unknown>][]
    sessionStorage.removeItem(PENDING_KEY)
    for (const [e, p] of list) {
      if (typeof e === 'string' && p && typeof p === 'object') track(e as EventName, p as EventParams<EventName>)
    }
  } catch { /* nothing parked, or storage blocked */ }
}
