'use client'

import {
  ANALYTICS_HOSTS, GA_ID, GTM_ID, OPT_OUT_COOKIE, type Outcome,
  pageTemplate, pageTitle, safeLocation, safeReferrer,
} from '@/lib/analytics'

// The browser half of lib/analytics.ts. Nothing here runs until `startAnalytics`
// decides this browser is measured, and every export is a no-op until then.

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
let lastLocation = ''
let lastTitle = ''
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

function send(name: string, params: Record<string, unknown>) {
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
      for (const [n, p] of queue.splice(0)) win().gtag?.('event', n, { send_to: GA_ID, ...p })
      return
    }
    if (Date.now() - t0 < 10_000) setTimeout(tick, 100)
  }
  tick()
}

export function startAnalytics(): boolean {
  if (started) return true
  if (typeof window === 'undefined' || !measured()) return false
  const w = win()
  w.dataLayer = w.dataLayer || []
  w.gtag = function gtag() { w.dataLayer!.push(arguments) } // eslint-disable-line prefer-rest-params
  // Analytics only. Every advertising signal is denied before the tag loads.
  w.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
  })
  w.gtag('set', { allow_google_signals: false, allow_ad_personalization_signals: false })
  w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`
  document.head.appendChild(s)
  started = true
  waitForTag()
  return true
}

/** Once per committed route. Repeats of the same template are dropped. */
export function pageView(pathname: string, search: string) {
  if (!started) return
  const loc = safeLocation(location.origin, pathname, search)
  if (!loc || loc === lastLocation) return
  const referrer = lastLocation || safeReferrer(document.referrer)
  const title = pageTitle(pageTemplate(pathname))
  // Defaults for anything GTM sends on its own (scrolls, engagement), so no
  // automatic event reports the raw URL either.
  win().gtag?.('set', { page_location: loc, page_title: title, page_referrer: referrer })
  send('page_view', { page_location: loc, page_title: title, page_referrer: referrer })
  lastLocation = loc
  lastTitle = title
}

function sendOutcome(event: Outcome, method?: string) {
  send(event, { ...(method ? { method } : {}), page_location: lastLocation, page_title: lastTitle })
}

/**
 * A backend-confirmed outcome, carried across the redirect that follows it.
 * Signup ends in `location.href = '/dashboard'`, which would unload the page
 * before a request left it, so the outcome is parked in sessionStorage and
 * sent by the next page once its tag is running. The ROUTE decides whether it
 * happened; this only carries the answer.
 */
export function queueOutcome(event: Outcome, method?: string) {
  if (!started) return
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as [Outcome, string?][]
    list.push([event, method])
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(list))
  } catch { /* storage blocked: the outcome is lost, nothing else is */ }
}

export function flushOutcomes() {
  if (!started) return
  try {
    const list = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '[]') as [Outcome, string?][]
    sessionStorage.removeItem(PENDING_KEY)
    for (const [e, m] of list) if (e === 'sign_up' || e === 'trial_start') sendOutcome(e, m)
  } catch { /* nothing parked, or storage blocked */ }
}
