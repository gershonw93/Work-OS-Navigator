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
    // ───────────────────────────────────────────────────────────────────
    // THE APP'S OWN ORIGIN AND THE AUTH HOP. NOTHING ELSE.
    //
    // This list used to carry `sytenav.com` and `www.sytenav.com` too, and
    // that is the exact path the App Review reviewer walked: an app-side link
    // to a MARKETING_PATHS entry (`PLAN_CTA_HREF` was `/contact`) is
    // redirected by middleware to the marketing host, and a host on this list
    // renders IN THE WEBVIEW - so the Pricing page, with $99 / $299 / $499 and
    // a CTA on every card, looked like a screen of the app. Build 1.0 (14)
    // came back under 3.1.1.
    //
    // The prices and every link to them are gone, so nothing reaches those
    // hosts today; this is the structural stop so a regression cannot. A link
    // to a host NOT on this list opens in the system browser instead, which is
    // the right failure: the guideline is about a purchase surface inside the
    // app, and Safari is visibly not the app.
    //
    // Supabase stays - it is the auth redirect, not a destination.
    //
    // NEEDS AN IOS REBUILD TO TAKE EFFECT, like every other native setting in
    // this file. `ios-no-purchase.ts` pins the list, and pins that no app-side
    // file links to a marketing path - that half ships with a Vercel deploy
    // and is what actually guards the regression in the meantime.
    // ───────────────────────────────────────────────────────────────────
    allowNavigation: ['app.sytenav.com', '*.supabase.co'],
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
