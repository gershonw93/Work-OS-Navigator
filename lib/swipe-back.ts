// ─────────────────────────────────────────────────────────────────────────────
// Going back by dragging the page in from the left edge.
//
// The one gesture that says "native" louder than any other: on an iPhone every
// app goes back this way, and a screen that does not is the clearest tell that
// it is a website in a wrapper. In the native shell WKWebView does it itself
// (`allowsBackForwardNavigationGestures`, set in ios/App/App/AppDelegate.swift -
// a native setting, so it only reaches a phone after an iOS rebuild). This is
// the same gesture for everywhere else: the home-screen app in Safari, Android,
// and every phone still on a build from before the setting existed.
//
// Pure, because the numbers are the whole feature. Start it too far from the
// edge and a horizontal scroll through a table goes back a page instead; commit
// on too little travel and a thumb resting near the edge navigates; commit on
// too much and it "does nothing".
// ─────────────────────────────────────────────────────────────────────────────

import { FLICK_MIN_PX, FLICK_PX_PER_MS } from './swipe-dismiss'

/**
 * How far in from the left edge a finger may land and still mean "back".
 *
 * Roughly iOS's own strip. Any wider and it starts stealing the first column
 * of a side-scrolling table or a calendar; any narrower and it is unreachable
 * through a phone case.
 */
export const BACK_EDGE_PX = 24

/** Travel at which the hint is fully shown and a release goes back. */
export const BACK_COMMIT_PX = 80

export function startsAtEdge(x: number, edge: number = BACK_EDGE_PX): boolean {
  return x >= 0 && x <= edge
}

/** 0 at the edge, 1 at the commit distance, never beyond either. */
export function backProgress(dx: number, commit: number = BACK_COMMIT_PX): number {
  if (dx <= 0) return 0
  return Math.min(1, dx / commit)
}

export interface BackEnd {
  dx: number
  elapsedMs: number
}

/** Reached the commit distance, or flicked - the same two ways a drawer means it. */
export function shouldGoBack({ dx, elapsedMs }: BackEnd, commit: number = BACK_COMMIT_PX): boolean {
  if (dx <= 0) return false
  if (dx >= commit) return true
  return dx >= FLICK_MIN_PX && elapsedMs > 0 && dx / elapsedMs >= FLICK_PX_PER_MS
}

export interface BackContext {
  /** `window.history.length`. */
  historyLength: number
  /** Is anything floating over the page (`[data-overlay]`)? */
  overlayOpen: boolean
  /** At or above `lg` - the desktop, which does not change. */
  wide: boolean
}

/**
 * Is there anywhere to go back TO, and is the page the thing on top?
 *
 * THREE REFUSALS, each for a different reason:
 *   * `historyLength <= 1`: this is the first page this tab has ever shown. A
 *     home-screen app has no address bar, so "back" from here is out of the
 *     app entirely, to whatever the phone was doing before - which from inside
 *     reads as the app having crashed.
 *   * an overlay is open: the thing on top is a dialog, a sheet or a drawer,
 *     and every one of those has its own gesture (or its own close button).
 *     Navigating the PAGE out from underneath an open sheet leaves the sheet
 *     hanging over a screen it was never about.
 *   * wide: the desktop does not change. That is a decision, not an oversight
 *     (CLAUDE.md, "Mobile look and feel").
 */
export function canSwipeBack({ historyLength, overlayOpen, wide }: BackContext): boolean {
  return historyLength > 1 && !overlayOpen && !wide
}
