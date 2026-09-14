// SyteNav native shell (Capacitor).
//
// This app is a server-rendered Next.js app (120+ API routes, middleware, SSR),
// so a Capacitor static export is NOT viable. Instead the native shell loads the
// live deployed web app via `server.url`. All server features keep working.
//
// Change `appId` / `appName` / `server.url` to your real values before building.
const config = {
  appId: 'com.sytenav.app',
  appName: 'SyteNav',
  // Required by Capacitor even in remote mode; not used for content.
  webDir: 'public',
  server: {
    // The native shell loads the PRODUCT, not the marketing site.
    url: 'https://app.sytenav.com',
    cleartext: false,
    // What the phone shows when it cannot reach app.sytenav.com.
    // Without this the webview renders its own blank failure page, which
    // reads as a broken app - and one bar of signal is normal on a jobsite.
    // The file lives in `public/` (which is webDir), so it ships inside the
    // app bundle and needs no network to appear.
    errorPath: 'offline.html',
    // Only the app's own origin (+ Supabase for auth) loads in the shell; other links open in the system browser.
    allowNavigation: ['app.sytenav.com', 'sytenav.com', 'www.sytenav.com', '*.supabase.co'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f3f4ef',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // ─────────────────────────────────────────────────────────────────────
    // THE PLUGIN THE WHOLE VIEWPORT DESIGN ASSUMED WAS ALREADY HERE.
    //
    // `lib/visible-viewport.ts` opens by stating that "Capacitor's default
    // keyboard mode shrinks the WKWebView frame, so the LAYOUT viewport is
    // already only the visible strip" - and CLAUDE.md repeated it as fact.
    // It was not true of the shipped app: @capacitor/keyboard was never
    // installed, so nothing resized anything. The branch in that file for a
    // shrunken frame was dead code, and the app ran permanently in the
    // mobile-Safari branch it was only meant to fall back to.
    //
    // What that looks like on the phone: WKWebView does not resize, so iOS
    // PANS the visual viewport to bring a focused field above the keyboard -
    // and panning drags every `position: fixed` element with it. Reported
    // against the Request Inspection form: tapping Inspector Name left the
    // bottom tab bar floating in the middle of the screen, a band of bare
    // background where the app should be, and the dialog somewhere off the
    // top. The same "the screen goes crazy" family as the 16px zoom rule.
    //
    // `resize: 'native'` is what the CSS was written for: the frame shrinks,
    // the layout viewport IS the strip, fixed elements stay where they are,
    // and `visibleViewport` takes its first branch instead of subtracting a
    // keyboard that is already outside the frame.
    //
    // NEEDS AN IOS REBUILD TO TAKE EFFECT - it is a native dependency, not
    // something the remote web app can change on its own.
    // ─────────────────────────────────────────────────────────────────────
    Keyboard: {
      resize: 'native',
    },
  },
  ios: {
    // 'never', and this is not a harmless default.
    //
    // THE BUG. The top bar sat flush under the Dynamic Island, then jumped down
    // by exactly 59pt when the menu was opened, then back. Nothing in SyteNav
    // pads the top - iOS was, via 'always', which tells WKWebView to inset its
    // OWN scroll view by the safe area.
    //
    // That held while the document scrolled. Then the shell became one screen
    // tall with <main> as the only scroller (#388), and an inset applied to a
    // scroll view with nothing to scroll started being recalculated on layout
    // events - opening the drawer sets `html { overflow: hidden }`, which is
    // enough to make iOS reapply it.
    //
    // One value, decided in two places, and which one is in force depends on
    // what the webview did last. So it moves to one: 'never' takes iOS out of
    // it, `viewportFit: 'cover'` (app/layout.tsx) makes env(safe-area-inset-*)
    // report the real numbers instead of zero, and the CSS that has been
    // written for those insets all along finally does the job.
    contentInset: 'never',
  },
}

export default config
