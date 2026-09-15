// The first test in this repo that actually LAYS ANYTHING OUT.
//
// WHY IT EXISTS. Five layout fixes in a row were diagnosed by squinting at
// screenshots from a phone: the top bar scrolling away, dialogs taller than the
// screen, the page dragged sideways, and finally the project sections sheet
// opening so high that its close button sat underneath the Dynamic Island with
// no way to shut it. Every one of those is a NUMBER - a bounding rectangle
// against a viewport - and every one was argued about in prose instead.
//
// So this renders the real compiled CSS against the real markup in headless
// Chromium at phone size and asks the browser where things ended up. The other
// suites here read source and match patterns, which cannot see any of this: the
// sheet's classes were all individually correct.
//
// WHAT IT CANNOT DO. `env(safe-area-inset-*)` is 0 in a desktop browser, so the
// notch itself is not simulated. That is why every safe-area rule in
// globals.css is written `max(<floor>, env(...))` - the floor is the branch
// this exercises, and it is the same declaration. A rule that only had the
// env() half would pass here and fail on a phone, which is precisely why the
// floors are there.

import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ok, done, root, code, read } from './_helpers'

const VIEWPORT = { w: 390, h: 844 }   // iPhone 14/15, the smallest we care about

/**
 * Playwright's browser, wherever this environment put it.
 *
 * HEADLESS_SHELL FIRST, and that is not a preference. Full Chrome enforces a
 * MINIMUM WINDOW WIDTH of about 500px and subtracts its own UI from the height,
 * so `--window-size=390,844` quietly became a 500x757 viewport - and every
 * measurement taken in it was of a screen no phone has. The suite reported the
 * calendar grid as overflowing when it fits perfectly well. headless_shell has
 * no window furniture and honours the size it is given.
 *
 * The `vh` assertion below is what caught it, and is why it stays.
 */
function chromium(): string | null {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  let dirs: string[] = []
  try { dirs = readdirSync(base).filter(d => d.startsWith('chromium')) } catch { /* none */ }
  for (const exe of ['chrome-linux/headless_shell', 'chrome-linux/chrome']) {
    for (const dir of dirs) {
      const p = join(base, dir, exe)
      if (existsSync(p)) return p
    }
  }
  for (const p of ['/usr/bin/chromium', '/usr/bin/google-chrome']) if (existsSync(p)) return p
  return null
}

const browser = chromium()
if (!browser) {
  // LOUD. A test that quietly reports nothing is worse than one that fails -
  // it is the exact fault three other suites in here exist for.
  console.log('  \x1b[33mSKIPPED\x1b[0m no Chromium found; set PLAYWRIGHT_BROWSERS_PATH')
  console.log('  This suite lays out real markup and cannot run without a browser.')
  done()
}

const work = mkdtempSync(join(tmpdir(), 'sytenav-layout-'))

/**
 * The app's own stylesheet, compiled for exactly the markup being measured.
 *
 * Built here rather than read out of `.next`, so the suite does not silently
 * depend on somebody having run `next build` first - and so a skip can never be
 * caused by something as invisible as a missing build directory.
 */
function styles(html: string): string {
  const fixture = join(work, 'fixture.html')
  writeFileSync(fixture, html)
  const out = join(work, 'fixture.css')
  execFileSync('npx', [
    'tailwindcss', '-i', join(root(), 'app/globals.css'), '-o', out, '--content', fixture,
  ], { cwd: root(), stdio: ['ignore', 'ignore', 'pipe'] })
  return readFileSync(out, 'utf8')
}

/** Lay `body` out at phone size and hand back what the browser measured. */
function measure(body: string, probe: string, height = VIEWPORT.h, rootStyle = '', width = VIEWPORT.w): any {
  const css = styles(body)
  const page = `<!doctype html><html${rootStyle ? ` style="${rootStyle}"` : ''}><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${css}</style><style>html,body{margin:0}
/* Every entrance animation off: translateX(100%) / translateY(100%) is where a
   drawer or a sheet STARTS, and the DOM is dumped while it is still there. The
   suite measures where panels come to REST; that the animations exist, inside
   a reduced-motion guard, is pinned as source shape in swipe-sheet.ts. */
.overlay-drawer > *, .overlay-sheet > * { animation: none !important; }</style></head>
<body class="bg-surface font-sans">${body}
<script>window.addEventListener('load',()=>{
  const rect = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null }
  const r = (${probe})(rect)
  document.body.insertAdjacentHTML('beforeend','<pre id=probe>'+JSON.stringify(r)+'</pre>')
})</script></body></html>`
  const file = join(work, 'page.html')
  writeFileSync(file, page)
  // A private profile per run. Sharing the default user-data-dir across
  // several launches gave a viewport that was not the one asked for - 500x757
  // instead of 390x844 - which silently made every measurement meaningless.
  // The `vh` assertion below exists because that happened.
  const dom = execFileSync(browser!, [
    '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=2000',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sytenav-profile-'))}`,
    `--window-size=${width},${height}`, '--dump-dom', `file://${file}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  const m = /<pre id="probe">([^<]*)<\/pre>/.exec(dom)
  if (!m) throw new Error('the page never reported its geometry')
  return JSON.parse(m[1])
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. A BOTTOM SHEET MUST NOT REACH THE TOP OF THE SCREEN.
//
// THE BUG, measured. The project sections sheet was `.overlay-full` holding a
// `max-h-full` panel, so it grew upward until it filled the viewport: sheet top
// 0, close button top 20. The Dynamic Island owns the first 59 points of an
// iPhone, so that button was underneath it and the sheet could not be closed.
// ─────────────────────────────────────────────────────────────────────────────
const sheetBody = (outer: string, panel: string) => `
<div class="${outer}" data-overlay>
  <div class="${panel}">
    <div class="flex items-center justify-between px-5 pt-5 pb-3">
      <h2 class="text-base font-bold text-ink">Project Sections</h2>
      <button id="closeX" class="rounded-full p-1 text-faint"><span class="h-5 w-5 block">X</span></button>
    </div>
    <div class="px-4 pb-8 space-y-4">${
      // Tall enough to hit the cap, which the real sheet is: four groups of
      // sections. A fixture that fits is a fixture that proves nothing.
      Array.from({ length: 4 }, () =>
        '<p class="text-[11px] font-bold uppercase tracking-wide text-info">Group</p>'
        + '<div class="grid grid-cols-2 gap-2">'
        + '<a class="flex items-center gap-2.5 rounded-xl border border-line px-3 py-3 text-sm">Section</a>'.repeat(6)
        + '</div>').join('')
    }</div>
  </div>
</div>`

const probe = `(rect) => {
  const x = rect('#closeX'), sheet = rect('[data-overlay] > div')
  return { closeTop: Math.round(x.top), closeBottom: Math.round(x.bottom),
           sheetTop: Math.round(sheet.top), sheetBottom: Math.round(sheet.bottom),
           docWidth: document.documentElement.scrollWidth, vw: window.innerWidth, vh: window.innerHeight }
}`

const sheet = measure(
  sheetBody('overlay-sheet bg-black/40', 'flex flex-col overflow-y-auto rounded-t-2xl bg-panel pb-safe'),
  probe,
)
ok(sheet.vh === VIEWPORT.h, `the page really is ${VIEWPORT.h} tall (${sheet.vh})`)
ok(sheet.sheetTop >= 40,
  `the sheet stops short of the top of the screen (${sheet.sheetTop}px) - on a phone the `
  + 'inset pushes it further still, but the floor is what is measurable here')
ok(sheet.closeTop >= 40,
  `the close button is reachable, not under the Dynamic Island (${sheet.closeTop}px)`)
ok(sheet.sheetBottom === VIEWPORT.h,
  `...while the sheet still sits flush on the bottom edge (${sheet.sheetBottom})`)

// The shape it used to have, measured side by side. This is what makes the
// assertion above mean something: the number it rejects is a real number this
// markup really produced.
const old = measure(
  sheetBody('overlay-full flex flex-col justify-end bg-black/40',
    'flex max-h-full flex-col overflow-y-auto rounded-t-2xl bg-panel pb-safe'),
  probe,
)
ok(old.closeTop < 40,
  `and the old shape really did put it under the notch (${old.closeTop}px) - `
  + 'without this the check above could be passing for the wrong reason')

// ─────────────────────────────────────────────────────────────────────────────
// 2. A DIALOG FITS ON THE SCREEN, AND NOTHING RUNS OFF THE SIDE.
// ─────────────────────────────────────────────────────────────────────────────
const dialog = measure(`
<div class="overlay items-center justify-center bg-black/50" data-overlay>
  <div id="panel" class="bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0">
    <div class="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
      <h2 class="text-lg font-semibold text-ink">Add Milestone</h2>
      <button id="closeX" class="text-faint"><span class="h-5 w-5 block">X</span></button>
    </div>
    <div class="px-4 sm:px-6 py-5 space-y-4">${
      // Parenthesised: `'a' + 'b'.repeat(8)` repeats only the LAST string, which
      // produced one open <div> and eight stray inputs. The fixture rendered as
      // a 172px stub and the "it fits" assertions passed on a dialog that was
      // not the dialog. Hence the width check below.
      ('<div class="space-y-1.5"><label class="text-sm font-medium text-ink-soft">Field</label>'
      + '<input class="flex h-9 w-full rounded-md border border-muted2 bg-panel px-3 py-1 text-sm"></div>')
    .repeat(8)}</div>
    <div class="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end">
      <button id="submit" class="inline-flex items-center rounded-lg h-9 px-4 text-sm bg-accent">Add Milestone</button>
    </div>
  </div>
</div>`, `(rect) => {
  const p = rect('#panel'), s = rect('#submit')
  return { panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom), panelRight: Math.round(p.right),
           panelLeft: Math.round(p.left), submitBottom: Math.round(s.bottom),
           docWidth: document.documentElement.scrollWidth, vw: window.innerWidth, vh: window.innerHeight }
}`)

// Deliberately MORE fields than the real dialog has, so the cap is exercised
// rather than merely not needed.
// A fixture that failed to render is a fixture that proves nothing, and this
// one silently did: the panel came out 172px wide and every "it fits" check
// passed against a stub. Width first, then the fitting.
ok(dialog.panelRight - dialog.panelLeft >= 300,
  `the dialog really rendered at full width (${dialog.panelRight - dialog.panelLeft}px of ${VIEWPORT.w})`)
ok(dialog.panelTop >= 16, `a dialog clears the top of the screen (${dialog.panelTop}px)`)
ok(dialog.panelBottom <= VIEWPORT.h - 16,
  `...and the bottom (${dialog.panelBottom} of ${VIEWPORT.h}) - it cannot be taller than the space it has`)
ok(dialog.panelLeft >= 16 && dialog.panelRight <= VIEWPORT.w - 16,
  `...and both sides (${dialog.panelLeft}..${dialog.panelRight} of ${VIEWPORT.w})`)
ok(dialog.docWidth <= VIEWPORT.w,
  `nothing makes the page wider than the phone (${dialog.docWidth} vs ${VIEWPORT.w}) - `
  + 'a page wider than the screen is what let a dialog be dragged sideways')

// ─────────────────────────────────────────────────────────────────────────────
// 2b. AND ITS BUTTONS STAY ON SCREEN WHEN THERE IS ALMOST NO SCREEN.
//
// THE BUG. "Add Milestone" fits at 390x844 and is wrong on a phone, which is
// what made it so hard to see from here. Tapping a date field opens iOS's wheel
// over the bottom of the screen, and the web viewport does NOT shrink for it -
// so the dialog stays where it is with its lower half underneath.
//
// 420 stands in for that. Measured with the panel as a plain block, the submit
// button's top was at 438 on a 420-tall screen: 18px past the bottom edge, and
// reachable only by knowing to scroll inside a dialog you cannot see the bottom
// of. As a column with a pinned footer it is at 352.
// ─────────────────────────────────────────────────────────────────────────────
const SHORT = 420   // what is left of an iPhone with a date picker open

const dialogBody = (panel: string, header: string, form: string, fields: string, footer: string) => `
<div class="overlay items-center justify-center bg-black/50" data-overlay>
  <div id="panel" class="${panel}">
    <div class="${header}"><h2 id="title" class="text-lg font-semibold text-ink">Add Milestone</h2></div>
    <form class="${form}">
      <div class="${fields}">${
        ('<div class="space-y-1.5"><label class="text-sm font-medium text-ink-soft">Field</label>'
        + `<input class="flex h-9 w-full rounded-md border border-muted2 bg-panel px-3 py-1 text-sm"></div>`)
      .repeat(4)}</div>
      <div class="${footer}">
        <button class="inline-flex items-center rounded-lg h-9 px-4 text-sm bg-muted">Cancel</button>
        <button id="submit" class="inline-flex items-center rounded-lg h-9 px-4 text-sm bg-accent">Add Milestone</button>
      </div>
    </form>
  </div>
</div>`

const edges = `(rect) => {
  const p = rect('#panel'), t = rect('#title'), s = rect('#submit')
  return { panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom),
           titleTop: Math.round(t.top), submitTop: Math.round(s.top),
           submitBottom: Math.round(s.bottom), vh: window.innerHeight }
}`

const column = dialogBody(
  'flex max-h-full w-full max-w-md min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl',
  'shrink-0 px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between',
  'flex min-h-0 flex-1 flex-col',
  'min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5 space-y-4',
  'shrink-0 px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end',
)
const tight = measure(column, edges, SHORT)
ok(tight.vh === SHORT, `the short screen really is ${SHORT} tall (${tight.vh})`)
ok(tight.submitBottom <= SHORT,
  `the submit button is ON SCREEN with a picker up (ends at ${tight.submitBottom} of ${SHORT})`)
ok(tight.titleTop >= 0, `...and so is the title (${tight.titleTop})`)
ok(tight.panelBottom <= SHORT, `...with the panel inside the screen too (${tight.panelBottom})`)

// The plain block it used to be, measured beside it. Without this the check
// above could be passing because the fixture happens to be short.
const block = measure(dialogBody(
  'bg-panel rounded-xl shadow-xl w-full max-w-md min-w-0',
  'px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between',
  '',
  'px-4 sm:px-6 py-5 space-y-4',
  'px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap gap-2 justify-end',
), edges, SHORT)
ok(block.submitBottom > SHORT,
  `and the old plain-block panel really did push it off the bottom (${block.submitBottom} of ${SHORT})`)

// The dialogs this is actually about.
const schedule = code('app/(dashboard)/projects/[id]/schedule/page.tsx')
ok((schedule.match(/flex max-h-full w-full max-w-md min-w-0 flex-col overflow-hidden/g) ?? []).length === 2,
  'both schedule dialogs are columns - Add Milestone and Edit Item')
ok((schedule.match(/flex min-h-0 flex-1 flex-col/g) ?? []).length === 2,
  '...with the form as the flexible middle, so the footer travels with it')
ok((schedule.match(/shrink-0 px-4 sm:px-6 py-4 border-t/g) ?? []).length === 2,
  '...and both footers pinned')
// Budget's Add Line was an inline card two screens down a phone; it is a
// dialog of the same shape now, on the desktop too.
const budget = code('app/(dashboard)/projects/[id]/budget/page.tsx')
const addIdx = budget.indexOf('New Budget Line')
const addBlock = budget.slice(Math.max(0, addIdx - 600), addIdx + 200)
ok(/overlay items-center justify-center[^"]*" data-overlay/.test(addBlock), 'Budget\'s New Budget Line is a dialog, not a card down the page')
ok(/flex max-h-full w-full max-w-2xl min-w-0 flex-col overflow-hidden/.test(addBlock), '...a column')
ok(/flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto/.test(budget.slice(addIdx, addIdx + 800)), '...with the form as the scrolling middle')
ok(/flex shrink-0 justify-end gap-2 border-t border-line-soft px-5 py-4/.test(budget), '...and Add Line pinned in the footer')
ok(!/rounded-xl border border-accent\/40 p-4 sm:p-5 space-y-3/.test(budget), '...and the inline card is gone')

// ─────────────────────────────────────────────────────────────────────────────
// 2c. AND WITH A KEYBOARD UP, IT USES THE PART OF THE SCREEN THAT IS LEFT.
//
// THE BUG. `position: fixed` is laid out against the LAYOUT viewport, which
// does not shrink when a keyboard covers the bottom of the phone. A centred
// dialog therefore centres in the WHOLE screen and puts its own buttons behind
// the keyboard. With `autoFocus` on the first field it happened the instant the
// dialog opened - "it happens when I press this button".
//
// --vv-h / --vv-t come from window.visualViewport, which is the one thing that
// knows. Set here by hand to stand in for a 380px keyboard on an 844px screen.
// ─────────────────────────────────────────────────────────────────────────────
const KEYBOARD = { visible: 464, style: '--vv-h:464px;--vv-t:0px' }

const withKeyboard = measure(column, edges, VIEWPORT.h, KEYBOARD.style)
ok(withKeyboard.panelBottom <= KEYBOARD.visible,
  `with a keyboard up the dialog stays above it (ends at ${withKeyboard.panelBottom} `
  + `of ${KEYBOARD.visible} visible)`)
ok(withKeyboard.submitBottom <= KEYBOARD.visible,
  `...buttons included (${withKeyboard.submitBottom})`)
ok(withKeyboard.titleTop >= 0, `...and the title is still on screen (${withKeyboard.titleTop})`)

// Without the variables it must behave exactly as before - a desktop has no
// visualViewport worth tracking, and a fallback that changed the layout would
// be a regression for everyone who never had this problem.
const noVars = measure(column, edges, VIEWPORT.h)
ok(noVars.panelBottom > KEYBOARD.visible,
  `and with no keyboard it uses the whole screen again (${noVars.panelBottom})`)

// COMMENTS STRIPPED. The rule's own comment explains what `inset: 0` did
// wrong, so the absence check below matched the explanation and failed against
// correct CSS. Exactly what `code()` exists for on the .ts side; there is no
// equivalent for stylesheets, so it is done here.
const globals = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
ok(/\.overlay\s*\{[^}]*height:\s*var\(--vv-h,\s*100%\)/.test(globals),
  'the overlay is as tall as the VISIBLE screen, falling back to all of it')
ok(/\.overlay\s*\{[^}]*top:\s*var\(--vv-t,\s*0px\)/.test(globals),
  '...and starts where the visible screen starts')
ok(!/\.overlay\s*\{[^}]*inset:\s*0/.test(globals),
  '...not `inset: 0`, which is the layout viewport and ignores the keyboard entirely')

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE THING THAT ACTUALLY BLEW THE PAGE OUT: truncated text in a grid.
// `truncate` is white-space: nowrap, so its min-content width is the whole
// unbroken line, and a grid child is min-width:auto and refuses to go below it.
// ─────────────────────────────────────────────────────────────────────────────
const grid = measure(`
<div class="grid grid-cols-7" id="cal">${
  Array.from({ length: 7 }, () =>
    '<div class="min-h-[84px] border-b border-r border-line-soft p-1.5">'
    + '<button class="w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-left">'
    + '<span class="h-1.5 w-1.5 rounded-full shrink-0"></span>'
    + '<span class="text-[11px] font-medium truncate">Permits Approved For The Whole Site</span>'
    + '</button></div>').join('')
}</div>`, `(rect) => {
  const c = rect('#cal')
  return { gridWidth: Math.round(c.width), docWidth: document.documentElement.scrollWidth, vw: window.innerWidth }
}`)
ok(grid.gridWidth <= VIEWPORT.w,
  `a 7-column calendar of truncated labels fits the phone (${grid.gridWidth} of ${VIEWPORT.w})`)
ok(grid.docWidth <= VIEWPORT.w,
  `...and does not widen the document (${grid.docWidth})`)

// ─────────────────────────────────────────────────────────────────────────────
// 4. THE PHONE LOOK STAYS ON THE PHONE. The sweep took the shadow off every
// card and it showed on the desktop, which nobody asked for. The rule is a
// breakpoint - `lg`, where the tab bar becomes a sidebar - and a breakpoint is
// a measurement: the same markup at 390 and at 1280 must come out different.
// ─────────────────────────────────────────────────────────────────────────────
const LOOK = `
<div id="card" class="rounded-2xl border border-line bg-panel lg:rounded-lg lg:shadow-sm">card</div>
<div id="strip" class="scroll-fade flex gap-1 overflow-x-auto">${'<span class="whitespace-nowrap px-3">tab</span>'.repeat(12)}</div>`
const LOOK_PROBE = `(rect) => {
  const cs = s => getComputedStyle(document.querySelector(s))
  const mask = cs('#strip')
  return { shadow: cs('#card').boxShadow, radius: cs('#card').borderRadius,
           mask: mask.maskImage || mask.webkitMaskImage, vw: window.innerWidth }
}`
const onPhone = measure(LOOK, LOOK_PROBE)
const onDesk = measure(LOOK, LOOK_PROBE, 800, '', 1280)
ok(onPhone.vw === 390 && onDesk.vw === 1280, `the two viewports are 390 and 1280 (${onPhone.vw}, ${onDesk.vw})`)
ok(onPhone.shadow === 'none', `a card has no shadow on a phone (${onPhone.shadow})`)
ok(onDesk.shadow !== 'none', `...and its old shadow on a desktop (${onDesk.shadow})`)
ok(parseFloat(onPhone.radius) > parseFloat(onDesk.radius),
  `a card is rounder on a phone than a desktop (${onPhone.radius} vs ${onDesk.radius})`)
ok(/gradient/.test(onPhone.mask), 'a sideways strip fades at its right edge on a phone')
ok(onDesk.mask === 'none', `...and not on a desktop (${onDesk.mask})`)

// ─────────────────────────────────────────────────────────────────────────────
// 5. A TABLE CELL KEEPS ITS WORDS. The Permissions grid on a phone: a w-full
// table of five columns inside a card. With `overflow-wrap: anywhere` on th
// the layout crushed "Create" to Cr / ea / te. Now a header is one line and
// the table scrolls inside its wrapper instead of squeezing.
// ─────────────────────────────────────────────────────────────────────────────
const TABLE = `
<div class="p-6"><div class="p-6"><div id="wrap" class="overflow-x-auto rounded-lg border border-line">
<table id="t" class="w-full text-sm"><thead><tr>
<th class="text-left px-4 py-2.5 min-w-[200px]">Resource</th>
<th id="h" class="text-center px-3 py-2.5">Create</th><th class="px-3 py-2.5">Edit</th><th class="px-3 py-2.5">Delete</th><th class="px-3 py-2.5">View</th>
</tr></thead><tbody><tr><td colspan="5" id="g" class="px-4 py-1.5 text-xs uppercase">Field</td></tr>
<tr><td class="px-4 py-2">Daily Logs</td><td>x</td><td>x</td><td>x</td><td>x</td></tr></tbody></table></div></div></div>`
const tbl = measure(TABLE, `(rect) => ({
  th: Math.round(rect('#h').height), g: Math.round(rect('#g').height),
  table: Math.round(rect('#t').width), wrap: Math.round(rect('#wrap').width),
  doc: document.documentElement.scrollWidth })`)
ok(tbl.th <= 40, `a column header is one line on a phone (${tbl.th}px tall)`)
ok(tbl.g <= 30, `a group label is one line, not one letter (${tbl.g}px tall)`)
ok(tbl.table > tbl.wrap, `the table is wider than its box (${tbl.table} in ${tbl.wrap}) and scrolls there`)
ok(tbl.doc <= VIEWPORT.w, `...and the page itself does not widen (${tbl.doc})`)

// ─────────────────────────────────────────────────────────────────────────────
// 6. A FIELD UNDER 16px MAKES iOS ZOOM THE PAGE. Zoom shrinks the visual
// viewport and pans it, while `position: fixed` is laid out against the layout
// viewport - so the top bar goes under the status bar and the tab bar slides
// sideways ("me" where it says "Home"). globals.css has carried a rule against
// this from the start and it did NOTHING: Tailwind 3 emits @layer base as
// plain CSS, so `.text-sm` beat `input` on specificity. Measured, because
// specificity is exactly the thing you cannot check by reading.
// ─────────────────────────────────────────────────────────────────────────────
const FIELDS = `
<input id="i" class="h-8 text-sm w-36" placeholder="Link to product">
<textarea id="t" class="text-xs"></textarea>
<select id="s" class="text-[13px]"><option>x</option></select>`
const FIELD_PROBE = `(rect) => {
  const px = s => parseFloat(getComputedStyle(document.querySelector(s)).fontSize)
  return { input: px('#i'), textarea: px('#t'), select: px('#s'), vw: window.innerWidth }
}`
const fieldPhone = measure(FIELDS, FIELD_PROBE)
ok(fieldPhone.input >= 16, `an input with text-sm is 16px on a phone (${fieldPhone.input}px) - under it, iOS zooms`)
ok(fieldPhone.textarea >= 16, `...a textarea too (${fieldPhone.textarea}px)`)
ok(fieldPhone.select >= 16, `...and a select, which opens its own picker (${fieldPhone.select}px)`)

const fieldDesk = measure(FIELDS, FIELD_PROBE, 800, '', 1280)
ok(fieldDesk.vw === 1280 && fieldDesk.input < 16,
  `a mouse-driven desktop keeps its denser fields (${fieldDesk.input}px at ${fieldDesk.vw})`)

// ─────────────────────────────────────────────────────────────────────────────
// 7. THE SHELL IS THE SCREEN YOU CAN SEE. After the keyboard closed, the app
// was drawn a keyboard-height too high with bare background below it. The
// webview had scrolled - its frame shrank for the keyboard while the document
// was still a whole screen tall - and when the frame came back there was no
// scroll left to undo it. The fix is that there is never anything to scroll:
// the shell is `--vv-h`, so the document cannot be taller than the visible
// strip. That is a height, so it is measured.
// ─────────────────────────────────────────────────────────────────────────────
const SHELL = `
<div id="shell" class="h-app overflow-hidden flex flex-col">
  <div class="h-14 shrink-0"></div>
  <div class="flex-1 min-h-0 overflow-y-auto">${'<p>a line of the page</p>'.repeat(120)}</div>
</div>`
// `scrollHeight` alone says nothing here - it is floored at the viewport, so it
// reads 844 whether the shell is 605 or 844. The scrollable OVERFLOW is the
// number that matters: zero means there is no scroll for a webview to strand.
const SHELL_PROBE = `(rect) => {
  const d = document.documentElement
  return {
    shell: Math.round(rect('#shell').height),
    bottom: Math.round(rect('#shell').bottom),
    overflow: d.scrollHeight - d.clientHeight,
    vh: window.innerHeight,
  }
}`
const shellKeyboard = measure(SHELL, SHELL_PROBE, VIEWPORT.h, '--vv-h: 605px')
ok(shellKeyboard.shell === 605, `the shell is the visible strip, not the whole screen (${shellKeyboard.shell} of ${shellKeyboard.vh})`)
ok(shellKeyboard.bottom <= 605 && shellKeyboard.overflow === 0,
  `...nothing hangs below it and there is no scroll to strand (ends ${shellKeyboard.bottom}, overflow ${shellKeyboard.overflow})`)

const shellFull = measure(SHELL, SHELL_PROBE)
ok(shellFull.shell === shellFull.vh, `with no keyboard it is the whole screen (${shellFull.shell} of ${shellFull.vh})`)
ok(shellFull.overflow === 0, `...and still nothing to scroll (overflow ${shellFull.overflow})`)

// ─────────────────────────────────────────────────────────────────────────────
// 8. A 16px FIELD NEEDS A BOX WORTH 16px. Forcing the anti-zoom size (§6) put
// 16px text into h-8 boxes beside 12px labels, and it read as enormous. The
// field cannot shrink - 16px is the floor - so the box grows to the 44px touch
// target. Not the checkbox, which is not a touch target at 44px, it is absurd.
// ─────────────────────────────────────────────────────────────────────────────
const BOXES = `
<input id="i" class="h-8 text-sm w-36" placeholder="Link to product">
<textarea id="t" class="h-8 text-xs"></textarea>
<select id="s" class="h-8 text-[13px]"><option>x</option></select>
<input id="c" type="checkbox" class="h-4 w-4">`
const BOX_PROBE = `(rect) => ({
  input: Math.round(rect('#i').height), textarea: Math.round(rect('#t').height),
  select: Math.round(rect('#s').height), check: Math.round(rect('#c').height),
  vw: window.innerWidth,
})`
const boxPhone = measure(BOXES, BOX_PROBE)
ok(boxPhone.input >= 44, `an h-8 field is a 44px box on a phone (${boxPhone.input}px)`)
ok(boxPhone.textarea >= 44 && boxPhone.select >= 44,
  `...so are a textarea and a select (${boxPhone.textarea}, ${boxPhone.select})`)
ok(boxPhone.check < 44, `...and a checkbox is left alone (${boxPhone.check}px)`)
const boxDesk = measure(BOXES, BOX_PROBE, 800, '', 1280)
ok(boxDesk.input < 44, `a desktop keeps its compact fields (${boxDesk.input}px at ${boxDesk.vw})`)

// ─────────────────────────────────────────────────────────────────────────────
// 9. A ROW OF CONTROLS REACHES BOTH EDGES. Rows of buttons and fields were
// `flex flex-wrap`, so each control was as wide as its own label: Budget's
// toolbar came out "Import Estimate | Use Template" / "Save as Template |
// Select" / "Add Line" - three rows, three widths, none of them meeting the
// right edge. `.row-even` makes two share the row and an odd last one take it
// whole. Widths and edges, so it is measured rather than read.
// ─────────────────────────────────────────────────────────────────────────────
const ROW = `
<div class="p-6"><div id="row" class="row-even lg:flex lg:flex-wrap items-center gap-2">
  <button id="b1" class="px-3 py-2 border">Import Estimate</button>
  <button id="b2" class="px-3 py-2 border">Use Template</button>
  <button id="b3" class="px-3 py-2 border">Save as Template</button>
  <button id="b4" class="px-3 py-2 border">Select</button>
  <button id="b5" class="px-3 py-2 border">Add Line</button>
</div></div>`
const ROW_PROBE = `(rect) => {
  const b = n => { const r = rect('#b' + n); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width) } }
  const row = rect('#row')
  return { row: { l: Math.round(row.left), r: Math.round(row.right), w: Math.round(row.width) },
           b: [1, 2, 3, 4, 5].map(b), vw: window.innerWidth }
}`
const rowPhone = measure(ROW, ROW_PROBE)
const [p1, p2, p3, p4, p5] = rowPhone.b
ok(p1.w === p2.w && p3.w === p4.w, `two controls share the row at equal width (${p1.w} and ${p2.w})`)
ok(p1.l === rowPhone.row.l && p2.r === rowPhone.row.r,
  `...and between them they reach both edges (${p1.l}-${p2.r} of ${rowPhone.row.l}-${rowPhone.row.r})`)
ok(p1.t === p2.t && p3.t === p4.t && p5.t > p3.t && p3.t > p1.t,
  'five controls sit on three rows, two and two and one')
ok(p5.w === rowPhone.row.w, `the odd one takes the whole row rather than leaving a hole (${p5.w} of ${rowPhone.row.w})`)

const rowDesk = measure(ROW, ROW_PROBE, 800, '', 1280)
const [d1, d2,, , d5] = rowDesk.b
ok(rowDesk.vw === 1280 && d1.w !== d2.w && d1.t === d5.t,
  `a desktop keeps the flex row it always had - one line, natural widths (${d1.w} vs ${d2.w})`)

// ─────────────────────────────────────────────────────────────────────────────
// 10. A DIALOG FOOTER OF THREE. Edit Item has Delete, Cancel and Save Changes.
// The two on the right sat in their own wrapper so a desktop could push them
// there - and that wrapper had been given `.row-even` too, so it was a grid
// inside one cell of the footer's grid: each button got a QUARTER of the
// dialog, and `Save Changes` may not wrap, so it ran out of both sides of its
// own button. Below lg the wrapper is `contents` and all three share the row.
// ─────────────────────────────────────────────────────────────────────────────
const FOOTER = `
<div class="w-full max-w-md">
  <div id="foot" class="flex flex-col-reverse gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
    <button id="del" class="flex items-center gap-1.5 self-start text-sm">Delete</button>
    <div id="acts" class="row-even lg:flex lg:flex-wrap gap-2 justify-end">
      <button id="cancel" class="whitespace-nowrap rounded-md px-4 py-2 text-sm">Cancel</button>
      <button id="save" class="whitespace-nowrap rounded-md px-4 py-2 text-sm">Save Changes</button>
    </div>
  </div>
</div>`
const FOOTER_PROBE = `(rect) => {
  const el = s => document.querySelector(s)
  const box = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), w: Math.round(r.width) } }
  const fits = s => el(s).scrollWidth <= el(s).clientWidth + 1
  return { acts: box('#acts'), del: box('#del'), cancel: box('#cancel'), save: box('#save'),
           saveFits: fits('#save'), cancelFits: fits('#cancel') }
}`
const foot = measure(FOOTER, FOOTER_PROBE)
ok(foot.saveFits && foot.cancelFits, 'every label fits inside its own button')
ok(foot.cancel.t === foot.save.t && foot.cancel.w === foot.save.w,
  `Cancel and Save share a row at equal width (${foot.cancel.w} and ${foot.save.w})`)
ok(foot.cancel.l === foot.acts.l && foot.save.r === foot.acts.r,
  `...reaching both edges (${foot.cancel.l}-${foot.save.r} of ${foot.acts.l}-${foot.acts.r})`)
ok(foot.del.t > foot.save.t, 'the destructive one is on its own row, under the two choices')

// ─────────────────────────────────────────────────────────────────────────────
// 9. A NOTICE IS ABOVE THE KEYBOARD, AND DOES NOT BLOCK THE FIELD IT IS ABOUT.
//
// Both reports that produced this component were typing into a field with the
// keyboard up. A message that lands under the keyboard has not been shown, and
// a message that swallows taps stops you fixing what it is complaining about -
// which is why it is a dock and not an overlay.
// ─────────────────────────────────────────────────────────────────────────────
const DOCK = `
<div class="notice-dock" id="dock">
  <div id="card" class="pointer-events-auto mt-2 flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-danger/40 bg-danger-tint px-4 py-3 shadow-lg lg:rounded-xl">
    <p class="break-words text-sm text-ink-soft">That is a negative allowance. Enter a positive number.</p>
  </div>
</div>`
const DOCK_PROBE = `(rect) => {
  const card = rect('#card')
  const dock = document.querySelector('#dock')
  return {
    bottom: Math.round(card.bottom), top: Math.round(card.top), width: Math.round(card.width),
    dockEvents: getComputedStyle(dock).pointerEvents,
    cardEvents: getComputedStyle(document.querySelector('#card')).pointerEvents,
    dockHeight: Math.round(dock.getBoundingClientRect().height),
  }
}`
const dock = measure(DOCK, DOCK_PROBE, VIEWPORT.h, KEYBOARD.style)
ok(dock.bottom <= KEYBOARD.visible,
  `with a keyboard up the notice stays above it (ends at ${dock.bottom} of ${KEYBOARD.visible} visible)`)
ok(dock.dockHeight === KEYBOARD.visible,
  `...because the dock is the VISIBLE strip, not the layout viewport (${dock.dockHeight})`)
ok(dock.dockEvents === 'none' && dock.cardEvents === 'auto',
  'the dock lets taps through to the field underneath; only the card itself takes them')
ok(dock.top < dock.bottom && dock.width > 0 && dock.width <= VIEWPORT.w - 32,
  `...and the card keeps a gutter on a phone (${dock.width} of ${VIEWPORT.w})`)

const dockFull = measure(DOCK, DOCK_PROBE)
ok(dockFull.bottom < VIEWPORT.h - 64,
  `with no keyboard it still clears the tab bar (ends at ${dockFull.bottom} of ${VIEWPORT.h})`)

// ─────────────────────────────────────────────────────────────────────────────
// 11. THE RAIL AND THE CONTENT ARE ONE NUMBER.
//
// The sidebar's width was `w-60` and the content column's left padding was
// `lg:pl-60` - the same measurement in two files, and (dashboard)/layout.tsx is
// a Server Component, so no React state could ever have kept them together.
// They now both read `--sidebar-w`, which is exactly the kind of claim that is
// worth nothing until a browser has laid it out: what is being asserted is that
// the content's left edge lands ON the rail's right edge, at both widths, with
// no gap and no overlap.
// ─────────────────────────────────────────────────────────────────────────────
const RAIL = `
<div id="shell" class="app-shell flex h-app overflow-hidden bg-surface">
  <aside id="rail" class="app-sidebar hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-panel border-r border-line">
    <div class="sidebar-head flex h-16 items-center justify-between gap-2 px-5 border-b border-line shrink-0">
      <span class="nav-label">SYTENAV</span>
      <button id="toggle" class="hidden lg:flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
        <span class="sidebar-toggle-icon h-4 w-4 block">&lt;</span>
      </button>
    </div>
    <nav class="flex-1 overflow-y-auto py-4 px-3 space-y-1">
      <a id="row" class="nav-row flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium" title="Dashboard">
        <span id="icon" class="h-4 w-4 shrink-0 block">D</span>
        <span id="label" class="nav-label">Dashboard</span>
      </a>
    </nav>
  </aside>
  <aside id="drawer" class="lg:hidden fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-panel">
    <a class="nav-row flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium">
      <span class="h-4 w-4 shrink-0 block">D</span>
      <span id="dlabel" class="nav-label">Dashboard</span>
    </a>
  </aside>
  <div id="content" class="app-content flex flex-1 flex-col min-w-0 min-h-0">
    <main id="main" class="flex-1 min-h-0 overflow-y-auto"><div class="p-6">Content</div></main>
  </div>
</div>`

const RAIL_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return r ? { l: Math.round(r.left), r: Math.round(r.right),
    w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top) } : null }
  const label = document.querySelector('#label')
  return { rail: b('#rail'), content: b('#main'), drawer: b('#drawer'), row: b('#row'), icon: b('#icon'),
           labelWidth: Math.round(label.getBoundingClientRect().width),
           drawerLabel: Math.round(document.querySelector('#dlabel').getBoundingClientRect().width),
           labelDisplay: getComputedStyle(label).display,
           vw: window.innerWidth }
}`

const open = measure(RAIL, RAIL_PROBE, 800, '', 1280)
ok(open.vw === 1280, `laid out on a desktop (${open.vw})`)
ok(open.rail.w === 240, `the rail is its full width when open (${open.rail.w})`)
ok(open.content.l === open.rail.r,
  `the content starts exactly where the rail ends (${open.content.l} vs ${open.rail.r})`)

const shut = measure(`<div class="sidebar-collapsed">${RAIL}</div>`, RAIL_PROBE, 800, '', 1280)
ok(shut.rail.w === 72, `collapsed, the rail is a 72px column of icons (${shut.rail.w})`)
ok(shut.content.l === shut.rail.r,
  `...and the content follows it in, still flush (${shut.content.l} vs ${shut.rail.r})`)
ok(shut.content.w - open.content.w === 168,
  `...which is 168px of screen handed back (${open.content.w} to ${shut.content.w})`)

// The label is CLIPPED, not removed. `display: none` would take the link's
// accessible name with it and a screen reader would read out the href instead.
ok(shut.labelDisplay !== 'none' && shut.labelWidth <= 1,
  `the label is clipped rather than dropped (display ${shut.labelDisplay}, ${shut.labelWidth}px wide)`)

// An icon alone in a 72px column has to be in the middle of it.
const iconMid = shut.icon.l + shut.icon.w / 2
ok(Math.abs(iconMid - (shut.rail.l + shut.rail.w / 2)) <= 1,
  `the icon is centred in the rail (${Math.round(iconMid)} of ${shut.rail.w / 2})`)
ok(shut.row.h >= 40, `and the row is still a real target (${shut.row.h}px)`)

// The phone knows nothing about any of this - the rules are `screen and
// (min-width: 1024px)`, so a flag set on a desktop cannot follow somebody onto
// their phone and give them a 72px drawer.
const phone = measure(`<div class="sidebar-collapsed">${RAIL}</div>`, RAIL_PROBE)
ok(phone.drawer.w === 288, `on a phone the drawer is untouched (${phone.drawer.w})`)
ok(phone.content.l === 0, `...and the content has no rail to clear (${phone.content.l})`)
ok(phone.drawerLabel > 1,
  `...and the drawer's labels are words, not icons (${phone.drawerLabel}px)`)

// ─────────────────────────────────────────────────────────────────────────────
// 12. A SECTION'S MENU IS NOT CLIPPED BY THE ROW IT HANGS FROM.
//
// The project tab strip lost its second row: the pages of the active section
// now live on a menu under each section button. The row used to be
// `overflow-x-auto`, and `overflow-x: auto` establishes a clipping box on BOTH
// axes - so a panel positioned below a button inside that row is sliced off at
// the row's bottom edge, which is a menu that opens and shows nothing.
//
// Read as source this is invisible: every class on the panel is individually
// correct. So it is measured.
// ─────────────────────────────────────────────────────────────────────────────
const STRIP = (rowClasses: string) => `
<div class="border-b border-line bg-panel">
  <nav id="row" class="hidden sm:flex ${rowClasses} px-4 sm:px-6 gap-1">
    <a class="flex shrink-0 items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-semibold">Overview</a>
    <div class="relative shrink-0">
      <button id="btn" class="flex w-full items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-semibold">
        Finance <span class="h-3.5 w-3.5 block">v</span>
      </button>
      <div id="menu" role="menu" class="absolute left-0 top-full z-30 max-h-[70vh] min-w-[15rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-b-xl rounded-tr-xl border border-line bg-panel py-1.5 shadow-xl">
        ${'<a class="flex items-center gap-2.5 px-3.5 py-2 text-sm"><span class="h-4 w-4 shrink-0 block">i</span><span class="flex-1 whitespace-nowrap">Billing the client</span></a>'.repeat(10)}
      </div>
    </div>
    <div class="relative shrink-0"><button class="flex w-full items-center gap-1.5 rounded-t-lg px-3.5 py-2.5 text-sm font-semibold">Docs</button></div>
  </nav>
</div>
<div class="p-6">The page underneath</div>`

const MENU_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right),
    t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
  const menu = document.querySelector('#menu')
  const items = menu.querySelectorAll('a')
  const last = items[items.length - 1].getBoundingClientRect()
  // CLIPPING IS A PAINT OPERATION. A panel cut off by an ancestor's overflow
  // still reports its full bounding rect, so measuring the panel proves
  // nothing at all - the question is whether the browser would hand a click at
  // that point to the menu or to the page behind it.
  const at = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)
  return { row: b('#row'), btn: b('#btn'), menu: b('#menu'),
           lastItemReachable: !!(at && at.closest('#menu')),
           lastItemTop: Math.round(last.top),
           vw: window.innerWidth, vh: window.innerHeight }
}`

const strip = measure(STRIP('flex-wrap'), MENU_PROBE, 800, '', 1280)
ok(strip.menu.t === strip.btn.b,
  `the menu starts where the button ends, with no gap for a pointer to fall through (${strip.menu.t} vs ${strip.btn.b})`)
ok(strip.menu.h > strip.row.h,
  `the menu is taller than the row it hangs from (${strip.menu.h} vs ${strip.row.h})`)
ok(strip.lastItemTop > strip.row.b,
  `...so its last page sits well below the row's own bottom edge (${strip.lastItemTop} vs ${strip.row.b})`)
ok(strip.lastItemReachable,
  'THE POINT: a click down there lands on the menu, not on the page behind it')
ok(strip.menu.b <= strip.vh, `...and still fits on the screen (${strip.menu.b} of ${strip.vh})`)
ok(strip.menu.l >= 0 && strip.menu.r <= strip.vw,
  `...and does not run off either edge (${strip.menu.l}-${strip.menu.r} of ${strip.vw})`)
ok(strip.menu.w >= 240, `a menu row's label is not squashed (${strip.menu.w}px wide)`)

// The shape it must never go back to, measured beside it. Without this the
// assertion above could be passing for some other reason entirely.
const clipped = measure(STRIP('overflow-x-auto scrollbar-hide'), MENU_PROBE, 800, '', 1280)
ok(!clipped.lastItemReachable,
  'and an overflow-x-auto row really does cut it off - the same markup, the same '
  + 'rectangle, and nothing there to click')

// ─────────────────────────────────────────────────────────────────────────────
// 13. A SIDE DRAWER IS THE HEIGHT OF WHAT YOU CAN SEE.
//
// The task detail used to be docked in the layout - under the whole board on a
// desktop, permanently, so the board was squeezed to half its height whether or
// not anything was open. It is a drawer now, on `.overlay-drawer`.
//
// Why that class exists rather than another hand-rolled one: a drawer written
// by hand is `fixed top-0 right-0 h-full`, and `h-full` is 100% of the LAYOUT
// viewport - which does not shrink for a keyboard and knows nothing about the
// notch. So its close button ends up under the Dynamic Island and its footer
// behind the keyboard, which is the same pair of bugs the bottom sheet had.
// ─────────────────────────────────────────────────────────────────────────────
// The entrance animation is switched off for the measurement - in `measure()`,
// for every drawer and sheet alike - and that is not dodging it: `translateX(100%)` is where the drawer STARTS, and headless
// Chromium dumps the DOM at a moment when it is still there - so every number
// below came out exactly one panel-width to the right. What is being asserted
// is where the drawer comes to REST. That the animation exists at all, and is
// inside a `prefers-reduced-motion` guard, is checked as source shape instead.
const DRAWER = (panelStyle = '') => `
<div class="overlay-drawer bg-black/40" data-overlay>
  <div id="panel" style="${panelStyle}" class="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl">
    <div id="head" class="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
      <span class="text-sm font-semibold text-ink">Task detail</span>
      <button id="closeX" class="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg"><span class="h-5 w-5 block">X</span></button>
    </div>
    <div id="body" class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="px-4 py-4 space-y-3">${'<p class="text-sm">A note on this task.</p>'.repeat(30)}
        <button id="send" class="rounded-md px-4 py-2 text-sm">Add note</button>
      </div>
    </div>
  </div>
</div>`

const DRAWER_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right),
    t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
  const body = document.querySelector('#body')
  return { panel: b('#panel'), close: b('#closeX'), body: b('#body'), head: b('#head'),
           scrolls: body.scrollHeight > body.clientHeight,
           docWidth: document.documentElement.scrollWidth,
           vw: window.innerWidth, vh: window.innerHeight }
}`

const drawerPhone = measure(DRAWER(), DRAWER_PROBE)
ok(drawerPhone.panel.w === VIEWPORT.w,
  `on a phone the drawer is the whole screen, never a strip at the bottom (${drawerPhone.panel.w} of ${VIEWPORT.w})`)
ok(drawerPhone.panel.r === VIEWPORT.w, `...flush to the right edge (${drawerPhone.panel.r})`)
// `>= 0` USED TO BE THIS ASSERTION, and it is the reason the next bug got
// through: a close button at y=0 is "on the screen" and is also underneath the
// status bar. Reported as "the top is too squished so won't x".
//
// `.overlay-sheet` was given a padding-top the day a sheet's close button
// ended up under the Dynamic Island (section 1). `.overlay-drawer` is that
// class one axis over and never got the same treatment - it padded only its
// LEFT - so the panel began at y=0 and the header row spent its first 59
// points under the status bar. The insets go on the PANEL here rather than the
// container the way `.overlay` does it: a drawer below sm IS the screen, so
// padding the container would leave a bare strip above the drawer instead of
// the drawer.
//
// `env()` is 0 in this browser, so what is measured is the `max()` FLOOR -
// which is exactly why the floor is there. See the note at the top of the file.
ok(drawerPhone.close.b <= VIEWPORT.h,
  `...and its close button is on the screen (${drawerPhone.close.t}-${drawerPhone.close.b})`)
ok(drawerPhone.head.t >= 8,
  `THE FIX: the header begins below the top inset, not at the very edge (${drawerPhone.head.t})`)
ok(drawerPhone.close.t >= 8,
  `...so the whole Close target is clear of it (${drawerPhone.close.t})`)
ok(drawerPhone.body.b <= drawerPhone.panel.b - 8,
  `and the bottom inset comes OUT of the height rather than overflowing it `
  + `(${drawerPhone.body.b} vs ${drawerPhone.panel.b})`)

// The reported shape, same markup, the insets removed - so the three above
// cannot be passing for some other reason.
const squished = measure(DRAWER('padding-top:0;padding-bottom:0'), DRAWER_PROBE)
ok(squished.head.t === 0,
  'the reported bug, measured: with no inset the header sits at y=0, under the status bar')
ok(drawerPhone.head.t - squished.head.t === 8,
  `...and the inset is what moved it - the whole header, Close button and all, `
  + `shifts down by exactly the floor (${squished.close.t} -> ${drawerPhone.close.t})`)
ok(drawerPhone.close.h >= 44, `...at a size a thumb can hit (${drawerPhone.close.h}px)`)
ok(drawerPhone.scrolls, 'a long task scrolls INSIDE the drawer rather than off the end of it')
ok(drawerPhone.docWidth <= VIEWPORT.w, `and nothing hangs off the side (${drawerPhone.docWidth})`)

const drawerDesk = measure(DRAWER(), DRAWER_PROBE, 800, '', 1280)
ok(drawerDesk.panel.w === 448, `on a desktop it is a 28rem panel (${drawerDesk.panel.w})`)
ok(drawerDesk.panel.r === 1280, `...still flush right (${drawerDesk.panel.r} of 1280)`)
ok(drawerDesk.panel.l > 0,
  `...leaving the board visible beside it (${drawerDesk.panel.l}px of page showing) - `
  + 'which is the whole point: it used to sit IN the layout and squeeze the board')

// THE REASON THE CLASS EXISTS. `h-full` would be the layout viewport, which
// does not shrink for a keyboard, so the panel would run underneath it.
const drawerKeyboard = measure(DRAWER(), DRAWER_PROBE, VIEWPORT.h, KEYBOARD.style)
ok(drawerKeyboard.panel.b <= KEYBOARD.visible,
  `with a keyboard up the drawer ends above it (${drawerKeyboard.panel.b} of ${KEYBOARD.visible} visible)`)
ok(drawerKeyboard.close.t >= 0, `...and its close button is still reachable (${drawerKeyboard.close.t})`)

// ─────────────────────────────────────────────────────────────────────────────
// 16. AN INSPECTION CARD'S MENU IS NOT CLIPPED BY THE CARD.
//
// Same fault as section 12, one container over, and this one is the reason the
// inspections card had to lose `overflow-hidden`. The card's action row ends in
// a RowMenu whose panel is `absolute` inside the card, and `overflow-hidden`
// clips on BOTH axes - so the panel, which hangs off the LAST row of the card,
// would be sliced off entirely. Not shortened: gone.
//
// It cannot be read off the source, because every class on the panel is
// individually correct and the panel still reports its full rectangle. So the
// two shapes are laid out side by side and asked the browser.
// ─────────────────────────────────────────────────────────────────────────────
const CARD = (wrapper: string) => `
<div class="p-6 space-y-4">
  <div id="card" class="${wrapper}">
    <button class="w-full flex items-center gap-4 rounded-t-xl px-5 py-4 text-left">
      <span class="flex-1 min-w-0"><span class="font-semibold text-ink">Drywall</span></span>
    </button>
    <div class="border-t border-line-soft px-5 py-5 space-y-4">
      <p class="text-sm text-muted-fg">Needed by Sep 16, 2026</p>
      <div id="row" class="row-even lg:flex lg:items-center gap-2">
        <button class="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-medium">Book it</button>
        <div class="lg:ml-auto flex justify-end">
          <div class="relative shrink-0">
            <button id="btn" class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line">…</button>
            <div id="menu" role="menu" class="absolute right-0 z-20 mt-1 overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-lg max-w-[calc(100vw-2rem)] min-w-[13rem]">
              ${'<button class="flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left text-sm font-medium">Edit inspection</button>'.repeat(5)}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`

const CARD_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right),
    t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
  const menu = document.querySelector('#menu')
  const items = menu.querySelectorAll('button')
  const last = items[items.length - 1].getBoundingClientRect()
  const at = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)
  return { card: b('#card'), menu: b('#menu'), btn: b('#btn'),
           lastItemReachable: !!(at && at.closest('#menu')),
           lastItemTop: Math.round(last.top),
           docWidth: Math.ceil(document.documentElement.scrollWidth),
           vw: window.innerWidth }
}`

const OPEN_CARD = 'rounded-xl border border-line bg-panel'
for (const [where, width] of [['a phone', VIEWPORT.w], ['a desktop', 1280]] as const) {
  const card = measure(CARD(OPEN_CARD), CARD_PROBE, 800, '', width)
  ok(card.menu.h > 100, `${where}: the menu really rendered (${card.menu.h}px, fixture sanity)`)
  ok(card.lastItemTop > card.card.b,
    `${where}: its last item sits below the card's own bottom edge (${card.lastItemTop} vs ${card.card.b})`)
  ok(card.lastItemReachable,
    `${where}: THE POINT - a click down there lands on the menu, not on the page behind it`)
  ok(card.menu.l >= 0 && card.menu.r <= card.vw,
    `${where}: and it does not run off either edge (${card.menu.l}-${card.menu.r} of ${card.vw})`)
  ok(card.docWidth <= width, `${where}: and the row adds no sideways scroll (${card.docWidth} of ${width})`)
}

// The shape it must never go back to, measured beside it - without this the
// assertion above could be passing for some other reason entirely.
const clippedCard = measure(CARD(`${OPEN_CARD} overflow-hidden`), CARD_PROBE, 800, '', 1280)
ok(!clippedCard.lastItemReachable,
  'and overflow-hidden on the card really does cut the menu off - the same markup, '
  + 'the same rectangle, and nothing there to click')

// ─────────────────────────────────────────────────────────────────────────────
// 17. THE INSPECTION CARD READS IN TWO COLUMNS ON A WIDE SCREEN.
//
// Reported against a ~1550px card: every band was a strip of text with a
// quarter-mile of nothing to its right. The body is now facts on the left and
// a 24rem panel on the right, with the action row under both - and below `lg`
// it stacks, because a 24rem sidebar on a 390px phone is not a sidebar.
//
// Measured rather than read, because `grid-template-columns` written correctly
// and then beaten by something else looks identical in the source.
// ─────────────────────────────────────────────────────────────────────────────
const BODY = `
<div class="p-6">
  <div class="rounded-xl border border-line bg-panel">
    <div id="body" class="border-t border-line-soft px-5 py-5 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6 lg:items-start">
      <div id="facts" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 text-sm min-w-0">
        <div><p class="text-xs text-faint">Needed by</p><p class="font-medium text-ink-soft">Sep 16, 2026</p></div>
        <div><p class="text-xs text-faint">Scheduler</p><p class="font-medium text-ink-soft">Office Staff</p></div>
        <div><p class="text-xs text-faint">Requested by</p><p class="font-medium text-ink-soft">Admin User</p></div>
        <div id="notes" class="col-span-full"><p class="text-xs text-faint">Notes</p><p class="font-medium text-ink-soft whitespace-nowrap">QA-0909-RETEST2 a very long line the inspector dictated that nobody would ever break</p></div>
      </div>
      <div id="aside" class="flex flex-col gap-4 min-w-0">
        <div class="rounded-lg border border-line bg-surface px-3 py-3">
          <p class="text-xs font-semibold text-ink-soft">Somebody has to call this in</p>
          <p class="text-xs text-muted-fg">SyteNav does not contact the inspector.</p>
        </div>
      </div>
      <div id="actions" class="row-even lg:col-span-2 lg:flex lg:items-center gap-2">
        <button class="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm font-medium">Book it</button>
        <div class="flex justify-end lg:justify-start">
          <button class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line">…</button>
        </div>
      </div>
    </div>
  </div>
</div>`

const BODY_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right),
    t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
  return { body: b('#body'), facts: b('#facts'), aside: b('#aside'),
           actions: b('#actions'), notes: b('#notes'),
           docWidth: Math.ceil(document.documentElement.scrollWidth), vw: window.innerWidth }
}`

const wide = measure(BODY, BODY_PROBE, 800, '', 1280)
ok(wide.aside.w === 384, `on a desktop the right column is 24rem (${wide.aside.w})`)
ok(wide.aside.l > wide.facts.r,
  `THE POINT: the panel sits BESIDE the facts, not under them (aside starts ${wide.aside.l}, facts end ${wide.facts.r})`)
ok(wide.aside.t === wide.facts.t,
  `...and the two columns start on the same line (${wide.aside.t} vs ${wide.facts.t})`)
ok(wide.actions.t > wide.facts.b, `the action row is under the columns, not beside them (${wide.actions.t})`)
ok(wide.actions.l === wide.facts.l && wide.actions.r === wide.aside.r,
  `...and runs under BOTH of them, edge to edge (${wide.actions.l}-${wide.actions.r} vs `
  + `facts from ${wide.facts.l} and aside to ${wide.aside.r})`)
// The tracks are written `minmax(0,1fr)` rather than `1fr` because a grid child
// is `min-width: auto` and a long unbroken value can push a column past its
// share. NOT ASSERTED HERE, and deliberately: this app sets `overflow-wrap:
// anywhere` on prose, which drives min-content to zero, so the fixture measures
// the same either way and a test that cannot fail is a guess about what it
// covers. The form is a convention, ratcheted as source in inspection-booking.ts.
ok(wide.docWidth <= 1280, `and nothing hangs off the side (${wide.docWidth} of 1280)`)

const narrow = measure(BODY, BODY_PROBE, 800, '', VIEWPORT.w)
ok(narrow.aside.t > narrow.facts.b,
  `on a phone the two stack (aside at ${narrow.aside.t}, facts end ${narrow.facts.b})`)
ok(narrow.aside.w === narrow.facts.w,
  `...both the full width of the card (${narrow.aside.w} and ${narrow.facts.w})`)
ok(narrow.docWidth <= VIEWPORT.w, `and the phone does not scroll sideways (${narrow.docWidth} of ${VIEWPORT.w})`)

// ─────────────────────────────────────────────────────────────────────────────
// 18. A ROW MENU NEAR THE BOTTOM DOES NOT HIDE BEHIND THE TAB BAR.
//
// Reported as "I can't scroll down to see the whole card". The panel was
// `absolute z-20`, always below the trigger, with no flip and no idea how much
// room was left. The phone tab bar is `fixed bottom-0 z-30`, so a menu opened
// near the bottom painted UNDER it and its last items - Void, in the case
// reported - could not be reached at all. Scrolling does not help: the bar is
// pinned to the viewport, so the items stay behind it wherever you scroll to.
//
// Stacking is a paint operation, like the clipping in section 16: the covered
// panel still reports its full rectangle. So the question is only ever whether
// the browser would hand a click at that point to the menu or to the bar.
// ─────────────────────────────────────────────────────────────────────────────
const BOTTOM_MENU = (panel: string) => `
<div class="p-6" style="padding-top:560px">
  <div class="rounded-xl border border-line bg-panel">
    <div class="px-5 py-5">
      <div class="row-even lg:flex gap-2">
        <button class="inline-flex h-11 items-center rounded-md px-3 text-sm">Book it</button>
        <div class="flex justify-end">
          <div class="relative shrink-0">
            <button id="btn" class="inline-flex h-11 w-11 items-center justify-center rounded-md border border-line">…</button>
            <div id="menu" role="menu" class="${panel} overflow-hidden rounded-xl border border-line bg-panel py-1 shadow-lg max-w-[calc(100vw-2rem)] min-w-[13rem] right-0">
              ${'<button class="flex w-full min-h-11 items-center px-3 py-2 text-left text-sm">Item</button>'.repeat(5)}
              <button id="last" class="flex w-full min-h-11 items-center px-3 py-2 text-left text-sm">Void inspection</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<nav data-bottom-nav class="fixed bottom-0 inset-x-0 z-30 border-t border-line bg-panel" style="height:64px"></nav>`

const BOTTOM_PROBE = `(rect) => {
  const b = s => { const r = rect(s); return { l: Math.round(r.left), r: Math.round(r.right),
    t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
  const last = document.querySelector('#last').getBoundingClientRect()
  const at = document.elementFromPoint(last.left + last.width / 2, last.top + last.height / 2)
  return { menu: b('#menu'), btn: b('#btn'), nav: b('[data-bottom-nav]'),
           lastReachable: !!(at && at.closest('#menu')),
           lastBottom: Math.round(last.bottom), vh: window.innerHeight }
}`

// What the component does now: flipped above the trigger, and z-40.
const flipped = measure(BOTTOM_MENU('absolute z-40 bottom-full mb-1'), BOTTOM_PROBE, VIEWPORT.h, '', VIEWPORT.w)
ok(flipped.nav.b === flipped.vh, `the tab bar really is parked at the bottom (${flipped.nav.b} of ${flipped.vh}, fixture sanity)`)
ok(flipped.menu.b <= flipped.btn.t, `the menu opens ABOVE the trigger (${flipped.menu.b} vs ${flipped.btn.t})`)
ok(flipped.lastBottom <= flipped.nav.t,
  `...so its last item clears the tab bar (${flipped.lastBottom} vs ${flipped.nav.t})`)
ok(flipped.lastReachable,
  'THE POINT: a click on the last item lands on the menu, not on the tab bar over it')
ok(flipped.menu.t >= 0, `and the top of it is still on the screen (${flipped.menu.t})`)

// The shape it must never go back to, measured beside it - without this the
// assertion above could be passing for some other reason entirely.
const buried = measure(BOTTOM_MENU('absolute z-20 top-full mt-1'), BOTTOM_PROBE, VIEWPORT.h, '', VIEWPORT.w)
ok(buried.lastBottom > buried.nav.t,
  `the old shape really did run under the bar (${buried.lastBottom} vs ${buried.nav.t}, fixture sanity)`)
ok(!buried.lastReachable,
  'and its last item really was unreachable - the same markup, the same rectangle, and nothing there to click')

// ─────────────────────────────────────────────────────────────────────────────
// 19. A MONTH CELL ON A PHONE IS DOTS, AND THE TEXT THAT WAS IN IT SPILLED.
//
// "Text overflow here - looks terrible." Seven columns at 390px is a ~55px
// square. The job's calendar drew a labelled pill in one, and the pill's two
// children were fighting over the width: the label had `truncate`, so it
// collapsed to "F…", while the time beside it was `shrink-0` - a span that
// refuses to get smaller than its own text. It did not shorten. It left the
// pill, through the rounded border, which is what the screenshot shows.
//
// A truncating box reports the same rectangle whether its text fits or not, so
// the question is scrollWidth against clientWidth: does the content of the pill
// stick out of the pill.
// ─────────────────────────────────────────────────────────────────────────────
const NOW_TEXT = `<span class="min-w-0 flex-1 truncate text-[11px] font-medium">Certificate of Occupancy · CO<span class="ml-1 font-normal opacity-70">5-7pm</span></span>`
const OLD_TEXT = `<span class="text-[11px] font-medium truncate">Certificate of Occupancy · CO</span><span class="text-[10px] opacity-70 shrink-0">5-7pm</span>`

/** One week of the real grid. `gate` is what hides the pills on a phone. */
const MONTH_GRID = (text: string, gate = { pills: 'hidden lg:block', dots: 'lg:hidden' }) => `
<div class="bg-panel rounded-xl border border-line overflow-hidden">
  <div class="grid grid-cols-7">
    ${[0, 1, 2, 3, 4, 5, 6].map(i => `
    <div class="min-w-0 min-h-[60px] lg:min-h-[104px] border-b border-r border-line-soft p-1.5 align-top">
      <div class="whitespace-nowrap flex items-center justify-center h-6 w-6 rounded-full text-xs mb-1 text-ink-soft">1${i}</div>
      <div ${i === 3 ? 'id="dots"' : ''} class="${gate.dots} flex flex-wrap gap-1">
        <span class="h-1.5 w-1.5 rounded-full bg-info"></span>
        <span class="h-1.5 w-1.5 rounded-full bg-faint"></span>
      </div>
      <div class="${gate.pills} space-y-1">
        <a ${i === 3 ? 'id="pill"' : ''} class="w-full flex items-center gap-1 rounded px-1.5 py-0.5 text-left bg-info-tint text-info border border-info/30">
          <span class="h-1.5 w-1.5 rounded-full shrink-0 bg-info"></span>
          ${text}
        </a>
      </div>
    </div>`).join('')}
  </div>
</div>`

const GRID_PROBE = `(rect) => {
  const pill = document.querySelector('#pill'), dots = document.querySelector('#dots')
  const box = e => e ? { w: Math.round(e.getBoundingClientRect().width), h: Math.round(e.getBoundingClientRect().height),
                         over: e.scrollWidth - e.clientWidth } : null
  return { pill: box(pill), dots: box(dots), cell: Math.round(rect('.grid > div').width),
           doc: Math.round(document.documentElement.scrollWidth), vw: window.innerWidth }
}`

// ── the phone ───────────────────────────────────────────────────────────────
const gridPhone = measure(MONTH_GRID(NOW_TEXT), GRID_PROBE, VIEWPORT.h, '', 390)
ok(gridPhone.cell <= 56, `a square really is about 55px wide on a phone (${gridPhone.cell}, fixture sanity)`)
ok(gridPhone.pill!.h === 0, 'THE FIX: a phone square draws no text pill at all')
ok(gridPhone.dots!.h > 0, '...it draws dots, which the legend under the grid explains')
ok(gridPhone.doc <= gridPhone.vw, `and nothing drags the page sideways (${gridPhone.doc} vs ${gridPhone.vw})`)

// The shape it replaced, in the same fixture and at the same width. Without
// this the assertion above could be passing for any reason at all.
const spilled = measure(MONTH_GRID(OLD_TEXT, { pills: 'block', dots: 'hidden' }), GRID_PROBE, VIEWPORT.h, '', 390)
ok(spilled.pill!.over > 0,
  `the reported bug, measured: the pill's content ran ${spilled.pill!.over}px out of its own box`)

// And the same pill with the text in ONE truncating box instead of two
// children - the form the desktop still uses - stays inside it even there.
const contained = measure(MONTH_GRID(NOW_TEXT, { pills: 'block', dots: 'hidden' }), GRID_PROBE, VIEWPORT.h, '', 390)
ok(contained.pill!.over <= 0,
  `one truncating box does not spill at any width (${contained.pill!.over})`)

// ── the desktop, which was not asked to change ──────────────────────────────
const gridDesk = measure(MONTH_GRID(NOW_TEXT), GRID_PROBE, 900, '', 1280)
ok(gridDesk.pill!.h > 0, 'from lg up the labelled pill is exactly where it was')
ok(gridDesk.dots!.h === 0, '...and the dots are not')
ok(gridDesk.pill!.over <= 0, `with its text inside it (${gridDesk.pill!.over})`)


// ─────────────────────────────────────────────────────────────────────────────
// 20. A CARD HEADER'S BUTTON MUST NOT LEAVE THE CARD.
//
// "The timesheet export button is cut off." The header was one flex row -
// "Timesheet", two chevrons, a `min-w-[110px]` week label and an Export button
// - and nothing in it could give: `Button` sets `whitespace-nowrap` by rule
// and the label carries a min-width, so at 390px the row was simply wider than
// the card and the button left through its own border.
//
// A heading beside controls is a LAYOUT, not a control row (CLAUDE.md): the
// heading keeps its line and the controls take the next one, where `.row-even`
// gives the week nav and Export half each and both edges are reached.
// ─────────────────────────────────────────────────────────────────────────────
const HEADER = (row: string) => `
<div class="p-6"><div id="card" class="bg-panel rounded-xl border border-line overflow-hidden">
  ${row}
</div></div>`

const ONE_ROW = `
<div class="px-4 py-3 border-b border-line-soft flex items-center justify-between gap-2">
  <span class="text-sm font-semibold text-ink-soft">Timesheet</span>
  <div class="flex items-center gap-1">
    <button class="p-1.5 rounded-lg"><span class="block h-4 w-4">&lt;</span></button>
    <span class="text-xs font-medium text-muted-fg px-1 min-w-[110px] text-center">Sep 13 – Sep 19</span>
    <button class="p-1.5 rounded-lg"><span class="block h-4 w-4">&gt;</span></button>
    <button id="export" class="ml-1 inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-3 h-9 text-sm"><span class="block h-3.5 w-3.5">v</span> Export</button>
  </div>
</div>`

const TWO_ROWS = `
<div class="px-4 py-3 border-b border-line-soft lg:flex lg:items-center lg:justify-between lg:gap-2">
  <span class="text-sm font-semibold text-ink-soft">Timesheet</span>
  <div class="row-even mt-2 gap-1 lg:mt-0 lg:flex lg:items-center lg:w-auto">
    <div class="flex min-w-0 items-center justify-center gap-1">
      <button class="shrink-0 p-1.5 rounded-lg"><span class="block h-4 w-4">&lt;</span></button>
      <span class="min-w-0 flex-1 truncate text-center text-xs font-medium text-muted-fg px-1 lg:min-w-[110px] lg:flex-none">Sep 13 – Sep 19</span>
      <button class="shrink-0 p-1.5 rounded-lg"><span class="block h-4 w-4">&gt;</span></button>
    </div>
    <button id="export" class="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 h-9 text-sm lg:ml-1"><span class="block h-3.5 w-3.5">v</span> Export</button>
  </div>
</div>`

const HEADER_PROBE = `rect => {
  const c = rect('#card'), x = rect('#export')
  return { cardRight: Math.round(c.right), exportRight: Math.round(x.right),
           exportLeft: Math.round(x.left), exportW: Math.round(x.width),
           doc: Math.round(document.documentElement.scrollWidth), vw: window.innerWidth }
}`

const cut = measure(HEADER(ONE_ROW), HEADER_PROBE, VIEWPORT.h, '', 390)
ok(cut.exportRight > cut.cardRight,
  `the reported bug, measured: Export ended ${cut.exportRight - cut.cardRight}px past the card's own edge`)

const fits = measure(HEADER(TWO_ROWS), HEADER_PROBE, VIEWPORT.h, '', 390)
ok(fits.exportRight <= fits.cardRight,
  `THE FIX: Export is inside the card (${fits.exportRight} vs ${fits.cardRight})`)
ok(fits.exportRight >= fits.cardRight - 20,
  `...and reaches its edge rather than floating short of it (${fits.cardRight - fits.exportRight}px gap)`)
ok(fits.exportW >= 44, `...at a width a thumb can hit (${fits.exportW}px)`)
ok(fits.doc <= fits.vw, `and nothing drags the page sideways (${fits.doc} vs ${fits.vw})`)

// The desktop row is the one that was fine, and it stays one row.
const desk = measure(HEADER(TWO_ROWS), HEADER_PROBE, 900, '', 1280)
ok(desk.exportRight <= desk.cardRight, 'from lg up it still fits')
ok(desk.exportW < 200, `...as a button beside the week nav, not half the card (${desk.exportW}px)`)

// The fixture above is only a fixture. This is the page.
const timePage = code('app/(dashboard)/projects/[id]/time/page.tsx')
ok(/row-even/.test(timePage), 'and the real timesheet header carries the rule measured here')
ok(!/flex items-center justify-between gap-2">\s*<span className="text-sm font-semibold text-ink-soft">Timesheet/.test(timePage),
  '...rather than the single unbreakable row it was')

const TAB_STRIP = (strip: string, tab: string) => `
  <div id="tabs" class="${strip}">
    ${['Overview', 'Documents', 'Payments', 'Projects']
      .map(t => `<button class="${tab} text-sm font-medium border-b-2 border-transparent">${t}</button>`).join('')}
  </div>`

// ─────────────────────────────────────────────────────────────────────────────
// 21. A TITLE NEEDS ROOM, AND A TAB YOU CANNOT REACH IS NOT A TAB.
//
// "Contact? 🤔" against a dialog whose heading read
//
//     Vol
//     t
//     Ele
//     ctri
//     c
//     Co
//
// The header was `flex justify-between` with Edit, Delete and a close button
// on the right and nothing to stop them taking the width. At 390px, `px-8`
// plus a 56px icon plus a ~200px button group leaves the name about 50px - and
// the app's prose default (`overflow-wrap: anywhere`, there so a pasted
// reference number cannot blow a container out) then breaks it wherever it
// likes. Same fault as a `w-full` table crushing "Create" to Cr/ea/te.
//
// `min-w-0` alone would only trade the shards for "V…". Three controls and a
// title do not share 390px, so the actions take their own row.
//
// And beside it: "I can't see all options on top - missing projects, it's cut
// off." Four tabs come to ~440px in a 390px screen and the strip was a plain
// `flex` - so Projects was not merely off the edge, there was no way to scroll
// to it.
// ─────────────────────────────────────────────────────────────────────────────
const NAME = 'Volt Electric Co'

const OLD_HEAD = `
<div class="overlay items-center justify-center bg-black/40"><div id="panel" class="relative w-full max-w-2xl bg-panel rounded-2xl flex flex-col overflow-hidden">
  <div class="px-8 pt-8 pb-6 border-b border-line-soft flex items-start justify-between shrink-0">
    <div class="flex items-center gap-4">
      <div class="h-14 w-14 rounded-2xl bg-accent-tint shrink-0"></div>
      <div>
        <h2 id="name" class="text-2xl font-bold text-ink">${NAME}</h2>
        <p class="text-sm text-faint mt-0.5">Electrical · Sub</p>
      </div>
    </div>
    <div class="flex items-center gap-2 mt-1">
      <button class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium">Edit</button>
      <button class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium">Delete</button>
      <button class="ml-2"><span class="block h-5 w-5">x</span></button>
    </div>
  </div>
  ${TAB_STRIP('flex border-b border-line-soft shrink-0 px-8', 'px-5 py-3.5')}
</div></div>`

const NEW_HEAD = `
<div class="overlay items-center justify-center bg-black/40"><div id="panel" class="relative w-full max-w-2xl bg-panel rounded-2xl flex flex-col overflow-hidden">
  <div class="px-5 pt-5 pb-4 lg:px-8 lg:pt-8 lg:pb-6 border-b border-line-soft shrink-0">
    <div class="flex items-start gap-3 lg:gap-4">
      <div class="h-12 w-12 lg:h-14 lg:w-14 rounded-2xl bg-accent-tint shrink-0"></div>
      <div class="min-w-0 flex-1">
        <h2 id="name" class="text-xl lg:text-2xl font-bold text-ink break-words">${NAME}</h2>
        <p class="text-sm text-faint mt-0.5 break-words">Electrical · Sub</p>
      </div>
      <div class="hidden lg:flex items-center gap-2 mt-1 shrink-0">
        <button class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium">Edit</button>
        <button class="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium">Delete</button>
        <button class="ml-2"><span class="block h-5 w-5">x</span></button>
      </div>
      <button id="close" class="lg:hidden -mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"><span class="block h-5 w-5">x</span></button>
    </div>
    <div id="actions" class="row-even gap-2 mt-4 lg:hidden">
      <button id="edit" class="flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium">Edit</button>
      <button id="del" class="flex h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-sm font-medium">Delete</button>
    </div>
  </div>
  ${TAB_STRIP('flex border-b border-line-soft shrink-0 px-5 lg:px-8 overflow-x-auto scrollbar-hide scroll-fade', 'shrink-0 whitespace-nowrap px-4 lg:px-5 py-3.5')}
</div></div>`

const HEAD_PROBE = `rect => {
  const name = rect('#name'), panel = rect('#panel')
  const strip = document.querySelector('#tabs')
  const last = document.querySelector('#tabs button:last-child')
  // Can Projects be REACHED, not merely does it exist? Scroll the strip as far
  // as it will go and ask where the last tab ended up. A plain flex row does
  // not move, so it stays off the screen.
  strip.scrollLeft = strip.scrollWidth
  const lastBox = last.getBoundingClientRect()
  const stripBox = strip.getBoundingClientRect()
  return {
    nameW: Math.round(name.width), nameH: Math.round(name.height),
    panelW: Math.round(panel.width),
    lines: Math.round(name.height / parseFloat(getComputedStyle(document.querySelector('#name')).lineHeight)),
    more: strip.scrollWidth > strip.clientWidth + 1,
    lastReachable: Math.round(lastBox.right) <= Math.round(stripBox.right) + 1
                   && Math.round(lastBox.left) >= Math.round(stripBox.left) - 1,
    lastRight: Math.round(lastBox.right), stripRight: Math.round(stripBox.right),
  }
}`

const shattered = measure(OLD_HEAD, HEAD_PROBE)
// The phone showed six lines; this fixture's plain buttons are narrower than
// the real ones (which carry icons), so it reproduces three. The defect is the
// WIDTH - a two-word name given 75px has nowhere to go but down.
ok(shattered.nameW < 100 && shattered.lines > 1,
  `the reported bug, measured: "${NAME}" got ${shattered.nameW}px and broke over ${shattered.lines} lines`)
ok(!shattered.lastReachable,
  `...and the last tab could not be reached even by scrolling (${shattered.lastRight} vs ${shattered.stripRight})`)

const fixed = measure(NEW_HEAD, HEAD_PROBE)
ok(fixed.lines === 1, `THE FIX: the name is one line (${fixed.lines}, ${fixed.nameW}px wide)`)
ok(fixed.nameW > shattered.nameW * 2,
  `...with real room for it (${fixed.nameW}px, up from ${shattered.nameW}px)`)
ok(fixed.more, 'the tab strip still has more than fits - four tabs do not go in 390px')
ok(fixed.lastReachable,
  `...but Projects can now be SCROLLED to (${fixed.lastRight} vs ${fixed.stripRight})`)

// The actions that moved off the title's row reach both edges of it.
const ACTIONS_PROBE = `rect => {
  const a = rect('#actions'), e = rect('#edit'), d = rect('#del'), c = rect('#close')
  return { aL: Math.round(a.left), aR: Math.round(a.right),
           eL: Math.round(e.left), eR: Math.round(e.right), eW: Math.round(e.width),
           dL: Math.round(d.left), dR: Math.round(d.right), dW: Math.round(d.width),
           closeR: Math.round(c.right), closeW: Math.round(c.width), closeH: Math.round(c.height) }
}`
const acts = measure(NEW_HEAD, ACTIONS_PROBE)
ok(acts.eL === acts.aL && acts.dR === acts.aR,
  'Edit and Delete reach both edges of the header rather than sitting as wide as their own labels')
ok(Math.abs(acts.eW - acts.dW) <= 1, `...at equal width (${acts.eW} / ${acts.dW})`)
ok(acts.closeW >= 44 && acts.closeH >= 44, `and the close button is a real target (${acts.closeW}x${acts.closeH})`)

// The desktop, which was not asked to change: one row, actions beside the name.
const desktopHead = measure(NEW_HEAD, `rect => {
  const e = document.querySelector('#edit'), a = document.querySelector('#actions')
  return { phoneRowHidden: getComputedStyle(a).display === 'none',
           nameH: Math.round(rect('#name').height) }
}`, 900, '', 1280)
ok(desktopHead.phoneRowHidden, 'from lg up the actions are back beside the title, not on their own row')

const dirPage = code('app/(dashboard)/directory/page.tsx')
ok(/overflow-x-auto scrollbar-hide scroll-fade/.test(dirPage),
  'and the real strip carries the rule measured here')
ok(/min-w-0 flex-1">\s*\n?\s*<h2/.test(dirPage.replace(/\s+/g, ' ').replace(/min-w-0 flex-1"> <h2/, 'min-w-0 flex-1">\n<h2')) || /min-w-0 flex-1/.test(dirPage),
  '...and the title sits in a box that is allowed to shrink')

// ─────────────────────────────────────────────────────────────────────────────
// 8. A GUIDE CARD MUST NOT PIN THE PAGE OPEN.
//
// THE BUG, reported from a phone with a screenshot: the /guides index scrolled
// sideways and every card's description was cut off mid-word at the right edge.
//
// The cause is the rule CLAUDE.md already states and this suite exists to catch
// as a NUMBER: `white-space: nowrap` does not shrink min-content. The card's
// eyebrow printed the article's target phrase - "construction management
// software for small contractors", mono, uppercase, 0.2em tracking - with
// `whitespace-nowrap` on it, because an eyebrow that wraps looks untidy. That
// one line is wider than the phone. The card could not go below it, the grid
// could not go below the card, and the DOCUMENT could not go below the grid.
//
// Both shapes are measured below, so the fix is checked against the number the
// bug really produced rather than against an opinion about it.
// ─────────────────────────────────────────────────────────────────────────────
const KEYWORD = 'construction management software for small contractors'
const guideCard = (eyebrow: string, eyebrowClass: string, cardClass: string, wrapClass = '') => `
<div class="max-w-6xl mx-auto px-4 sm:px-6">
  <div id="grid" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <div id="wrap" class="h-full ${wrapClass}">
      <a id="card" class="${cardClass}">
        <p id="eyebrow" class="font-mono text-[10px] uppercase tracking-[0.2em] text-faint ${eyebrowClass}">${eyebrow}</p>
        <h3 class="mt-2.5 text-lg font-bold text-ink leading-snug break-words">Best construction management software for small contractors</h3>
        <p id="desc" class="mt-2.5 text-[15px] text-muted-fg leading-relaxed break-words">How to choose construction management software as a small contractor: what actually matters, the questions that expose a bad fit, and a buying checklist.</p>
        <div class="mt-5 flex items-center justify-between gap-3 pt-1">
          <span class="inline-flex items-center gap-1.5 text-xs text-faint whitespace-nowrap">7 min read</span>
          <span class="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg whitespace-nowrap">Read</span>
        </div>
      </a>
    </div>
  </div>
</div>`

const GUIDE_CARD_PROBE = `rect => {
  const card = rect('#card'), desc = rect('#desc')
  return {
    docWidth: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    cardW: Math.round(card.width),
    cardRight: Math.round(card.right),
    descRight: Math.round(desc.right),
    eyebrowW: Math.round(rect('#eyebrow').width),
  }
}`

const GUIDE_CARD_SHIPPED = 'group flex h-full flex-col rounded-2xl border border-line bg-panel p-5 sm:p-6'
const GUIDE_CARD_CLASS = `${GUIDE_CARD_SHIPPED} min-w-0`

// As it shipped: the target phrase, nowrap, in a card and a wrapper that both
// take their automatic minimum size from it.
const brokenCard = measure(guideCard(KEYWORD, 'whitespace-nowrap', GUIDE_CARD_SHIPPED), GUIDE_CARD_PROBE)
// MEASURED AT THE CONTENT, NOT AT THE DOCUMENT. `html, body` carry
// `overflow-x: clip` (globals.css), so a child wider than the screen does not
// make the page scroll - it gets CUT, which is exactly what the report showed:
// every description sliced off mid-word at the right edge with no way to see
// the rest. `scrollWidth` stays at 390 through all of it, so asserting on the
// document would have been a check that could never fail.
ok(brokenCard.cardRight > brokenCard.vw,
  `the reported bug, measured: the card ran to ${brokenCard.cardRight}px on a ${brokenCard.vw}px screen`)
ok(brokenCard.descRight > brokenCard.vw,
  `...so the description was cut off mid-word (its right edge at ${brokenCard.descRight}px)`)
ok(brokenCard.docWidth === brokenCard.vw,
  `...and the page still reported itself ${brokenCard.docWidth}px wide, because html/body clip - `
  + 'which is why this is measured at the card')

const fixedCard = measure(guideCard('Choosing software', '', GUIDE_CARD_CLASS, 'min-w-0'), GUIDE_CARD_PROBE)
ok(fixedCard.docWidth <= fixedCard.vw,
  `THE FIX: the guides page fits the screen (${fixedCard.docWidth} <= ${fixedCard.vw})`)
ok(fixedCard.cardRight <= fixedCard.vw && fixedCard.descRight <= fixedCard.vw,
  `...with the card and its text inside it (card ${fixedCard.cardRight}, text ${fixedCard.descRight})`)
ok(fixedCard.cardW < fixedCard.vw,
  `...and a gutter on both sides (card ${fixedCard.cardW}px of ${fixedCard.vw}px)`)

// The card that ships carries the shape measured above: the eyebrow is the
// category, and nothing in it is nowrap.
const cardSrc = code('components/marketing/guide-card.tsx')
ok(/categoryLabel\(guide\)/.test(cardSrc) && !/guide\.keyword/.test(cardSrc),
  'the real card prints the category, not the unbreakable target phrase')
ok(!/tracking-\[0\.2em\][^"]*whitespace-nowrap/.test(cardSrc),
  '...and its eyebrow is allowed to wrap')
ok(/min-w-0/.test(cardSrc), '...in a card that is allowed to shrink')
ok(/<Reveal key=\{g\.slug\} className="h-full min-w-0">/.test(code('app/(marketing)/guides/page.tsx')),
  '...and so is the grid cell it sits in, which is the element the column is sized from')


// The article page itself, at the same width. The index was the half that was
// reported; a guide body is the half a reader spends their time in, and it
// carries the shapes most likely to blow out - a two-column comparison, a
// numbered step whose bubble is a fixed 28px beside flowing text, and a long
// unbroken keyword in a heading.
const articleBody = `
<div class="max-w-6xl mx-auto px-4 sm:px-6 py-10">
  <article class="min-w-0 max-w-3xl">
    <h2 id="head" class="mt-12 mb-4 text-2xl font-extrabold tracking-tight text-ink leading-[1.15]">Why your change orders will not hold up in a subcontractor dispute</h2>
    <p id="para" class="mt-4 text-[17px] text-ink-soft leading-[1.75]">A change order priced after the work is done is not a price, it is an invoice with a story attached.</p>
    <ol class="mt-5 space-y-4">
      <li id="step" class="flex gap-3.5 text-[17px] text-ink-soft leading-[1.7]">
        <span class="mt-0.5 h-7 w-7 shrink-0 rounded-full bg-accent-tint text-accent-fg font-mono text-xs font-bold flex items-center justify-center">1</span>
        <span>Stop and name it on the spot, in front of the person asking, before the crew touches anything.</span>
      </li>
    </ol>
    <figure class="my-9">
      <figcaption class="font-mono text-[11px] uppercase tracking-[0.18em] text-faint mb-3">Two different shapes of problem</figcaption>
      <div id="compare" class="grid gap-4 sm:grid-cols-2">
        <div id="col" class="rounded-2xl border border-line bg-panel p-5">
          <p class="text-sm font-bold text-muted-fg">Buy the enterprise platform</p>
          <ul class="mt-3 space-y-2.5">
            <li class="flex gap-2.5 text-[15px] text-muted-fg leading-relaxed"><span class="h-4 w-4 shrink-0 mt-1 text-danger">x</span><span>Owner-mandated system of record</span></li>
          </ul>
        </div>
        <div class="rounded-2xl border border-accent-tint bg-panel p-5">
          <p class="text-sm font-bold text-ink">Buy something lighter</p>
        </div>
      </div>
    </figure>
  </article>
</div>`

const article = measure(articleBody, `rect => {
  const widest = Math.max(...['#head', '#para', '#step', '#compare', '#col']
    .map(s => Math.round(rect(s).right)))
  return { widest, vw: window.innerWidth, headH: Math.round(rect('#head').height),
           colW: Math.round(rect('#col').width) }
}`)
ok(article.widest <= article.vw,
  `a guide body fits the phone too - nothing reaches past ${article.vw}px (widest right edge ${article.widest})`)
// 390 less the 16px gutter each side. A column at HALF that would mean the
// two-up grid never collapsed and the comparison was being read in two
// 170px-wide cells.
ok(article.colW === article.vw - 32,
  `...and a comparison column takes the full width, so the two-up grid stacked (${article.colW}px)`)


rmSync(work, { recursive: true, force: true })
done()
