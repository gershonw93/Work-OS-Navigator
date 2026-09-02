// The bottom bar on a phone.
//
// The iOS app is a native shell around this same web app, so what the site does
// on a phone IS what the app does. Field Mode already had a bottom bar; everyone
// else got the sidebar behind a hamburger, which is the clearest tell that
// something is a website in a wrapper - and MOBILE.md names Apple's rule 4.2
// "minimum functionality" as the real rejection risk for exactly that.
//
// Nothing here renders React. These are the traps the component can fall into,
// every one of which would ship looking fine: two bottom bars stacked in Field
// Mode, a tab to a screen the person cannot open, tabs guessed while permissions
// are still loading, a bar on desktop, and content sitting underneath it.

import { ok, done, read, code, exists } from './_helpers'

const bar = code('components/layout/mobile-tab-bar.tsx')
const layout = code('app/(dashboard)/layout.tsx')
const css = read('app/globals.css')

// ── it must not stack on top of Field Mode's own bar ─────────────────────────
ok(/pathname\.startsWith\('\/field'\)/.test(bar), 'Field Mode is excluded - it already has a bottom bar')
ok(/startsWith\('\/field'\)\) return null/.test(bar), '...by rendering nothing at all')

// ── phone only ───────────────────────────────────────────────────────────────
ok(/lg:hidden/.test(bar), 'hidden from lg up, so a desktop is untouched')
// Split on the JSX USE, not the import - the import contains the same word and
// comes first, which is what made the first version of this look at the top of
// the file and pass for the wrong reason.
ok(/print:hidden/.test(layout.split('<MobileTabBar')[0].slice(-140)), 'hidden when printing, like the rest of the chrome')

// ── never guess a tab ────────────────────────────────────────────────────────
ok(/if \(loading \|\| error\) return null/.test(bar), 'nothing is drawn while permissions are unknown OR failed')
ok(/can\(t\.resource, 'view'\)/.test(bar), 'a tab is dropped when the permission model says the screen is not theirs')
ok(/companyType === 'subcontractor'/.test(bar), 'a subcontractor gets their own tabs, not the GC set')

// Split at `= [`, not at the first `]` - the annotation is `Tab[]`, so the first
// `]` is inside it and the naive version captured an empty string, which then
// "passed" every check that asked whether something was absent.
const arr = (name: string) => bar.split(`const ${name}: Tab[] = [`)[1].split(']')[0]
const gc = arr('GC_TABS')
const sub = arr('SUB_TABS')
ok(gc.length > 40 && sub.length > 40, `both tab arrays were actually captured (${gc.length}, ${sub.length} chars)`)
ok(/\/projects/.test(gc) && /\/approvals/.test(gc), 'the GC bar is Projects and Approvals')
ok(/\/my-jobs/.test(sub) && /\/my-bids/.test(sub), 'the subcontractor bar is My Jobs and My Bids')
ok(!/\/my-bids/.test(gc) && !/\/approvals/.test(sub), '...and they are not one list with different labels')

// Every tab has to point somewhere that exists.
for (const href of ['/dashboard', '/projects', '/approvals', '/my-jobs', '/my-bids']) {
  ok(exists(`app/(dashboard)${href}/page.tsx`), `${href} is a real page`)
}

// ── More opens the drawer that already exists ────────────────────────────────
ok(/OPEN_SIDEBAR_EVENT/.test(bar), 'More opens the existing sidebar drawer')
ok(/export const OPEN_SIDEBAR_EVENT/.test(read('components/layout/sidebar.tsx')), '...the event the sidebar actually listens for')
ok(/from '\.\/sidebar'/.test(read('components/layout/mobile-tab-bar.tsx')), '...imported, not retyped as a string literal')

// ── the content has to clear it ──────────────────────────────────────────────
ok(/pb-tab-bar/.test(layout), 'the scrolling area leaves room for the bar')
ok(/\.pb-tab-bar \{ padding-bottom: calc\(4rem \+ env\(safe-area-inset-bottom\)\)/.test(css), 'the utility clears the bar and the home indicator')

// TWO CLASSES SETTING ONE PROPERTY is how a fix silently does nothing - the CSS
// file's own note warns about pb-24 and pb-safe fighting. pb-tab-bar carries the
// safe inset itself, so pb-safe must not also be on that element.
const mainTag = layout.split('<main')[1].split('>')[0]
ok(/pb-tab-bar/.test(mainTag), 'pb-tab-bar is on <main>')
ok(!/pb-safe/.test(mainTag), '...and pb-safe is NOT, so nothing depends on which rule is defined last')

// An iPad in landscape is past lg and still has a home indicator, and iPad
// support is staying in v1.
ok(/min-width: 1024px\) \{ \.pb-tab-bar \{ padding-bottom: env\(safe-area-inset-bottom\)/.test(css),
  'above lg it falls back to the safe inset, not to zero')

done()
