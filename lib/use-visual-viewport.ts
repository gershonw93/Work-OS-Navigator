'use client'

import { useEffect } from 'react'

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
 */
export function useVisualViewport() {
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null
    if (!vv) return

    const root = document.documentElement
    const apply = () => {
      root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`)
      // Rounded up: half a pixel of slack at the top is invisible, and half a
      // pixel short is a hairline of the page showing above a full-bleed sheet.
      root.style.setProperty('--vv-t', `${Math.ceil(vv.offsetTop)}px`)
    }
    apply()

    vv.addEventListener('resize', apply)
    // The keyboard does not only resize: focusing a field near the bottom
    // SCROLLS the visual viewport within the layout one, and offsetTop is the
    // only place that shows up.
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      root.style.removeProperty('--vv-h')
      root.style.removeProperty('--vv-t')
    }
  }, [])
}
