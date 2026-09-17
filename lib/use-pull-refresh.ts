'use client'

import { useEffect, useRef, useState } from 'react'
import {
  canStartPull, pullAxis, pullTravel, pullState,
  PULL_MAX_WIDTH, type PullState,
} from './pull-refresh'

/**
 * Pull down at the top of the app's scroller to reload the screen.
 *
 * Mounted ONCE from `NativeShell`, like the swipe-back it shares an axis rule
 * with, so every screen answers to it and none can forget. It finds the
 * scroller by `[data-app-scroll]` - the one element in either shell that
 * scrolls - rather than being handed a ref through five layouts.
 *
 * The listeners are NOT passive: a pull has to be able to `preventDefault` the
 * scroll it is standing in for, and a passive listener may not. They are
 * attached to the scroller and not to the document, so nothing inside an
 * overlay - which has its own scrolling - is ever intercepted.
 */
export function usePullRefresh(onRefresh: () => void) {
  const [travel, setTravel] = useState(0)
  const [state, setState] = useState<PullState>('idle')

  // Everything the handlers need between events. Refs, not state: a re-render
  // per touchmove is 60 of them a second, and none of this is drawn.
  const startY = useRef(0)
  const startX = useRef(0)
  const active = useRef(false)
  const axis = useRef<ReturnType<typeof pullAxis>>('undecided')
  const firing = useRef(false)

  useEffect(() => {
    const el = document.querySelector<HTMLElement>('[data-app-scroll]')
    if (!el) return

    const reset = () => {
      active.current = false
      axis.current = 'undecided'
      setTravel(0)
      setState('idle')
    }

    function onStart(e: TouchEvent) {
      if (firing.current || e.touches.length !== 1) return
      const t = e.touches[0]
      // Asked ONCE, here. Re-asking mid-gesture would cancel the pull the
      // instant the container moved a pixel.
      const allowed = canStartPull({
        scrollTop: el!.scrollTop,
        hasOverlay: !!document.querySelector('[data-overlay]'),
        width: window.innerWidth,
        isTouch: true,
      })
      if (!allowed) return
      active.current = true
      axis.current = 'undecided'
      startY.current = t.clientY
      startX.current = t.clientX
    }

    function onMove(e: TouchEvent) {
      if (!active.current || firing.current) return
      const t = e.touches[0]
      const dy = t.clientY - startY.current
      const dx = t.clientX - startX.current

      if (axis.current === 'undecided') {
        axis.current = pullAxis(dx, dy)
        // Sideways belongs to swipe-back. Bow out and stay out for this touch.
        if (axis.current === 'horizontal') { active.current = false; return }
        if (axis.current === 'undecided') return
      }

      if (dy <= 0) { setTravel(0); setState('idle'); return }

      // Standing in for the scroll, so the scroll must not also happen.
      if (e.cancelable) e.preventDefault()

      const next = pullTravel(dy)
      setTravel(next)
      setState(pullState(next))
    }

    function onEnd() {
      if (!active.current || firing.current) return
      const fire = state === 'ready'
      active.current = false
      axis.current = 'undecided'

      if (!fire) { reset(); return }

      // Hold the indicator where it is and say so. The reload replaces the
      // page, so nothing here needs to put it back - but `firing` stops a
      // second pull starting during the handover, which on a slow connection
      // is a real window.
      firing.current = true
      setState('refreshing')
      onRefresh()
    }

    // Above the breakpoint none of this is wanted, and the listeners are the
    // cheapest thing to not have.
    if (window.innerWidth >= PULL_MAX_WIDTH) return

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', reset)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', reset)
    }
  }, [onRefresh, state])

  return { travel, state }
}
