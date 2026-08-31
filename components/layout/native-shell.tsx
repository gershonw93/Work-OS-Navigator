'use client'

import { useEffect } from 'react'
import { usePush } from '@/lib/use-push'
import { useNativePlatform } from '@/lib/use-native'

/**
 * Everything the phone app needs that the website does not.
 *
 * Rendered once per shell (the dashboard and the field layouts). On the web
 * every hook inside it short-circuits on `isNative` and this renders nothing,
 * costs nothing and downloads nothing - the Capacitor plugins are behind
 * dynamic imports.
 *
 * One component rather than three hooks scattered through the layouts, so
 * there is a single answer to "what is different inside the app".
 */
export function NativeShell() {
  usePush()
  useStatusBar()
  useDeepLinks()
  return null
}

/**
 * Match the status bar to the theme.
 *
 * Without this iOS draws dark text on the status bar regardless, which is
 * invisible against SyteNav's dark mode - the clock and the battery simply
 * disappear. It follows the `dark` class the theme script sets on <html>, so
 * it tracks a theme change without being told about it.
 */
function useStatusBar() {
  const { isNative, ready } = useNativePlatform()

  useEffect(() => {
    if (!ready || !isNative) return
    let stop: (() => void) | undefined

    ;(async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar')
        const apply = () => {
          const dark = document.documentElement.classList.contains('dark')
          // Style.Dark means "dark CONTENT" - i.e. dark text for a light bar.
          // The naming is Apple's and it is the wrong way round from what you
          // would guess, which is worth one comment rather than one bug.
          StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark }).catch(() => {})
        }
        apply()
        const observer = new MutationObserver(apply)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        stop = () => observer.disconnect()
      } catch { /* the bar keeps its default; not worth an error */ }
    })()

    return () => stop?.()
  }, [ready, isNative])
}

/**
 * Coming back INTO the app from somewhere else.
 *
 * Two things send you out to Safari and need to land back here:
 *   * connecting QuickBooks - Intuit's consent screen has to open in the real
 *     browser (Intuit blocks embedded webviews, and Apple treats an embedded
 *     one as still being inside the app). Without this you would finish
 *     connecting and be left staring at Safari, with no way to tell whether
 *     it had worked.
 *   * links in email - a password reset or an invite.
 *
 * Both arrive as sytenav://<path>, registered as a URL scheme in
 * ios/App/App/Info.plist. Only the path is used; the host part is ignored, so
 * sytenav://settings?tab=integrations opens /settings?tab=integrations.
 */
function useDeepLinks() {
  const { isNative, ready } = useNativePlatform()

  useEffect(() => {
    if (!ready || !isNative) return
    let remove: (() => void) | undefined

    ;(async () => {
      try {
        const { App } = await import('@capacitor/app')
        const handle = await App.addListener('appUrlOpen', async ({ url }) => {
          const path = pathFromDeepLink(url)
          if (!path) return
          // Safari is still sitting on top; close it before navigating or the
          // app comes back underneath a browser nobody dismissed.
          try {
            const { Browser } = await import('@capacitor/browser')
            await Browser.close()
          } catch { /* nothing open, which is fine */ }

          // A REAL navigation, not router.push. A deep link from outside the
          // app always means "something happened elsewhere, show me the
          // result" - and the screens that read that result do it once, on
          // mount. The QuickBooks card reads ?qbo=connected in a mount effect,
          // so a soft navigation to the same route would land silently: the
          // connection would have worked and the card would still be sitting
          // on its spinner saying nothing.
          window.location.assign(path)
        })
        remove = () => { handle.remove() }
      } catch { /* nothing to listen with */ }
    })()

    return () => remove?.()
  }, [ready, isNative])
}

/**
 * The in-app path a deep link is asking for, or null if it is not ours.
 *
 * Split out and exported because it is the part with the sharp edge: anything
 * that turns an incoming URL into a navigation is a place a hostile link tries
 * to send somebody somewhere they did not intend. Only a relative path inside
 * SyteNav is ever returned - never an absolute URL, never a protocol-relative
 * //evil.example one, never a scheme we do not own.
 */
export function pathFromDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'sytenav:' && url.host !== 'app.sytenav.com') return null
    // A sytenav:// URL puts the first segment in `host`, so sytenav://settings
    // has pathname '' and host 'settings'. Recombine them, then take only the
    // path - which by construction cannot escape the app.
    const path = url.protocol === 'sytenav:'
      ? `/${url.host}${url.pathname}`.replace(/\/+/g, '/')
      : url.pathname
    if (!path.startsWith('/') || path.startsWith('//')) return null
    return `${path}${url.search}${url.hash}`
  } catch {
    return null
  }
}
