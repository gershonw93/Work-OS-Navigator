// ─────────────────────────────────────────────────────────────────────────────
// Did this REQUEST come from the iOS app?
//
// `lib/use-native.ts` answers that in the browser, which is enough for
// anything the page draws. It is not enough for a sentence the SERVER writes:
// a 402 for a locked account ("Choose a plan..."), the project cap ("move up a
// plan - Company covers 11") and the scan cap all reach the iOS app as an
// error string the page simply prints. Under 3.1.3(f) the app may contain no
// call to purchase, and Apple rejected 1.0 (14) and (15) under 3.1.1 - so the
// server has to know which shell is asking and leave the plan out.
//
// TWO SIGNALS, EITHER ONE IS ENOUGH:
//   - the user agent. `capacitor.config.ts` appends `SyteNavApp/ios` to the
//     WKWebView's UA, so EVERY request carries it from the first one. It is a
//     native setting and only arrives with an iOS rebuild.
//   - a cookie `NativeShell` sets the moment it knows it is on iOS. It reaches
//     the build already in the store, minus the very first page load - which
//     is never a save, so never a refusal.
//
// It decides WORDING ONLY. Nothing is permitted or refused on it: a web user
// who forged the cookie would get a sentence without a plan name in it, which
// is the whole of what it can buy.
//
// Pure, so the client (to set the cookie) and the server (to read it) share
// one spelling of both names. The server half that reads the live request is
// `lib/native-request-server.ts`, kept apart so this file never drags
// `next/headers` into a client bundle.
// ─────────────────────────────────────────────────────────────────────────────

/** Appended to the iOS WKWebView's user agent - see capacitor.config.ts. */
export const IOS_UA_TOKEN = 'SyteNavApp/ios'

/** Set by the iOS shell at runtime, for builds without the UA token. */
export const IOS_SHELL_COOKIE = 'sytenav-shell'
export const IOS_SHELL_COOKIE_VALUE = 'ios'

export function isIosShellRequest(userAgent: string | null | undefined, cookieHeader: string | null | undefined): boolean {
  if (userAgent && userAgent.includes(IOS_UA_TOKEN)) return true
  if (!cookieHeader) return false
  return cookieHeader.split(';').some(part => {
    const [k, ...v] = part.trim().split('=')
    return k === IOS_SHELL_COOKIE && v.join('=') === IOS_SHELL_COOKIE_VALUE
  })
}

/** The cookie string the iOS shell writes. A year, the app's own host only. */
export function iosShellCookie(): string {
  return `${IOS_SHELL_COOKIE}=${IOS_SHELL_COOKIE_VALUE}; path=/; max-age=31536000; secure; samesite=lax`
}

/**
 * What a LOCKED account is told inside the iOS app, by the banner and by every
 * refused save: the fact, and no way to buy. Every web reason ends in "Choose
 * a plan".
 */
export const IOS_LOCKED = 'This account is read-only right now. Nothing has been deleted - everything on your jobs is still here to read.'
