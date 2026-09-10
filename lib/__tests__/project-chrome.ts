// The top of a project screen was four bands of chrome before any of the job.
//
// The app's top bar with a "View as" strip on it; the job header, with three
// controls of three different shapes; a row of section names; and a fourth row
// listing that section's pages. The request was to make it clean WITHOUT
// removing anything, which is the interesting constraint - every tab and every
// control still exists, it is reachable in one fewer stripe.
//
// Three things are pinned here, and each is a way the change could have gone
// wrong quietly:
//
//   1. The four header buttons drift apart again. They were a pill of avatars,
//      a `px-3 py-1.5` word, a `px-3 py-2` word and a square icon, which is
//      what four independently-written class strings turn into. There is one
//      now, and each button is icon-only, so each needs a name to be read out
//      and a title to hover.
//   2. "View as" is deleted rather than moved. It is the only way an admin can
//      answer "what does a Field Supervisor actually see", and a preview whose
//      exit banner is gone is worse than no preview.
//   3. A page stops being reachable. The second row listed them; the menus do
//      now, and a group whose menu did not render would take its pages with it.
//
// The geometry - that a menu is not clipped by the row it hangs from - is
// measured by a browser in overlay-geometry.ts case 12.

import { ok, done, code } from './_helpers'
import { RESOURCE_GROUPS, RESOURCES } from '../permissions'

const tabs = code('components/layout/project-tabs.tsx')
const topNav = code('components/layout/top-nav.tsx')
const perms = code('components/settings/permissions-panel.tsx')
const chrome = code('app/(dashboard)/layout.tsx')

// ── one shape for the controls in a job header ──────────────────────────────
const HEADER_BUTTONS = [
  ['the team', 'components/layout/team-quick-view.tsx', 'Users'],
  ['sharing with the client', 'components/layout/share-portal-button.tsx', 'Share2'],
  ['job history', 'components/layout/project-activity-button.tsx', 'History'],
  ['project settings', 'components/layout/edit-project-button.tsx', 'Settings'],
] as const

for (const [what, file, icon] of HEADER_BUTTONS) {
  const src = code(file)
  ok(/headerIconButton/.test(src), `${what} uses the one shared button shape`)
  const btn = /<button[\s\S]*?<\/button>/.exec(src)?.[0] ?? ''
  ok(/aria-label=/.test(btn), `...and says what it is (${what})`)
  ok(/title=/.test(btn), `...with hover text to match (${what})`)
  ok(new RegExp(`<${icon} className`).test(btn), `...and it is the ${icon} icon`)
}

const shape = code('components/layout/header-icon-button.tsx')
ok(/h-11 w-11/.test(shape) && /lg:h-9 lg:w-9/.test(shape),
  'a 44px target on a phone, compact where a mouse is doing the aiming')
ok(!/Share with Client|Job History/.test(
  code('components/layout/share-portal-button.tsx').split('</button>')[0]
  + code('components/layout/project-activity-button.tsx').split('</button>')[0]),
  'the words are gone from the buttons themselves - that was the ask')

// ── "view as" moved; it was not deleted ─────────────────────────────────────
ok(!/ViewAsSwitcher/.test(topNav), 'THE ASK: the View as strip is off the top bar')
ok(/<ViewAsSwitcher \/>/.test(perms),
  '...and lives in Settings > Permissions, the screen that is about what a role can see')
ok(/<ViewAsBanner \/>/.test(chrome),
  '...while the banner stays in the chrome: a preview you cannot exit is worse than none')
ok(/export function ViewAsSwitcher/.test(code('components/layout/view-as-switcher.tsx')),
  '...and the switcher itself is untouched, not reimplemented somewhere else')

// ── one row, and every page still on it ─────────────────────────────────────
ok(!/aria-label=\{`\$\{activeGroup\.label\} pages`\}/.test(tabs),
  'the second row of chrome is gone')
// Split on the sheet's own CLASS, not on the comment above it - `code()`
// strips comments, so a marker written in one is not there to split on.
const desktopStrip = tabs.split('overlay-sheet')[0]
ok(!/overflow-x-auto/.test(desktopStrip),
  'THE TRAP: the section row does not scroll sideways - overflow-x clips on BOTH '
  + 'axes, and it would cut the menu off at the row\'s bottom edge')
ok(/role="menu"/.test(tabs) && /role="menuitem"/.test(tabs), 'the pages are a real menu')
ok(!/data-overlay/.test(desktopStrip),
  '...that travels with the page rather than freezing it - it is absolute in a '
  + 'relative parent, like RowMenu, not pinned to a measured position')

// OPEN, NEVER TOGGLE. A toggle is re-triggered by the interaction that just
// used it: mouseenter opens, the click that follows closes, and the menu
// flickers out from under the pointer. Same fault as SearchableSelect.
ok(/onMouseEnter=\{\(\) => setMenu\(g\.label\)\}/.test(tabs), 'hovering a section opens its pages')
ok(/onClick=\{\(\) => setMenu\(g\.label\)\}/.test(tabs), '...and so does clicking it')
ok(!/setMenu\(m => m/.test(tabs) && !/setMenu\(isOpen \? null/.test(tabs),
  '...and NEITHER is a toggle, or the click that follows a hover would shut it again')
for (const [how, re] of [
  ['picking a page', /onClick=\{\(\) => setMenu\(null\)\}/],
  ['Escape', /e\.key === 'Escape'\) setMenu\(null\)/],
  ['clicking outside', /navRef\.current && !navRef\.current\.contains/],
  ['moving the pointer away', /onMouseLeave=\{\(\) => setMenu\(null\)\}/],
  ['navigating', /useEffect\(\(\) => \{ setMenu\(null\) \}, \[pathname\]\)/],
] as const) {
  ok(re.test(tabs), `  it closes on ${how}`)
}

// Nothing was dropped on the way. The groups still hold every slug they held,
// and the menu is built from the same `g.tabs` the second row was.
for (const slug of ['plans', 'schedule', 'tasks', 'progress', 'daily-logs', 'time', 'units',
  'request-quotes', 'team', 'compliance', 'quote', 'budget', 'materials', 'selections',
  'invoices', 'pay-apps', 'payments', 'change-orders', 'financials', 'reports',
  'permits', 'inspections', 'submittals', 'rfis', 'sharing']) {
  ok(new RegExp(`slug: '${slug}'`).test(tabs), `  ${slug} is still a tab`)
}
ok(/\{g\.tabs\.map\(tab => \{/.test(tabs),
  'the menu lists the group\'s own tabs, so a page cannot be visible in one place and not the other')
ok(/const isActive = pathname\.endsWith\(`\/\$\{tab\.slug\}`\)/.test(tabs) && /<Check /.test(tabs),
  'and the menu ticks the page you are on - the row no longer names it')

// The phone never had the second row and does not get a menu: it has the
// bottom sheet, which is untouched.
ok(/overlay-sheet sm:hidden/.test(tabs), 'the phone keeps its sheet')

// ── Money is Finance, in both lists ─────────────────────────────────────────
ok(/label: 'Finance'/.test(tabs), 'THE ASK: the section is called Finance')
ok(!/label: 'Money'/.test(tabs), '...and not Money as well')
ok((RESOURCE_GROUPS as readonly string[]).includes('Finance'),
  'the permissions matrix calls it the same thing')
ok(!(RESOURCE_GROUPS as readonly string[]).includes('Money'),
  '...and only that - two names for one section is how the grouping got into a mess before')
const orphans = RESOURCES.filter(r => !(RESOURCE_GROUPS as readonly string[]).includes(r.group))
ok(orphans.length === 0,
  `every resource sits in a group the matrix renders (${orphans.map(o => o.key).join(', ') || 'none loose'})`)

done()
