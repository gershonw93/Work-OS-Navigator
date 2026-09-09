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

**Never `autoFocus` on a touch screen.** Use `autoFocusOnDesktop()` from
`lib/auto-focus.ts` — `autoFocus={autoFocusOnDesktop()}`, or
`autoFocus={autoFocusOnDesktop() && yourCondition}`. iOS opens the keyboard for
an autofocused field the moment it mounts, nobody having asked, and then scrolls
the LAYOUT viewport to reach it — dragging a `position: fixed` dialog off with
it. It was in 29 places across 24 files. The test is the POINTER, not the screen
width: an iPad in landscape is wide and still touched.

**Overlays are sized from the VISIBLE screen.** `position: fixed` is laid out
against the layout viewport, which does not shrink for a keyboard, so
`inset: 0` puts the bottom of a dialog behind one. `lib/use-visual-viewport.ts`
(mounted in `NativeShell`, and NOT gated on being the native app — mobile Safari
has the same keyboard) keeps `--vv-h` and `--vv-t` tracking
`window.visualViewport`, and `.overlay` / `.overlay-sheet` use them:

```css
top: var(--vv-t, 0px);
height: var(--vv-h, 100%);
```

The fallback is the full screen, which is what a desktop has anyway.

**A dialog with a footer is a COLUMN.** `.overlay > *` caps the panel and gives
it `overflow-y: auto`, so a plain block panel scrolls as a whole - header,
fields and buttons together. That is fine until there is very little screen, and
on a phone there often is: tapping a date field opens iOS's wheel over the
bottom ~40% and **the web viewport does not shrink for it**. Measured at 420pt,
Add Milestone's submit button sat 18px below the bottom edge, reachable only by
knowing to scroll inside a dialog you cannot see the bottom of.

```
flex max-h-full flex-col overflow-hidden   panel
  shrink-0                                 title
  min-h-0 flex-1 overflow-y-auto           the fields
  shrink-0                                 the buttons
```

When a `<form>` wraps both the fields and the footer, the FORM is the flexible
middle (`flex min-h-0 flex-1 flex-col`) so the footer travels with it.
`lib/__tests__/overlay-geometry.ts` measures this at 420pt and checks the plain
block still fails it.

**A bottom sheet is `.overlay-sheet`, not `.overlay-full`.** A sheet owns the
bottom edge and every side except the top - the status bar and the Dynamic
Island live up there, and a close button underneath them cannot be tapped. That
is exactly what happened to the project sections sheet: `.overlay-full` around a
`max-h-full` panel grew until it filled the screen, putting the X at 20px on a
phone whose first 59 points belong to the Island, with no way to shut it.
`.overlay-sheet` pads only the top, by `max(2.5rem, env(safe-area-inset-top) +
1rem)`, and caps its panel against that.

Put the dim on the overlay itself, never on an `absolute inset-0` child: an
absolute child is positioned against the padding box and stops short of the edge.

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

**The scroll lock is `overflow-y: hidden`, never the `overflow` shorthand.**
The shorthand also sets `overflow-x`, which replaces the `clip` on html/body
with `hidden` - and `clip` cannot be scrolled while `hidden` can, it merely has
no scrollbar. That turned latent sideways overflow into a viewport iOS could
pan, and `position: fixed` is pinned to the LAYOUT viewport, so an open dialog
slid off the left of the screen taking the header with it.

**Long text.** `overflow-wrap: anywhere` is the default for `p / li / dd / dt /
td / th / h1-h6`, and `.truncate` sets `min-width: 0`. `truncate` is
`white-space: nowrap`, so its min-content width is the whole unbroken line, and
a flex or grid child is `min-width: auto` and refuses to go below it - the text
truncates perfectly while the container blows out, which is what makes it so
hard to spot. One rule in `@layer base` rather than `min-w-0` at 136 call
sites; base so an explicit `min-w-*` still wins. `break-words` is the trap: it wraps the text but does NOT
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

### TestFlight: internal vs external (IMPORTANT)

**Internal testers do not need Beta App Review.** A build is installable the
moment App Store Connect finishes processing it. Beta App Review gates
**external** testers only, it is a human queue, and Apple takes **one build per
version train at a time**.

The workflow used to set `submit_to_testflight: true`, and that failed a build
which had compiled, signed, uploaded and finished processing:

    422: Another build is in review. - Another build in the same train is
    already in beta review. Please submit it again once it gets completed.

Build 1 was still in that queue. Nothing was wrong with build 2 - the binary was
already delivered - and a red build that actually succeeded is worse than no
status at all. It was also pointless: build 1 reached a phone while its own beta
review was still pending, which is exactly what "internal testers skip review"
means.

So the workflow uploads and stops there. **To get a build onto your own phone:
open TestFlight once processing finishes.** Submitting for external testing is a
deliberate act with a human on the other end - do it in App Store Connect when
you actually want it, not on every push.

### Push: the key is rebuilt, not trusted

Send test reported `error:1E08010C:DECODER routines::unsupported`. That is
**OpenSSL, not Apple** - Node could not parse `APNS_PRIVATE_KEY`, so nothing was
ever sent and Apple was never contacted. A PEM is only valid WITH its line
breaks, and a dashboard field eats them.

This repo already knew that: it is exactly why the Codemagic signing
certificate is carried base64-encoded as `CERTIFICATE_PRIVATE_KEY_B64`. The
other key was left to chance and failed the same way.

`normalizePrivateKey` in `lib/push.ts` now throws away every character that is
not base64, re-wraps at 64 columns and puts the header back - so escaped
newlines, lost newlines, spaces, a PEM base64'd again to get through a one-line
field, and a bare body with no header all work. The label is preserved: an EC
key in SEC1 form is not PKCS#8 and relabelling it breaks it.

**A failure here is reported as ours, not Apple's.** "Apple refused it:
error:1E08010C" sent somebody to look at the wrong end of the problem.

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
| `APNS_PRIVATE_KEY` | The whole `.p8` file, BEGIN and END lines included. Its line breaks do not survive a dashboard field, and a PEM without them is unparseable - `normalizePrivateKey` rebuilds it from whatever base64 is in there, so escaped, lost, spaced or base64'd-again all work |
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
