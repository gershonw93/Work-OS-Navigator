// ─────────────────────────────────────────────────────────────────────────────
// Sliding a panel back off the screen the way it came in.
//
// Asked for directly: "can you also make the option to slide back to go back
// to all tasks?" - and then, once one drawer answered to it, for the whole app:
// "add swiping all over to go back or swipe down the project menu etc. make it
// feel super native app like". A gesture that only SOME panels answer to is
// worse than none, because every panel that ignores it reads as broken.
//
// So there is one set of rules here, and every panel reads it:
//   * a right-hand drawer leaves to the RIGHT  (`lib/use-swipe-dismiss.ts`)
//   * the phone navigation leaves to the LEFT  (same hook, `'left'`)
//   * a bottom sheet leaves DOWNWARD           (`lib/use-sheet-dismiss.ts`)
//   * and the page itself goes BACK from the left edge (`lib/swipe-back.ts`)
//
// Pure, because every part of it is a judgement about numbers and every one of
// those judgements has a wrong answer that feels broken: hijack a vertical
// scroll and the list will not move; demand too much travel and the gesture
// "does nothing"; accept too little and the drawer falls off the screen while
// somebody is trying to read it.
// ─────────────────────────────────────────────────────────────────────────────

export type SwipeAxis = 'undecided' | 'horizontal' | 'vertical'

/** The way a panel leaves. It is also the only way it can be dragged. */
export type SwipeDirection = 'right' | 'left' | 'down'

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

/** The axis a panel leaving in `direction` moves along. */
export function exitAxis(direction: SwipeDirection): Exclude<SwipeAxis, 'undecided'> {
  return direction === 'down' ? 'vertical' : 'horizontal'
}

/**
 * How far the panel has actually moved, SIGNED, along its exit axis.
 *
 * ONE WAY ONLY. A panel came from one edge and it only ever leaves that way:
 * dragging a right-hand drawer LEFT does nothing at all, and dragging a bottom
 * sheet UP does nothing at all. There is nothing behind a full-bleed panel to
 * reveal on the other side, so rubber-banding there would just be the panel
 * coming away from the edge of the screen with a strip of the backdrop behind
 * it.
 *
 * The sign is the direction's own, so the result can be handed straight to a
 * `translateX`/`translateY`: a leftward drawer reports negative numbers.
 */
export function swipeTravel(dx: number, dy: number, direction: SwipeDirection): number {
  switch (direction) {
    case 'right': return dx > 0 ? dx : 0
    case 'left':  return dx < 0 ? dx : 0
    case 'down':  return dy > 0 ? dy : 0
  }
}

/** The original, right-hand-drawer case. Kept because two panels read it by name. */
export function swipeOffset(dx: number): number {
  return swipeTravel(dx, 0, 'right')
}

export interface SwipeEnd {
  /** Distance travelled along the exit axis. Magnitude - the sign was settled by `swipeTravel`. */
  dx: number
  /** The panel's own extent on that axis - width for a drawer, HEIGHT for a sheet. The threshold is a fraction of it, not a constant. */
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

/**
 * May a bottom sheet take this vertical drag, or is it a scroll?
 *
 * THE ONE THING THAT MAKES A SHEET DIFFERENT FROM A DRAWER. A drawer's exit
 * axis is horizontal and its body scrolls vertically, so the two never collide.
 * A sheet leaves DOWNWARD - the same axis its body scrolls on - and the only
 * thing that tells them apart is where the scroller is: at the top, a downward
 * drag has nowhere to scroll to, so it is the sheet being pulled; anywhere
 * else it is the list being scrolled back up, and the sheet must not move.
 *
 * `scrollTop` is read ONCE, when the finger lands. A panel that re-asks on
 * every move would start dragging the moment a scroll-up reached the top,
 * mid-gesture, and slide out from under a finger that only wanted the first
 * row.
 */
export function sheetTakesGesture(scrollTopAtStart: number, dy: number): boolean {
  return scrollTopAtStart <= 0 && dy > 0
}
