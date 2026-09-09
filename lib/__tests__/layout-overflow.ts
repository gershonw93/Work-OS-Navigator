// The phone app was a document, not an app.
//
// FOUR THINGS, all the same underlying fault - nobody owned "what fits on the
// screen", so seventy-eight places each answered it differently.
//
//   1  The top bar and the tab bar scrolled away. `min-h-screen` on the shell
//      means the DOCUMENT grows with the content, so the header rides up with
//      it and `overflow-y-auto` on <main> never engages: there is nothing for
//      it to scroll, because the page itself is scrolling.
//
//   2  The page carried on scrolling under an open dialog.
//
//   3  Adding a milestone to the calendar opened a dialog TALLER THAN THE
//      PHONE, with its buttons off the bottom and no way to reach them. 54 of
//      the 78 overlays shared one exact class string; most of the rest had
//      drifted. Some capped at 90vh, most capped at nothing, none of them knew
//      about the notch or the home indicator.
//
//   4  Tables wider than a phone sat inside `overflow-hidden`, which does not
//      contain them - it CUTS THEM OFF, with no scrollbar and no sign that
//      columns are missing.
//
// What is checkable from here is source shape, which is what all four are.

import { ok, done, code, read, walk, exists } from './_helpers'

const css = read('app/globals.css')
const office = code('app/(dashboard)/layout.tsx')
const field = code('app/field/layout.tsx')

// ── 1. the shell is one screen tall, and only <main> scrolls ─────────────────
ok(/\.h-app\s*\{[^}]*height:\s*100vh[^}]*height:\s*100dvh/.test(css),
  '.h-app is 100vh THEN 100dvh - dvh landed in Safari 15.4 and the app targets iOS 15.0, '
  + 'so an older WebKit keeps the first rather than dropping both and collapsing the shell')
// ...and "one screen" is the one you can SEE. The shell was the last thing
// measuring the whole screen while every overlay already followed --vv-h, and
// that gap is what let the webview strand a keyboard-height of scroll.
ok(/@supports \(height: 100dvh\)[\s\S]{0,120}\.h-app \{ height: var\(--vv-h, 100dvh\); \}/.test(css),
  'the shell follows --vv-h, inside an @supports so an unset var cannot collapse it to auto')

for (const [name, src] of [['office', office], ['field', field]] as const) {
  ok(/h-app/.test(src), `the ${name} shell is exactly one screen tall`)
  ok(!/min-h-screen/.test(src), `...not min-h-screen, which is what let the page grow (${name})`)
  ok(/h-app[^"]*overflow-hidden|overflow-hidden[^"]*h-app/.test(src),
    `...and does not scroll itself (${name})`)
  ok(/data-app-scroll/.test(src), `the ${name} <main> is the marked scroll container`)
  ok(/data-app-scroll[\s\S]{0,220}overflow-y-auto/.test(src), `...and it is the thing that scrolls (${name})`)
  ok(/data-app-scroll[\s\S]{0,220}min-h-0/.test(src),
    `...with min-h-0, or a tall child pushes it past the shell instead of scrolling (${name})`)
  ok(/print:h-auto/.test(src), `printing undoes the fixed height (${name}) - a paged document has no viewport`)
}
ok(/shrink-0[\s\S]{0,320}<TopNav/.test(office),
  'the top bar cannot be squashed by a tall child - a flex item shrinks by default')

// ── 1b. the top inset has exactly ONE owner ─────────────────────────────────
// THE BUG. The header sat flush under the Dynamic Island, then jumped down by
// exactly 59pt when the drawer was opened, then back. Nothing in SyteNav padded
// the top at all - iOS was, through `contentInset: 'always'`, which insets the
// webview's own scroll view. That held while the DOCUMENT scrolled; once the
// shell became one screen tall (#388) an inset on a scroll view with nothing to
// scroll started being recalculated on layout events, and opening the drawer
// sets `html { overflow: hidden }`.
//
// One value decided in two places, with the winner depending on what the
// webview did last. These assertions exist to keep it at one.
const capacitor = read('capacitor.config.ts')
ok(/contentInset:\s*'never'/.test(capacitor),
  "iOS does not inset the webview - 'always' is a second opinion nothing else can see")
ok(!/contentInset:\s*'always'/.test(capacitor),
  '...and the old value is gone, not merely overridden further down')
ok(/viewportFit:\s*'cover'/.test(code('app/layout.tsx')),
  'viewport-fit=cover, or env(safe-area-inset-*) reports zero and the CSS is inert')

for (const [name, src] of [['office', office], ['field', field]] as const) {
  const times = (src.match(/pt-safe/g) ?? []).length
  // A COUNT, not a presence check. The failure being guarded is two elements
  // padding one edge, and a presence check cannot see that at all. Comments are
  // stripped by code(), so the one explaining this does not count itself.
  ok(times === 1, `the ${name} shell pads the top exactly once (found ${times})`)
  ok(/shrink-0[^"]*pt-safe|pt-safe[^"]*shrink-0/.test(src),
    `...on an element that cannot be collapsed (${name})`)
}
ok(!/h-14[^"]*pt-safe|pt-safe[^"]*h-14/.test(code('components/layout/top-nav.tsx')),
  'the inset is NOT on the h-14 header itself - border-box would take the padding '
  + 'out of the 56px row and squash the search bar instead of moving it down')

// ── 2. nothing behind an open overlay scrolls ────────────────────────────────
ok(/html:has\(\[data-overlay\]\)\s*\{[^}]*overflow-y:\s*hidden/.test(css),
  'an open overlay stops the document scrolling')
ok(/html:has\(\[data-overlay\]\)\s*\[data-app-scroll\]\s*\{[^}]*overflow-y:\s*hidden/.test(css),
  '...and stops <main> scrolling, which is the one that actually moves')
// A JS counter is the obvious alternative and the wrong one: one early return
// in one of 78 cleanup paths leaves the whole app frozen with no dialog open.
ok(!/document\.body\.style\.overflow/.test(code('components/ui/image-lightbox.tsx')),
  'no component sets body overflow by hand any more')

// ── 2b. the lock must not make the page pannable sideways ───────────────────
// THE BUG. Half of "Add Milestone" was off the LEFT edge of the phone, and so
// was the header behind it - a `position: fixed` dialog dragged sideways with
// everything else.
//
// The lock above was written as `overflow: hidden`, the SHORTHAND, which also
// sets overflow-x and so replaced `overflow-x: clip` with `hidden`. Those are
// not the same: clip cannot be scrolled, hidden is scrollable and merely has no
// scrollbar. So opening any dialog turned latent sideways overflow into a
// viewport iOS could pan, and `fixed` is pinned to the LAYOUT viewport.
//
// The file already knew this - the comment on the html/body rule says exactly
// why clip and hidden differ, two hundred lines above where I broke it.
const lock = /html:has\(\[data-overlay\]\)[^{]*\{([^}]*)\}/g
let lockRule: RegExpExecArray | null
let lockCount = 0
while ((lockRule = lock.exec(css))) {
  lockCount++
  const decls = lockRule[1]
  ok(/overflow-y:\s*hidden/.test(decls),
    'the scroll lock names the Y axis explicitly')
  ok(!/overflow:\s*hidden/.test(decls),
    '...and never the `overflow` shorthand, which silently downgrades overflow-x '
    + 'from clip to hidden and makes the page pannable')
  ok(!/overflow-x:/.test(decls), '...and does not touch overflow-x at all')
}
ok(lockCount === 2, `both lock rules checked (${lockCount})`)
ok(/html,\s*body\s*\{[^}]*overflow-x:\s*clip/.test(css),
  'the document still cannot be scrolled sideways - clip, not hidden')

// ── 2c. and nothing should be wider than the screen to begin with ───────────
// `truncate` is white-space: nowrap, so its MIN-CONTENT width is the whole
// unbroken line - and a flex or grid child is min-width:auto and refuses to go
// below it. The text truncates perfectly while the container blows out, which
// is exactly what makes it invisible. The schedule month grid is grid-cols-7
// (= repeat(7, minmax(0, 1fr))), so the TRACKS could shrink and the cells could
// not, and overflowed them.
ok(/\.truncate\s*\{[^}]*min-width:\s*0/.test(css),
  'a truncating element is allowed to shrink - one rule rather than min-w-0 at 136 call sites')

// ── 2d. a sheet has a top edge it cannot cross ──────────────────────────────
// THE BUG. The project sections sheet was `.overlay-full` around a `max-h-full`
// panel, so it grew upward until it filled the screen and put its close button
// under the Dynamic Island. Measured in lib/__tests__/overlay-geometry.ts: the
// button's top was at 20px, and the Island owns the first 59.
ok(/\.overlay-sheet\s*\{[^}]*justify-content:\s*flex-end/.test(css),
  'a sheet sits on the bottom edge')
ok(/\.overlay-sheet\s*\{[^}]*padding-top:\s*max\([^)]*env\(safe-area-inset-top\)/.test(css),
  '...and pads the ONE edge it does not own, so its close button is always reachable')
ok(/\.overlay-sheet\s*>\s*\*\s*\{[^}]*max-height:\s*100%/.test(css),
  '...capping the panel against that padded box, not the whole screen')
const tabs = code('components/layout/project-tabs.tsx')
ok(/className="overlay-sheet/.test(tabs), 'the project sections sheet uses it')
ok(!/overlay-full/.test(tabs),
  '...and not overlay-full, which has no top edge and is what put the X under the notch')
// The dim has to be on the overlay itself: an `absolute inset-0` child is
// positioned against the PADDING box and would leave an undimmed strip.
ok(!/overlay-sheet[^"]*"[\s\S]{0,200}absolute inset-0 bg-/.test(tabs),
  'the dim is on the sheet overlay, not an absolute child that stops at the padding')

// ── 3. every overlay goes through one definition ─────────────────────────────
ok(/\.overlay\s*\{[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0/.test(css), '.overlay is the backdrop')
ok(/\.overlay\s*\{[\s\S]*?env\(safe-area-inset-top\)/.test(css),
  '...padded by the notch, so a dialog is never under the Dynamic Island')
ok(/\.overlay\s*\{[\s\S]*?env\(safe-area-inset-bottom\)/.test(css),
  '...and by the home indicator')
ok(/\.overlay\s*\{[\s\S]*?max\(1rem,\s*env\(safe-area-inset-top\)\)/.test(css),
  '...max() not the raw inset, so a device without a notch still gets breathing room')
const panel = /\.overlay\s*>\s*\*\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
ok(/max-height:\s*100%/.test(panel),
  'THE REPORTED BUG: a panel physically cannot be taller than what is left after the insets')
ok(/min-width:\s*0/.test(panel),
  '...nor wider - a flex item is min-width:auto and refuses to shrink below its content')
ok(/overflow-y:\s*auto/.test(panel), '...and it scrolls inside itself rather than off the screen')
ok(/overscroll-behavior:\s*contain/.test(panel),
  '...without handing the scroll to the page underneath when it reaches the end')

// Every overlay in the codebase, and there is no other kind.
const tsx = [...walk('app'), ...walk('components')].filter(f => f.endsWith('.tsx'))
const raw: string[] = []
const overlays: string[] = []
const unmarked: string[] = []
const vhCapped: string[] = []

for (const f of tsx) {
  const src = read(f)
  for (const line of src.split('\n')) {
    // ANY quoted class string, not just a bare `className="..."`. The plans
    // viewer wrote its full-screen branch as a `cn()` argument on its own
    // line, with `className` two lines above - so the old scan could not see
    // it even with the exemption below removed. Two ways to hide from one
    // rule, and the exemption was only the one anybody knew about.
    if (!(line.match(/'[^']*'|"[^"]*"/g) ?? []).some(q => /\bfixed\b/.test(q) && /\binset-0\b/.test(q))) continue
    // No exemptions. The plans viewer used to have one - "a fullscreen toggle
    // that IS the scroller, not a dialog over one" - and being the exception
    // is precisely why it never learned about the notch: its title and its own
    // exit button sat under the Dynamic Island. `.overlay-full` scrolls just
    // as well and knows where the screen starts.
    raw.push(`${f}: ${line.trim().slice(0, 70)}`)
  }
  for (const line of src.split('\n')) {
    if (!/className="(overlay|overlay-full)\b/.test(line)) continue
    overlays.push(f)
    if (!/data-overlay/.test(line)) unmarked.push(`${f}: ${line.trim().slice(0, 70)}`)
  }
  // A vh cap on a panel is BOTH weaker than the overlay's (vh knows nothing
  // about the notch) and stronger (a Tailwind utility beats the .overlay rule),
  // so the one that wins is the wrong one.
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (i && /data-overlay/.test(lines[i - 1]) && /max-h-\[\d+vh\]/.test(line)) {
      vhCapped.push(`${f}:${i + 1}`)
    }
  })
}

ok(overlays.length >= 70, `${overlays.length} overlays all use the shared definition`)
ok(raw.length === 0, `no overlay hand-rolls "fixed inset-0" any more${raw.length ? ` - ${raw[0]}` : ''}`)
ok(unmarked.length === 0,
  `every overlay carries data-overlay, or it does not lock the background${unmarked.length ? ` - ${unmarked[0]}` : ''}`)
ok(vhCapped.length === 0,
  `no panel re-caps itself in vh${vhCapped.length ? ` - ${vhCapped[0]}` : ''}`)

// The reported one, by name.
const schedule = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
ok((schedule.match(/className="overlay /g) ?? []).length === 2,
  'both schedule dialogs - Add Milestone is the one that would not fit')

// ── 4. a wide table can be reached, not just clipped ─────────────────────────
const clipped: string[] = []
for (const f of tsx) {
  if (f.includes('/print/')) continue          // paged output does not scroll
  const lines = read(f).split('\n')
  lines.forEach((line, i) => {
    if (!/<table/.test(line)) return
    if (/hidden md:table/.test(line)) return   // a phone never sees this one
    const above = lines.slice(Math.max(0, i - 4), i).join(' ')
    if (/overflow-x-auto|overflow-auto|overflow-x-scroll/.test(above)) return
    clipped.push(`${f}:${i + 1}`)
  })
}
ok(clipped.length === 0,
  `no table is cut off by an overflow-hidden ancestor${clipped.length ? ` - ${clipped[0]}` : ''}`)

// ── 2e. nothing steals the keyboard on a touch screen ───────────────────────
// THE BUG. Pressing + on the schedule opened a dialog whose first field had
// `autoFocus`. iOS opens the keyboard for that immediately - nobody asked - and
// then SCROLLS THE LAYOUT VIEWPORT to reach the field, dragging the fixed
// dialog with it. It happened the instant the button was pressed.
//
// A COUNT over every .tsx, because it was in 29 places across 24 files and the
// thirtieth is the one that would be missed.
const bare: string[] = []
for (const f of tsx) {
  read(f).split('\n').forEach((line, i) => {
    if (/\bautoFocus\b(?!=\{autoFocusOnDesktop)/.test(line)) bare.push(`${f}:${i + 1}`)
  })
}
ok(bare.length === 0,
  `no autoFocus is left unguarded${bare.length ? ` - ${bare[0]}` : ''} - on a phone it opens the `
  + 'keyboard before anybody has chosen to type, and drags the dialog off with it')
const guarded = tsx.filter(f => /autoFocusOnDesktop\(\)/.test(read(f))).length
ok(guarded >= 20, `${guarded} files go through autoFocusOnDesktop()`)
ok(/pointer: coarse/.test(read('lib/auto-focus.ts')),
  'the test is the POINTER, not the screen width - an iPad in landscape is wide and still touched')

// ── 5. a label must not wrap, and a table is not a phone layout ─────────────
// THE BUG, from three screenshots. In a narrow table cell "Missing" came out as
// "Missin / g", "Admin" broke one letter per line and read VERTICALLY, and the
// "Actions" column header did the same. A badge is a label; a label that wraps
// is not one. Same for a button: "Request via email" broke across two lines
// inside a fixed-height control and spilled out of it.
ok(/whitespace-nowrap/.test(code('components/ui/badge.tsx')), 'a Badge never wraps')
ok(/whitespace-nowrap/.test(code('components/ui/button.tsx')), 'nor does a button label')

const wrapping: string[] = []
for (const f of tsx) {
  if (f.startsWith('components/marketing/')) continue   // wide by design
  code(f).split('\n').forEach((line, i) => {
    if (!/rounded-full/.test(line)) return
    if (!/\btext-(?:xs|\[10px\]|\[11px\])\b/.test(line)) return
    if (/whitespace-nowrap/.test(line)) return
    wrapping.push(`${f}:${i + 1}`)
  })
}
ok(wrapping.length === 0,
  `no hand-rolled badge can wrap${wrapping.length ? ` - ${wrapping[0]} (+${wrapping.length - 1})` : ''}`)

// A RATCHET, not a clean sweep. Sixteen tables were rendered to phones; each
// one that becomes a list is one fewer, and this number may only go DOWN.
// Team & Users was the worst of them and is a list now.
const phoneTables: string[] = []
for (const f of tsx) {
  if (f.includes('/print/')) continue                   // paged output, no phone
  if (f === 'components/ui/table.tsx') continue           // the primitive, not a screen
  const lines = read(f).split('\n')
  lines.forEach((line, i) => {
    if (!/<table/.test(line)) return
    // Hidden on the <table> itself, OR on a wrapper a few lines up - Approvals
    // has a `hidden md:block` wrapper and a separate phone layout, and the
    // first version of this scan counted it as a phone table anyway.
    const above = lines.slice(Math.max(0, i - 4), i + 1).join(' ')
    if (/hidden (?:sm|md|lg):(?:table|block)/.test(above)) return
    phoneTables.push(`${f}:${i + 1}`)
  })
}
// The floor is not zero and the test should not pretend it is: a vendor-by-
// vendor quote comparison, the permissions matrix and an AIA schedule of values
// are tables because the DATA is a grid, and those scroll inside themselves.
ok(phoneTables.length <= 9,
  `${phoneTables.length} tables still render on a phone (was 16, and this may only go down)`)
// Compliance, Settings and the Directory keep their tables FOR THE DESKTOP,
// which was not asked to change, under `hidden lg:block`; the phone gets the
// list. So each file has both, and none of its tables reaches a phone.
for (const f of ['app/(dashboard)/projects/[id]/compliance/page.tsx', 'app/(dashboard)/settings/page.tsx', 'app/(dashboard)/directory/page.tsx']) {
  const name = f.split('/').slice(-2, -1)[0]
  ok(/<table/.test(read(f)) && !phoneTables.some(t => t.startsWith(f + ':')),
    `${name} keeps its table for the desktop and none of it reaches a phone`)
  ok(/divide-y divide-line-soft lg:hidden|lg:hidden[^"]*divide-y divide-line-soft|divide-y divide-line-soft[^"]*lg:hidden/.test(read(f)),
    `...and the phone list is gated the other way (${name})`)
}

// ── 6. the look: one radius, a border, no shadow, 24px gutters ──────────────
// A border already separates a card from the page. A shadow on top of it is a
// second separator saying the same thing, and it is what made every screen
// read as a web dashboard rather than a native one. Set on Card so all move.
// THE RULE, after the desktop was found changed: the phone look lives BELOW
// `lg` - the breakpoint where the tab bar gives way to the sidebar - and from
// `lg` up every screen looks exactly as it did before the sweep. Two ways to
// say it in code: `lg:` variants where only classes changed, and a second
// markup under `hidden lg:...` where the shape changed. `phone()` strips the
// `lg:` classes so the old assertions read the phone's half alone.
const phone = (src: string) => src.replace(/\blg:[^\s'"`]+/g, '')
const card = code('components/ui/card.tsx')
ok(/rounded-2xl/.test(card), 'Card is ~20px radius on a phone')
ok(!/shadow-/.test(phone(card)), '...with no shadow - the 1px border is the separation')
ok(/lg:rounded-lg/.test(card) && /lg:shadow-sm/.test(card),
  '...and from lg up it is the rounded-lg, shadow-sm card the desktop always had')
const gutters: string[] = []
for (const f of tsx) {
  if (!f.startsWith('app/(dashboard)/')) continue
  code(f).split('\n').forEach((line, i) => { if (/\bp-4 sm:p-6\b/.test(line)) gutters.push(`${f}:${i + 1}`) })
}
ok(gutters.length === 0,
  `no screen squeezes to 16px gutters on a phone${gutters.length ? ` - ${gutters[0]}` : ''} - 24px everywhere`)

// ── 7. numbers that belong together share one card ──────────────────────────
// The home screen had four coloured tiles and then three coloured pills. The
// reference it was measured against has ONE overview card with hairline
// dividers and a "needs attention" list of rows. That is what it is now, and
// the old four-box StatCard is gone from the repo rather than merely unused.
const home = code('app/(dashboard)/dashboard/page.tsx')
ok((home.match(/<StatStrip/g) ?? []).length === 3,
  'every dashboard variant (sub, admin, GC) puts its numbers in one StatStrip on a phone')
ok(/StatCard/.test(home) && exists('components/ui/stat-card.tsx'),
  '...and the desktop keeps its StatCard tiles - the file is back, not orphaned')
ok(/Needs attention/.test(home) && /bg-panel lg:hidden/.test(home),
  'needs-attention is a list of rows in one card on a phone')
ok(/hidden lg:flex flex-wrap gap-2/.test(home),
  '...and the three coloured pills on a desktop')

// Every StatStrip in the app is the PHONE half: it carries `lg:hidden`, and
// the same file has a `hidden lg:` block that is the desktop's numbers.
const strips: string[] = []
for (const f of tsx) {
  const src = code(f)
  const n = (src.match(/<StatStrip/g) ?? []).length
  if (!n) continue
  const gated = (src.match(/<StatStrip[\s\S]{0,160}?className="[^"]*lg:hidden/g) ?? []).length
  if (gated !== n || !/hidden lg:(?:grid|flex|block|contents)/.test(src)) strips.push(`${f} (${gated}/${n} gated)`)
}
ok(strips.length === 0,
  `every StatStrip is phone-only and has a desktop twin${strips.length ? ` - ${strips[0]}` : ''}`)
ok(tsx.filter(f => /<StatStrip/.test(code(f))).length >= 4, '...and there are at least four of them')
// The three screens a tester sent still had coloured tiles after pass 4:
// a project's overview, the Projects list and Master Money. Each is a strip
// on a phone now (the scan above proves it is gated and has its twin).
for (const f of ['app/(dashboard)/projects/[id]/overview/page.tsx', 'app/(dashboard)/projects/page.tsx', 'app/(dashboard)/master-money/page.tsx']) {
  ok(/<StatStrip/.test(code(f)), `${f.split('/').slice(-2, -1)[0]} puts its numbers in one StatStrip on a phone`)
}
const strip = code('components/ui/stat-strip.tsx')
ok(/onClick\?: \(\) => void/.test(strip) && /active\?: boolean/.test(strip) && /\? 'button' :/.test(strip),
  'a StatStrip cell can be a button - the Projects counts are filters, not links')
ok(/onClick: \(\) => setStatusFilter/.test(code('app/(dashboard)/projects/page.tsx')),
  '...and the Projects page uses it, so tapping a count still filters on a phone')
const overview = code('app/(dashboard)/projects/[id]/overview/page.tsx')
ok(/phoneRow\(/.test(overview) && (overview.match(/divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel lg:hidden/g) ?? []).length === 2,
  'a project\'s waiting-on lists are one divided card each on a phone')
ok(/hidden space-y-2\.5 lg:block/.test(overview), '...with the spined, tinted rows kept for the desktop')

// The Permissions matrix: five columns in a card on a phone. A list of
// resources with four labelled toggles each below lg, the matrix above it.
const perms = code('components/settings/permissions-panel.tsx')
ok(/rounded-2xl border border-line lg:hidden/.test(perms) && /hidden lg:block overflow-x-auto rounded-lg border border-line/.test(perms),
  'the Permissions grid is a list of toggles on a phone and the matrix on a desktop')
ok((perms.match(/ACTION_LABELS\[a\]/g) ?? []).length >= 3, '...and the phone toggles are labelled, not bare boxes')
// A seven-column editor scrolls in its own box rather than crushing.
const scope = code('components/ui/scope-builder.tsx')
ok(/overflow-x-auto/.test(scope) && (scope.match(/min-w-\[520px\] grid-cols-\[28px/g) ?? []).length === 2,
  'the scope builder grid keeps its width and scrolls inside the category card')
ok(/min-w-\[640px\]/.test(code('app/(dashboard)/projects/[id]/pay-apps/page.tsx')),
  'the G703 sheet keeps its seven columns readable and scrolls')

// ── 8. the Tasks board: one card per column, rows inside, no tints ──────────
// Three columns in three colours, each holding a stack of bordered cards on a
// tinted ground, is a card inside a card inside a card. A column is now one
// neutral card whose tasks are rows divided by hairlines; the list view is
// the same shape per group. Colour is left to the due date and the status
// chip, where it says something - an overdue row was tinted red on top of
// saying "Overdue" in red, and the expanded one wore a ring.
const tasksPage = code('app/(dashboard)/projects/[id]/tasks/page.tsx')
const slice = (a: string, b: string) => phone(tasksPage.slice(tasksPage.indexOf(a), tasksPage.indexOf(b)))
const boardCard = slice('function BoardCard(', 'function ListCard(')
const listCard = slice('function ListCard(', 'function BoardView(')
const boardView = slice('function BoardView(', 'function ListView(')
ok(!/col\.(?:colBg|headerBg|headerText|colBorder)\b/.test(boardView), 'tasks board columns have no tinted ground on a phone')
ok(/col\.lg\.(?:col|headerBg)/.test(tasksPage.slice(tasksPage.indexOf('function BoardView('))),
  '...and the desktop keeps its tinted columns under lg:')
ok(boardCard.length > 0 && listCard.length > 0, 'BoardCard and ListCard are declared in that order')
ok(!/ring-2/.test(boardCard) && !/ring-2/.test(listCard), 'an expanded task is a quiet bg-surface row, not a ringed card')
ok(!/bg-danger-tint/.test(listCard), 'an overdue row is not tinted - the red "Overdue" label already says it')
ok(!/rounded-xl border/.test(listCard), 'a list row is a row, not its own bordered card')
ok((tasksPage.match(/divide-y divide-line-soft/g) ?? []).length >= 4,
  'board columns and every list group put their rows in one divided card')
ok(!/p-3 flex flex-col gap-2/.test(boardCard), 'a board row is padded once, not twice')
// The detail opens where you tapped. A desktop board is three columns side by
// side, so a full-width drawer under all of them is right there; a phone stacks
// those columns, so "under the board" is under every OTHER column as well - tap
// something in Open and the detail lands below In Progress and Completed, off
// the bottom of the screen.
ok(/<BoardCard task=\{task\} \/>[\s\S]{0,200}expandedTask\?\.id === task\.id[\s\S]{0,120}lg:hidden"><TaskDetail/.test(tasksPage),
  'on a phone the task detail opens under the card that was tapped')
ok(/hidden overflow-hidden rounded-xl border border-accent\/40 bg-panel shadow-md lg:block/.test(tasksPage),
  '...and the drawer under the whole board is what a desktop still gets')
ok((tasksPage.match(/Task detail<\/span>/g) ?? []).length === 1,
  '...from one definition, so the two places it appears cannot drift apart')

// ── 9. a strip that scrolls sideways says so ────────────────────────────────
// A hidden scrollbar leaves a phone with no sign that the filter row keeps
// going. The mask fades the right edge; it is the one utility for that so
// every strip fades the same way.
ok(/\.scroll-fade\s*\{[^}]*mask-image:\s*linear-gradient\(to right/.test(css), '.scroll-fade fades the right edge')
ok(/scroll-fade/.test(tasksPage), 'tasks filter strip fades at its right edge')
ok(/scroll-fade/.test(code('app/(dashboard)/settings/page.tsx')), 'settings tab strip fades at its right edge')

// ── 10. four spots from one phone ───────────────────────────────────────────
// The project layout pads p-6; nine project pages padded p-6 again and sat
// 48px from the edge on a phone. A page root under projects/[id] never pads
// without an lg: prefix.
const doubled: string[] = []
for (const f of tsx) {
  if (!f.startsWith('app/(dashboard)/projects/[id]/') || !f.endsWith('/page.tsx') || f.includes('/print/')) continue
  const m = /\n  return \(\n\s*<div className="([^"]*)"/.exec(code(f))
  if (m && /(^|\s)p-6(\s|$)/.test(m[1])) doubled.push(f)
}
ok(doubled.length === 0, `no project page doubles the layout's gutter${doubled.length ? ` - ${doubled[0]}` : ''}`)
// A menu anchored to a control in the project header is a bottom sheet on a
// phone - anchored to its left edge it ran off the right of the screen.
for (const f of ['components/layout/project-status-switch.tsx', 'components/layout/team-quick-view.tsx']) {
  const src = code(f)
  ok(/overlay-sheet lg:hidden/.test(src) && /hidden lg:block absolute/.test(src),
    `${f.split('/').pop()} is a sheet on a phone and the dropdown it was on a desktop`)
  ok(!/w-\[calc\(100vw/.test(src), `...and does not size itself from vw (${f.split('/').pop()})`)
}
// A drawer inside .overlay-full (inset 0, no safe padding) pads its own top.
const checklist = code('components/projects/setup-checklist.tsx')
ok(/flex-col bg-panel shadow-2xl pt-safe pb-safe/.test(checklist), 'the setup checklist drawer pads the notch and the home bar itself')
// Bills: rows in one card per group on a phone, no icon column.
const bills = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/<Receipt className="hidden h-5 w-5 text-faint shrink-0 lg:block" \/>/.test(bills), 'a bill row has no icon column on a phone')
ok(/const GROUP = 'divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel lg:divide-y-0/.test(bills)
  && (bills.match(/className=\{GROUP\}/g) ?? []).length === 3, 'each group of bills is one divided card on a phone')

// A 12px label beside a field that must be 16px (iOS zooms below it) is what
// made the placeholders read as enormous. The field cannot shrink, so on a
// phone the label does not either - it shrinks at lg, where the field does too.
const shrunkLabels: string[] = []
for (const f of tsx) {
  code(f).split('\n').forEach((line, i) => {
    if (/<Label[^>]*\btext-xs\b/.test(line) && !/lg:text-xs/.test(line)) shrunkLabels.push(`${f}:${i + 1}`)
  })
}
ok(shrunkLabels.length === 0,
  `no label is smaller than its own field on a phone${shrunkLabels.length ? ` - ${shrunkLabels[0]} (+${shrunkLabels.length - 1})` : ''}`)

// ── 11. a row of controls is never ragged ───────────────────────────────────
// `flex flex-wrap` makes every control as wide as its own label, so a toolbar
// of five buttons came out 2 + 2 + 1 at three different widths and none of the
// rows met the right edge. `.row-even` (globals.css) is the answer and this is
// the ratchet: a flex row holding two or more Buttons carries it, so the next
// one written follows the rule rather than adding to the pile.
const ragged: string[] = []
for (const f of tsx) {
  const lines = code(f).split('\n')
  lines.forEach((line, i) => {
    const m = /<div className="([^"]*)"\s*>\s*$/.exec(line)
    if (!m) return
    const cls = m[1]
    if (!/(^|\s)flex(\s|$)/.test(cls)) return
    if (/flex-col|row-even|hidden|grid/.test(cls)) return
    // The block this div opens, to the line that closes it.
    let depth = 0
    let end = -1
    for (let j = i; j < Math.min(i + 40, lines.length); j++) {
      depth += (lines[j].match(/<div\b/g) ?? []).length - (lines[j].match(/<\/div>/g) ?? []).length
      if (j > i && depth <= 0) { end = j; break }
    }
    if (end < 0) return
    const block = lines.slice(i + 1, end).join('\n')
    if ((block.match(/<Button\b/g) ?? []).length < 2) return
    // A heading or a paragraph beside the buttons makes it a LAYOUT - "title
    // on the left, toolbar on the right" - not a row of controls. Its button
    // group is the row, and that is what carries the class.
    const withoutButtons = block.replace(/<Button\b[\s\S]*?(?:\/>|<\/Button>)/g, '')
    if (/<(h[1-6]|p|img|table)\b/.test(withoutButtons)) return
    // Same idea one step along: the buttons are already inside a row that
    // carries the rule, so this is the LAYOUT around it - a summary line, or
    // filter pills, beside the actions. Giving it the rule as well nested one
    // grid inside a cell of another.
    if (/row-even/.test(block)) return
    ragged.push(`${f}:${i + 1}`)
  })
}
ok(ragged.length === 0,
  `every row of buttons reaches both edges on a phone${ragged.length ? ` - ${ragged[0]} (+${ragged.length - 1})` : ''}`)

// ...and never one inside another. A `.row-even` in a cell of a `.row-even`
// halves an already-halved cell: on the schedule's Edit Item footer, Cancel and
// Save got a quarter of the dialog each and "Save Changes", which may not wrap,
// ran out of both sides of its own button. Where a wrapper exists only to group
// the actions on a desktop, it is `contents` below lg - it stops existing, and
// the controls share the one row.
const nested: string[] = []
for (const f of tsx) {
  const lines = code(f).split('\n')
  lines.forEach((line, i) => {
    if (!/row-even/.test(line)) return
    let depth = 0
    for (let j = i; j < Math.min(i + 40, lines.length); j++) {
      depth += (lines[j].match(/<div\b/g) ?? []).length - (lines[j].match(/<\/div>/g) ?? []).length
      if (j > i && /row-even/.test(lines[j])) { nested.push(`${f}:${i + 1} holds :${j + 1}`); break }
      if (j > i && depth <= 0) break
    }
  })
}
ok(nested.length === 0,
  `no row of controls is nested inside another${nested.length ? ` - ${nested[0]}` : ''}`)

// A date field is left-aligned like every other field beside it. iOS centres
// the value in one, so "Sep 17, 2026" sat in the middle of its box under a
// left-aligned label, next to a Label field whose text started at the edge.
ok(/input\[type='date'\][\s\S]{0,500}text-align:\s*left/.test(css),
  'a date field reads from the left, like the fields around it')
ok(/\.row-even\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/.test(css),
  '...two equal columns')
ok(/\.row-even > :last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \}/.test(css),
  '...and an odd last control takes the whole row')
ok(/\.row-even > :is\([^)]*\) \{[\s\S]{0,60}width: 100%/.test(css),
  '...with :is() so the cell beats a `w-28` written for the desktop row')

// ── 12. a gutter is the same on both sides of a phone ───────────────────────
// The selections editor was `px-4 pb-4 pl-10`: 40px of gutter on the left
// against 16 on the right. It is a hanging indent that lines the body up with
// the row's title past its chevron - right on a desktop, and on a phone just
// off-centre, and 24px off a 342px line.
// Two things are not this: a printed page, which has no phone; and a form
// control, where the extra padding on one side makes room for a `$` or an icon
// sitting inside the field.
const lopsided: string[] = []
for (const f of tsx) {
  if (f.includes('/print/')) continue
  const lines = code(f).split('\n')
  lines.forEach((line, i) => {
    const tag = lines.slice(Math.max(0, i - 8), i + 1).join(' ').lastIndexOf('<')
    const opensAControl = /<(input|textarea|select|Input|Textarea)\b/.test(
      lines.slice(Math.max(0, i - 8), i + 1).join(' ').slice(tag))
    if (opensAControl) return
    for (const cls of line.match(/className="[^"]*"/g) ?? []) {
      const px = /(?:^|[\s"])px-(\d+)/.exec(cls)
      const pl = /(?:^|[\s"])pl-(\d+)/.exec(cls)     // a bare pl-, not lg:pl-
      if (px && pl && Number(pl[1]) > Number(px[1])) lopsided.push(`${f}:${i + 1}`)
    }
  })
}
ok(lopsided.length === 0,
  `no phone gutter is wider on one side than the other${lopsided.length ? ` - ${lopsided[0]} (+${lopsided.length - 1})` : ''}`)

// ── 13. the status note explains the status you are looking at ──────────────
// One sentence was printed under both the menu and the sheet whatever was
// selected, so picking On Hold explained Active.
const statusSwitch = code('components/layout/project-status-switch.tsx')
const statuses = /const STATUSES = \[([^\]]*)\]/.exec(statusSwitch)?.[1] ?? ''
const meanings = statusSwitch.slice(statusSwitch.indexOf('const STATUS_MEANING'))
const missing = (statuses.match(/'([a-z_]+)'/g) ?? []).filter(q => !meanings.includes(`${q.slice(1, -1)}:`))
ok(missing.length === 0, `every job status says what it means${missing.length ? ` - ${missing[0]} does not` : ''}`)
ok((statusSwitch.match(/\{STATUS_MEANING\[current\]\}/g) ?? []).length === 2,
  '...and both the desktop menu and the phone sheet read the selected one')

// ── long text, which is the same bug one level down ──────────────────────────
ok(/p,\s*li,\s*dd,\s*dt,\s*blockquote[\s\S]{0,80}overflow-wrap:\s*anywhere/.test(css),
  'prose wraps anywhere by default - `break-word` wraps the text but not the container')
// ...but NOT a table cell. `anywhere` let the table layout squeeze a column to
// one character: "Create" was Cr / ea / te on the Permissions grid and a
// group name was its first letter. A cell keeps its words, a header never
// wraps, and a table too wide for the screen scrolls in its wrapper.
ok(!/p,[^{]*\btd\b[^{]*\{[^}]*overflow-wrap:\s*anywhere/.test(css) && !/p,[^{]*\bth\b[^{]*\{[^}]*overflow-wrap:\s*anywhere/.test(css),
  'a table cell is not prose - td/th are not in the anywhere list')
ok(/th,\s*td\s*\{[^}]*overflow-wrap:\s*break-word/.test(css), '...cells keep their words')
ok(/\bth\s*\{[^}]*white-space:\s*nowrap/.test(css), '...and a column header never wraps')
ok(!/^\s*\*\s*\{[^}]*overflow-wrap:\s*anywhere/m.test(css),
  '...but not on everything: on a button that breaks the label instead of keeping the shape')

done()
