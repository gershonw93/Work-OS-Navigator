// Pull down to reload, and the four things it must not do.
//
// Every case below is a collision with something already on the screen: a
// normal scroll, the left-edge swipe-back, an open dialog, or a desktop mouse.

import { ok, done } from './_helpers'
import {
  canStartPull, pullAxis, pullTravel, pullState, pullLabel, pullProgress,
  PULL_THRESHOLD, PULL_MAX, PULL_MAX_WIDTH,
} from '../pull-refresh'

console.log('\npull-refresh')

const phone = { scrollTop: 0, hasOverlay: false, width: 390, isTouch: true }

// ── when a pull may start ────────────────────────────────────────────────────
{
  ok(canStartPull(phone), 'at the top of a phone screen, a pull may start')

  // THE ONE THAT MATTERS MOST. Anywhere but the very top, a downward drag is
  // somebody scrolling UP - stealing it breaks the commonest interaction there
  // is.
  ok(!canStartPull({ ...phone, scrollTop: 1 }),
    'ONE PIXEL down the page it may not - that drag is a scroll')
  ok(!canStartPull({ ...phone, scrollTop: 400 }), '...and certainly not halfway down')

  // iOS rubber-banding reports a small NEGATIVE scrollTop at the top.
  ok(canStartPull({ ...phone, scrollTop: -3 }),
    'a negative scrollTop is still the top - iOS reports that while bouncing')

  // A dialog is a conversation. Reloading out from under a half-typed note is
  // the same loss as the native confirm() that killed the page.
  ok(!canStartPull({ ...phone, hasOverlay: true }),
    'never with an overlay open - a reload would take a half-typed note with it')

  ok(!canStartPull({ ...phone, isTouch: false }), 'never without a touch screen')
  ok(!canStartPull({ ...phone, width: PULL_MAX_WIDTH }),
    'never at the desktop breakpoint - a mouse drag is not a pull')
  ok(canStartPull({ ...phone, width: PULL_MAX_WIDTH - 1 }), '...but right below it, yes')
}

// ── the axis, shared with swipe-back ─────────────────────────────────────────
{
  // The gesture this has to coexist with is the left-edge swipe-back, and it
  // decides its axis with `swipeAxis`. Two gestures with two different ideas of
  // "horizontal" is how one fires during the other.
  //
  // The vocabulary is `swipeAxis`'s own - 'horizontal' | 'vertical' |
  // 'undecided'. The first version of this test invented 'x' / 'y' / null from
  // memory and failed against a function that was correct, which is the same
  // mistake as writing an interface from memory instead of from the migration.
  ok(pullAxis(0, 30) === 'vertical', 'straight down is vertical')
  ok(pullAxis(40, 3) === 'horizontal', 'a swipe-back is horizontal, and this must agree')
  ok(pullAxis(2, 3) === 'undecided', 'inside the slop nothing is decided yet')

  // A diagonal that is mostly sideways belongs to the back gesture.
  ok(pullAxis(30, 14) === 'horizontal', 'a mostly-sideways drag is not a pull')
}

// ── travel: rubber-banded, bounded, one-way ──────────────────────────────────
{
  ok(pullTravel(0) === 0, 'no drag, no travel')
  ok(pullTravel(-80) === 0, 'UPWARD is nothing - this gesture only exists downward')

  const t20 = pullTravel(20)
  ok(t20 > 0 && t20 < 20, 'it follows the finger but always gives a little less')

  // Monotonic: further always means further, or the indicator judders.
  let last = -1
  let monotonic = true
  for (let dy = 0; dy <= 600; dy += 7) {
    const t = pullTravel(dy)
    if (t < last) monotonic = false
    last = t
  }
  ok(monotonic, 'travel never goes backwards as the finger goes further')

  ok(pullTravel(10_000) <= PULL_MAX,
    'and it CANNOT be hauled past the cap, however hard somebody pulls')
  ok(pullTravel(5_000) >= PULL_MAX - 1, '...while still reaching it')

  // The threshold has to be reachable with an ordinary thumb - a cap the
  // gesture can approach but a threshold nobody can cross is a dead control.
  ok(PULL_THRESHOLD < PULL_MAX, 'the threshold sits below the cap')
  ok(pullTravel(200) >= PULL_THRESHOLD,
    'a 200px drag - an ordinary thumb - clears the threshold')
}

// ── what it says ─────────────────────────────────────────────────────────────
{
  ok(pullState(0) === 'idle', 'nothing pulled, nothing said')
  ok(pullState(PULL_THRESHOLD - 1) === 'pulling', 'short of the mark it is still pulling')
  ok(pullState(PULL_THRESHOLD) === 'ready',
    'AT the mark it is ready - "80% along" means 80 is enough, same as everywhere else here')
  ok(pullState(PULL_THRESHOLD + 50) === 'ready', '...and stays ready past it')

  ok(pullLabel('ready') === 'Let go to refresh', 'ready promises what letting go does')
  ok(pullLabel('refreshing') === 'Refreshing…', 'and refreshing says it is working')
  ok(pullLabel('idle') === '', 'idle says nothing at all')

  // Field language, like the rest of the app.
  ok(!/reload|fetch|sync/i.test(pullLabel('pulling')), 'the words are plain - no "reload" or "sync"')
}

// ── progress ─────────────────────────────────────────────────────────────────
{
  ok(pullProgress(0) === 0, 'no travel, no progress')
  ok(pullProgress(PULL_THRESHOLD / 2) === 0.5, 'halfway is a half')
  ok(pullProgress(PULL_THRESHOLD) === 1, 'at the mark it is full')
  ok(pullProgress(PULL_MAX) === 1, '...and never over-fills past it')
}

done()
