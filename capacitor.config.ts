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
    // Point at your production deployment (use your custom domain once you have one).
    url: 'https://work-os-navigator.vercel.app',
    cleartext: false,
    // Only the app's own origin loads in the shell; external links open in the system browser.
    allowNavigation: ['work-os-navigator.vercel.app', '*.supabase.co'],
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
