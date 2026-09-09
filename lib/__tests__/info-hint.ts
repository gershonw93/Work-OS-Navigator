// The "?" explainer, at the sizes that broke.
//
// Two screenshots from one phone. On a budget line's detail sheet the whole
// body sat shifted 50px to the left - a hidden tooltip, absolutely positioned
// inside the scrolling body, had made it wider than the panel and a thumb had
// dragged it. On the Budget tiles the Total Budget "?" opened with two thirds
// of its text off the left edge of the screen: `right-0` on a trigger that
// sits in the left half of a 430px phone.
//
// The box is a portal at a fixed position now, and the position is a pure
// function, so both the sums and the shape are checkable from here.

import { hintPosition, HINT_PAD, HINT_GAP } from '../hint-position'
import { ok, done, code } from './_helpers'

const phone = { width: 430, height: 932 }
const tip = { width: 256, height: 120 }

// ── the Total Budget "?" - right side of the left tile on a 430px phone ──────
const totalBudget = { left: 182, right: 194, top: 420, bottom: 432 }
let p = hintPosition(totalBudget, tip, phone)
ok(p.left >= HINT_PAD, `the box starts on the screen (left ${p.left})`)
ok(p.left + tip.width <= phone.width - HINT_PAD, `...and ends on it (right edge ${p.left + tip.width} of ${phone.width})`)
ok(p.top === totalBudget.bottom + HINT_GAP && !p.above, 'below the trigger, where there is room')

// ── a trigger hard against the right edge ────────────────────────────────────
p = hintPosition({ left: 410, right: 422, top: 100, bottom: 112 }, tip, phone)
ok(p.left === phone.width - HINT_PAD - tip.width, `slides back to fit (left ${p.left})`)

// ── one at the left edge stays put rather than being pushed right ────────────
p = hintPosition({ left: 20, right: 32, top: 100, bottom: 112 }, tip, phone)
ok(p.left === 20, 'a trigger with room to its right anchors the box to itself')

// ── no room below: flips above ───────────────────────────────────────────────
p = hintPosition({ left: 20, right: 32, top: 880, bottom: 892 }, tip, phone)
ok(p.above && p.top === 880 - HINT_GAP - tip.height, `flips above at the bottom of the screen (top ${p.top})`)
ok(p.top >= HINT_PAD, '...and is still on the screen')

// ── no room either way: below, rather than off the top ───────────────────────
p = hintPosition({ left: 20, right: 32, top: 60, bottom: 72 }, tip, { width: 430, height: 150 })
ok(!p.above, 'when neither fits it stays below - the page can scroll down, not up past the top')

// ── a box wider than the screen sits at the pad; the component caps its width ─
p = hintPosition({ left: 100, right: 112, top: 100, bottom: 112 }, { width: 500, height: 80 }, { width: 320, height: 600 })
ok(p.left === HINT_PAD, 'a box wider than the screen starts at the pad')

// ── the shape ────────────────────────────────────────────────────────────────
const hint = code('components/ui/info-hint.tsx')
ok(/createPortal\(/.test(hint) && /position: 'fixed'/.test(hint), 'the box is a portal at a fixed position - it is in no scroll container')
ok(!/absolute top-full/.test(hint) && !/invisible/.test(hint),
  '...not an absolutely positioned, visibility-hidden child that still takes up room')
ok(/maxWidth: `calc\(100vw - /.test(hint), '...and never wider than the screen')
ok(/addEventListener\('scroll', off, true\)/.test(hint), 'it closes when the page scrolls, so a measured position cannot go stale')
ok(/setTimeout\(\(\) => setOpen\(true\), 1500\)/.test(hint) && /onMouseLeave=\{hide\}/.test(hint),
  'hover still waits 1.5s on the way in and leaves at once')
ok(/onFocus=\{show\}/.test(hint) && /onClick=\{e => \{ e\.stopPropagation\(\); open \? hide\(\) : show\(\) \}\}/.test(hint),
  'a tap or keyboard focus opens it at once - no pointer is crossing anything')

done()
