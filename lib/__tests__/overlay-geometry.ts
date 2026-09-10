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
<style>${css}</style><style>html,body{margin:0}</style></head>
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

rmSync(work, { recursive: true, force: true })
done()
