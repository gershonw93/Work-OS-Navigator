# SyteNav - App Store & Play Store runbook

This app is a **server-rendered Next.js app** (120+ API routes, middleware, SSR). A
Capacitor **static export is not possible** - it would delete the backend. So we ship a
**Capacitor native shell that loads the live deployed web app** (`server.url` in
`capacitor.config.ts`). Everything keeps working with no rewrite.

Run these on **your machine** (Windows/Linux is fine for Android; iOS builds happen in
the cloud via Codemagic - no Mac needed).

---

## YOU ARE HERE: build 1 is in App Store Connect

Version 1.0, build 1 uploaded successfully on 8 Sep 2026 - eight builds, all of
them signing. What is left is TestFlight, screenshots off a real device, the
listing, and submission: step 6 below.

The signing configuration is now pinned by `lib/__tests__/codemagic.ts`, which
syntax-checks every build script and asserts the four settings that each cost a
build to discover. Do not undo one without reading the comment attached to it.

*(The walkthrough below is kept for the Android build and for the next person
setting this up from nothing.)*

## Getting here: Developer Program approved, no keys yet

Everything in this repo is done. What is left is six steps, and five of them are
on Apple's side. In this order, because each one unblocks the next:

| # | Where | Do | Unblocks | Time |
|---|---|---|---|---|
| 1 | App Store Connect | **My Apps → + → New App.** Bundle ID `com.sytenav.app`, name `SyteNav`, primary language, SKU (anything - `sytenav-ios`). If the bundle ID is not in the dropdown, do step 2 first. | Everything - Codemagic uploads into this record | 5 min |
| 2 | Developer portal → Identifiers | Register the App ID `com.sytenav.app` if it does not exist, and tick **Push Notifications** and **Associated Domains**. Tick Associated Domains NOW even though the entitlement is added later - it is free to have and awkward to add mid-build. | Push, and Universal Links later | 5 min |
| 3 | **Two different sites** | Create **two** `.p8` keys and download each one - Apple shows a `.p8` ONCE and never again; close the tab and you revoke and start over. (a) **APNs**, for push: developer.apple.com → Certificates, Identifiers & Profiles → **Keys**. (b) **App Store Connect API**, for Codemagic, with the *App Manager* role: appstoreconnect.apple.com → **Users and Access → Integrations → App Store Connect API** - NOT the developer portal, they are in different places. Note each Key ID, the ASC key's **Issuer ID**, and your **Team ID** (developer.apple.com/account → Membership details). | Steps 4 and 5 | 10 min |
| 4 | Vercel → Settings → Environment Variables (Production) | `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (the whole `.p8` file, newlines and all - pasted `\n` is handled), and `APPLE_TEAM_ID`. Redeploy. | Push actually sends; `/.well-known/apple-app-site-association` stops 404ing | 5 min |
| 5 | Codemagic | Connect the repo. Add the **App Store Connect API key** from 3(b) as an integration named exactly `SyteNav ASC` - `codemagic.yaml` refers to it by that name, character for character. Run the **`ios-capacitor`** workflow on `claude/admiring-bohr-DyFVR`. There is **no environment variable group to create**; the integration carries the credentials. Signing is SCRIPTED, not automatic - there is deliberately no `ios_signing:` block, because that turns on Codemagic's pre-build automatic signing, which looks for an existing profile and fails in two seconds if there is none rather than creating one. **Before the first build you must add a secure environment variable `CERTIFICATE_PRIVATE_KEY_B64` to the group `app_store_credentials`.** A new account has no distribution certificate, one has to be created, and creating one needs a private key to create it against. Generate it ONCE and keep it - a fresh key per build mints a new certificate per build, and Apple caps how many you may hold.

```
ssh-keygen -t rsa -b 2048 -m PEM -f cert_key
```

**BASE64 IT, do not paste the PEM.** A PEM block is only valid WITH its line breaks, and pasting a multi-line secret through a web form loses them - which fails as "Provided value in environment variable ... is not valid", an error that sounds like a bad key when the key is fine. On Windows: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Desktop\cert_key")) | Set-Clipboard`. On macOS or Linux: `base64 -i cert_key | tr -d '\n'`. | A TestFlight build | 20 min + build |
| 5b | Apple developer portal | **Tick Push Notifications on the App ID** before the first build, not after. `App.entitlements` declares `aps-environment`, and a profile minted against an App ID without that capability fails the archive step with "requires a provisioning profile with the Push Notifications feature". Enabling it later does NOT retrofit an existing profile, which cost three identical build failures. The workflow now passes `--delete-stale-profiles`, so a profile that no longer matches the App ID's capabilities is replaced automatically and this is no longer a manual step - but ticking the capability BEFORE the first build still saves a round trip. | The archive step | 5 min |
| 6 | After the build succeeds | Associated Domains entitlement (section 2), re-seed the demo account, and look at the safe areas on a real device. Then submit. | Submission | - |

**Why the entitlement waits until after step 5.** An entitlement the App ID does
not carry fails code signing, and the error does not name which one. Get one
clean build first, then add it.

**Screenshots need a real device, not a resized browser.** The shell is a
WKWebView loading the live site, so the DOM is identical - but the pixels are
not. Safe-area insets resolve to real values on a phone and to zero on a
desktop, the status bar and home indicator are part of an iPhone screenshot,
and font rendering differs. There is no Mac here, so no Simulator either:
capture them off your own iPhone and iPad once the TestFlight build is
installed. **Both sets are required** - the target is universal
(`TARGETED_DEVICE_FAMILY = "1,2"`), so Apple wants 6.7" iPhone *and* 13" iPad,
and the reviewer will run it on an iPad. Decided deliberately: iPad support
stays in v1. Dropping it later is a downgrade for anyone already using it.

**What step 4 proves, and what it does NOT.** Once the variables are in, load
`https://app.sytenav.com/.well-known/apple-app-site-association` in any browser:
JSON means `APPLE_TEAM_ID` landed, "Not configured" means it did not. That file
is public because Apple has to fetch it unauthenticated.

**Push cannot be tested before a build, and this runbook used to say it could.**
`usePush()` opens with `if (!ready || !isNative) return` - it runs only inside
the native shell, so a browser never registers a device token and "No phone is
registered to your account yet" is the only possible answer until TestFlight is
on the phone. That message IS however a useful signal: `pushTestMessage` checks
`configured` first, so getting "no phone registered" rather than "not switched
on for SyteNav yet" proves all three `APNS_*` variables are readable in
production. Push itself is verified in step 6.

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
- **Safe areas — SyteNav owns them, iOS does not.** `.pt-safe` / `.pb-safe` /
  `.px-safe` / `.pb-tab-bar` / `.pb-field-nav` in `globals.css`, plus
  `.overlay`'s `max(1rem, env(safe-area-inset-*))`.

  `capacitor.config.ts` sets `ios: { contentInset: 'never' }` and
  `app/layout.tsx` sets `viewportFit: 'cover'`. Together those mean the webview
  covers the whole screen and `env(safe-area-inset-*)` reports the real numbers,
  so the CSS above is the only thing insetting anything.

  ⚠️ **It used to be `'always'`, and that was the bug.** iOS inset its own
  scroll view, nothing in the app padded the top, and the header sat flush under
  the Dynamic Island — then jumped down by exactly 59pt when the drawer was
  opened, then back. `'always'` held while the DOCUMENT scrolled; once the shell
  became one screen tall an inset applied to a scroll view with nothing to
  scroll started being recalculated on layout events, and opening the drawer
  sets `html { overflow: hidden }`. One value decided in two places, with the
  winner depending on what the webview did last.

  **EXACTLY ONE ELEMENT PADS EACH EDGE.** Top: the chrome wrapper in
  `(dashboard)/layout.tsx`, and the banner wrapper in `field/layout.tsx`. Bottom:
  `pb-safe` on each bottom nav, and `pb-tab-bar` / `pb-field-nav` on `<main>` to
  clear it. Adding a second is not belt-and-braces, it is 118pt of white space.

  `pt-safe` goes on a wrapper, never on the `h-14` header itself: Tailwind sizes
  with `border-box`, so padding there comes OUT of the 56px row and squashes the
  search bar instead of moving it down.

  Changing `contentInset` means a NEW native build. The CSS half deploys on its
  own and is self-correcting in the meantime — where iOS is still insetting,
  `env()` reports 0 and `pt-safe` adds nothing.

### The app shell, and why nothing overflows (IMPORTANT)

Read this before adding a dialog, a drawer, a sheet or a menu.

**The shell is exactly one screen tall.** `.h-app` (100vh, then 100dvh) plus
`overflow-hidden` on the outer div of `(dashboard)/layout.tsx` and
`field/layout.tsx`. The header and the tab bar are laid out once and never
move; the only thing that scrolls is `<main data-app-scroll>`. It used to be
`min-h-screen`, which let the DOCUMENT grow and carried the top bar away with
it - and meant `overflow-y-auto` on `<main>` never engaged, because there was
nothing left for it to scroll.

`100vh` is written first and `100dvh` second on purpose: `dvh` landed in Safari
15.4 and the deployment target is iOS 15.0, so an older WebKit keeps the first
declaration instead of dropping both and collapsing the shell.

**Every overlay uses `.overlay`.** Not `fixed inset-0`. There were 78 of those,
54 sharing one exact class string and the rest drifted; whether a dialog fitted
on the screen depended on which file it lived in.

```jsx
<div className="overlay items-center justify-center bg-black/50" data-overlay>
  <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">…</div>
</div>
```

- `.overlay` is `position: fixed; inset: 0; display: flex`, padded by
  `max(1rem, env(safe-area-inset-*))` - so a dialog is never under the Dynamic
  Island or the home indicator, and still has breathing room on a device with
  neither.
- `.overlay > *` caps the panel at `max-height: 100%` with `min-width: 0`,
  `overflow-y: auto` and `overscroll-behavior: contain`. A panel **cannot** be
  taller than the screen. Do not add `max-h-[90vh]` back: `vh` knows nothing
  about the notch, and being a Tailwind utility it *beats* the rule above, so
  the cap that wins is the wrong one.
- Alignment (`items-center`, `items-end`), colour and `z-*` stay at the call
  site, because those genuinely differ.
- `.overlay-full` is the full-bleed variant - lightbox, camera, PDF filler,
  drawers and bottom sheets that own the whole screen and position their own
  children. No padding, no panel cap.
- A dimming layer inside a `.overlay` must go **on the overlay itself**, not on
  an `absolute inset-0` child: an absolute child is positioned against the
  padding box, so it stops short of the edge and leaves undimmed strips.

**`data-overlay` is what stops the background scrolling.** Put it on anything
that floats over the app - dialogs, drawers, sheets, and menus whose position
was measured when they opened (`searchable-select` is fixed at coordinates read
off the trigger; let the page move and the panel stays where the field used to
be). The lock is CSS:

```css
html:has([data-overlay]) { overflow: hidden; }
html:has([data-overlay]) [data-app-scroll] { overflow: hidden !important; }
```

Deliberately not a JavaScript counter. One early return in one of 78 cleanup
paths leaves the whole app frozen with nothing on screen to explain it; the
selector is true for exactly as long as an overlay is in the DOM and cannot
leak.

**Wide content scrolls, it does not get clipped.** A `<table>` wider than a
phone inside `overflow-hidden` is not contained, it is cut off - no scrollbar,
no sign that columns are missing. Use `overflow-x-auto` on the wrapper and
`min-w-[Npx]` on the table so the columns keep their shape
(`projects/[id]/compliance` is the model).

**Long text.** `overflow-wrap: anywhere` is the default for `p / li / dd / dt /
td / th / h1-h6`. `break-words` is the trap: it wraps the text but does NOT
reduce min-content width, so a grid or flex parent still refuses to shrink and
the *container* blows out while the text wraps perfectly. Not applied to
everything - on a button it breaks the label instead of the control keeping its
shape - so a flex or grid cell holding pasted text still wants `min-w-0`.

All of the above is pinned by `lib/__tests__/layout-overflow.ts`.

### The build number

`CURRENT_PROJECT_VERSION` is hardcoded to `1` in the Xcode project and nothing
in the repo moves it. Apple refuses any upload whose bundle version is not
higher than the last one it accepted, so every build after the first collided:

    The bundle version must be higher than the previously uploaded version: '1'.

Twenty minutes in, at the very last step, having compiled and signed
successfully. The `Set the build number` step in `codemagic.yaml` now rewrites
that setting to `$BUILD_NUMBER` - Codemagic's own counter, which counts failed
builds too and therefore only ever goes up.

**Not `agvtool`.** It is the recipe in every guide and it does not work here: it
needs `VERSIONING_SYSTEM = "apple-generic"` in the project, and this project
does not set it, so it fails with "cannot find the Xcode project's versioning
system". `Info.plist` already reads `CFBundleVersion` from
`$(CURRENT_PROJECT_VERSION)`, so writing that build setting IS writing the
bundle version.

The step verifies its own `sed` and fails loudly if it matched nothing - a
substitution that changed no lines looks exactly like one that worked.

### Push: the app delegate (IMPORTANT)

`ios/App/App/AppDelegate.swift` MUST forward Apple's two remote-notification
callbacks onto `NotificationCenter`:

```swift
func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
}
func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
}
```

**This is what was missing, and it cost a whole debugging round.** Permission
granted, `register()` called, `device_tokens` empty, and no error anywhere on
either side - because `register()` only calls
`UIApplication.registerForRemoteNotifications()`, Apple answers by calling those
two methods on the app delegate, and they did not exist. The token was delivered
to nobody. The failure path went the same way, which is why `registrationError`
never fired either and there was nothing at all to report.

`npx cap sync` will not add them: it writes the Podfile and the plugin, but the
app delegate is our file. Delete either one and push stops working with no error
at all. `lib/__tests__/push-diagnostics.ts` checks both are present.

Changing this file means a NEW native build - Codemagic, then TestFlight. The
web half deploys on its own; the native half does not.

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
