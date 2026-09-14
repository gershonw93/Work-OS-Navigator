'use client'

import { useEffect, useRef, useState } from 'react'
import { swipeAxis, type SwipeAxis } from './swipe-dismiss'
import { startsAtEdge, backProgress, shouldGoBack, canSwipeBack } from './swipe-back'

export interface SwipeBackState {
  /** 0 while idle, 1 at the commit distance. Drives the hint. */
  progress: number
  /** A finger is down on a gesture that began at the edge. */
  active: boolean
}

/**
 * Drag in from the left edge of the screen to go back.
 *
 * Listens on `document`, ONCE, from the one component mounted in both shells
 * (`NativeShell`) - rather than on any page, so every screen answers to it and
 * none can forget to.
 *
 * The rules are in `lib/swipe-back.ts`. This is only the wiring:
 *   * the gesture has to START in the edge strip; a drag that begins in the
 *     middle of the page is a scroll through whatever is there.
 *   * the axis is decided ONCE at the slop, the same as every other gesture
 *     here - a vertical scroll that drifts right is still a scroll.
 *   * nothing happens while an overlay is open, above `lg`, or on the first
 *     page of the session (`canSwipeBack`).
 *   * commit is `window.history.back()`. The Next router owns `popstate`, so
 *     this is a soft navigation, exactly as the browser's own back is - and
 *     exactly what WKWebView's native gesture does in the shell, so the two
 *     cannot disagree about where "back" goes.
 *
 * Passive listeners throughout: nothing here needs to cancel a scroll, and a
 * non-passive touch listener on `document` makes every scroll in the app wait
 * on it.
 */
export function useSwipeBack(): SwipeBackState {
  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(false)
  const start = useRef<{ x: number; y: number; at: number } | null>(null)
  const axis = useRef<SwipeAxis>('undecided')

  useEffect(() => {
    const reset = () => {
      start.current = null
      axis.current = 'undecided'
      setActive(false)
      setProgress(0)
    }

    const onStart = (e: globalThis.TouchEvent) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      if (!startsAtEdge(t.clientX)) return
      if (!canSwipeBack({
        historyLength: window.history.length,
        overlayOpen: !!document.querySelector('[data-overlay]'),
        wide: window.matchMedia('(min-width: 1024px)').matches,
      })) return
      start.current = { x: t.clientX, y: t.clientY, at: Date.now() }
      axis.current = 'undecided'
    }

    const onMove = (e: globalThis.TouchEvent) => {
      const from = start.current
      if (!from) return
      if (e.touches.length !== 1) { reset(); return }
      const t = e.touches[0]
      const dx = t.clientX - from.x
      const dy = t.clientY - from.y
      if (axis.current === 'undecided') axis.current = swipeAxis(dx, dy)
      if (axis.current !== 'horizontal') { reset(); return }   // a scroll; stop watching it
      setActive(true)
      setProgress(backProgress(dx))
    }

    const onEnd = (e: globalThis.TouchEvent) => {
      const from = start.current
      if (!from) return
      const t = e.changedTouches[0]
      const dx = t ? t.clientX - from.x : 0
      const go = axis.current === 'horizontal' && shouldGoBack({ dx, elapsedMs: Date.now() - from.at })
      reset()
      if (go) window.history.back()
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', reset)
    }
  }, [])

  return { progress, active }
}
