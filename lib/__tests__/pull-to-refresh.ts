// Where the pull gesture is mounted, and what it must never collide with.
//
// The arithmetic is pinned in `pull-refresh.ts`. This file pins the wiring -
// the parts that go wrong by omission months later, when somebody moves the
// scroller or adds a third gesture.

import { ok, done, code, read, exists } from './_helpers'

console.log('\npull-to-refresh')

{
  ok(exists('lib/pull-refresh.ts'), 'the rules are a pure module')
  ok(exists('lib/use-pull-refresh.ts'), '...with the DOM in a hook beside it, not mixed in')

  const pure = code('lib/pull-refresh.ts')
  ok(!/document\.|window\.|addEventListener|useState/.test(pure),
    'the pure half touches no DOM, so every rule above is testable without a browser')
}

// ── mounted once, where the other gesture is ─────────────────────────────────
{
  const shell = code('components/layout/native-shell.tsx')
  ok(/<PullRefresh \/>/.test(shell),
    'mounted from NativeShell - the one component both shells render')
  ok(/<SwipeBack \/>/.test(shell),
    '...beside the back gesture, so neither is left to twenty screens to remember')

  // Mounted twice would attach two sets of listeners to one scroller and
  // double every travel reading.
  const dash = code('app/(dashboard)/layout.tsx')
  const field = code('app/field/layout.tsx')
  ok(!/PullRefresh/.test(dash) && !/PullRefresh/.test(field),
    'and NOT mounted again in either layout - two listeners on one scroller doubles the pull')
}

// ── it shares the axis rule rather than inventing a second one ───────────────
{
  const pure = code('lib/pull-refresh.ts')
  ok(/from '\.\/swipe-dismiss'/.test(pure),
    'the axis comes from swipe-dismiss, the module the BACK gesture decides with')
  ok(/swipeAxis/.test(pure),
    '...by name - two gestures with two ideas of "horizontal" is how one fires during the other')

  const hook = code('lib/use-pull-refresh.ts')
  ok(/axis\.current === 'undecided'/.test(hook),
    'the axis is decided ONCE per touch')
  ok(/axis\.current === 'horizontal'/.test(hook) && /active\.current = false/.test(hook),
    '...and a sideways drag bows out for the whole touch, leaving it to swipe-back')
}

// ── the three things that must stop it ───────────────────────────────────────
{
  const pure = code('lib/pull-refresh.ts')
  ok(/ctx\.hasOverlay/.test(pure),
    'NEVER with an overlay open - a reload takes a half-typed note with it')
  ok(/ctx\.scrollTop <= 0/.test(pure),
    'only at the very top - anywhere else a downward drag is a scroll')
  ok(/PULL_MAX_WIDTH/.test(pure) && /width >= PULL_MAX_WIDTH/.test(pure),
    'never on a desktop - a mouse drag is not a pull')

  const hook = code('lib/use-pull-refresh.ts')
  ok(/data-overlay/.test(hook), '...and the hook actually asks the DOM for the overlay')
  ok(/window\.innerWidth >= PULL_MAX_WIDTH/.test(hook),
    '...and does not even attach its listeners above the breakpoint')
}

// ── the listener has to be able to swallow the scroll ────────────────────────
{
  const hook = code('lib/use-pull-refresh.ts')
  ok(/'touchmove', onMove, \{ passive: false \}/.test(hook),
    'touchmove is NOT passive - a passive listener may not preventDefault the scroll it replaces')
  ok(/data-app-scroll/.test(hook),
    'it listens on the app scroller, not the document - nothing inside an overlay is intercepted')
  ok(/touchcancel/.test(hook),
    'a cancelled touch resets it, or the indicator sticks after a notification slides in')
}

// ── it reloads, because router.refresh() would be a lie here ─────────────────
{
  const cmp = code('components/layout/pull-refresh.tsx')
  ok(/window\.location\.reload\(\)/.test(cmp),
    'it RELOADS - 18 of 20 project screens fetch in a useEffect, which router.refresh() does not re-run')
  ok(!/router\.refresh/.test(cmp),
    '...and does not call router.refresh(), which would refresh nothing on almost every screen offering it')
  ok(/useCallback/.test(cmp),
    'the callback is stable, or the hook rebuilds its listeners on every touchmove')

  // It sits over the page; it must not freeze it.
  ok(!/data-overlay/.test(cmp),
    'the indicator is NOT an overlay - it must not lock the page it is sitting on')
  ok(/pointer-events-none/.test(cmp), '...and does not take a tap meant for the screen')
}

// ── the words ────────────────────────────────────────────────────────────────
{
  const pure = read('lib/pull-refresh.ts')
  ok(/Let go to refresh/.test(pure), 'ready promises exactly what letting go does')
  ok(/Pull to refresh/.test(pure), 'and the pulling state says what to do')
}

done()
