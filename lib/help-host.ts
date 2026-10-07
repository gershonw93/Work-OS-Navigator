// ─────────────────────────────────────────────────────────────────────────────
// Where the public Help Center lives.
//
// The pages are ONE route tree, `app/help-center/`, served two ways:
//   - help.sytenav.com/<path>        once NEXT_PUBLIC_HELP_URL is set, by a
//                                    middleware REWRITE to /help-center/<path>
//   - www.sytenav.com/help-center/…  until then, as an ordinary marketing page
//
// Same shape as lib/hosts.ts: inert until the variable exists, so the code can
// ship before the DNS record does without a window where every link points at a
// host that does not resolve. And once it IS set, the www copy 301s to the help
// host - one page at two URLs is the duplicate `lib/canonical.ts` exists to
// prevent.
//
// IMPORTED BY MIDDLEWARE, which runs on the edge: nothing here may import the
// article bodies. That is why this is not in lib/help/.
// ─────────────────────────────────────────────────────────────────────────────

import { CANONICAL_ORIGIN } from '@/lib/canonical'

/** The internal route tree. Never shown on the help host itself. */
export const HELP_PREFIX = '/help-center'

/** e.g. https://help.sytenav.com - empty until the subdomain exists. */
export const HELP_URL = (process.env.NEXT_PUBLIC_HELP_URL ?? '').replace(/\/+$/, '')

/** True once the Help Center has its own hostname. */
export const helpHostLive = HELP_URL.length > 0

export const HELP_HOST = helpHostLive ? new URL(HELP_URL).host.toLowerCase() : ''

/** Is this request for the help subdomain? */
export function isHelpHost(host: string | null | undefined): boolean {
  if (!helpHostLive || !host) return false
  return host.split(':')[0].toLowerCase() === HELP_HOST
}

/**
 * A link to a Help Center page, given its path WITHIN the help center
 * ('/', '/articles/award-quote', '/topics/money').
 *
 * Absolute once the subdomain is live, so the same static HTML is right
 * whichever host served it; prefixed and relative before then.
 */
export function helpHref(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (helpHostLive) return p === '/' ? `${HELP_URL}/` : `${HELP_URL}${p}`
  return p === '/' ? HELP_PREFIX : `${HELP_PREFIX}${p}`
}

/** The canonical URL of a Help Center page - always absolute, never the deployment host. */
export function helpCanonical(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (helpHostLive) return p === '/' ? HELP_URL : `${HELP_URL}${p}`
  return `${CANONICAL_ORIGIN}${HELP_PREFIX}${p === '/' ? '' : p}`
}

/**
 * What the help host's middleware rewrites a path to, or null to leave it.
 *
 * API calls, Next's own assets and robots.txt pass straight through: the AI
 * answer box posts to /api from this host, and robots.ts is host-aware already.
 * A path that already carries the prefix is left alone so a stale absolute link
 * cannot become /help-center/help-center.
 */
export function helpRewrite(pathname: string): string | null {
  if (pathname === '/api' || pathname.startsWith('/api/')) return null
  if (pathname.startsWith('/_next/')) return null
  if (pathname === '/robots.txt' || pathname === '/manifest.webmanifest') return null
  if (pathname === HELP_PREFIX || pathname.startsWith(`${HELP_PREFIX}/`)) return null
  return pathname === '/' ? HELP_PREFIX : `${HELP_PREFIX}${pathname}`
}
