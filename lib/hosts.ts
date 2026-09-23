// Marketing site and app live on two hostnames off one deployment:
//   sytenav.com      - the marketing site, and nothing else
//   app.sytenav.com  - the product, including sign-in
//
// The split only turns on once NEXT_PUBLIC_APP_URL is set. Until then every
// helper here returns a same-origin path and middleware leaves routing alone,
// so the code can ship before the DNS record exists without a window where
// links point at a host that doesn't resolve yet.

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '')

/** True once the app has its own hostname. */
export const splitHosts = APP_URL.length > 0

/** Link to something in the product - absolute once the split is on. */
export function appHref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return splitHosts ? `${APP_URL}${p}` : p
}

/** Link to something on the marketing site. */
export function siteHref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return splitHosts && SITE_URL ? `${SITE_URL}${p}` : p
}

// Everything the product owns. Anything not listed here and not in
// MARKETING_PATHS is treated as app-side, so a new route defaults to the app
// rather than leaking onto the marketing domain.
export const APP_PATH_PREFIXES = [
  '/dashboard', '/projects', '/directory', '/approvals', '/settings',
  '/customers', '/files', '/help', '/whats-new', '/equipment', '/materials',
  '/budget-templates', '/master-calendar', '/master-money', '/my-bids', '/my-jobs',
  '/admin', '/field', '/auth', '/login', '/signup', '/forgot-password', '/reset-password',
  // Token links handed to people without accounts. They are served by the app,
  // and an old link to the apex still works because it redirects.
  '/portal', '/rfi', '/bid', '/compliance', '/share', '/bill',
]

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The public marketing pages, by exact path.
 *
 * This HAS to be an explicit list now. Marketing used to live under /homepage,
 * so "is this marketing?" was a prefix test. Since the site moved to the root
 * it shares a namespace with the product, and a prefix test would claim
 * /projects and /settings for the marketing domain - which on the app host
 * would redirect somebody out of the product mid-session.
 *
 * Adding a marketing page means adding it here AND to app/sitemap.ts.
 */
export const MARKETING_PATHS = [
  '/', '/features', '/money', '/flows', '/workflow', '/ai', '/mobile',
  '/contractors', '/subcontractors', '/why', '/pricing', '/security',
  '/about', '/contact', '/privacy', '/terms', '/cookies', '/acceptable-use',
  '/delete-account', '/guides',
]

/**
 * Marketing namespaces matched by PREFIX, which the list above deliberately is
 * not.
 *
 * The reason the list is exact is that marketing shares the root namespace with
 * the product, so a prefix test would claim /projects and /settings for the
 * marketing domain and redirect somebody out of the app mid-session. That
 * argument does not apply to a segment the product does not own: /guides is a
 * marketing directory, nothing in APP_PATH_PREFIXES starts with it, and a guide
 * is one page per article - so listing them here would mean this file (and
 * therefore middleware, which runs on the edge) importing every article body.
 *
 * `lib/__tests__/guides.ts` pins the two facts this depends on: that every
 * published guide path is matched here, and that no app prefix collides with it.
 */
const MARKETING_PREFIXES = ['/guides']

export function isMarketingPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/'
  if (MARKETING_PATHS.includes(clean)) return true
  return MARKETING_PREFIXES.some(p => clean.startsWith(`${p}/`))
}
