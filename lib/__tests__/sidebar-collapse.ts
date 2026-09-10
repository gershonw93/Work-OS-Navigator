// The desktop sidebar collapses to a rail of icons.
//
// A feature rather than a defect, but it lands on top of two faults this repo
// has already paid for, and those are what this suite is about:
//
//   1. ONE NUMBER IN TWO FILES. The rail was `w-60` and the content column
//      beside it was `lg:pl-60`. Nothing connected them, and (dashboard)/
//      layout.tsx is a Server Component, so no piece of React state ever could.
//      Shrink one and the content either overlaps the rail or leaves 168px of
//      nothing beside it.
//   2. HIDDEN IS NOT GONE, AND GONE IS NOT HIDDEN. The label beside each icon
//      is the link's ACCESSIBLE NAME. Take it out of the tree with
//      `display: none` and a screen reader falls back to announcing the href,
//      so the rail reads as a column of URLs.
//
// The geometry - 240 open, 72 collapsed, the content flush against both - is
// measured by a browser in overlay-geometry.ts. This suite is about the shape
// of the source: that there is one definition to measure in the first place.

import { ok, done, code, read } from './_helpers'
import { SIDEBAR_COLLAPSED_CLASS, SIDEBAR_COLLAPSED_KEY, sidebarCollapseScript } from '../sidebar-collapse'

const css = read('app/globals.css')
const sidebar = code('components/layout/sidebar.tsx')
const shell = code('app/(dashboard)/layout.tsx')
const rootLayout = code('app/layout.tsx')

// ── one number ──────────────────────────────────────────────────────────────
ok(!/lg:pl-60/.test(shell), 'THE BUG: the content column no longer hardcodes the rail\'s width')
ok(!/\bw-60\b/.test(sidebar), '...and the rail no longer hardcodes it either')
ok(/\.app-sidebar \{ width: var\(--sidebar-w\); \}/.test(css)
  && /\.app-content \{ padding-left: var\(--sidebar-w\); \}/.test(css),
  'both read the same variable, so they cannot disagree')
ok(/\.app-shell \{ --sidebar-w: 15rem; \}/.test(css)
  && /\.sidebar-collapsed \.app-shell \{ --sidebar-w: 4\.5rem; \}/.test(css),
  '...and the variable has exactly two values, each written once')
ok(/className="app-shell /.test(shell) && /className="app-content /.test(shell),
  'the shell declares the variable and the content column reads it')
ok(/className="app-sidebar hidden lg:flex/.test(sidebar), 'the aside carries the other half')

// ── the rules cannot reach a phone, or a sheet of paper ─────────────────────
const block = /@media screen and \(min-width: 1024px\) \{[\s\S]*?\n  \}\n/.exec(css)
ok(!!block, 'every collapse rule lives in one screen-and-desktop block')
for (const sel of ['.app-sidebar', '.app-content', '.sidebar-collapsed .app-sidebar .nav-label',
  '.sidebar-collapsed .app-sidebar .nav-row', '.sidebar-collapsed .app-sidebar .sidebar-head',
  '.sidebar-collapsed .app-sidebar .nav-badge', '.sidebar-collapsed .app-sidebar .sidebar-toggle-icon']) {
  ok(block![0].includes(sel), `  ${sel} is inside it`)
}
ok(!/@media \(min-width: 1024px\) \{\s*\.app-shell/.test(css),
  'SCREEN, not just min-width: a print stylesheet is not a narrow one, and '
  + 'without it every printed page gains a 240px margin holding nothing')

// ── hidden, not gone ────────────────────────────────────────────────────────
const label = /\.sidebar-collapsed \.app-sidebar \.nav-label \{([\s\S]*?)\}/.exec(css)
ok(!!label, 'the collapsed label has a rule of its own')
ok(/clip: rect/.test(label![1]) && /position: absolute/.test(label![1]),
  'THE OTHER BUG: the label is clipped, so the link keeps its accessible name')
ok(!/display: none/.test(label![1]),
  '...and never dropped, which would leave a screen reader reading out hrefs')
ok(/min-height: 2\.5rem/.test(css),
  'a row that has lost its label keeps its height rather than shrinking to the icon')

// ── set before the first paint ──────────────────────────────────────────────
ok(/sidebarCollapseScript/.test(rootLayout),
  'the stored preference is applied in <head>, before anything is drawn')
const head = /<head>([\s\S]*?)<\/head>/.exec(rootLayout)
ok(!!head && /themeScript/.test(head[1]) && /sidebarCollapseScript/.test(head[1]),
  '...in <head> beside the theme script, which solves the identical problem')
ok(sidebarCollapseScript.includes(SIDEBAR_COLLAPSED_KEY)
  && sidebarCollapseScript.includes(SIDEBAR_COLLAPSED_CLASS),
  'the script reads the same key and writes the same class the toggle does')
ok(/try\{/.test(sidebarCollapseScript) && /catch/.test(sidebarCollapseScript),
  '...and cannot take the page down when localStorage throws')

// The literal must exist in exactly one place. A key typed twice is a
// preference that saves to one name and loads from another.
const typedTwice = ['components/layout/sidebar.tsx', 'app/layout.tsx', 'app/(dashboard)/layout.tsx']
  .filter(f => code(f).includes(`'${SIDEBAR_COLLAPSED_KEY}'`))
ok(typedTwice.length === 0,
  `the key lives in lib/sidebar-collapse.ts only (${typedTwice.join(', ') || 'nowhere else'})`)
ok(/from '@\/lib\/sidebar-collapse'/.test(sidebar), '...and the sidebar imports it')

// ── the toggle, and the rows it hides ───────────────────────────────────────
ok(/aria-label=\{collapsed \? 'Expand menu' : 'Collapse menu'\}/.test(sidebar),
  'the toggle says which way it goes')
ok(/aria-expanded=\{!collapsed\}/.test(sidebar), '...and reports its state')
ok(/hidden lg:flex h-8 w-8/.test(sidebar),
  '...and is desktop-only: a phone drawer has no width to hand back')
ok(/sidebar-toggle-icon/.test(sidebar) && /rotate\(180deg\)/.test(css),
  'the chevron turns in CSS, so it cannot render backwards for a frame while '
  + 'React catches up with a class that is already on the page')

const ROW = /const ROW = '([^']+)'/.exec(sidebar)
ok(!!ROW && ROW[1].startsWith('nav-row '),
  'every row is built from one string, so a row added later cannot be the one '
  + 'left aligned against the edge of a 72px column')
const rows = sidebar.split('\n').filter(l => /className=\{cn\(ROW,/.test(l))
ok(rows.length >= 5, `and they all use it (${rows.length} rows)`)
ok(!/'flex items-center gap-3 rounded-lg px-3 py-2\.5 text-sm font-medium transition-colors'/.test(sidebar),
  '...rather than the copy of that class string each one used to carry')

const labels = (sidebar.match(/className="nav-label/g) ?? []).length
ok(labels >= 7, `every label that has to disappear is wrapped (${labels})`)
ok(/<span className="nav-label"><SyteNavLogo/.test(sidebar),
  'the lockup goes with them - collapsed, the header is the toggle alone')
ok(/title=\{item\.label\}/.test(sidebar),
  'a collapsed icon names itself on hover, since there is no label to read')

// ── the phone is untouched ──────────────────────────────────────────────────
ok(/export const OPEN_SIDEBAR_EVENT/.test(sidebar), 'the drawer still opens the way it did')
ok(/lg:hidden fixed inset-y-0 left-0 z-50 w-72/.test(sidebar), '...at the width it always was')
ok(!/sidebar-collapsed/.test(code('components/layout/mobile-tab-bar.tsx')),
  '...and the tab bar knows nothing about any of this')

done()
