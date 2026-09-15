# Layout post-mortems

The app shell, overlays, safe areas and the visual-viewport saga.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## Layout: the app shell and overlays
- The shell is ONE SCREEN TALL - `.h-app` + `overflow-hidden`, and the only
  thing that scrolls is `<main data-app-scroll>`. `min-h-screen` lets the
  DOCUMENT grow, which carries the top bar off the screen and means `<main>`'s
  `overflow-y-auto` never engages.
- Every dialog/drawer/sheet uses `.overlay` (or `.overlay-full`), NEVER a
  hand-rolled `fixed inset-0` - and there are NO exemptions. The plans viewer
  had one ("a fullscreen toggle that IS the scroller, not a dialog over one")
  and being the exception is exactly why it never learned about the notch: its
  title and its own exit button sat under the Dynamic Island. It also hid from
  the scan a second way, by writing the class string as a `cn()` argument on
  its own line, so the pin now reads quoted class strings anywhere rather than
  `className="…"` literals. There were 78 of those and whether a dialog fitted
  on the phone depended on which file it lived in. `.overlay` pads by the safe
  insets and caps its panel at `max-height: 100%`, so a panel cannot be taller
  than the screen. Do NOT re-add `max-h-[90vh]`: vh knows nothing about the
  notch, and as a utility it beats the rule and wins with the wrong answer.
- Anything floating over the app carries `data-overlay`, which is what freezes
  the background (`html:has([data-overlay])` in globals.css). Menus too - a
  panel positioned from `getBoundingClientRect()` detaches if the page moves.
  A tooltip is the exception: `InfoHint` measures, floats as a fixed portal
  (`lib/hint-position.ts`, pure and tested) and CLOSES on scroll instead. It
  used to be an `absolute` child hidden with `visibility` - hidden is not
  gone: it still had a width, made a sheet's scroll body wider than the panel
  (a thumb dragged the sheet sideways), and opened off the edge of a phone.
- THE DESKTOP SIDEBAR'S WIDTH IS ONE VARIABLE, NOT TWO CLASSES. It was `w-60`
  on the aside and `lg:pl-60` on the content column - the same measurement in
  two files, with nothing connecting them, and `(dashboard)/layout.tsx` is a
  Server Component so no React state ever could. Both now read `--sidebar-w`
  off `.app-shell` (globals.css), which is how the rail can collapse to a 72px
  strip of icons without the content overlapping it or leaving a hole. The
  collapsed state is a class on `<html>`, set by a pre-paint script in
  `lib/sidebar-collapse.ts` - the same door the theme uses, because anything
  read from localStorage AFTER mount is drawn wrong first and then snaps.
  Every rule is `@media screen and (min-width: 1024px)`: `screen` because a
  print stylesheet is not a narrow one, and 1024 because the phone drawer is
  untouched. Collapsed labels are CLIPPED, never `display: none` - the label is
  the link's accessible name, and dropping it leaves a screen reader announcing
  the href. Pinned in `sidebar-collapse.ts` and measured in `overlay-geometry.ts`.
- Wide content gets `overflow-x-auto`, never `overflow-hidden`. Hidden does not
  contain a wide table, it cuts it off with nothing to say so.
- SAFE AREAS ARE OURS, not iOS's. `capacitor.config.ts` sets
  `contentInset: 'never'` so `env(safe-area-inset-*)` reports real numbers, and
  EXACTLY ONE element pads each edge - the chrome wrapper at the top of each
  shell, `pb-safe` on each bottom nav. When iOS was also insetting, the header
  jumped 59pt whenever a layout event made it recalculate. A second `pt-safe`
  is not belt-and-braces, it is a visible band of nothing.
- `pt-safe` never goes on the `h-14` header: border-box takes the padding out of
  the row and squashes the search bar rather than moving it down.
- `overflow-wrap: anywhere` is the default for prose - NOT for `td`/`th`. In a
  table it tells the layout a cell can be one character wide, so a `w-full`
  table on a phone crushed "Create" to Cr/ea/te and a group name to its first
  letter. Cells are `break-word`, `th` is `white-space: nowrap`, and a table
  too wide for the screen scrolls in its `overflow-x-auto` wrapper (give it a
  `min-w-[…]` when the columns matter). Measured in `overlay-geometry.ts`.
  `.truncate` sets `min-width: 0`. Both are the same rule: `break-words` and `white-space:
  nowrap` do not shrink min-content, so a flex/grid child refuses to go below
  the full unbroken line and the CONTAINER blows out while the text inside
  behaves perfectly.
- A SIDE DRAWER IS `.overlay-drawer`, never `fixed top-0 right-0 h-full`. There
  were two hand-rolled ones, and `h-full` is 100% of the LAYOUT viewport - which
  does not shrink for a keyboard and knows nothing about the notch, so a
  drawer's own header sat under the Dynamic Island and its footer behind the
  keyboard. It is `.overlay-sheet` one axis over: sized off `--vv-h` / `--vv-t`,
  `justify-content: flex-end`, panel at `min(28rem, 100%)`, full-bleed below
  `sm`, and it pads only the LEFT - something of the page behind has to stay
  visible or there is nothing to aim at to dismiss it. Measured in
  `overlay-geometry.ts`, where the entrance animation is switched off for the
  measurement: `translateX(100%)` is where it STARTS, and headless Chromium
  dumps the DOM while it is still there.
  **AND ITS INSETS GO ON THE PANEL, NOT THE CONTAINER.** `.overlay-sheet` was
  given a `padding-top` the day a sheet's close button ended up under the
  Dynamic Island; the drawer is that class one axis over and never got the same
  treatment - it padded only its LEFT - so the panel began at y=0 and its
  header row, Close button and all, spent its first 59pt under the status bar.
  Reported as "the top is too squished so won't x". The container is the wrong
  place for it here: `.overlay` pads the container because its panel FLOATS
  inside one, but a drawer below `sm` IS the screen, so padding the container
  leaves a bare strip above the drawer instead of the drawer. The panel takes
  them, its own background fills the notch strip, and only its CONTENT starts
  below it. `max(0.5rem, env(...))` like every other safe-area rule: `env()` is
  0 in a desktop browser, so a declaration with only the env() half cannot be
  measured at all and would pass `overlay-geometry` while failing on the phone
  it was written for. The assertion that let this through was
  `close.t >= 0` - a button at y=0 is "on the screen" AND under the status bar.
- **A COMPONENT DECLARED INSIDE A COMPONENT IS A NEW TYPE ON EVERY RENDER, so
  React does not update it - it throws the DOM away and builds a new one.**
  `TaskDrawer` was declared inside `TasksPage`. Reported as "it blinks/slides
  out twice when I open a task": opening a task renders the drawer (it slides
  in), the notes arrive and set state on the page, the page re-renders, the
  drawer is a different function and therefore a different type, React deletes
  it and mounts a fresh one - and `overlay-drawer-in` plays again on the new
  element. The animation is the visible half; the invisible half is that the
  remount resets the state INSIDE the subtree, so a half-typed note goes with
  it. Hoist it and pass props (derive the type from the props of what it wraps,
  rather than retyping them). Nine other files still do this - counted and
  ratcheted in `swipe-dismiss.ts`, may only go DOWN.
- A DRAWER CAN BE SLID BACK THE WAY IT CAME IN. `lib/swipe-dismiss.ts` (pure)
  and `lib/use-swipe-dismiss.ts`, on the PANEL not the backdrop. The axis is
  decided ONCE at the slop boundary and kept: re-deciding on every move turns a
  scroll that curves into a swipe halfway through, and a panel that slides
  sideways when somebody tries to scroll it is worse than no gesture. Dragging
  LEFT does nothing - there is nothing behind a full-bleed drawer to pull it
  away from. Dismiss is a fraction of the panel's own width (so it means the
  same on a 390px phone and a 448px desktop drawer) OR a flick, which distance
  alone refuses. The close is a TIMER, never `transitionend`: that never fires
  under reduced motion, and a gesture that leaves a drawer stuck half off the
  screen has slid the close button away with it.
- The overlay scroll lock is `overflow-y: hidden`, NEVER the `overflow`
  shorthand. The shorthand also sets `overflow-x`, replacing the `clip` on
  html/body with `hidden` - and clip cannot be scrolled while hidden can. That
  turned latent sideways overflow into a pannable viewport, and `position:
  fixed` is pinned to the LAYOUT viewport, so dialogs slid off the screen.
- NEVER `autoFocus` on a touch screen - `autoFocus={autoFocusOnDesktop()}`
  (`lib/auto-focus.ts`). iOS opens the keyboard for it unasked and scrolls the
  LAYOUT viewport to reach the field, dragging the fixed dialog off with it.
- A form control under 16px makes iOS ZOOM THE PAGE on focus. Zoom shrinks and
  pans the visual viewport while `position: fixed` stays on the LAYOUT one, so
  the top bar hides under the status bar and the tab bar slides off the left -
  the "screen goes crazy" that is not a scroll at all. globals.css forces 16px
  on touch/narrow, with `!important`: **a `@layer base` rule does NOT beat a
  utility class.** Tailwind 3 emits base as plain CSS, so `.text-sm` (0,1,0)
  outranks `input` (0,0,1) whatever the order - the rule sat there dead while
  42 controls, `components/ui/input.tsx` included, zoomed every screen.
  Measured in `overlay-geometry.ts`; never write a bare element rule in base
  and assume it wins.
- Overlays are sized from `--vv-h` / `--vv-t` (`lib/use-visual-viewport.ts`),
  not `inset: 0`. The layout viewport does not shrink for a keyboard, so a
  centred dialog puts its own buttons behind one.
- **`--vv-h` is NOT `visualViewport.height`.** It is the visible strip measured
  against the layout viewport the CSS resolves in, and `lib/visible-viewport.ts`
  (pure, unit-tested) decides which of the two knows. On `resize: 'native'` the
  WKWebView frame shrinks, so the layout viewport is ALREADY the strip and
  `visualViewport` subtracts the keyboard a SECOND time - the app came out
  ~121pt tall in a ~516pt space.
  **THAT TAKES A PLUGIN, AND FOR MOST OF THIS APP'S LIFE IT WAS NOT INSTALLED.**
  This file used to assert the frame-shrinking as a fact about "Capacitor's
  default"; `@capacitor/keyboard` was absent from `package.json`, the Podfile
  and the iOS project, so NOTHING resized anything and the shrunken-frame branch
  was dead code. What iOS does instead is PAN the visual viewport to reach a
  focused field, dragging every `position: fixed` element with it: tapping
  Inspector Name on the Request Inspection form left the bottom tab bar floating
  mid-screen, a band of bare background, and the dialog off the top. An
  assumption nothing checks is a comment rather than a guarantee - the plugin,
  the Podfile line and `resize: 'native'` are pinned in `keyboard-resize.ts`,
  and it is a NATIVE dependency, so a config change only reaches a phone after
  an iOS rebuild. When `innerHeight` has dropped below
  the tallest frame seen, trust `innerHeight` and set the offset to 0; only an
  unshrunk frame (mobile Safari) defers to `visualViewport`. Rotation resets
  the baseline, or landscape reads as a keyboard forever.
  AND THE HOOK LISTENS FOR `window.resize` AS WELL, which it did not: every
  decision in that file turns on `window.innerHeight` and nothing was listening
  for the event that says it changed, so a frame that resized without a
  `visualViewport` event left `--vv-h` stale for as long as the keyboard was up.
  Each event also measures AGAIN a frame later (`requestAnimationFrame`),
  because the two numbers do not settle together on iOS: `visualViewport` fires
  first, and reading `innerHeight` at that instant picks the branch from a value
  that has not caught up yet.
  **AND A MEASUREMENT THAT CAN LAG IS CHECKED AGAINST A FACT THAT CANNOT.**
  Reported as "what's this? is it my phone or the app?" - a task drawer over
  the top half of the screen, bare white below it, no top bar, a few times in
  one day and always after typing. Both `.overlay-drawer` and `.h-app` are
  `var(--vv-h)`, so that picture IS a `--vv-h` stuck at a keyboard-open value.
  The two inputs do not recover together: `innerHeight` comes back first, which
  drops out of the shrunk-frame branch and into the one that trusts `vvHeight`,
  and `vvHeight` is still mid-animation - so a strip is published as though the
  frame were whole, and then NOTHING FIRES AGAIN, because as far as the browser
  is concerned nothing is happening any more. A stale number with no further
  event is indistinguishable from a correct one. The keyboard (and the iOS
  select wheel) exists only while something is focused, so `raisesKeyboard`
  asks `document.activeElement` and nothing-focused means the whole frame,
  whatever `visualViewport` still says; `focusin`/`focusout` recompute, both
  DEFERRED because focusout fires before focusin and `activeElement` is `body`
  between two fields. The re-read after each event is a frame AND ~300ms: one
  frame was sized to nothing in particular, and the iOS keyboard animation is a
  quarter of a second long.
  **AND THE BASELINE IS ONLY LEARNED WITH NOTHING FOCUSED.** `fullFrame` means
  "the frame with nothing covering it" and was `Math.max(fullFrame,
  innerHeight)` on EVERY call - including calls made while the frame had
  already shrunk for a keyboard. ONE of those redefines a whole screen as a
  strip, and every call afterwards compares against the strip, so `innerHeight
  < full - 1` is false and we fall through to the branch that trusts `vvHeight`
  - which inside an already-shrunk frame has the keyboard taken out AGAIN.
  Reported against the daily logs: tapping "Add an update" left the app in a
  band across the top third of the screen. The arithmetic closes exactly - the
  app filled 33.5% of the space above the keyboard, and on a 932pt screen with
  a 372pt keyboard the strip is 560 while `vvHeight` says 560-372=188, which is
  33.5% of 560. It only takes one poisoning event (a page loaded onto a focused
  field, a rotation while typing - `orientationchange` zeroes the baseline and
  re-reads it on the spot - the app resumed onto a field) and it sticks until
  the keyboard closes, because `innerHeight` cannot grow past a baseline it
  already equals. With NO baseline yet, take `innerHeight`: trusting it on an
  unshrunk frame leaves a dialog's buttons under the keyboard, trusting
  `vvHeight` on a shrunk one collapses the whole app - take the smaller
  mistake.
- **The SHELL follows `--vv-h` too**, not just overlays: `.h-app` is
  `var(--vv-h, 100dvh)` inside `@supports (height: 100dvh)`. A document taller
  than the webview's frame is one the webview can scroll, and Capacitor shrinks
  that frame for the keyboard - so it scrolled by a keyboard-height, the
  keyboard closed, and the offset had nothing left to undo it: the app sat too
  high with bare background below and no top bar. The `@supports` is
  load-bearing. An unset `--vv-h` falls back to `100dvh`, and where `dvh` does
  not parse that is invalid AT COMPUTED-VALUE TIME, which makes `height`
  `unset` - it does NOT fall back to the `100vh` declaration above it the way a
  plain bad value would, and the shell collapses to `auto` on exactly the old
  WebKit those declarations exist for.
- A form control is 44px tall on a phone as well as 16px (see above). 16px is
  forced and cannot be lowered, so a `h-8` box put big text in a small frame
  next to a 12px label and read as enormous. Fields grow; `<Label>` keeps its
  `text-sm` on a phone and shrinks only at `lg` (`lg:text-xs`, never a bare
  `text-xs` - pinned). Both measured in `overlay-geometry.ts`.
- Pinned by `lib/__tests__/layout-overflow.ts` and, for anything that is a
  measurement rather than a pattern, `lib/__tests__/overlay-geometry.ts`, which
  lays real markup out in headless Chromium. Full detail in MOBILE.md.


## A menu that covers the page is an overlay, whatever it is called

> When the menu is open, I can still scroll on mobile

The marketing site's phone menu. It opens under a `sticky` header, covers the
page, and the page behind it kept scrolling.

`globals.css` has had the lock for a long time:

```css
html:has([data-overlay]) { overflow-y: hidden; }
html:has([data-overlay]) [data-app-scroll] { overflow-y: hidden !important; }
```

and `layout-overflow.ts` has had a scan for a long time that every overlay
carries `data-overlay`. Both were working. The menu had no `data-overlay` on it
at all.

### Why the scan could not see it

The scan asks which panels DECLARE themselves overlays:

```ts
if (!/className="(overlay|overlay-full)\b/.test(line)) continue
overlays.push(f)
if (!/data-overlay/.test(line)) unmarked.push(...)
```

That is the right question for a dialog, and it is unanswerable for a panel
that declares nothing. This menu is a plain `<div>` with `md:hidden border-t
bg-panel` - no `.overlay`, no `fixed inset-0`, nothing for a pattern to match
on. It is an overlay by behaviour and not by name, so a scan keyed on the name
reports green over it for ever.

The CSS was never that fussy. `html:has([data-overlay])` does not care what a
panel is called; it cares that the panel says it is one. So the fix is one
attribute, and the new scan asks a behavioural question instead - a panel
rendered from an `open` state that hides itself at a breakpoint is a phone
menu, and a phone menu covers the page.

### The two surfaces fail differently, which is why this one was missed

Inside the app the DOCUMENT never scrolls: the shell is `h-app` +
`overflow-hidden` and the only thing that moves is `<main data-app-scroll>`. So
the second line of the rule does the work and the first is belt-and-braces. The
app's own phone nav has carried `data-overlay` since #388.

Marketing is an ordinary scrolling document. The first line is the only lock it
has, and a missing attribute is the entire bug. Two surfaces, one rule, and only
one of them was ever exercised by it.

### Two smaller things in the same panel

Its cap was `max-h-[calc(100vh-4rem)]`. `vh` knows nothing about the browser
chrome that collapses as you scroll, so the menu could be taller than the
screen. `--vv-h` is the right answer, but it is set by `useVisualViewport` in
`NativeShell`, which wraps the dashboard and field shells and NOT marketing - so
the fallback is what actually applies here. `calc(var(--vv-h, 100dvh) - 4rem)`
uses `dvh`, which does track the chrome, and needs no edit if marketing ever
mounts the hook.

And Escape did not close it. The dropdown two elements away always had Escape;
the one panel that covers the whole page did not, so on a keyboard it was the
only thing you could not dismiss without finding its button again.

### Two tests that failed on the fix they were written to protect

The vh assertion was first written `/max-h-\[[^\]]*\dvh/`, which matches the
`0dvh` inside `100dvh` - it failed on the replacement. `[^dsl]vh` is the
distinction that was meant: `dvh`, `svh` and `lvh` are the units that DO track
the chrome, so they are the answer rather than the bug.

Then it failed again, on prose: the comment beside the fix quotes the old
`max-h-[calc(100vh-4rem)]` to say what it replaced, and the assertion was
reading the raw file. `code()` exists for exactly this, and this is the second
time in this session that a scan has found its own explanatory comment.
