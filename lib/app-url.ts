/**
 * Where the PRODUCT lives - the origin every auth link must come back to.
 *
 * There are two domains and they are not interchangeable:
 *   NEXT_PUBLIC_SITE_URL  - the marketing site (sytenav.com)
 *   NEXT_PUBLIC_APP_URL   - the product and sign-in (app.sytenav.com)
 *
 * Auth callbacks, password resets and invites belong on the APP. Sending one to
 * the marketing domain gives the recipient a page that cannot complete the
 * sign-in - the invite route was doing exactly that, preferring SITE_URL over
 * APP_URL for /auth/callback.
 *
 * Order matters: APP_URL, then the host actually serving the request, then
 * SITE_URL as a last resort, and only then a hardcoded default. Preferring the
 * live host over a stale env var is deliberate - a link that comes back to
 * wherever the user really is beats one pointing at a domain someone forgot to
 * update.
 */
export function appOrigin(requestOrigin?: string | null): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const chosen = configured || requestOrigin || site || 'https://app.sytenav.com'
  return chosen.replace(/\/+$/, '')
}

/**
 * The same thing in the browser.
 *
 * Falls back to where the page actually is, so a reset requested from a preview
 * deployment comes back to that preview rather than bouncing to production.
 */
export function clientAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'https://app.sytenav.com'
}
