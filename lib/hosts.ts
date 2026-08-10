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

// Everything the product owns. Anything not listed here and not /homepage is
// treated as app-side too, so a new route defaults to the app rather than
// leaking onto the marketing domain.
export const APP_PATH_PREFIXES = [
  '/dashboard', '/projects', '/directory', '/approvals', '/settings',
  '/customers', '/files', '/help', '/equipment', '/materials',
  '/budget-templates', '/master-calendar', '/master-money', '/my-bids', '/my-jobs',
  '/admin', '/field', '/auth', '/login', '/signup', '/forgot-password', '/reset-password',
  // Token links handed to people without accounts. They are served by the app,
  // and an old link to the apex still works because it redirects.
  '/portal', '/rfi', '/bid', '/compliance', '/share',
]

export function isAppPath(pathname: string): boolean {
  return APP_PATH_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export function isMarketingPath(pathname: string): boolean {
  return pathname === '/homepage' || pathname.startsWith('/homepage/')
}
