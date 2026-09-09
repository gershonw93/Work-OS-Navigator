// A structural sheet opened on the phone as an empty grey box, and full screen
// put its own exit button under the Dynamic Island.
//
// The grey was not a failure that went unreported - it was a failure the code
// never saw. Safari refuses to rasterise a canvas past a per-side and a
// total-area limit, and rather than throwing it hands back a canvas of the
// size you asked for with nothing in it. The viewer capped the long side at
// 5000px, which is past the 4096 a phone will draw, so the bigger the drawing
// the more certainly it came out blank. On the occasions it DID throw, the
// message went nowhere either: `error` is rendered by the `if (!plan)` guard,
// so once the plan had loaded it was set and dropped.
//
// Full screen was the app's only hand-rolled `fixed inset-0`, and
// layout-overflow.ts exempted it by name. Being the exception is why it never
// got the safe insets every other overlay has.

import { canvasScale, MAX_CANVAS_SIDE, MAX_CANVAS_AREA } from '../canvas-limits'
import { ok, done, code } from './_helpers'

const area = (w: number, h: number, s: number) => (w * s) * (h * s)
const side = (w: number, h: number, s: number) => Math.max(w * s, h * s)

// ── the sheet in the screenshot: 36x24in at 72dpi ────────────────────────────
const W = 2592, H = 1728
const s = canvasScale(W, H)
ok(side(W, H, s) <= MAX_CANVAS_SIDE, `an architectural sheet stays inside the side limit (${Math.round(side(W, H, s))}px)`)
ok(area(W, H, s) <= MAX_CANVAS_AREA, `...and the area limit (${Math.round(area(W, H, s) / 1e6)}MP)`)
// What the old rule did with the same page, which is the blank canvas.
const old = Math.min(2, 5000 / Math.max(W, H))
ok(side(W, H, old) > MAX_CANVAS_SIDE,
  `the old 5000px rule drew it at ${Math.round(side(W, H, old))}px, past what a phone will rasterise`)

// ── a monster: a full E1 sheet scanned at 300dpi ─────────────────────────────
const big = canvasScale(12_600, 8_400)
ok(side(12_600, 8_400, big) <= MAX_CANVAS_SIDE && area(12_600, 8_400, big) <= MAX_CANVAS_AREA,
  'a 300dpi E1 sheet is brought inside both limits')

// ── a small page is NOT blown up to fill the allowance ───────────────────────
ok(canvasScale(600, 400) === 2, 'a small page still renders at 2x for a retina screen, no more')

// ── whatever the shape, both limits hold and 2x is never exceeded ────────────
const shapes: [number, number][] = [
  [3000, 3000], [8000, 500], [500, 8000], [1, 20_000], [4097, 4097], [1024, 768],
]
const broke = shapes.filter(([w, h]) => {
  const k = canvasScale(w, h)
  return k > 2 || side(w, h, k) > MAX_CANVAS_SIDE + 1 || area(w, h, k) > MAX_CANVAS_AREA + 1
})
ok(broke.length === 0,
  `every shape lands inside both limits at 2x or less${broke.length ? ` - ${broke[0]}` : ''}`)

// ── a page with no dimensions yet must not divide by zero ────────────────────
ok(canvasScale(0, 0) === 2, 'a page that has not measured itself falls back rather than returning NaN')

// ── the viewer ───────────────────────────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/plans/[planId]/page.tsx')
ok(/canvasScale\(base\.width, base\.height\)/.test(page), 'the viewer sizes its canvas through canvasScale')
ok(!/5000 \/ Math\.max/.test(page), '...not the 5000px rule that drew past the limit')

ok(/overlay-full[^']*pt-safe pb-safe/.test(page),
  'full screen is an overlay padded for the notch, so its exit button is reachable')
ok(!/fixed inset-0/.test(page), '...not a hand-rolled fixed inset-0, which is what kept it out of that rule')
ok(!/max-h-\[calc\(100vh/.test(page), '...and it takes the space left rather than measuring in vh')

ok(/\{error && \(/.test(page),
  'a render that fails after the plan loads says so - the message used to be set and dropped')
ok(/onError=\{\(\) => setError/.test(page), '...and a broken image says so too')

done()
