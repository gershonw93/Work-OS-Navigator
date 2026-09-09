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
    if (!/className="[^"]*\bfixed\b[^"]*\binset-0\b/.test(line)) continue
    // The plans page has a fullscreen toggle that IS the scroller, not a
    // dialog over one. It is the only legitimate hand-rolled full-screen.
    if (f.includes('plans/[planId]')) continue
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
ok(phoneTables.length <= 10,
  `${phoneTables.length} tables still render on a phone (was 16, and this may only go down)`)
ok(!/<table/.test(read('app/(dashboard)/projects/[id]/compliance/page.tsx')),
  'Compliance is a list - it needed 560px and scrolled its Expires column off the phone')
ok(!/<table/.test(read('app/(dashboard)/settings/page.tsx')),
  'Settings has no tables at all - Team & Users was five columns in 390px')

// ── 6. the look: one radius, a border, no shadow, 24px gutters ──────────────
// A border already separates a card from the page. A shadow on top of it is a
// second separator saying the same thing, and it is what made every screen
// read as a web dashboard rather than a native one. Set on Card so all move.
const card = code('components/ui/card.tsx')
ok(/rounded-2xl/.test(card), 'Card is ~20px radius')
ok(!/shadow-/.test(card), '...with no shadow - the 1px border is the separation')
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
  'every dashboard variant (sub, admin, GC) puts its numbers in one StatStrip')
ok(!/StatCard/.test(home), '...and the four-box StatCard is not used on it')
ok(!exists('components/ui/stat-card.tsx'), '...or anywhere - the file is deleted, not orphaned')
ok(/Needs attention/.test(home) && /divide-y divide-line-soft/.test(home),
  'needs-attention is a list of rows in one card')
ok(!/rounded-full bg-warn-tint text-warn text-xs font-medium px-3 py-1\.5/.test(home),
  '...not three coloured pills')
for (const f of ['app/(dashboard)/projects/[id]/compliance/page.tsx', 'app/(dashboard)/customers/[customerId]/page.tsx']) {
  ok(/<StatStrip/.test(code(f)) && !/StatCard/.test(code(f)), `${f.split('/').slice(-2, -1)[0]} uses StatStrip, not a grid of stat boxes`)
}

// ── long text, which is the same bug one level down ──────────────────────────
ok(/p,\s*li,\s*dd,\s*dt,\s*td,\s*th[\s\S]{0,80}overflow-wrap:\s*anywhere/.test(css),
  'prose wraps anywhere by default - `break-word` wraps the text but not the container')
ok(!/^\s*\*\s*\{[^}]*overflow-wrap:\s*anywhere/m.test(css),
  '...but not on everything: on a button that breaks the label instead of keeping the shape')

done()
