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

import { raisesKeyboard, visibleViewport } from '../visible-viewport'
import { ok, done, code } from './_helpers'

const SCREEN = 932        // the frame with no keyboard up
const STRIP = 516         // what is left above the keyboard
const DOUBLED = 121       // what visualViewport reported inside the shrunk frame

// ── the reported bug: Capacitor shrank the frame, vv subtracted again ────────
let seen = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0, keyboardPossible: false }, 0)
ok(seen.height === SCREEN && seen.fullFrame === SCREEN, `with no keyboard the whole frame is visible (${seen.height})`)

seen = visibleViewport({ innerHeight: STRIP, vvHeight: DOUBLED, vvOffsetTop: 0, keyboardPossible: true }, seen.fullFrame)
ok(seen.height === STRIP,
  `a shrunk frame IS the visible strip, keyboard outside it (got ${seen.height}, want ${STRIP})`)
ok(seen.top === 0, 'and a shrunk frame has no visual-viewport offset to report')

// ...and it comes back when the keyboard closes.
seen = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0, keyboardPossible: false }, seen.fullFrame)
ok(seen.height === SCREEN, `the screen is whole again afterwards (${seen.height})`)

// ── mobile Safari: the frame does NOT move, so visualViewport is the truth ───
let safari = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0, keyboardPossible: false }, 0)
safari = visibleViewport({ innerHeight: SCREEN, vvHeight: STRIP, vvOffsetTop: 40, keyboardPossible: true }, safari.fullFrame)
ok(safari.height === STRIP, `an unshrunk frame defers to the visual viewport (${safari.height})`)
ok(safari.top === 40, `...including how far a focused field pushed the page up (${safari.top})`)

// ── half a pixel of wobble is not a keyboard ─────────────────────────────────
const wobble = visibleViewport({ innerHeight: SCREEN - 0.5, vvHeight: SCREEN - 0.5, vvOffsetTop: 0, keyboardPossible: true }, SCREEN)
ok(wobble.height === SCREEN - 0.5,
  'a fractional frame height is not read as the keyboard opening')

// ── a fractional offset rounds UP: short by half a pixel is a visible hairline
const frac = visibleViewport({ innerHeight: SCREEN, vvHeight: STRIP, vvOffsetTop: 39.2, keyboardPossible: true }, SCREEN)
ok(frac.top === 40, `the offset rounds up, never down (${frac.top})`)

// ── rotation is a different frame, and the baseline grows into it ────────────
const landscape = visibleViewport({ innerHeight: 430, vvHeight: 430, vvOffsetTop: 0, keyboardPossible: false }, 0)
ok(landscape.height === 430 && landscape.fullFrame === 430,
  'a fresh baseline takes the frame it is given, whichever way up the phone is')

// ── the hook does not read vv.height itself ──────────────────────────────────
const hook = code('lib/use-visual-viewport.ts')
ok(/visibleViewport\(/.test(hook), 'the hook goes through visibleViewport')
ok(!/vv\.height\}px|Math\.round\(vv\.height\)/.test(hook),
  '...rather than publishing vv.height straight, which is the bug')
ok(/orientationchange/.test(hook),
  'and rotation resets the baseline, or landscape reads as a keyboard for the rest of the session')

// ── the event that says the input changed ───────────────────────────────────
//
// Everything above turns on `window.innerHeight`, and the hook listened to
// `visualViewport` resize/scroll and `orientationchange` - never to
// `window.resize`. A frame that resized without a visualViewport event left
// `--vv-h` stale for as long as the keyboard was up, and the whole point of the
// remembered baseline is that it is compared against a CURRENT innerHeight.
ok(/window\.addEventListener\('resize'/.test(hook),
  'THE MISSING LISTENER: the layout viewport has its own event, and innerHeight is the input')
ok(/window\.removeEventListener\('resize'/.test(hook), '...and it is cleaned up')

// AND TWICE, A FRAME APART. visualViewport fires before innerHeight settles on
// iOS, so a measurement taken at that instant reads a stale innerHeight, picks
// the wrong branch, and nothing recomputes afterwards.
ok(/requestAnimationFrame\(apply\)/.test(hook),
  'each event measures again a frame later, because the two numbers do not settle together')
ok(/cancelAnimationFrame\(raf\)/.test(hook),
  '...with the pending one cancelled, so a burst of events is one extra read and not a queue')

// ─────────────────────────────────────────────────────────────────────────────
// AND THE ONE IT LEFT: the strip that never came back.
//
// "What's this? Is it my phone or the app?" - a task drawer over the top half
// of the phone, bare white under it, no top bar. A few times in one day, always
// after typing. `.overlay-drawer` and `.h-app` are both `var(--vv-h)`, so that
// picture IS a --vv-h stuck at a keyboard-open value.
//
// The two numbers do not recover together. `innerHeight` comes back first,
// which drops out of the shrunk-frame branch and into the one that trusts
// `vvHeight` - and `vvHeight` is still mid-animation. A strip gets published as
// though the frame were whole, and then nothing fires again, because as far as
// the browser is concerned nothing is happening any more.
// ─────────────────────────────────────────────────────────────────────────────
{
  let v = visibleViewport({ innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0, keyboardPossible: false }, 0)
  v = visibleViewport({ innerHeight: STRIP, vvHeight: STRIP, vvOffsetTop: 0, keyboardPossible: true }, v.fullFrame)
  ok(v.height === STRIP, `keyboard up, frame shrunk: the strip (${v.height}, fixture sanity)`)

  // The instant the keyboard goes. innerHeight is back; vvHeight is not.
  const stale = { innerHeight: SCREEN, vvHeight: STRIP, vvOffsetTop: 0 }
  ok(visibleViewport({ ...stale, keyboardPossible: true }, v.fullFrame).height === STRIP,
    `with a field still focused the lagging number is still believed (${STRIP}, fixture sanity)`)
  ok(visibleViewport({ ...stale, keyboardPossible: false }, v.fullFrame).height === SCREEN,
    'THE BUG: nothing focused means nothing is covering the screen, whatever visualViewport still says')
  ok(visibleViewport({ ...stale, keyboardPossible: false }, v.fullFrame).top === 0,
    '...and a page pushed up for a field it no longer has is back at the top')
}

// ── what counts as "something could be covering the screen" ─────────────────
ok(!raisesKeyboard(null), 'nothing focused raises no keyboard')
ok(!raisesKeyboard({ tagName: 'BODY' }), '...and neither does the body')
ok(raisesKeyboard({ tagName: 'TEXTAREA' }), 'a textarea does - this is the one that was reported')
ok(raisesKeyboard({ tagName: 'INPUT' }), 'a bare input does')
ok(raisesKeyboard({ tagName: 'INPUT', type: 'date' }), '...and so does a date field, wheel and all')
ok(raisesKeyboard({ tagName: 'SELECT' }),
  'a select is not a keyboard, but on iOS it is a wheel over the bottom of the screen')
ok(raisesKeyboard({ tagName: 'DIV', isContentEditable: true }), 'and so is anything contenteditable')
ok(!raisesKeyboard({ tagName: 'INPUT', type: 'checkbox' }), 'a checkbox does not')
ok(!raisesKeyboard({ tagName: 'BUTTON' }), '...nor a button')
ok(raisesKeyboard({ tagName: 'INPUT', type: 'something-new' }),
  'an input type nobody has heard of counts as a keyboard - wrong that way is only today\'s behaviour')

ok(/raisesKeyboard\(document\.activeElement\)/.test(hook),
  'the hook asks the DOM for the fact rather than inferring it from the measurement')
ok(/addEventListener\('focusout', applyLater\)/.test(hook) && /addEventListener\('focusin', applyLater\)/.test(hook),
  '...and recomputes when focus moves, which is the moment a keyboard appears or goes')
ok(/removeEventListener\('focusout'/.test(hook) && /removeEventListener\('focusin'/.test(hook),
  '...cleaned up with the rest')
ok(!/'focusout', applySoon\)/.test(hook),
  'DEFERRED, not immediate: focusout fires before focusin, so measuring there sees <body> between two fields')
ok(/setTimeout\(apply, 300\)/.test(hook) && /clearTimeout\(settle\)/.test(hook),
  'and one more read after the keyboard animation, which a single frame is far too early for')

// ─────────────────────────────────────────────────────────────────────────────
// AND THE ONE AFTER THAT: the baseline learned with the keyboard already up.
//
// "Daily logs update got this issue as well" - tapping "Add an update" left the
// app in a band across the top THIRD of the screen, bare background under it
// all the way down to the keyboard.
//
// The arithmetic closes exactly. The app filled 33.5% of the space above the
// keyboard; on this screen that space is 560pt and the keyboard is 372pt, and
// 560 - 372 = 188, which is 33.5% of 560. The keyboard subtracted TWICE - the
// bug this file exists for - but reached through the BASELINE this time rather
// than through the branch.
//
// `fullFrame` means "the frame with nothing covering it" and was updated on
// every call, including calls made while the frame had already shrunk for a
// keyboard. One of those redefines a whole screen as a strip, and from then on
// `innerHeight < full - 1` is false, so every measurement falls through to the
// branch that trusts `vvHeight`.
// ─────────────────────────────────────────────────────────────────────────────
{
  const KEYBOARD = 372
  const VISIBLE = SCREEN - KEYBOARD            // 560: the frame Capacitor leaves
  const TWICE = VISIBLE - KEYBOARD             // 188: what vvHeight says inside it

  // The poisoning event: the very first measurement happens with a field
  // already focused - a page loaded onto one, a rotation while typing, the app
  // resumed. There is no baseline yet and the frame is already shrunk.
  const first = visibleViewport(
    { innerHeight: VISIBLE, vvHeight: TWICE, vvOffsetTop: 0, keyboardPossible: true }, 0)
  ok(first.height === VISIBLE,
    `THE REPORT: with no baseline and a keyboard up, the frame we can see is the answer (got ${first.height}, not ${TWICE})`)
  ok(first.fullFrame === 0,
    'and a keyboard-up frame is NOT taken as the baseline - that is what poisons every later call')

  // Still typing. Without the rule above this reads `188` for as long as the
  // keyboard is up, because innerHeight can never grow past a baseline it is
  // already equal to.
  const still = visibleViewport(
    { innerHeight: VISIBLE, vvHeight: TWICE, vvOffsetTop: 0, keyboardPossible: true }, first.fullFrame)
  ok(still.height === VISIBLE, `...and it stays right while they keep typing (${still.height})`)

  // The keyboard goes: now the frame is honest, and only now is it learned.
  const closed = visibleViewport(
    { innerHeight: SCREEN, vvHeight: SCREEN, vvOffsetTop: 0, keyboardPossible: false }, still.fullFrame)
  ok(closed.height === SCREEN && closed.fullFrame === SCREEN,
    'the whole screen comes back, and THAT is the measurement worth remembering')

  // And with a real baseline the original shrunk-frame branch still does the work.
  const again = visibleViewport(
    { innerHeight: VISIBLE, vvHeight: TWICE, vvOffsetTop: 0, keyboardPossible: true }, closed.fullFrame)
  ok(again.height === VISIBLE, `the next keyboard is handled by the baseline as before (${again.height})`)
  ok(again.fullFrame === SCREEN, '...and does not lower it on the way through')

  // Mobile Safari is untouched: the frame does not shrink there, so the visual
  // viewport is still the only thing that knows what the keyboard covers.
  const safariNow = visibleViewport(
    { innerHeight: SCREEN, vvHeight: VISIBLE, vvOffsetTop: 0, keyboardPossible: true }, SCREEN)
  ok(safariNow.height === VISIBLE,
    `an unshrunk frame still defers to the visual viewport (${safariNow.height})`)
}

done()
