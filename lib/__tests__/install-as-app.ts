// "Add it to your home screen and it behaves like an app."
//
// The Help article said that before it was true. There was no web app manifest
// and no appleWebApp metadata, so an installed icon opened in a browser view
// with the address bar still showing - the doc was ahead of the product, which
// is the same shape as the cookie policy claiming analytics we do not run.
//
// So this suite ties the claim to the thing that makes it true: if the help
// article tells people to install it, the manifest and the iOS metadata have to
// be there, and the icons it points at have to exist.

import { ok, done, read, code, exists } from './_helpers'

const manifest = code('app/manifest.ts')
const layout = code('app/layout.tsx')
const help = read('lib/help/articles.ts')

// ── the manifest, and the one line that removes the browser chrome ───────────
ok(exists('app/manifest.ts'), 'a web app manifest exists')
ok(/display: 'standalone'/.test(manifest), "display is 'standalone' - the line that drops the address bar")
ok(/name: 'SyteNav'/.test(manifest) && /short_name: 'SyteNav'/.test(manifest), 'it is called SyteNav on the home screen')
ok(/start_url: '\/dashboard'/.test(manifest), 'it opens the app, not the marketing root')
ok(/background_color:/.test(manifest) && /theme_color:/.test(manifest), 'it has a launch colour, so there is no white flash')

// ── the iOS half ─────────────────────────────────────────────────────────────
ok(/appleWebApp:/.test(layout), 'appleWebApp metadata is set')
ok(/capable: true/.test(layout), '...capable, which is what an iPhone older than 16.4 reads')
ok(/statusBarStyle: 'default'/.test(layout), "...with the default status bar")
ok(!/black-translucent/.test(layout),
  "...NOT black-translucent - that puts the page under the clock, and this app does not paint its own header up there")
ok(/apple-touch-icon/.test(layout), 'an Apple touch icon is declared')

// ── every icon the manifest promises has to actually be there ────────────────
// A manifest naming a missing icon fails silently: the phone falls back to a
// screenshot of the page, which looks like a broken install rather than an error.
// An exec loop rather than [...matchAll()] - the spread needs downlevelIteration
// under this tsconfig, and these files are typechecked now that they live in
// the repo, which is how that got caught.
const icons: string[] = []
const iconPattern = /src: '([^']+)'/g
let m: RegExpExecArray | null
while ((m = iconPattern.exec(manifest))) icons.push(m[1])
ok(icons.length >= 2, `the manifest names icons (${icons.length})`)
for (const src of icons) {
  ok(exists(`public${src}`), `${src} exists on disk`)
}
ok(exists('public/apple-touch-icon.png'), 'the Apple touch icon exists on disk')
ok(/purpose: 'maskable'/.test(manifest), 'one icon is maskable, so Android can crop without clipping the mark')

// ── the claim and the capability, tied together ──────────────────────────────
// If the article stops telling people to install it, this can relax. While it
// does say so, the manifest has to back it up.
const claimsInstall = /Add to Home Screen/i.test(help)
ok(claimsInstall === /display: 'standalone'/.test(manifest),
  claimsInstall
    ? 'the help article tells people to install it, and the manifest makes that real'
    : 'the help article makes no install claim, and none is needed')

// The safe-area insets the tab bar and the fixed header depend on only return
// real numbers with this set - without it the CSS avoiding the notch and the
// home indicator is inert, which matters more once there is no browser chrome
// to push the page inward.
ok(/viewportFit: 'cover'/.test(layout), "viewportFit is 'cover', so safe-area insets are not zero")

done()
