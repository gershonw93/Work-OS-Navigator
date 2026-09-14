// ─────────────────────────────────────────────────────────────────────────────
// Sliding a drawer back off the screen.
//
// Asked for directly: "can you also make the option to slide back to go back
// to all tasks?" The drawer arrives from the right edge, so the way out of it
// is the way it came in - and on a phone that is the gesture people reach for
// before they look for a close button.
//
// Pure, because every part of it is a judgement about numbers and every one of
// those judgements has a wrong answer that feels broken: hijack a vertical
// scroll and the list will not move; demand too much travel and the gesture
// "does nothing"; accept too little and the drawer falls off the screen while
// somebody is trying to read it.
// ─────────────────────────────────────────────────────────────────────────────

export type SwipeAxis = 'undecided' | 'horizontal' | 'vertical'

/**
 * How far a finger must travel before the gesture has a direction.
 *
 * Nothing may move before this: a tap has a pixel or two of wobble in it, and
 * a drawer that shifts under a tap on a button reads as a glitch.
 */
export const SWIPE_SLOP = 12

/**
 * Which way is this gesture going?
 *
 * ONE ANSWER PER GESTURE, decided once and kept - the caller must not re-ask
 * on every move. A drag that starts down the page and curves sideways is still
 * a scroll; if the axis were recomputed it would become a swipe halfway
 * through and take the panel with it.
 */
export function swipeAxis(dx: number, dy: number, slop: number = SWIPE_SLOP): SwipeAxis {
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return 'undecided'
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
}

/**
 * How far the panel has actually moved.
 *
 * It came from the right and it only ever leaves that way: dragging LEFT does
 * nothing at all. There is nothing to the left of a full-bleed drawer to
 * reveal, so rubber-banding there would just be the panel coming away from the
 * edge of the screen with a strip of the backdrop behind it.
 */
export function swipeOffset(dx: number): number {
  return dx > 0 ? dx : 0
}

export interface SwipeEnd {
  dx: number
  /** The panel's own width - the threshold is a fraction of it, not a constant. */
  width: number
  elapsedMs: number
}

/** A third of the way across is a decision, not a slip. */
export const SWIPE_FRACTION = 0.35
/** ...and so is a short, fast flick, which never travels a third of anything. */
export const FLICK_PX_PER_MS = 0.5
export const FLICK_MIN_PX = 32

export function shouldDismiss({ dx, width, elapsedMs }: SwipeEnd): boolean {
  if (dx <= 0) return false
  if (width > 0 && dx >= width * SWIPE_FRACTION) return true
  // TWO WAYS TO MEAN IT, because distance alone fails the quick flick people
  // actually use - a 40px shove in 60ms is unambiguous and would otherwise
  // spring back, which reads as the gesture not being supported.
  return dx >= FLICK_MIN_PX && elapsedMs > 0 && dx / elapsedMs >= FLICK_PX_PER_MS
}
