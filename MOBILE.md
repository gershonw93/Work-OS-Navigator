# SyteNav — App Store & Play Store runbook

This app is a **server-rendered Next.js app** (120+ API routes, middleware, SSR). A
Capacitor **static export is not possible** — it would delete the backend. So we ship a
**Capacitor native shell that loads the live deployed web app** (`server.url` in
`capacitor.config.ts`). Everything keeps working with no rewrite.

Run these on **your machine** (Windows/Linux is fine for Android; iOS builds happen in
the cloud via Codemagic — no Mac needed).

---

## 0. Accounts you need
- **Apple Developer Program** — $99/yr — https://developer.apple.com/programs/
- **Google Play Console** — $25 one-time — https://play.google.com/console/
- **Codemagic** account (free tier ok) for Mac-free iOS builds — https://codemagic.io

Decide your identifiers first (used everywhere):
- Bundle ID / package name: `com.sytenav.app` (change in `capacitor.config.ts`, `codemagic.yaml`)
- App name: `SyteNav`
- Production URL: set `server.url` to your custom domain when you have one.

---

## 1. Install Capacitor + platforms
```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npm i @capacitor/app @capacitor/splash-screen @capacitor/status-bar \
      @capacitor/push-notifications @capacitor/camera @capacitor/browser
# capacitor.config.ts is already in the repo. Then:
npx cap add ios
npx cap add android
npx cap sync
```
(You need Android Studio + SDK to build Android locally; iOS is built in the cloud.)

---

## 2. Supabase auth inside the native shell (important)
Because the shell loads the hosted site, email/password login already works. For
**OAuth / magic links**, redirects must return to the app via a deep link, not Safari.

1. Add a custom scheme. In `ios/App/App/Info.plist` add a `CFBundleURLSchemes` entry
   `sytenav`; in `android/app/src/main/AndroidManifest.xml` add an intent-filter for
   scheme `sytenav`.
2. In Supabase → Authentication → URL Configuration, add redirect URLs:
   `sytenav://auth/callback` (and keep your web `https://.../auth/callback`).
3. In the web app, when running inside Capacitor, pass `redirectTo: 'sytenav://auth/callback'`
   to `signInWithOAuth` / `signInWithOtp`, and listen with `@capacitor/app`'s
   `appUrlOpen` to hand the code to `supabase.auth.exchangeCodeForSession`.
   (Ping me and I'll add this shim to the web app once the platforms exist.)

---

## 3. Native capabilities (so Apple doesn't reject it as "just a website")
Already configured in `capacitor.config.ts`: **splash screen**, **push notifications**.
Add via the web app when running natively:
- **Status bar** styling (`@capacitor/status-bar`)
- **Camera** for jobsite photos / document capture (`@capacitor/camera`) — fits daily logs & AI doc scan
- **Push notifications** for approvals, new bids, invoice status
- **Share / open external links** in the system browser (`@capacitor/browser`)
- Optional: **Geolocation** for the time clock, **Filesystem** for offline PDFs

---

## 4. Icons & splash screens
Put a 1024×1024 PNG at `resources/icon.png` and a 2732×2732 PNG at `resources/splash.png`, then:
```bash
npm i -D @capacitor/assets
npx capacitor-assets generate --iconBackgroundColor '#C9F24A' --splashBackgroundColor '#f3f4ef'
```
This generates every required iOS/Android icon + splash size.

---

## 5. Cloud builds (no Mac) — Codemagic
`codemagic.yaml` is in the repo (workflows: `ios-capacitor`, `android-capacitor`).
1. Connect the repo in Codemagic.
2. iOS: add an **App Store Connect API key** integration named `SyteNav ASC`; enable automatic code signing.
3. Android: create a keystore, add it + passwords as the `google_play_credentials` group; add a Play service-account JSON.
4. Run `ios-capacitor` → uploads to **TestFlight**; `android-capacitor` → uploads to Play **internal** track.

---

## 6. Store submission checklist
- App name, subtitle, description, keywords, screenshots (see `store/listing.md`)
- Privacy policy URL: **https://your-domain/homepage/privacy** (already built)
- App privacy "nutrition label" (data collected via Supabase auth: name, email, usage)
- Support URL: `/homepage/contact`
- Age rating, category (Business / Productivity)
- iOS: TestFlight review → App Store review. Android: internal → closed → production.

---

## What I can wire up next (just ask)
- The Capacitor-aware Supabase deep-link auth shim in the web app
- A small `useNative()` hook that enables camera/status-bar/push only inside the shell
- A cookie-consent banner + App Privacy details doc
