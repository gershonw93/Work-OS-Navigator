// ─────────────────────────────────────────────────────────────────────────────
// How much of the screen you can actually see, in the coordinates the CSS is
// laid out in.
//
// THE BUG. With the keyboard up, the app was squeezed into a strip at the top
// of the screen with bare background under it. Measured off the phone: the
// visible strip above the keyboard was ~516pt and the shell got ~121pt. The
// difference, ~395, is the keyboard - it had been subtracted TWICE.
//
//   1. The native keyboard mode shrinks the WKWebView frame, so the LAYOUT
//      viewport is already only the visible strip. That takes the
//      `@capacitor/keyboard` plugin on `resize: 'native'` - WITHOUT IT
//      NOTHING RESIZES, and the first branch below is unreachable. It was
//      missing from the app for its whole life, which is how the Request
//      Inspection form came to leave the tab bar floating mid-screen: iOS
//      cannot shrink the frame, so it PANS the visual viewport instead and
//      drags every `position: fixed` element along with it. Pinned in
//      `lib/__tests__/keyboard-resize.ts`, because an assumption nothing
//      checks is a comment rather than a guarantee.
//   2. `window.visualViewport.height` inside that frame subtracts it again.
//
// `--vv-h` was published straight from (2), so the shell and every overlay
// sized themselves to a screen-minus-two-keyboards that does not exist.
//
// The rule: these values describe the visible strip RELATIVE TO THE LAYOUT
// VIEWPORT they will be laid out against. When the webview has already resized
// itself, the layout viewport IS the visible strip - the keyboard is outside
// the frame entirely - so the height is `innerHeight` and there is no offset.
// `visualViewport` is the authority only when the frame did not shrink: mobile
// Safari, and any future build with native keyboard resizing turned off.
//
// Telling those apart takes one remembered number, which is why this is a
// function of state rather than of `window` alone.
// ─────────────────────────────────────────────────────────────────────────────

export interface ViewportNow {
  /** The layout viewport - what CSS lengths are resolved against. */
  innerHeight: number
  vvHeight: number
  vvOffsetTop: number
  /**
   * Is something focused that could be covering the bottom of the screen?
   *
   * Required, not optional: a caller that forgets it is the bug below, and a
   * default would hide that behind a compile that passed.
   */
  keyboardPossible: boolean
}

export interface VisibleViewport {
  /** `--vv-h`: the height of the strip you can see. */
  height: number
  /** `--vv-t`: where that strip starts. */
  top: number
  /** The tallest frame seen so far, to feed back in next time. */
  fullFrame: number
}

/**
 * `fullFrame` is the tallest layout viewport seen with no keyboard up. Pass 0
 * on the first call and hand back what you get.
 *
 * A pixel of slack on the comparison, deliberately: iOS reports fractional
 * heights and a half-pixel wobble must not read as "the keyboard opened".
 */
export function visibleViewport(now: ViewportNow, fullFrame: number): VisibleViewport {
  const full = Math.max(fullFrame, now.innerHeight)

  // NOTHING IS FOCUSED, SO NOTHING IS COVERING THE SCREEN.
  //
  // THE BUG THIS CLOSES. A task drawer opened over the top half of the phone
  // with bare white under it and no top bar - reported as "what's this? is it
  // my phone or the app?", a few times in one day, always after typing. Both
  // `.overlay-drawer` and `.h-app` are `var(--vv-h)`, so a `--vv-h` left at a
  // keyboard-open value draws exactly that: a half-height app on a full-height
  // screen.
  //
  // It is stale because the two numbers below do not recover together. When
  // the keyboard goes away `innerHeight` comes back first, which drops us out
  // of the shrunk-frame branch and into the one that trusts `vvHeight` - and
  // `vvHeight` is still mid-animation, or has already fired its last event. We
  // then publish a strip as though the frame were whole, and nothing
  // recomputes, because from the browser's point of view nothing is happening
  // any more.
  //
  // A measurement that can lag has to be checked against a fact that cannot.
  // The keyboard (and the iOS select wheel) exists only while something is
  // focused, so with nothing focused the visible strip is the WHOLE frame,
  // whatever `visualViewport` is still reporting.
  if (!now.keyboardPossible) {
    return { height: now.innerHeight, top: 0, fullFrame: full }
  }

  // The frame shrank, so it has already taken the keyboard off for us.
  if (now.innerHeight < full - 1) {
    return { height: now.innerHeight, top: 0, fullFrame: full }
  }

  // The frame is whole: the visual viewport is the only thing that knows what
  // the keyboard is covering, and how far a focused field pushed the page up.
  // Rounded up: half a pixel of slack at the top is invisible, half a pixel
  // short is a hairline of the page showing above a full-bleed sheet.
  return { height: now.vvHeight, top: Math.ceil(now.vvOffsetTop), fullFrame: full }
}

/**
 * Can this element be raising a keyboard?
 *
 * A `<select>` counts: it is not a keyboard, but on iOS it is a wheel over the
 * bottom of the screen, which is the same fact as far as "how much can you see"
 * is concerned. Everything else is a shape a keyboard never opens for.
 *
 * Deliberately loose in the uncertain direction - an unknown input type counts
 * as a keyboard. Being wrong that way leaves today's behaviour; being wrong the
 * other way forces the app to full height with a keyboard still up.
 */
const NO_KEYBOARD = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
])

export function raisesKeyboard(
  el: { tagName?: string; type?: string; isContentEditable?: boolean } | null | undefined,
): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toLowerCase()
  if (tag === 'textarea' || tag === 'select') return true
  if (tag !== 'input') return false
  return !NO_KEYBOARD.has((el.type ?? 'text').toLowerCase())
}
