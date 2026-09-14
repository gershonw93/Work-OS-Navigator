'use client'

import { useEffect, useRef } from 'react'
import { raisesKeyboard, visibleViewport } from './visible-viewport'

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
        {
          innerHeight: window.innerHeight, vvHeight: vv.height, vvOffsetTop: vv.offsetTop,
          // The fact that cannot lag. See visibleViewport.
          keyboardPossible: raisesKeyboard(document.activeElement),
        },
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

    // TWICE, A FRAME APART. `visualViewport` resize and `window.innerHeight`
    // do not settle together on iOS: the visual viewport fires first, and a
    // measurement taken at that instant can read an `innerHeight` that has not
    // caught up with the frame yet. Since `innerHeight` is the input the whole
    // decision pivots on, reading it early picks the wrong branch - and then
    // nothing recomputes, so `--vv-h` keeps a wrong number for as long as the
    // keyboard is up. One deferred re-read costs a frame and closes it.
    // AND AGAIN WHEN THE ANIMATION IS OVER. One frame was a guess: the iOS
    // keyboard takes about a quarter of a second to slide away, so a re-read
    // 16ms later is still reading the middle of it. The frame catches an
    // innerHeight that had not settled; the timer catches a vvHeight that had
    // not. Both are cancelled on the next event, so a burst is one extra read
    // of each rather than a queue.
    let raf = 0
    let settle: ReturnType<typeof setTimeout> | undefined
    const applyLater = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
      clearTimeout(settle)
      settle = setTimeout(apply, 300)
    }
    const applySoon = () => {
      apply()
      applyLater()
    }

    vv.addEventListener('resize', applySoon)
    // The keyboard does not only resize: focusing a field near the bottom
    // SCROLLS the visual viewport within the layout one, and offsetTop is the
    // only place that shows up.
    vv.addEventListener('scroll', applySoon)
    // THE LAYOUT VIEWPORT'S OWN EVENT, which was missing. Everything here turns
    // on `window.innerHeight`, and nothing was listening for the event that
    // says it changed - so a frame that resized without a visualViewport event
    // left `--vv-h` stale until something else happened to fire.
    window.addEventListener('resize', applySoon)
    window.addEventListener('orientationchange', reset)
    // FOCUS IS THE FACT, the viewport numbers are the measurement. Deferred,
    // never immediate: moving from one field to the next fires focusout before
    // focusin, so `activeElement` is <body> for an instant - measuring there
    // would throw the app to full height for a frame with the keyboard still
    // up, which is a flicker rather than a fix.
    document.addEventListener('focusin', applyLater)
    document.addEventListener('focusout', applyLater)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(settle)
      document.removeEventListener('focusin', applyLater)
      document.removeEventListener('focusout', applyLater)
      vv.removeEventListener('resize', applySoon)
      vv.removeEventListener('scroll', applySoon)
      window.removeEventListener('resize', applySoon)
      window.removeEventListener('orientationchange', reset)
      root.style.removeProperty('--vv-h')
      root.style.removeProperty('--vv-t')
    }
  }, [])
}
