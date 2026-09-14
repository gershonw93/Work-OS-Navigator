// Swipe a bottom sheet DOWN to close it - and the sheet that slides up.
//
// "add swiping all over to go back or swipe down the project menu etc. make it
// feel super native app like." Three bottom sheets had no gesture at all and
// simply appeared: the project sections menu, the job status picker and the
// Team panel. A drawer you could slide away beside a sheet you could not is a
// gesture that only some panels answer to, which is worse than none.
//
// The one thing that makes a sheet harder than a drawer is that it leaves on
// the axis its body scrolls on, and that decision is the first block here.

import { sheetTakesGesture, shouldDismiss, swipeTravel } from '../swipe-dismiss'
import { ok, done, code, read, walk } from './_helpers'

// ── is this the sheet, or the list inside it ────────────────────────────────
ok(sheetTakesGesture(0, 40), 'at the top, a downward drag is the sheet being pulled')
ok(!sheetTakesGesture(120, 40),
  'scrolled down, the SAME drag is the list scrolling back up - and the sheet must not move')
ok(!sheetTakesGesture(0, -40), 'an upward drag is never the sheet, at the top or anywhere else')
ok(!sheetTakesGesture(0, 0), 'and nothing is nothing')

// ── it leaves downward, only downward, by a fraction of its HEIGHT ─────────
ok(swipeTravel(5, 90, 'down') === 90 && swipeTravel(5, -90, 'down') === 0,
  'THE ONE-WAY RULE, one axis over: pulled up, a sheet does not move')
ok(shouldDismiss({ dx: swipeTravel(0, 200, 'down'), width: 520, elapsedMs: 900 })
   && !shouldDismiss({ dx: swipeTravel(0, 120, 'down'), width: 520, elapsedMs: 900 }),
  "the threshold is a fraction of the sheet's own height, not a constant")

// ── the hook ────────────────────────────────────────────────────────────────
const hook = code('lib/use-sheet-dismiss.ts')
ok(/scrollTop: e\.currentTarget\.scrollTop/.test(hook),
  'scrollTop is read ONCE, when the finger lands - re-asking on every move would '
  + 'start dragging the moment a scroll-up reached the top')
ok(/axis\.current === 'undecided'\) axis\.current = swipeAxis/.test(hook), 'the axis is decided ONCE and kept')
ok(/axis\.current !== 'vertical'\) return/.test(hook), 'a sideways drag is not the sheet')
ok(/if \(!sheetTakesGesture\(from\.scrollTop, dy\)\) return/.test(hook),
  '...and a scroll is left completely alone, not merely not dismissed')
ok(/setTimeout\(onDismiss, SWIPE_EXIT_MS\)/.test(hook),
  'THE CLOSE IS A TIMER, not transitionend, which never fires under reduced motion')
ok(/clearTimeout\(exit\.current\)/.test(hook), '...cleared on unmount')
ok(!/preventDefault/.test(hook), 'nothing calls preventDefault (React attaches touch listeners passively anyway)')
ok(/overflowY: dragging \? 'hidden'/.test(hook),
  'the scroller is held still while the sheet follows the finger, or iOS bounces it inside itself as well')
ok(/translateY\(/.test(hook) && !/translateX\(/.test(hook), 'it moves on Y')

// ── every sheet, on the PANEL ───────────────────────────────────────────────
for (const [file, label] of [
  ['components/layout/project-tabs.tsx', 'the project sections sheet'],
  ['components/layout/project-status-switch.tsx', 'the job status sheet'],
  ['components/layout/team-quick-view.tsx', 'the team sheet'],
] as const) {
  const src = code(file)
  ok(/useSheetDismiss\(/.test(src), `${label} can be pulled down`)
  ok(/\{\.\.\.sheet\.handlers\}/.test(src) && /style=\{sheet\.style\}/.test(src),
    `...with the gesture spread on an element`)
  const i = src.indexOf('className="overlay-sheet')
  const j = src.indexOf('{...sheet.handlers}')
  ok(i >= 0 && j > i && j - i < 400, `...the panel inside the overlay, not the backdrop`)
  ok(/overflow-y-auto/.test(src.slice(j, j + 400)),
    `...and that element is the one that scrolls, since scrollTop is read off it`)
}

// A RATCHET: every .overlay-sheet in the app answers to the gesture. A fourth
// sheet added without it is exactly the "only some panels" fault this fixes.
const sheets = walk('components').concat(walk('app'))
  .filter(f => f.endsWith('.tsx') && /className="overlay-sheet/.test(read(f)))
ok(sheets.length >= 3, `(fixture sanity: the scan finds the sheets - ${sheets.length})`)
const deaf = sheets.filter(f => !/useSheetDismiss\(/.test(code(f)))
ok(deaf.length === 0, `every bottom sheet can be pulled down${deaf.length ? ` - not ${deaf[0]}` : ''}`)

// A sheet that is state in a LAYOUT outlives the page under it. The sections
// sheet lives in the project layout; a back-swipe can now change the page
// while it is open, and it must not hang over a screen it was never about.
const tabs = code('components/layout/project-tabs.tsx')
ok(/useEffect\(\(\) => \{ setOpen\(false\) \}, \[pathname\]\)/.test(tabs),
  'the project sections sheet closes when the page changes underneath it')

// ── the sheet slides up ─────────────────────────────────────────────────────
// overlay-geometry's drawer section says the animation "is checked as source
// shape instead" - and nothing checked it. Now something does, for both.
const css = read('app/globals.css')
ok(/@keyframes overlay-sheet-in \{\s*from \{ transform: translateY\(100%\); \}/.test(css),
  'a sheet slides UP from the bottom edge - it used to simply appear')
ok(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.overlay-sheet > \* \{ animation: overlay-sheet-in/.test(css),
  '...inside a reduced-motion guard')
ok(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.overlay-drawer > \* \{ animation: overlay-drawer-in/.test(css),
  '...as the drawer entrance is')
const geo = read('lib/__tests__/overlay-geometry.ts')
ok(/\.overlay-sheet > \*[^}]*animation: none !important/.test(geo),
  'overlay-geometry switches the sheet animation off, or it measures a sheet one panel-height too low')

done()
