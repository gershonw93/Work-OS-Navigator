# SyteNav - App Store & Play Store runbook

This app is a **server-rendered Next.js app** (120+ API routes, middleware, SSR). A
Capacitor **static export is not possible** - it would delete the backend. So we ship a
**Capacitor native shell that loads the live deployed web app** (`server.url` in
`capacitor.config.ts`). Everything keeps working with no rewrite.

Run these on **your machine** (Windows/Linux is fine for Android; iOS builds happen in
the cloud via Codemagic - no Mac needed).

---

## 0. Accounts you need
Start these FIRST - they involve waiting on other people, and everything else is
blocked behind them.

| Account | Cost | Notes |
|---|---|---|
| **D-U-N-S number** | free | Dun & Bradstreet. Needed to enrol as an *organization* (not an individual) on both Apple and Google. Longest lead time - request it before anything else. |
| **Apple Developer Program** | $99/yr | https://developer.apple.com/programs/ · Enrol as an Organization so the seller shows as SyteNav, not a personal name. Needs the D-U-N-S + a legal entity. App Store Connect comes with it. |
| **Google Play Console** | $25 once | https://play.google.com/console/ · Register as an **organization**, not personal - personal accounts have to run a closed test with real testers for a fixed period before they may publish. |
| **Codemagic** | free tier | https://codemagic.io · Mac-free iOS builds. `codemagic.yaml` is already in the repo. |

Both stores require identity verification (documents, sometimes a phone call), so treat
the account setup as its own task, not a five-minute form. Verify current fees and
requirements when you sign up - these change.

Decide your identifiers first (used everywhere):
- Bundle ID / package name: `com.sytenav.app` (set in `capacitor.config.ts` + `codemagic.yaml`)
- App name: `SyteNav`
- Production URL: `https://sytenav.com` (set as `server.url` in `capacitor.config.ts`)

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
Auth is **email + magic link only (no OAuth)**. Email/password login already works in
the shell. For the **magic-link** flow, the link must return to the app via a deep link,
not Safari/Chrome.

1. Add a custom scheme. In `ios/App/App/Info.plist` add a `CFBundleURLSchemes` entry
   `sytenav`; in `android/app/src/main/AndroidManifest.xml` add an intent-filter for
   scheme `sytenav`.
2. In Supabase → Authentication → URL Configuration, add redirect URLs:
   `sytenav://auth/callback` (and keep the web `https://sytenav.com/auth/callback`).
3. In the web app, when running inside Capacitor, pass `emailRedirectTo: 'sytenav://auth/callback'`
   to `signInWithOtp`, and listen with `@capacitor/app`'s `appUrlOpen` to hand the code to
   `supabase.auth.exchangeCodeForSession`.
   (Ping me and I'll add this magic-link shim to the web app once the platforms exist.)

---

## 2b. Sign-up is hidden on iOS (DONE - nothing to do)
Apple takes 15-30% of anything sold inside an iOS app, so the iOS build is **sign-in
only**: you sign up and pay on the web, then log in on the phone. Same shape Slack and
Salesforce use. Android and the web are untouched.

Already wired, in `lib/use-native.ts`:
- `useNativePlatform()` reads `window.Capacitor` at runtime - no npm dependency, reports
  `'web'` until the native shell exists.
- `canSignUpHere()` / `useCanSignUp()` is the single switch. Callers: the login page
  (link becomes plain text), `/signup` (shows "accounts are set up on the web"), and
  Settings → Billing (Upgrade button becomes a line of text).
- An **invite link still works on iOS** (`/signup?invite=…`) - that is an account being
  handed over, not a sale.

**To allow sign-up on iOS later** - if billing moves to In-App Purchase, or the rules on
linking out settle - flip `IOS_SIGNUP_ALLOWED` to `true` in `lib/use-native.ts`. That is
the only change; every caller reads that one function.

⚠️ If you later add a link out to buy a plan, it must open in the **system browser**
(`@capacitor/browser`), not an in-app webview. Apple treats an embedded webview as still
being inside the app.

## 3. Native capabilities (so Apple doesn't reject it as "just a website")
Already configured in `capacitor.config.ts`: **splash screen**, **push notifications**.
Add via the web app when running natively:
- **Status bar** styling (`@capacitor/status-bar`)
- **Camera** for jobsite photos / document capture (`@capacitor/camera`) - fits daily logs & AI doc scan
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

## 5. Cloud builds (no Mac) - Codemagic
`codemagic.yaml` is in the repo (workflows: `ios-capacitor`, `android-capacitor`).
1. Connect the repo in Codemagic.
2. iOS: add an **App Store Connect API key** integration named `SyteNav ASC`; enable automatic code signing.
3. Android: create a keystore, add it + passwords as the `google_play_credentials` group; add a Play service-account JSON.
4. Run `ios-capacitor` → uploads to **TestFlight**; `android-capacitor` → uploads to Play **internal** track.

---

## 6. Store submission checklist
- App name, subtitle, description, keywords, screenshots (see `store/listing.md`)
- Privacy policy URL: **https://sytenav.com/homepage/privacy** (already built)
- App privacy "nutrition label" (data collected via Supabase auth: name, email, usage)
- Support URL: `/homepage/contact`
- Age rating, category (Business / Productivity)
- iOS: TestFlight review → App Store review. Android: internal → closed → production.

---

## What I can wire up next (just ask)
- The Capacitor-aware Supabase deep-link auth shim in the web app
- A small `useNative()` hook that enables camera/status-bar/push only inside the shell
- A cookie-consent banner + App Privacy details doc
