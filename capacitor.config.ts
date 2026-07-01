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
    // Production domain the native shell loads.
    url: 'https://sytenav.com',
    cleartext: false,
    // Only the app's own origin (+ Supabase for auth) loads in the shell; other links open in the system browser.
    allowNavigation: ['sytenav.com', 'www.sytenav.com', '*.supabase.co'],
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
  ios: { contentInset: 'always' },
}

export default config
