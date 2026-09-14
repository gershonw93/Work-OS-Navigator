# Mobile UI post-mortems

The phone look, controls a phone cannot reach, and the tail of a tap.

*Evidence for rules in [`CLAUDE.md`](../../CLAUDE.md). Every rule there that cites
this file is summarised to one line; the reasoning, the report that produced it and
the arithmetic live here. Read the matching section before arguing with a rule —
each one was written the day something shipped broken.*

---

## Mobile look and feel
- **PHONE ONLY. The desktop does not change - that is a decision, not an
  oversight.** The phone look lives BELOW `lg` (1024px), the breakpoint where
  the tab bar becomes the sidebar: if you see the bottom tab bar you get the
  phone look, and from `lg` up every screen looks exactly as it did before the
  sweep. Passes 1-4 shipped without this gate and a user found their laptop
  changed. Two ways to write it: `lg:` variants where only classes changed
  (`Card` is `rounded-2xl … lg:rounded-lg lg:shadow-sm`), and a SECOND MARKUP
  where the shape changed - the old desktop block under `hidden lg:block` /
  `hidden lg:grid` / `hidden lg:contents`, the phone block under `lg:hidden`.
  Pinned: every `<StatStrip>` is `lg:hidden` with a `hidden lg:` twin in the
  same file; restored tables sit under `hidden lg:block` within 4 lines of
  `<table`; and `overlay-geometry.ts` MEASURES a card at 390 and 1280.
- Target on the phone: clean, quiet, native-feeling. FEWER boxes, fewer
  colours, more whitespace, stronger type. 8px spacing, ~24px screen gutters,
  cards at ~18-22px radius with a 1px `border-line` and no shadow, 44px+
  touch targets.
- Related numbers go in ONE card with hairline dividers - `StatStrip`
  (`components/ui/stat-strip.tsx`), not a coloured pill per metric. Colour only
  when the colour MEANS something (overdue red; a total is just a number). A
  cell can be a link (`href`) or a filter (`onClick` + `active`, a quiet fill,
  no ring). In use on the dashboard, Tasks, Compliance, a customer, a project's
  overview, the Projects list and Master Money - always `lg:hidden`, always
  with the desktop's tiles beside it.
- A `<table>` is not a phone layout. Five columns in 390px gave headings
  running one letter per line down the page. Prefer a list of rows; keep a
  table only for genuinely tabular data, and then wrap it in `overflow-x-auto`.
  `layout-overflow.ts` ratchets the count of tables a phone renders - it may
  only go DOWN.
- `Card` is `rounded-2xl border border-line bg-panel` with NO shadow, and the
  page wrapper is `p-6` on every width - not `p-4 sm:p-6`. Both are pinned.
- A badge or a button label NEVER wraps. `Badge` and `Button` set
  `whitespace-nowrap` centrally; a hand-rolled pill must too, and the test
  scans for it.
- **AN ICON IS A LUCIDE COMPONENT, NEVER A CHARACTER.** Reported as "wtf is that
  emoji" against `🤖 Scan with AI` on the Compliance form, beside two other
  AI-scan blocks already using `<Sparkles>`. An emoji renders in the PLATFORM's
  emoji font, not the app's - full colour, at a size and weight nothing here
  controls, drawn differently on every OS. There were six, two of them on the
  CLIENT PORTAL, and one of those was a bug rather than a style problem: the
  portal printed `☀` beside every daily log whatever the weather said, so a
  rainy day showed the client a sun. `lib/weather.ts` is the one table both
  screens read, and an unrecognised condition returns NULL rather than a default
  icon - a wrong picture beside the right word is worse than no picture.
  Arrows and check marks (`→ ← ↑ ↓ ✓`) are NOT this: they render in the text
  font at the text's size, and the app uses them deliberately in fifty places.
  Ratcheted at zero in `layout-overflow.ts`, which also asserts the arrows are
  still there so the scan cannot be passed by banning everything non-ASCII.
- **SEVEN COLUMNS AT 390px IS A 55px SQUARE, AND TEXT CANNOT LIVE IN ONE.** The
  job's Schedule calendar drew a labelled pill per item in a month cell, so
  every label truncated to "F…" while the time beside it - `shrink-0`, a span
  that refuses to get smaller than its own text - did not shorten but LEFT the
  pill, through its own rounded border. Reported as "text overflow here - looks
  terrible". A month cell on a phone is DOTS (colour only, with the legend under
  the grid), and the DAY is the control: tapping it opens the day in full. That
  sheet is `components/calendar/day-detail-sheet.tsx`, shared with the Master
  Calendar which had it all along - and it takes an `onOpen` CALLBACK rather
  than an href, because on the job's calendar a schedule bar opens its edit
  dialog while an inspection navigates. Narrower rule, everywhere: a pill's
  label and its detail are ONE truncating box, never two flex children fighting
  over the width. Measured in `overlay-geometry.ts` (section 19) at 390 and
  1280, with the spill measured beside it as the negative control.
- Something that opens INLINE opens where it was tapped - and the better answer
  is usually not to open it inline at all. The task detail was a panel docked
  under the board; on a phone that is under every OTHER column too, so tapping a
  task in Open put its detail below Completed, off the screen. Rendering it
  inside the tapped column fixed the phone and left the desktop complaint: it
  sat in the layout permanently and squeezed the board to half its height. It is
  `.overlay-drawer` now - one panel over the screen, opened the same way from
  all three views, full-bleed below `sm`.
- A list of items is ONE card with `divide-y divide-line-soft` rows, never a
  bordered card per item, and never cards on a tinted column. The Tasks board
  was three coloured boxes each holding a stack of boxes. A selected/expanded
  row is `bg-surface`, not `ring-2`; an overdue row says "Overdue" in red and is
  NOT tinted on top of it.
- A strip that scrolls sideways carries `.scroll-fade` (globals.css) so its
  right edge fades - with the scrollbar hidden that is the only sign there is
  more. Pinned for the Tasks filter row and the Settings tab strip.
  **AND A STRIP THAT DOES NOT FIT MUST ACTUALLY SCROLL.** The Directory's
  contact dialog had four tabs at `px-5` - about 440px - in a plain `flex` row
  inside a 390px screen, so Projects was not merely off the edge, there was NO
  WAY TO REACH IT: no `overflow-x-auto`, nothing to swipe. Reported as "I can't
  see all options on top - missing projects, it's cut off". Measured with
  `scrollLeft = scrollWidth` and then asking where the last tab is, because a
  strip that cannot scroll reports the same rectangles as one that can.
- **A TITLE IN A FLEX ROW NEEDS `min-w-0` AND SOMEWHERE FOR THE ACTIONS TO GO.**
  The same dialog's heading came out "Vol / t / Ele / ctri / c / Co". It was
  `flex justify-between` with Edit, Delete and a close button opposite the
  name and nothing stopping them taking the width: at 390px, `px-8` plus a 56px
  icon plus a ~200px button group leaves the name about 50px, and this app's
  prose default (`overflow-wrap: anywhere`, there so a pasted reference number
  cannot blow a container out) then breaks it wherever it likes - the same
  fault as a `w-full` table crushing "Create" to Cr/ea/te. `min-w-0` ALONE IS
  NOT THE FIX: it only trades the shards for "V…". Three controls and a title
  do not share 390px, so below `lg` the actions take their own row
  (`.row-even`, equal width, both edges) and only the CLOSE button stays beside
  the title - a dialog's exit is the one control that may never move.
- A row of controls REACHES BOTH EDGES: `.row-even` (globals.css), written
  `row-even lg:flex lg:flex-wrap gap-2 …`. `flex flex-wrap` makes each control
  as wide as its own label, so Budget's toolbar came out 2 + 2 + 1 at three
  different widths with none of them meeting the right edge. Two share the row
  at equal width and an odd last one takes it whole - the trick `StatStrip`
  uses for an odd number. The child width override uses `:is()` for
  SPECIFICITY, not tidiness: `.row-even > *` is (0,1,0) and loses to a `w-28`
  written for the desktop row, the same trap that left the 16px rule dead.
  A `.row-even` NEVER contains another: a grid in a cell of a grid halves an
  already-halved cell, so the Edit Item footer gave Cancel and Save a quarter
  of the dialog each and "Save Changes", which may not wrap, ran out of both
  sides of its own button. Where a wrapper only groups the actions for a
  desktop, the wrapper is the layout and the group inside carries the rule -
  and a footer of three is not one row on a phone: the two choices share a
  row and the destructive one goes under them. Both pinned.
  Nothing restores `display` at `lg` - the row's own `lg:flex` does, because
  Tailwind emits utilities after components. Measured in `overlay-geometry.ts`
  and ratcheted in `layout-overflow.ts`: a flex row of two or more `<Button>`s
  must carry it. A heading beside the buttons makes it a LAYOUT, not a control
  row - the button group inside is the row.

## Controls a phone cannot reach
- **THERE IS NO HOVER ON A PHONE.** A QA pass reported that tasks could not be
  edited or deleted anywhere, then retracted it - the pencil and the trash were
  `opacity-0` until hover, at every width. Invisible is indistinguishable from
  absent, and the board card's actions were `absolute` against a parent that is
  only `lg:relative`, so they were mispositioned as well. A control may be
  hover-revealed FROM `lg` UP; below it, it is on screen:
  `opacity-100 lg:opacity-0 lg:group-hover:opacity-100`. Six of these existed.
  Pinned in `layout-overflow.ts`; a decorative chevron is not a control.
- An icon-only button carries `aria-label` (and `title`). One with a visible
  word beside the icon does not need one - the scan measures what is left after
  the icons are removed.
- **A DISABLED BUTTON EXPLAINS NOTHING.** `disabled={saving || !title.trim()}`
  means pressing Save does literally nothing and the form never names the field
  it is waiting on. Disable only for IN FLIGHT (`disabled={saving}`); let it
  fire and answer with the missing field. Where two dialogs validate the same
  shape, one function answers for both (`missingMilestone`, `missingSub`).
  Adding a REQUIREMENT to a form means writing it into that function, never into
  the `disabled` condition - a rule enforced by a greyed-out button is a rule
  nobody is ever told about.
- **A FIELD THAT TAKES ANYTHING WILL BE GIVEN ANYTHING.** The inspector
  picker's Quick add has two boxes, Full name and Phone, and validated neither -
  so a surname typed into the second saved without a word (`name: 'John'`,
  `phone: 'Dohr'`), and the inspections card then offered it as a tap-to-call
  link that dials nothing. `quickAddProblem` (`lib/contact-quick-add.ts`) is
  asked by the form AND the route, and `whoToCall` refuses to make a `tel:` link
  out of a string with no digit in it - the guard on the way in stops the next
  one, the guard on the way out covers the ones already stored. The test is
  deliberately loose (does it contain a digit) because anything stricter refuses
  `321-638-0808 x2231`; the thing to catch was a WORD.
- A PICKER MUST NOT OFFER TO ADD WHAT IT IS ALREADY SHOWING YOU. The same
  dropdown listed "QA Test Inspector" with a tick beside it and, underneath,
  `Quick add "QA Test Inspector"…`. The row rendered unconditionally and never
  looked at the list it sat under. `alreadyListed` is asked of the FILTERED
  options, so the offer and what is in front of you cannot disagree.
- A FIELD IS MARKED OR IT IS GUESSED AT. Add Subcontractor had eleven fields, of
  which one carried a `*`, two said "(optional)" and eight said nothing - so
  payment terms and dates read as required when a sub only ever needed a name
  and a trade. Every label in a dialog carries one marker or the other, and a
  parenthetical that says something ELSE ("(adds to schedule)") is a hint under
  the field, not a stand-in for the marker: it reads as the marker's slot and
  leaves the field unmarked. Pinned in `add-sub-form.ts`.
- A VALUE THE APP WRITES, SUBMITS AND READS BACK MUST HAVE A CONTROL SOMEWHERE.
  `subScope` is the one line shown wherever a sub appears - the Schedule row,
  the Directory, the Tasks assignee list, a pay-app line. The AI scan wrote it,
  the form posted it, the edit form loaded it, and there was no input for it in
  the entire app, so a wrong scan was uncorrectable by any route. A field with
  no box is not a hidden implementation detail; it is a fact about the job that
  only a machine may write.
- A record that a client will read must not be blank. A daily log with only a
  date filed happily into the list, the count and the client PDF - a page of
  empty headings asserting somebody was on site and reported this. Guard on the
  ROUTE as well as the form, since the field app posts to the same route, and
  count evidence (a photo, who was there) as a report, not just words.

## Menus, pickers and the tail of a tap
- A control that toggles must not be re-triggered by the tap that just used it.
  `SearchableSelect` closed correctly on pick and the TRIGGER re-opened it: on a
  phone the panel is a full-width sheet hard against the trigger, so the tap
  that picks an option lands on the trigger the instant the panel unmounts from
  under the finger, and a toggle turns "closed" back into "open". A close that
  something else immediately reverses looks exactly like never closing. Guarded
  with a `pickedAt` timestamp, not a flag on a timer - no timer to leak and it
  cannot get stuck on.
- AN "ADD" BUTTON OPENS; IT DOES NOT TOGGLE. Selections' `Add selection` was
  `setShowAdd(v => !v)` over an INLINE panel rendered partway down the page, so
  a press while it was already open closed it - and after a failed save it IS
  already open, which is exactly when somebody presses it again. Reported as
  "every click after does nothing". Same family as the hover menu below and as
  `SearchableSelect`: a state the next interaction reverses is indistinguishable
  from a control that is dead. Add opens a dialog (`.overlay` + `data-overlay`),
  and closing is Cancel, Escape, the backdrop, or a save that worked.
- A MENU THAT HOVER OPENS MUST NOT BE A TOGGLE. The project sections open their
  pages on hover AND on click, and NEITHER closes them - a toggle is
  re-triggered by the interaction that just used it, so with a mouse
  `mouseenter` opens and the `click` that follows shuts it again, and the menu
  flickers out from under the pointer. Same fault as `SearchableSelect`, one
  costume over. Closing is: pick something, Escape, click outside, or move the
  pointer off. The panel sits flush at `top-full` so there is no dead space to
  cross and no timer to leak.
- A PANEL HANGING OFF A ROW CANNOT LIVE INSIDE `overflow-x-auto` - OR INSIDE
  ANY `overflow` THAT IS NOT `visible`. `overflow-x` establishes a clipping box
  on BOTH axes, so a dropdown below a button inside a side-scrolling row is
  sliced off at the row's bottom edge - every class on it individually correct,
  and nothing there to click. `overflow-hidden` written on a CARD to round its
  corners is the same trap and it is worse, because a `RowMenu` in the card's
  last row hangs entirely below that edge: not shortened, gone. Round the
  children that touch an edge instead. Measured in `overlay-geometry.ts` with
  `elementFromPoint`, because clipping is a PAINT operation: the clipped panel
  still reports its full bounding rect, so measuring the panel proves nothing.
- **A POSITIONED PANEL MUST KNOW WHERE THE SCREEN ENDS, AND THE FIXED BOTTOM
  NAV IS PART OF WHERE IT ENDS.** `RowMenu` was `absolute z-20`, always `mt-1`
  below its trigger, with no flip and no measurement. The phone tab bar is
  `fixed bottom-0 z-30`, so a menu opened near the bottom painted UNDER it and
  its last items could not be reached - reported as "I can't scroll down to see
  the whole card", because scrolling cannot help: the bar is pinned to the
  VIEWPORT, so the items stay behind it wherever you scroll to. It flips to
  `bottom-full` using `hintPosition`'s verdict (the tooltip had this same
  fault), counts the strip under `[data-bottom-nav]` as gone, and sits at `z-40`
  - above the tab bar and desktop sidebar, below the phone drawer. Measured in
  `overlay-geometry.ts` with `elementFromPoint`: stacking is a paint operation,
  so the covered panel still reports its full rectangle.
- The controls in a project header are ONE class string
  (`components/layout/header-icon-button.tsx`), icon-only, each with
  `aria-label` and `title`. Four independently written ones became an avatar
  pill, a `px-3 py-1.5` word, a `px-3 py-2` word and a square icon.
- Something a user opens from a ROW opens over the screen, not at the bottom of
  the card. Compliance's Update rendered below the whole document list, so
  pressing it on the third row scrolled you away from what you tapped - which on
  a phone reads as having been sent to a different page. Same rule as Budget's
  Add Line and the task detail.
- A picker that SHOWS a fact in its options fills that fact in. The saved-subs
  dropdown listed "Joe's Plumbing (Electrical)" and then left Trade blank to be
  retyped - and a subcontract with no trade drops out of the compliance
  requirements for its trade.

