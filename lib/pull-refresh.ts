// Pull down at the top of a screen to reload it.
//
// THE ASK: "we need it sometimes after someone gets a permit submitted he just
// needs a refresh". A permit changes on somebody else's phone and the screen in
// your hand is a minute old, with no way to say "ask again" that is not hunting
// for the browser's reload - which the installed app does not have a bar for.
//
// Pure. No DOM, no timers, no React - the hook feeds it numbers and it answers.
// The rules below each stop a real collision, and the ones about the AXIS and
// the OVERLAY are the two that would otherwise make this gesture fight the ones
// already on the screen.

import { swipeAxis, SWIPE_SLOP } from './swipe-dismiss'

/** Past this much travel, letting go reloads. */
export const PULL_THRESHOLD = 72

/** However hard you pull, the indicator stops here. */
export const PULL_MAX = 120

/** Below this width only. A mouse drag is not a pull. */
export const PULL_MAX_WIDTH = 1024

export interface PullContext {
  /** The scroll container's scrollTop at touch start. */
  scrollTop: number
  /** True when any `[data-overlay]` is open. */
  hasOverlay: boolean
  /** Viewport width, for the desktop cut-off. */
  width: number
  /** False on a machine with no touch screen. */
  isTouch: boolean
}

/**
 * Whether a touch beginning here may become a pull.
 *
 * Asked ONCE at touch start, never re-asked mid-gesture: a pull that begins at
 * the top and is then allowed to keep deciding would cancel itself the instant
 * the container moved a pixel.
 *
 * `scrollTop > 0` is the important one. Anywhere but the very top, a downward
 * drag is somebody scrolling UP through the page, and stealing it would make
 * the app feel broken in the most ordinary interaction there is.
 */
export function canStartPull(ctx: PullContext): boolean {
  if (!ctx.isTouch) return false
  if (ctx.width >= PULL_MAX_WIDTH) return false
  // A dialog is a conversation. Reloading out from under a half-typed note is
  // the same class of loss as the native `confirm()` that killed the page.
  if (ctx.hasOverlay) return false
  return ctx.scrollTop <= 0
}

/**
 * The axis, decided once at the slop boundary and kept.
 *
 * Borrowed from `swipe-dismiss` rather than re-derived, because the gesture it
 * has to coexist with is decided that way: the left-edge swipe-back. Two
 * gestures answering the same touch with two different ideas of what counts as
 * horizontal is how one of them starts firing during the other.
 */
export function pullAxis(dx: number, dy: number, slop: number = SWIPE_SLOP) {
  return swipeAxis(dx, dy, slop)
}

/**
 * How far the indicator has actually travelled, given a raw finger distance.
 *
 * Sub-linear on purpose. A 1:1 drag feels like the page has come unstuck, and
 * it lets somebody haul the indicator to the bottom of the screen. The curve
 * below moves roughly with the finger for the first few pixels and then gives
 * progressively less, which is the rubber-band every phone user already knows.
 *
 * Upward is nothing: this gesture only exists downward.
 */
export function pullTravel(dy: number, max: number = PULL_MAX): number {
  if (dy <= 0) return 0
  // Asymptotic: travel -> max as dy -> infinity, and never past it.
  return Math.round(max * (1 - Math.exp(-dy / max)))
}

export type PullState = 'idle' | 'pulling' | 'ready' | 'refreshing'

/**
 * What the indicator should say, given how far it has come.
 *
 * `ready` is a promise: let go now and it WILL reload. Anything that could
 * still refuse - an overlay opening mid-pull, say - has to be checked before
 * the state, not after it, or the label lies for the last inch of the gesture.
 */
export function pullState(travel: number, threshold: number = PULL_THRESHOLD): PullState {
  if (travel <= 0) return 'idle'
  return travel >= threshold ? 'ready' : 'pulling'
}

/** The one place each of those states is put into words. */
export function pullLabel(state: PullState): string {
  switch (state) {
    case 'refreshing': return 'Refreshing…'
    case 'ready': return 'Let go to refresh'
    case 'pulling': return 'Pull to refresh'
    default: return ''
  }
}

/** 0 to 1, for spinning the arrow as it comes down. */
export function pullProgress(travel: number, threshold: number = PULL_THRESHOLD): number {
  if (travel <= 0 || threshold <= 0) return 0
  return Math.min(1, travel / threshold)
}
