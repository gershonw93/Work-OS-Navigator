// The drawer that slid in twice, could not be closed, and could not be swiped.
//
// Three reports against one panel:
//
//   "This task window slides in from the side but the top is too squished so
//    won't x. Also it blinks/slides out twice when I open a task. Can you also
//    make the option to slide back to go back to all tasks?"
//
// The top inset is a measurement and lives in `overlay-geometry` (section 13).
// The other two are here: WHY it played its entrance twice, and the gesture.

import { swipeAxis, swipeOffset, swipeTravel, shouldDismiss, SWIPE_SLOP } from '../swipe-dismiss'
import { ok, done, code, read, walk } from './_helpers'

// ── which way is this gesture going ─────────────────────────────────────────
ok(swipeAxis(0, 0) === 'undecided', 'a finger that has not moved has no direction')
ok(swipeAxis(5, 3) === 'undecided',
  `nothing moves inside the slop, or a tap with a wobble in it drags the panel (${SWIPE_SLOP}px)`)
ok(swipeAxis(40, 5) === 'horizontal', 'a sideways drag is a swipe')
ok(swipeAxis(5, 40) === 'vertical', 'a downward drag is a SCROLL, and the panel never takes it')
ok(swipeAxis(30, 31) === 'vertical',
  'and a diagonal goes to the scroller - the drawer is the thing that can be got back')
ok(swipeAxis(-40, 2) === 'horizontal',
  'a leftward drag still has a direction: it is horizontal, and it simply moves nothing')

// ── how far the panel has moved ─────────────────────────────────────────────
ok(swipeOffset(80) === 80, 'the panel follows the finger')
ok(swipeOffset(-80) === 0,
  'THE ONE-WAY RULE: it came from the right, so dragging left does nothing - there is '
  + 'nothing behind a full-bleed drawer to pull it away from')
ok(swipeOffset(0) === 0, 'and nothing is nothing')

// ── and whether that was a decision ─────────────────────────────────────────
const W = 390
ok(!shouldDismiss({ dx: 40, width: W, elapsedMs: 900 }),
  'a slow 40px nudge springs back - too little to have meant it')
ok(shouldDismiss({ dx: 160, width: W, elapsedMs: 900 }),
  'a slow drag a third of the way across is a decision')
ok(shouldDismiss({ dx: 45, width: W, elapsedMs: 70 }),
  'THE FLICK: a short fast shove closes it too, which distance alone would refuse')
ok(!shouldDismiss({ dx: 20, width: W, elapsedMs: 20 }),
  '...but a fast 20px is still inside the slop of a scroll that changed its mind')
ok(!shouldDismiss({ dx: -300, width: W, elapsedMs: 100 }),
  'and no amount of leftward drag ever closes it')
// The threshold is a FRACTION of the panel, not a constant: the same gesture
// has to mean the same thing on a 390px phone and a 448px desktop drawer.
ok(shouldDismiss({ dx: 150, width: 390, elapsedMs: 900 })
   && !shouldDismiss({ dx: 150, width: 448, elapsedMs: 900 }),
  'the threshold scales with the panel rather than being one number for every width')

// ── the hook ────────────────────────────────────────────────────────────────
const hook = code('lib/use-swipe-dismiss.ts')
ok(/axis\.current === 'undecided'\) axis\.current = swipeAxis/.test(hook),
  'the axis is decided ONCE and kept')
ok(/axis\.current !== 'horizontal'\) return/.test(hook),
  "...and a scroll is left completely alone - not merely not dismissed")
ok(/setTimeout\(onDismiss, SWIPE_EXIT_MS\)/.test(hook),
  'THE CLOSE IS A TIMER, not transitionend, which never fires under reduced motion')
ok(/clearTimeout\(exit\.current\)/.test(hook), '...cleared on unmount')
ok(!/preventDefault/.test(hook),
  'and nothing calls preventDefault, which React attaches touch listeners passively for anyway')

// Both drawers, because there is one drawer class and a gesture that only some
// of them answer to is worse than none.
for (const [file, label] of [
  ['app/(dashboard)/projects/[id]/tasks/page.tsx', 'the task drawer'],
  ['components/layout/activity-drawer.tsx', 'the job history drawer'],
] as const) {
  const src = code(file)
  ok(/useSwipeDismiss\(/.test(src), `${label} can be slid back off the screen`)
  ok(/\{\.\.\.swipe\.handlers\}/.test(src) && /style=\{swipe\.style\}/.test(src),
    `...with the gesture on the PANEL, not the backdrop`)
}

// ─────────────────────────────────────────────────────────────────────────────
// "IT BLINKS/SLIDES OUT TWICE WHEN I OPEN A TASK."
//
// `TaskDrawer` was declared INSIDE `TasksPage`. A function declared inside a
// component is a new function on every render, and React reconciles by element
// TYPE - so a new type is not an update, it is an unmount and a fresh mount.
// The DOM is thrown away and rebuilt every time the page re-renders.
//
// Opening a task renders the drawer (it slides in), the notes for that task
// arrive and set state, the page re-renders, the drawer is a different type,
// React deletes it and builds it again - and `overlay-drawer-in` plays a
// second time on the new element. That is the blink.
//
// The animation is the visible half. The invisible half is that a remount
// resets the state inside `TaskDetailPanel`, so a half-typed note goes with it.
// ─────────────────────────────────────────────────────────────────────────────
const tasks = read('app/(dashboard)/projects/[id]/tasks/page.tsx')
ok(/^function TaskDrawer\(/m.test(tasks),
  'THE FIX: TaskDrawer is declared at module level, so it is the same type on every render')
ok(!/^[ \t]+function TaskDrawer\(/m.test(tasks),
  '...and NOT inside TasksPage, which is what made it a new type - and a remount - every time')
ok(/TaskDetailPanelProps & \{ onClose/.test(tasks),
  'its props are derived from the panel it wraps rather than retyped from memory')

// A RATCHET, not a sweep. The same shape is in nine other files. Every one of
// them rebuilds its whole subtree on each render of the component around it -
// mostly cheap cards, where the cost is wasted work and a lost scroll position
// rather than a visible blink. The drawer is what it looks like when the thing
// being rebuilt has an animation or state of its own.
//
// So: counted, and THIS NUMBER MAY ONLY GO DOWN. Sweeping them all in the
// change that fixed one reported drawer is how a fix becomes a regression.
const NESTED_LIMIT = 18
const nested = walk('app').concat(walk('components'))
  .filter(f => f.endsWith('.tsx'))
  .flatMap(f => (read(f).match(/^[ \t]+function [A-Z][A-Za-z0-9]*\(/gm) ?? []).map(m => `${f}: ${m.trim()}`))
ok(nested.length <= NESTED_LIMIT,
  `components declared inside components: ${nested.length} (limit ${NESTED_LIMIT}, may only go down)`)
ok(!nested.some(n => /TaskDrawer/.test(n)),
  '...and the one that was reported is not among them')

// ─────────────────────────────────────────────────────────────────────────────
// ONE RULE, EVERY EDGE. "add swiping all over ... make it feel super native
// app like" - so the one-way rule became `swipeTravel`, signed per direction,
// and the phone navigation (which comes in from the LEFT) reads the same hook
// as the two right-hand drawers. The bottom sheets are in swipe-sheet.ts.
// ─────────────────────────────────────────────────────────────────────────────
ok(swipeTravel(80, 5, 'right') === 80 && swipeTravel(-80, 5, 'right') === 0,
  'a right-hand drawer follows a rightward drag and ignores a leftward one')
ok(swipeTravel(-80, 5, 'left') === -80 && swipeTravel(80, 5, 'left') === 0,
  'THE PHONE NAVIGATION leaves to the left, and only to the left - signed, so it feeds a translateX as-is')
ok(swipeOffset(80) === swipeTravel(80, 0, 'right') && swipeOffset(-80) === swipeTravel(-80, 0, 'right'),
  'swipeOffset is the right-hand case by its old name, so the two drawers that read it did not change')

ok(/direction: 'right' \| 'left' = 'right'/.test(hook), 'the drawer hook takes the edge it leaves by')
ok(/direction === 'left' \? Math\.min\(-width, travel\) : Math\.max\(width, travel\)/.test(hook),
  '...and slides all the way out on THAT side')
ok(/if \(enabled\) return\s+setLeaving\(false\)/.test(hook),
  'closing an always-mounted panel resets the gesture - or `leaving` sticks and every later touch is ignored')

const sidebar = code('components/layout/sidebar.tsx')
ok(/useSwipeDismiss\(\(\) => setMobileOpen\(false\), mobileOpen, 'left'\)/.test(sidebar),
  'the phone navigation can be slid back off the LEFT edge - enabled only while open, since it stays mounted')
ok(/\{\.\.\.swipe\.handlers\}/.test(sidebar) && /style=\{swipe\.style\}/.test(sidebar),
  '...with the gesture on the panel')

done()
