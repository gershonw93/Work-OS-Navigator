'use client'

import { useEffect, useRef } from 'react'
import { visibleViewport } from './visible-viewport'

/**
 * Keep `--vv-h` and `--vv-t` on <html> tracking the part of the screen you can
 * actually see.
 *
 * THE BUG. An overlay is `position: fixed`, which is laid out against the
 * LAYOUT viewport - and that does not shrink when a keyboard or a date wheel
 * covers the bottom 40% of the phone. So a dialog centres itself in the whole
 * screen and half of it, including its buttons, ends up behind the keyboard.
 * Add `autoFocus` and it happens the instant the dialog opens, which is what
 * "it happens when I press this button" was.
 *
 * `window.visualViewport` is the one thing that DOES know: its height is what
 * is left above the keyboard, and its offsetTop is how far the page has been
 * pushed up to reach a focused field. `.overlay` and `.overlay-sheet` size
 * themselves from these, so a dialog lands in the strip that is visible.
 *
 * NOT gated on being the native app, deliberately - mobile Safari has exactly
 * the same keyboard. When `visualViewport` is missing the variables are never
 * set and the CSS falls back to the full screen, which is today's behaviour.
 *
 * What the numbers MEAN is worked out by `visibleViewport` in
 * `lib/visible-viewport.ts` - reading `vv.height` straight off is what
 * subtracted the keyboard twice and squeezed the app into a strip.
 */
export function useVisualViewport() {
  // The tallest layout viewport seen with no keyboard up. It has to survive
  // between events, and it must never re-render - it is an input to a style,
  // not to the tree.
  const fullFrame = useRef(0)

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const root = document.documentElement
    const apply = () => {
      const next = visibleViewport(
        { innerHeight: window.innerHeight, vvHeight: vv.height, vvOffsetTop: vv.offsetTop },
        fullFrame.current,
      )
      fullFrame.current = next.fullFrame
      root.style.setProperty('--vv-h', `${Math.round(next.height)}px`)
      root.style.setProperty('--vv-t', `${next.top}px`)
    }
    apply()

    // Rotating gives a genuinely different frame. Without this reset, turning
    // a phone to landscape looks exactly like a keyboard opening - the layout
    // viewport drops below a baseline taken in portrait - and every overlay
    // would size itself from the wrong branch for the rest of the session.
    const reset = () => { fullFrame.current = 0; apply() }

    vv.addEventListener('resize', apply)
    // The keyboard does not only resize: focusing a field near the bottom
    // SCROLLS the visual viewport within the layout one, and offsetTop is the
    // only place that shows up.
    vv.addEventListener('scroll', apply)
    window.addEventListener('orientationchange', reset)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      window.removeEventListener('orientationchange', reset)
      root.style.removeProperty('--vv-h')
      root.style.removeProperty('--vv-t')
    }
  }, [])
}
