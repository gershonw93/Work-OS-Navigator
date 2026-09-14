'use client'

import { ChevronLeft } from 'lucide-react'
import { useSwipeBack } from '@/lib/use-swipe-back'

/**
 * The edge-swipe-to-go-back gesture, and the chip that shows it is being heard.
 *
 * The hint is the whole of the feedback: the page does not slide (a soft
 * navigation has nothing to slide until it has rendered), so a finger pulling
 * in from the edge would otherwise see nothing at all until it let go - and
 * a gesture that shows nothing while it is happening is one nobody trusts. The
 * chip follows the finger in, and firms up when the release would go back.
 *
 * `aria-hidden`: it is not a control. `.swipe-back-hint` (globals.css) pins it
 * to the left edge, halfway down the VISIBLE strip - `--vv-*`, like every
 * other fixed element - and above the tab bar and any row menu, below any
 * overlay (which it never shows under anyway: `canSwipeBack` refuses while one
 * is open).
 */
export function SwipeBack() {
  const { progress, active } = useSwipeBack()
  const shown = active && progress > 0
  // Parked one chip-width off the edge; at full progress it is 12px in.
  const x = shown ? Math.round(-44 + 56 * progress) : -44
  return (
    <div
      aria-hidden
      className="swipe-back-hint flex h-11 w-11 items-center justify-center rounded-full border border-line bg-panel text-ink shadow-lg lg:hidden"
      style={{
        opacity: shown ? progress : 0,
        transform: `translate(${x}px, -50%)`,
        // Following the finger while it is down; easing home once it lifts.
        transition: active ? 'none' : 'opacity 150ms ease-out, transform 150ms ease-out',
      }}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={progress >= 1 ? 2.75 : 2} />
    </div>
  )
}
