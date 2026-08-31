// ─────────────────────────────────────────────────────────────────────────────
// Where an OAuth handshake comes back to.
//
// THE PROBLEM. Connecting QuickBooks sends the browser to Intuit's consent
// screen. Inside the phone app that has to be the REAL Safari, not an embedded
// webview - Intuit blocks embedded webviews outright, and Apple treats an
// embedded one as still being inside the app. So the person leaves.
//
// Intuit then redirects to our callback, which redirects to /settings on
// app.sytenav.com... in Safari. You would finish connecting QuickBooks and be
// left looking at a browser, with no way to tell whether it had worked, and no
// route back except switching apps by hand. That is the whole bug.
//
// THE FIX. The callback needs to know the handshake STARTED in the app, hours
// of latency and a whole other application later. The only thing that survives
// that round trip is the `state` parameter, so that is what carries it.
//
// A prefix on the state rather than a new column, deliberately. The state is
// already a single-use row that must exist in the database for the callback to
// proceed - the prefix cannot be forged into anything, because we are the ones
// who mint it. A column would be clearer to read and would add a way for the
// whole connect flow to break on a database that has not been migrated, which
// is a bad trade for one boolean.
// ─────────────────────────────────────────────────────────────────────────────

/** The scheme registered in ios/App/App/Info.plist. */
export const APP_SCHEME = 'sytenav'

const NATIVE_PREFIX = 'app-'

/**
 * Mark a freshly-minted state as having started inside the phone app.
 *
 * Web states are left exactly as they were - a bare UUID - so nothing about
 * the existing flow changes, and states minted before this existed still read
 * correctly as web.
 */
export function markState(state: string, native: boolean): string {
  return native ? `${NATIVE_PREFIX}${state}` : state
}

export function isNativeState(state: string | null | undefined): boolean {
  return String(state ?? '').startsWith(NATIVE_PREFIX)
}

/**
 * The URL to send the browser to once Intuit is done with it.
 *
 * From the web: an ordinary path on our own origin, as before.
 * From the app: sytenav://settings?... which iOS hands to the app, closing
 * Safari and putting the person back where they started - on the Integrations
 * tab, reading whether it worked.
 *
 * `params` is the same set either way. The outcome message is not something
 * the phone should have to work out for itself.
 */
export function oauthReturnUrl(
  state: string | null | undefined,
  origin: string,
  params: Record<string, string>,
): string {
  const query = new URLSearchParams(params).toString()
  const path = `/settings${query ? `?${query}` : ''}`
  // A custom scheme has no meaningful host, and iOS puts the first path
  // segment there - so sytenav://settings?x=1 is the shape that opens
  // /settings?x=1. See pathFromDeepLink in components/layout/native-shell.tsx,
  // which is the other half of this.
  return isNativeState(state) ? `${APP_SCHEME}:/${path}` : `${origin}${path}`
}
