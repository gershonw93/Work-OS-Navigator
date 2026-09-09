// ─────────────────────────────────────────────────────────────────────────────
// How big a canvas iOS will actually draw.
//
// THE BUG. A structural sheet opened on the phone as an empty grey box. No
// spinner, no error - the PDF had "rendered" fine.
//
// Safari refuses to rasterise a canvas past a per-side and a total-area limit,
// and when you cross one it does not throw: it hands back a canvas of the size
// you asked for with NOTHING IN IT. Every error path in the viewer was
// therefore correct and silent, because from the code's point of view nothing
// had gone wrong.
//
// The old rule was `Math.min(2, 5000 / longest side)`, which caps the long
// side at 5000px - past the 4096 a phone will draw, and a 5000x3333 sheet is
// 16.7M pixels, right on the area limit as well. So the bigger the drawing,
// the more certainly it came out blank.
// ─────────────────────────────────────────────────────────────────────────────

/** Longest side Safari will rasterise. Older devices stop at 4096. */
export const MAX_CANVAS_SIDE = 4096
/**
 * Total pixels Safari will rasterise: 16,777,216.
 *
 * That is 4096 squared, so against the side limit above it never binds first -
 * it is here because the two are not linked on every device. Newer iPhones
 * allow 8192 a side with the same total, and there the area is the limit that
 * bites. Raise `MAX_CANVAS_SIDE` and this keeps the answer right.
 */
export const MAX_CANVAS_AREA = 16_777_216

/**
 * The scale to render a `width x height` page at so the canvas stays inside
 * both limits.
 *
 * `max` is the crispness we would like on a normal page - 2x for a retina
 * screen - and is only ever reduced, never exceeded: a small page should not
 * be blown up to fill the allowance.
 */
export function canvasScale(width: number, height: number, max = 2): number {
  if (!(width > 0) || !(height > 0)) return max
  return Math.min(
    max,
    MAX_CANVAS_SIDE / width,
    MAX_CANVAS_SIDE / height,
    Math.sqrt(MAX_CANVAS_AREA / (width * height)),
  )
}
