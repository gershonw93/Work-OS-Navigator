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
