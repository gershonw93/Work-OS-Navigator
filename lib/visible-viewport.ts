// ─────────────────────────────────────────────────────────────────────────────
// How much of the screen you can actually see, in the coordinates the CSS is
// laid out in.
//
// THE BUG. With the keyboard up, the app was squeezed into a strip at the top
// of the screen with bare background under it. Measured off the phone: the
// visible strip above the keyboard was ~516pt and the shell got ~121pt. The
// difference, ~395, is the keyboard - it had been subtracted TWICE.
//
//   1. Capacitor's default keyboard mode shrinks the WKWebView frame, so the
//      LAYOUT viewport is already only the visible strip.
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
