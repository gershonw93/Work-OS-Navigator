// ─────────────────────────────────────────────────────────────────────────────
// Where a tooltip goes so that ALL of it is on the screen.
//
// THE BUG, twice from one cause. The "?" explainer was an absolutely positioned
// box inside the page, hidden with `visibility` until hovered. Hidden is not
// gone: it still has a size, so on a budget line's detail sheet it made the
// scrolling body 256px wider than the panel, and a thumb dragged the whole
// sheet sideways. And when it did open, `right-0` on a trigger near the left
// half of a phone put two thirds of it off the left edge.
//
// So the box now floats from the trigger (a portal, position: fixed) and its
// place is worked out here, in a function with no DOM in it, so the sums can
// be tested at the sizes that broke.
// ─────────────────────────────────────────────────────────────────────────────

export interface Box { left: number; top: number; right: number; bottom: number }

/** Distance from the screen edge nothing may cross. */
export const HINT_PAD = 8
/** Gap between the trigger and the box. */
export const HINT_GAP = 6

export function hintPosition(
  trigger: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; above: boolean } {
  // Start at the trigger's left edge, then slide back until the right edge is
  // on screen. A box wider than the screen sits at the pad and is capped by
  // its own max-width, which the component sets from the viewport.
  const maxLeft = viewport.width - HINT_PAD - tip.width
  const left = Math.max(HINT_PAD, Math.min(trigger.left, maxLeft))

  const below = trigger.bottom + HINT_GAP
  const fitsBelow = below + tip.height <= viewport.height - HINT_PAD
  const aboveTop = trigger.top - HINT_GAP - tip.height
  const fitsAbove = aboveTop >= HINT_PAD
  // Below by default; above only when below does not fit and above does.
  const above = !fitsBelow && fitsAbove
  return { left, top: above ? aboveTop : below, above }
}
