'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { edgeColor } from '@/lib/edge-color'
import { usePush } from '@/lib/use-push'
import { useVisualViewport } from '@/lib/use-visual-viewport'
import { useNativePlatform } from '@/lib/use-native'
import { SwipeBack } from './swipe-back'
import { PullRefresh } from './pull-refresh'

/**
 * Everything the phone app needs that the website does not.
 *
 * Rendered once per shell (the dashboard and the field layouts). On the web
 * every native hook inside it short-circuits on `isNative` and costs nothing -
 * the Capacitor plugins are behind dynamic imports. The one thing it renders
 * is the swipe-back hint, which is for every phone, not only the app.
 *
 * One component rather than three hooks scattered through the layouts, so
 * there is a single answer to "what is different inside the app".
 */
export function NativeShell() {
  usePush()
  useStatusBar()
  useDeepLinks()
  // The one hook here that is NOT about being the native app: mobile Safari has
  // the same keyboard, and an overlay laid out against the layout viewport ends
  // up behind it either way. This is the only component mounted in both shells,
  // which is why it lives here.
  useVisualViewport()
  // Edge-swipe to go back, for the same reason and from the same place: the
  // native shell has WKWebView's own gesture (AppDelegate.swift), and this is
  // the same gesture for the home-screen app, Android, and a phone still on an
  // older build. Mounted here so every screen answers to it and none can forget.
  // Mounted beside the back gesture and for the same reason: both are phone
  // gestures that every screen must answer to, and neither can be left to the
  // twenty screens to remember. They share `swipeAxis`, so a sideways drag is
  // the back gesture's and a downward one is this one's - never both.
  return (
    <>
      <SwipeBack />
      <PullRefresh />
    </>
  )
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
  const { isNative, ready, platform } = useNativePlatform()
  // Android's bands are painted from what is ON SCREEN at each edge, and the
  // field shell's top is `surface` where the dashboard's is `panel` - so a
  // navigation can change the answer without the theme changing.
  const pathname = usePathname()

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
          if (platform === 'android') paintAndroidBars()
        }
        apply()
        const observer = new MutationObserver(apply)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
        stop = () => observer.disconnect()
      } catch { /* the bar keeps its default; not worth an error */ }
    })()

    return () => stop?.()
  }, [ready, isNative, platform, pathname])
}

/**
 * ANDROID: tell the native side what colour is at the top and bottom edges.
 *
 * Google Play requires targetSdk 36, which puts the app edge to edge under the
 * system bars. MainActivity keeps the WebView BETWEEN the bars and paints the
 * bands behind them - but only the page knows its colours: the theme is picked
 * inside the app and can disagree with the phone's night mode, and the phone's
 * guess would put a dark clock on a dark band. See MainActivity.java.
 *
 * Next frame, so the class change that triggered this has been painted.
 */
function paintAndroidBars() {
  requestAnimationFrame(async () => {
    try {
      const top = edgeColor(document.elementFromPoint(1, 1))
      const bottom = edgeColor(document.elementFromPoint(1, window.innerHeight - 1))
      if (!top || !bottom) return
      const { registerPlugin } = await import('@capacitor/core')
      const Bars = registerPlugin<{ setColors(o: { top: string; bottom: string }): Promise<void> }>('SyteNavBars')
      await Bars.setColors({ top, bottom })
    } catch { /* an older app build has no such plugin; its bars keep their colour */ }
  })
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
