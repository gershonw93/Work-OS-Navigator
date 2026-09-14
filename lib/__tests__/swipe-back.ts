// Swipe in from the left edge to go back - the gesture every iPhone app has.
//
// "add swiping all over to go back ... make it feel super native app like."
// Two halves, and the pin reads both:
//
//   * THE NATIVE HALF. WKWebView does this gesture itself, interactively, with
//     the system's slide-and-snapshot - `allowsBackForwardNavigationGestures`.
//     It is off by default. Turning it on is a subclass of the bridge view
//     controller that the storyboard has to instantiate, and it only reaches a
//     phone after an iOS rebuild - the same shape as @capacitor/keyboard, and
//     that one sat asserted-but-absent for most of the app's life. So the
//     Swift, the storyboard and the base class it relies on are all checked.
//   * THE WEB HALF. The home-screen app in Safari, Android, and every phone on
//     an older build get a JavaScript version of the same gesture, mounted
//     once from the one component both shells share.

import { startsAtEdge, backProgress, shouldGoBack, canSwipeBack, BACK_EDGE_PX, BACK_COMMIT_PX } from '../swipe-back'
import { ok, done, code, read, exists } from './_helpers'

// ── where it may start ──────────────────────────────────────────────────────
ok(startsAtEdge(0) && startsAtEdge(BACK_EDGE_PX), 'a finger landing in the edge strip may mean back')
ok(!startsAtEdge(BACK_EDGE_PX + 1) && !startsAtEdge(150),
  'one landing anywhere else is a scroll through whatever is there - a table, a calendar, a photo strip')
ok(!startsAtEdge(-1), 'and an impossible x is not the edge')

// ── how far it has come ─────────────────────────────────────────────────────
ok(backProgress(0) === 0 && backProgress(-30) === 0,
  'no travel is no progress, and travelling toward the edge is no travel')
ok(backProgress(BACK_COMMIT_PX / 2) === 0.5 && backProgress(BACK_COMMIT_PX) === 1 && backProgress(400) === 1,
  'progress is a fraction of the commit distance, capped at 1')

// ── and whether letting go means it ─────────────────────────────────────────
ok(shouldGoBack({ dx: BACK_COMMIT_PX, elapsedMs: 900 }), 'reaching the commit distance goes back')
ok(!shouldGoBack({ dx: 40, elapsedMs: 900 }),
  'a slow 40px does not - a thumb resting near the edge would otherwise navigate')
ok(shouldGoBack({ dx: 45, elapsedMs: 70 }), 'THE FLICK goes back too, which distance alone would refuse')
ok(!shouldGoBack({ dx: -200, elapsedMs: 100 }), 'dragging toward the edge never does')

// ── three refusals ──────────────────────────────────────────────────────────
const base = { historyLength: 5, overlayOpen: false, wide: false }
ok(canSwipeBack(base), 'a page with somewhere to go back to, nothing over it, on a phone')
ok(!canSwipeBack({ ...base, historyLength: 1 }),
  'THE FIRST PAGE: back from here is out of the app entirely, which reads as a crash')
ok(!canSwipeBack({ ...base, overlayOpen: true }),
  'an open dialog, sheet or drawer is the thing on top - the page under it does not move')
ok(!canSwipeBack({ ...base, wide: true }), 'the desktop does not change')

// ── the hook ────────────────────────────────────────────────────────────────
const hook = code('lib/use-swipe-back.ts')
ok(/document\.addEventListener\('touchstart', onStart, \{ passive: true \}\)/.test(hook),
  'listens on document, passively - a non-passive touch listener there makes every scroll wait on it')
ok(/document\.querySelector\('\[data-overlay\]'\)/.test(hook),
  'asks whether an overlay is open by the attribute every overlay carries')
ok(/window\.history\.length/.test(hook) && /min-width: 1024px/.test(hook), '...and makes the other two refusals')
ok(/axis\.current === 'undecided'\) axis\.current = swipeAxis/.test(hook), 'the axis is decided ONCE and kept')
ok(/window\.history\.back\(\)/.test(hook),
  "commit is the browser's own back, which the router owns - the same place WKWebView's gesture goes")
ok(!/preventDefault/.test(hook), 'nothing calls preventDefault')

// ── mounted once, from the one component both shells share ──────────────────
const shell = code('components/layout/native-shell.tsx')
ok(/<SwipeBack \/>/.test(shell), 'the gesture is mounted from NativeShell')
for (const f of ['app/(dashboard)/layout.tsx', 'app/field/layout.tsx']) {
  ok(/<NativeShell \/>/.test(read(f)), `...which ${f} mounts`)
}
const comp = code('components/layout/swipe-back.tsx')
ok(/aria-hidden/.test(comp), 'the hint is not a control')
ok(!/\bfixed\b[^"']*\binset-0\b/.test(comp), '...and not a hand-rolled overlay')
const css = read('app/globals.css')
ok(/\.swipe-back-hint \{[^}]*position: fixed;[^}]*var\(--vv-t/.test(css),
  'pinned to the VISIBLE strip, like every other fixed element')

// ── THE NATIVE HALF ─────────────────────────────────────────────────────────
const delegate = read('ios/App/App/AppDelegate.swift')
ok(/class SyteNavViewController: CAPBridgeViewController/.test(delegate),
  'the shell subclasses the bridge view controller')
ok(/override open func capacitorDidLoad\(\)/.test(delegate),
  '...at the override point Capacitor documents, where the webview already exists')
ok(/webView\?\.allowsBackForwardNavigationGestures = true/.test(delegate),
  "THE SETTING: WKWebView's own edge-swipe, which is the real native gesture")
const storyboard = read('ios/App/App/Base.lproj/Main.storyboard')
ok(/customClass="SyteNavViewController" customModule="App"/.test(storyboard),
  'the storyboard instantiates the subclass - a subclass nothing instantiates sets nothing')
ok(!/customClass="CAPBridgeViewController"/.test(storyboard), '...and no longer the base class')
ok(exists('node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift'),
  '(fixture sanity: the base class is really there)')
const cap = read('node_modules/@capacitor/ios/Capacitor/Capacitor/CAPBridgeViewController.swift')
ok(/open func capacitorDidLoad\(\)/.test(cap) && /var webView: WKWebView\?/.test(cap),
  '...and still has the two members the subclass relies on')

done()
