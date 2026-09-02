# SyteNav - App Store & Play Store runbook

This app is a **server-rendered Next.js app** (120+ API routes, middleware, SSR). A
Capacitor **static export is not possible** - it would delete the backend. So we ship a
**Capacitor native shell that loads the live deployed web app** (`server.url` in
`capacitor.config.ts`). Everything keeps working with no rewrite.

Run these on **your machine** (Windows/Linux is fine for Android; iOS builds happen in
the cloud via Codemagic - no Mac needed).

---

## YOU ARE HERE: Developer Program approved, no keys yet

Everything in this repo is done. What is left is six steps, and five of them are
on Apple's side. In this order, because each one unblocks the next:

| # | Where | Do | Unblocks | Time |
|---|---|---|---|---|
| 1 | App Store Connect | **My Apps → + → New App.** Bundle ID `com.sytenav.app`, name `SyteNav`, primary language, SKU (anything - `sytenav-ios`). If the bundle ID is not in the dropdown, do step 2 first. | Everything - Codemagic uploads into this record | 5 min |
| 2 | Developer portal → Identifiers | Register the App ID `com.sytenav.app` if it does not exist, and tick **Push Notifications** and **Associated Domains**. Tick Associated Domains NOW even though the entitlement is added later - it is free to have and awkward to add mid-build. | Push, and Universal Links later | 5 min |
| 3 | Developer portal → Keys | Create **two** `.p8` keys, and download each one - Apple shows them once and never again. (a) **APNs**, for push. (b) **App Store Connect API** with the *App Manager* role, for Codemagic. Note the Key ID of each, and your **Team ID** (top right of the portal). | Steps 4 and 5 | 10 min |
| 4 | Vercel → Settings → Environment Variables (Production) | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the whole `.p8` file, newlines and all - pasted `\n` is handled), and `APPLE_TEAM_ID`. Redeploy. | Push actually sends; `/.well-known/apple-app-site-association` stops 404ing | 5 min |
| 5 | Codemagic | Connect the repo. Add the **App Store Connect API key** from 3(b) as an integration named exactly `SyteNav ASC` - `codemagic.yaml` refers to it by that name. Enable automatic code signing. Run the **`ios-capacitor`** workflow. | A TestFlight build | 20 min + build |
| 6 | After the build succeeds | Associated Domains entitlement (section 2), re-seed the demo account, and look at the safe areas on a real device. Then submit. | Submission | - |

**Why the entitlement waits until after step 5.** An entitlement the App ID does
not carry fails code signing, and the error does not name which one. Get one
clean build first, then add it.

**What you can prove without a build:** once step 4 is done, push is live on the
web app. Sign in on your phone's browser, then **Settings → Notifications → Send
test**. It only ever reaches your own phones, and it says which of the three
things is wrong when nothing arrives.

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
- Production URL: `https://app.sytenav.com` (set as `server.url` in `capacitor.config.ts`). The shell loads the PRODUCT, not the marketing site - `sytenav.com` serves marketing only.

---

## 1. Capacitor + the iOS project - DONE, nothing to do
Installed and committed. `ios/` is in the repo, so the permission strings, the
push entitlement and the icons live in version control rather than on somebody's
machine. After changing `capacitor.config.ts` or adding a plugin, run:
```bash
npx cap sync ios
```
`pod install` is skipped on Linux and runs in the Codemagic build - that warning
is expected, not a failure.

**Android is set up too.** `android/` is committed, with the camera, photo,
location and notification permissions declared in `AndroidManifest.xml` - the
same capabilities the iOS `Info.plist` strings cover. The `android-capacitor`
workflow in `codemagic.yaml` builds it; it needs a keystore and a Play
service-account JSON (section 5) before it can upload. Nothing about Android
blocks the iOS submission - do iOS first.

---

## 2. Auth in the shell - works, with one thing left
Signing in is **email + password**, which works in the shell with no change.
(An earlier draft of this file said magic link; the app does not use one.)

The `sytenav://` URL scheme IS registered (`Info.plist`), and
`components/layout/native-shell.tsx` listens for it - that is what brings you
back after connecting QuickBooks.

**Not done: email links opening the app.** A password-reset or invite email has
to be an ordinary `https://` link so it works on a desktop too, so a custom
scheme is no good - that needs **Universal Links**. The server half is built and
inert: `/.well-known/apple-app-site-association` answers 404 until you set
`APPLE_TEAM_ID`. To finish it, after the first TestFlight build succeeds:

1. Apple developer portal → the App ID `com.sytenav.app` → tick **Associated
   Domains**.
2. Add to `ios/App/App/App.entitlements`:
   ```xml
   <key>com.apple.developer.associated-domains</key>
   <array><string>applinks:app.sytenav.com</string></array>
   ```
3. Set `APPLE_TEAM_ID` in Vercel.

Left until after the first build on purpose: an entitlement the App ID does not
carry **fails code signing**, and the error does not say which one.

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
Apple's rule **4.2, "minimum functionality"**, is the real risk for any app that
wraps a website. These are the mitigation, and they are all built:

- **Push notifications** - end to end. `lib/push.ts` talks to Apple over HTTP/2
  with an ES256 JWT and no npm dependency; sending is wired into `lib/notify.ts`,
  the one place the app tells anybody anything, so no other code changed.
  **One switch:** push obeys the in-app toggle the user already has. The `push`
  flag in `lib/notifications.ts` is our editorial call about which seven types
  deserve to interrupt somebody.
- **Camera and location** - already used by daily logs, materials and the time
  clock, now with the `Info.plist` strings that stop iOS killing the app.
- **Offline screen** - `public/offline.html`, wired to `server.errorPath`. A
  blank white webview on one bar of signal is a rejection and a bad app.
- **Splash screen + status bar** that follow the theme.
- **Safe areas** - `.pt-safe` / `.pb-safe` / `.px-safe` / `.pb-field-nav` in
  `globals.css`, applied to the fixed sidebar and the field bottom nav.
  ⚠️ **Needs one pass on a real device.** iOS also insets the webview's own
  scroll view (`contentInset: 'always'`), so some of these resolve to zero. It
  cannot be judged from a desktop browser; look at it in TestFlight.

### Push: what to set, and where
In **Vercel** (production env), after the Apple keys exist:

| Variable | What it is |
|---|---|
| `APNS_KEY_ID` | The Key ID of the `.p8` push key |
| `APNS_TEAM_ID` | Your Apple Team ID |
| `APNS_PRIVATE_KEY` | The whole `.p8` file contents. Pasted newlines usually arrive as `\n` - that is handled |
| `APNS_BUNDLE_ID` | Optional, defaults to `com.sytenav.app` |
| `APNS_SANDBOX` | Leave unset. TestFlight and App Store builds use production |

In the **Apple developer portal**: the App ID `com.sytenav.app` must have
**Push Notifications** ticked, or the entitlement has nothing to sign against.

Until those are set, `apnsConfig()` returns null and nothing is sent - the same
"not connected is a normal state" contract QuickBooks uses. The bell and the
emails are unaffected.

**Prove it the hour the key arrives**, without waiting for a build.

**No terminal needed:** sign in on the phone, then **Settings -> Notifications
-> Send test**. It only ever reaches your own phones, so it is safe to press,
and it names which of the three things is wrong when nothing arrives - the keys
are not set, no phone has registered, or Apple refused and said why. The card
stays hidden until push is configured or you have a phone registered, so nobody
on the web sees a permanently-empty feature.

**With a terminal**, and useful before anybody has signed in on the app at all,
because it takes a raw token:
```bash
APNS_KEY_ID=... APNS_TEAM_ID=... APNS_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)" \
  npx tsx scripts/push-test.ts <device-token>
```
The device token appears in `device_tokens` the first time you sign in on the
phone. Both turn Apple's two unhelpful answers - `InvalidProviderToken` and
`DeviceTokenNotForTopic` - into a sentence saying which thing is wrong.

Not built: **Filesystem** for offline PDFs.

---

## 4. Icons & splash screens - DONE
Generated from the SyteNav mark, so the home-screen icon and the app agree.
`scripts/gen-app-assets.mjs` draws the sources; to regenerate after a brand change:
```bash
node scripts/gen-app-assets.mjs
npx capacitor-assets generate --ios --android \
  --iconBackgroundColor '#0F1113' --iconBackgroundColorDark '#0F1113' \
  --splashBackgroundColor '#f3f4ef' --splashBackgroundColorDark '#0F1113'
```
`--android` matters: `npx cap add android` scaffolds Capacitor's own generic
launcher icon, and shipping that is how an app reaches a store looking like a
template. Both platforms are generated from the same `resources/icon.png`, so
they cannot drift apart.
The icon is a **full-bleed square with no transparency and no rounded corners** -
iOS applies its own mask, and an icon with an alpha channel is rejected outright.

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
- Privacy policy URL: **https://sytenav.com/privacy** (already built)
- App privacy "nutrition label" (data collected via Supabase auth: name, email, usage)
- Support URL: `/contact`
- Age rating, category (Business / Productivity)
- **Review notes** saying accounts are created on the website - otherwise the
  reviewer wonders why there is no sign-up button. (Nothing in the app leads to
  a purchase: billing is "Free during beta" with a disabled button, and the
  marketing pages are redirected off the app host, so rule 3.1.1 is clear.)
- iOS: TestFlight review → App Store review. Android: internal → closed → production.

---

## Still to do
- **Universal Links** (section 2) - after the first successful build
- **Re-seed the demo account before submitting** (`/api/dev/seed-demo`). It is
  the reviewer's login; credentials and the review notes are in
  `store/listing.md`. Apple rejects without working credentials, every time -
  and with no sign-up in the iOS build, a reviewer without a login has no way in
- **Safe areas on a real device** (section 3) - cannot be judged from a desktop
- **Android store assets**: keystore, Play service-account JSON, and screenshots
  at Android sizes. The project itself is done
- **Launch copy** is written and deliberately unpublished - `store/launch-copy.md`
  says what to paste, where, and in what order, on the day it goes live

**Done since this file was last updated:** Android project added; App Privacy
answered in `store/app-privacy.md`; store URLs corrected (they pointed at
`/homepage/...`, which has not existed since the marketing site moved to the
root, and they are what gets pasted into App Store Connect).

**No cookie-consent banner, on purpose.** SyteNav sets only sign-in and
preference cookies - there is no analytics, no tag manager, no advertising
script - so there is nothing to consent to, and a banner would ask permission
for tracking that does not happen. The Cookie Policy now says exactly that. A
guard in the test suite fails if an analytics integration is ever added while
the policy still claims there is none, which is the point at which a banner
becomes required.
