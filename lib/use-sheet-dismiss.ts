'use client'

import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react'
import { swipeAxis, swipeTravel, shouldDismiss, sheetTakesGesture, type SwipeAxis } from './swipe-dismiss'
import { SWIPE_EXIT_MS, type SwipeDismiss } from './use-swipe-dismiss'

/**
 * Drag a bottom sheet back down off the screen to close it.
 *
 * `useSwipeDismiss` one axis over - the same slop, the same one-way rule, the
 * same two ways to mean it, the same timer close - with ONE addition, which is
 * the whole reason it is a separate hook: the sheet's exit axis is the axis
 * its body scrolls on. A drawer never has to decide between "swipe" and
 * "scroll" because they point different ways; a sheet does, and the answer is
 * `sheetTakesGesture`: a downward drag is the sheet only when the panel is
 * already scrolled to the top. Read ONCE, when the finger lands.
 *
 * The horizontal gesture is never taken, for the mirror of the drawer's
 * reason: a sheet's rows can hold a strip that scrolls sideways.
 *
 * Spread the handlers on the PANEL - the element that scrolls - not the
 * backdrop: `scrollTop` is read off `currentTarget`.
 */
export function useSheetDismiss(onDismiss: () => void, enabled = true): SwipeDismiss {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const start = useRef<{ x: number; y: number; at: number; scrollTop: number } | null>(null)
  const axis = useRef<SwipeAxis>('undecided')
  const exit = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(exit.current), [])

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
    start.current = { x: t.clientX, y: t.clientY, at: Date.now(), scrollTop: e.currentTarget.scrollTop }
    axis.current = 'undecided'
  }

  const onTouchMove = (e: TouchEvent<HTMLElement>) => {
    const from = start.current
    if (!from || leaving) return
    if (e.touches.length !== 1) { cancel(); return }

    const t = e.touches[0]
    const dx = t.clientX - from.x
    const dy = t.clientY - from.y

    if (axis.current === 'undecided') axis.current = swipeAxis(dx, dy)
    if (axis.current !== 'vertical') return            // sideways: not ours
    if (!sheetTakesGesture(from.scrollTop, dy)) return // it is a scroll; leave it

    if (!dragging) setDragging(true)
    setOffset(swipeTravel(dx, dy, 'down'))
  }

  const onTouchEnd = (e: TouchEvent<HTMLElement>) => {
    const from = start.current
    start.current = null
    setDragging(false)
    if (!from || leaving || axis.current !== 'vertical') { setOffset(0); return }

    const t = e.changedTouches[0]
    const travel = t ? swipeTravel(0, t.clientY - from.y, 'down') : 0
    const height = e.currentTarget.offsetHeight

    if (!sheetTakesGesture(from.scrollTop, travel)
        || !shouldDismiss({ dx: travel, width: height, elapsedMs: Date.now() - from.at })) {
      setOffset(0)
      return
    }

    setLeaving(true)
    setOffset(Math.max(height, travel))
    exit.current = setTimeout(onDismiss, SWIPE_EXIT_MS)
  }

  return {
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: cancel },
    style: {
      transform: offset ? `translateY(${offset}px)` : undefined,
      transition: dragging ? 'none' : `transform ${SWIPE_EXIT_MS}ms ease-out`,
      // While the sheet is following the finger its own scroller is held
      // still. iOS rubber-bands an `overflow-y: auto` element pulled past its
      // top even with `overscroll-behavior: contain`, and a panel that is both
      // sliding down AND bouncing inside itself moves twice for one drag.
      overflowY: dragging ? 'hidden' : undefined,
    },
  }
}
