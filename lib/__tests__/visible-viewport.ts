// The keyboard, subtracted twice.
//
// A screenshot with the keyboard open: the app squeezed into a strip at the
// top of the screen, bare background under it, the keyboard's accessory bar a
// long way below. Measured against a 430pt phone, the shell ended at ~121pt
// and the visible strip above the keyboard was ~516pt. The difference is the
// keyboard's own height - it had come off twice. Capacitor shrinks the
// WKWebView frame for the keyboard, so the layout viewport was ALREADY the
// visible strip, and `visualViewport.height` inside that frame took it off
// again.
//
// `--vv-h` was published straight from that number, so the shell (#411) and
// every `.overlay` sized themselves to a screen minus two keyboards. Which
// branch is right depends on whether the frame moved, and that needs a
// remembered baseline - so it is a pure function, and these are the numbers
// off the two phones that reported it.

import { visibleViewport } from '../visible-viewport'
import { ok, done, code } from './_helpers'

const SCREEN = 932        // the frame with no keyboard up
const STRIP = 516         // what is left above the keyboard
const DOUBLED = 121       // what visualViewport reported inside the shrunk frame

// ── the reported bug: Capacitor shrank the frame, vv subtracted again ────────
let seen = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0 }, 0)
ok(seen.height === SCREEN && seen.fullFrame === SCREEN, `with no keyboard the whole frame is visible (${seen.height})`)

seen = visibleViewport({ innerHeight: STRIP, vvHeight: DOUBLED, vvOffsetTop: 0 }, seen.fullFrame)
ok(seen.height === STRIP,
  `a shrunk frame IS the visible strip, keyboard outside it (got ${seen.height}, want ${STRIP})`)
ok(seen.top === 0, 'and a shrunk frame has no visual-viewport offset to report')

// ...and it comes back when the keyboard closes.
seen = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0 }, seen.fullFrame)
ok(seen.height === SCREEN, `the screen is whole again afterwards (${seen.height})`)

// ── mobile Safari: the frame does NOT move, so visualViewport is the truth ───
let safari = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0 }, 0)
safari = visibleViewport({ innerHeight: SCREEN, vvHeight: STRIP, vvOffsetTop: 40 }, safari.fullFrame)
ok(safari.height === STRIP, `an unshrunk frame defers to the visual viewport (${safari.height})`)
ok(safari.top === 40, `...including how far a focused field pushed the page up (${safari.top})`)

// ── half a pixel of wobble is not a keyboard ─────────────────────────────────
const wobble = visibleViewport({ innerHeight: SCREEN - 0.5, vvHeight: SCREEN - 0.5, vvOffsetTop: 0 }, SCREEN)
ok(wobble.height === SCREEN - 0.5,
  'a fractional frame height is not read as the keyboard opening')

// ── a fractional offset rounds UP: short by half a pixel is a visible hairline
const frac = visibleViewport({ innerHeight: SCREEN, vvHeight: STRIP, vvOffsetTop: 39.2 }, SCREEN)
ok(frac.top === 40, `the offset rounds up, never down (${frac.top})`)

// ── rotation is a different frame, and the baseline grows into it ────────────
const landscape = visibleViewport({ innerHeight: 430, vvHeight: 430, vvOffsetTop: 0 }, 0)
ok(landscape.height === 430 && landscape.fullFrame === 430,
  'a fresh baseline takes the frame it is given, whichever way up the phone is')

// ── the hook does not read vv.height itself ──────────────────────────────────
const hook = code('lib/use-visual-viewport.ts')
ok(/visibleViewport\(/.test(hook), 'the hook goes through visibleViewport')
ok(!/vv\.height\}px|Math\.round\(vv\.height\)/.test(hook),
  '...rather than publishing vv.height straight, which is the bug')
ok(/orientationchange/.test(hook),
  'and rotation resets the baseline, or landscape reads as a keyboard for the rest of the session')

done()
