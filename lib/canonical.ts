// ─────────────────────────────────────────────────────────────────────────────
// The one hostname the marketing site is allowed to be indexed on.
//
// WHY THIS IS NOT JUST AN ENV VAR. metadataBase in the root layout falls back
// to VERCEL_PROJECT_PRODUCTION_URL when NEXT_PUBLIC_SITE_URL is unset, so a
// missing variable did not break anything loudly - it quietly made every
// canonical tag point at work-os-navigator.vercel.app, and Google indexed the
// deployment URL alongside the real site. Two copies of the same pages, and the
// internal project name in the search results.
//
// A canonical host must not be able to fall back to whatever host happened to
// serve the request. Env var if set, hardcoded real domain otherwise.
// ─────────────────────────────────────────────────────────────────────────────

/** Where the marketing site really lives. */
export const CANONICAL_ORIGIN =
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.sytenav.com').replace(/\/+$/, '')

/** Hostnames allowed to serve indexable marketing pages. */
const INDEXABLE_HOSTS = new Set([
  new URL(CANONICAL_ORIGIN).host,
  // The apex, so a visitor who drops the www is not served noindex while the
  // redirect to www is being set up.
  new URL(CANONICAL_ORIGIN).host.replace(/^www\./, ''),
])

/**
 * Should this host be in a search index?
 *
 * Everything else - vercel.app deployment URLs, preview builds, branch aliases
 * - answers no. They serve the same pages, and every one of them Google finds
 * is a duplicate competing with the real site.
 */
export function isIndexableHost(host: string | null | undefined): boolean {
  if (!host) return false
  const bare = host.split(':')[0].toLowerCase()
  return INDEXABLE_HOSTS.has(bare)
}

/** An absolute canonical URL for a marketing path. */
export function canonicalUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${CANONICAL_ORIGIN}${p === '/' ? '' : p}`
}
