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

rmSync(work, { recursive: true, force: true })
done()
