'use client'

import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { swipeAxis, swipeTravel, shouldDismiss, type SwipeAxis } from './swipe-dismiss'

/** Long enough to read as the panel leaving, short enough not to be a wait. */
export const SWIPE_EXIT_MS = 180

export interface SwipeDismiss {
  /** Spread onto the PANEL, not the backdrop. */
  handlers: {
    onTouchStart: (e: TouchEvent<HTMLElement>) => void
    onTouchMove: (e: TouchEvent<HTMLElement>) => void
    onTouchEnd: (e: TouchEvent<HTMLElement>) => void
    onTouchCancel: () => void
  }
  style: CSSProperties
}

/**
 * Drag a side drawer back off the edge it came in from to close it.
 *
 * `'right'` for a right-hand drawer (`.overlay-drawer`), `'left'` for the
 * phone navigation, which slides in from the left. One hook, because a gesture
 * only some drawers answer to is worse than none.
 *
 * Touch only, deliberately: a mouse has the close button and the backdrop, and
 * a drag-to-dismiss on a pointer device fights text selection.
 *
 * THE VERTICAL GESTURE IS NEVER TAKEN. The drawer's body scrolls, and a panel
 * that slides sideways when somebody tries to scroll it is worse than having
 * no gesture at all - so the axis is decided ONCE, at the moment the finger
 * passes the slop, and a scroll is left entirely alone for the rest of it.
 *
 * No preventDefault anywhere: React attaches touch listeners passively, so it
 * would not work, and it is not needed - nothing here scrolls sideways, so a
 * horizontal drag has nothing to steal.
 */
export function useSwipeDismiss(
  onDismiss: () => void,
  enabled = true,
  direction: 'right' | 'left' = 'right',
): SwipeDismiss {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  // Once it is on its way out, every further touch is ignored: a second
  // gesture landing mid-exit would otherwise drag a panel that is already gone
  // back onto the screen for a frame.
  const [leaving, setLeaving] = useState(false)

  const start = useRef<{ x: number; y: number; at: number } | null>(null)
  const axis = useRef<SwipeAxis>('undecided')
  const exit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(exit.current), [])

  // A panel that UNMOUNTS on dismiss takes this state with it. One that stays
  // mounted and merely slides out of frame - the phone navigation - does not,
  // and would be left with `leaving` set forever: every later touch ignored,
  // the inline transform still pinning it off-screen. So closing resets it.
  useEffect(() => {
    if (enabled) return
    setLeaving(false)
    setDragging(false)
    setOffset(0)
    start.current = null
    axis.current = 'undecided'
  }, [enabled])

  const cancel = () => {
    start.current = null
    axis.current = 'undecided'
    setDragging(false)
    setOffset(0)
  }

  const onTouchStart = (e: TouchEvent<HTMLElement>) => {
    if (!enabled || leaving || e.touches.length !== 1) return
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, at: Date.now() }
    axis.current = 'undecided'
  }

  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    const from = start.current
    if (!from || leaving) return
    if (e.touches.length !== 1) { cancel(); return }   // a pinch is not a swipe

    const t = e.touches[0]
    const dx = t.clientX - from.x
    const dy = t.clientY - from.y

    if (axis.current === 'undecided') axis.current = swipeAxis(dx, dy)
    if (axis.current !== 'horizontal') return          // it is a scroll; leave it

    if (!dragging) setDragging(true)
    setOffset(swipeTravel(dx, dy, direction))
  }

  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const from = start.current
    start.current = null
    setDragging(false)
    if (!from || leaving || axis.current !== 'horizontal') { setOffset(0); return }

    const t = e.changedTouches[0]
    const travel = t ? swipeTravel(t.clientX - from.x, 0, direction) : 0
    const width = e.currentTarget.offsetWidth

    if (!shouldDismiss({ dx: Math.abs(travel), width, elapsedMs: Date.now() - from.at })) {
      setOffset(0)                                     // spring back
      return
    }

    // Out the way it came in, then gone. The timer is what actually closes it -
    // not `transitionend`, which never fires under reduced motion or if the
    // panel is hidden mid-flight, and a gesture that leaves a drawer stuck
    // half off the screen is unrecoverable without the close button it just
    // slid away from.
    setLeaving(true)
    setOffset(direction === 'left' ? Math.min(-width, travel) : Math.max(width, travel))
    exit.current = setTimeout(onDismiss, SWIPE_EXIT_MS)
  }

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancel },
    style: {
      transform: offset ? `translateX(${offset}px)` : undefined,
      // None while the finger is down: the panel is following it, and a
      // transition there is lag. The entrance keyframes are unaffected either
      // way - a running animation outranks an inline style.
      transition: dragging ? 'none' : `transform ${SWIPE_EXIT_MS}ms ease-out`,
    },
  }
}
