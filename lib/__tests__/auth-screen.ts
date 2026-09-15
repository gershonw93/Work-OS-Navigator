// "Why does the app not remember my logins? The login screen looks like it's
// fake."  One message, one screenshot, and the two halves turned out to be the
// same bug pointing in opposite directions.
//
// The screenshot: two WHITE boxes with dark text sitting on the dark sign-in
// card, everything else on the screen correct. The password field had eight
// dots in it. Nothing in this codebase asks for a white field, and the classes
// on those inputs were right - present in the built CSS, applied to the
// element, `bg-slate-700` resolving exactly as written (the Tailwind config
// EXTENDS the palette, so slate is real; that was checked before blaming it).
//
// It is WebKit. A field the password manager filled matches
// `:-webkit-autofill`, and WebKit paints its own background in the UA-shadow
// layer where an author `background-color` does not reach. Only a huge inset
// `box-shadow` covers it, and only `-webkit-text-fill-color` recolours the
// text. There was no such rule anywhere in globals.css.
//
// So: it looked fake BECAUSE the credentials HAD been remembered. An account
// with nothing saved never saw it, which is how it lasted this long. And the
// answer to the first half of the question is that iOS is filling the password
// but not the address above it - the field said `autocomplete="email"`, a
// contact-details token, where a sign-in pair needs `username`.
//
// The second thing this file pins is why no single rule could have fixed it
// before: the auth card hardcoded the dark palette as hex while everything
// inside it followed the document theme, so each of the four auth pages patched
// its own fields with raw slate. Any autofill rule painted from the tokens
// would have been the wrong colour here. `.dark` on the wrapper is what makes
// one rule correct everywhere.

import { execFileSync } from 'child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ok, done, root, code, read, walk } from './_helpers'

const AUTH = walk('app/(auth)').filter(f => f.endsWith('.tsx'))
const layout = code('app/(auth)/layout.tsx')
const login = code('app/(auth)/login/page.tsx')
const css = read('app/globals.css')

// ── the card and its fields read the SAME tokens ────────────────────────────
ok(/className="dark /.test(layout),
  'THE SPLIT: the auth card declares itself dark with `.dark`, so the tokens inside it flip too')
ok(!/bg-\[#|border-\[#|text-\[#/.test(layout),
  '...rather than hardcoding the dark palette as hex while its children follow the theme')

// Raw palette colours are how each page worked around that, one file at a time.
for (const f of AUTH) {
  const src = code(f)
  ok(!/\b(bg|text|border|placeholder|ring|divide)-(slate|gray|zinc|neutral|stone)-\d{2,3}\b/.test(src),
    `${f.split('/').slice(-2).join('/')} styles from tokens, not raw palette colours`)
  ok(!/text-white\b/.test(src), `...and not text-white either (${f.split('/').slice(-2).join('/')})`)
}

// ── the rule the whole thing turned on ──────────────────────────────────────
ok(/input:-webkit-autofill/.test(css),
  'THE BUG: autofilled fields are painted by us, because WebKit paints them otherwise')
ok(/-webkit-box-shadow:\s*inset 0 0 0 1000px rgb\(var\(--panel\)\)/.test(css),
  '...with an inset box-shadow, which is the only thing that covers the UA background')
ok(/-webkit-text-fill-color:\s*rgb\(var\(--ink\)\)/.test(css),
  '...and -webkit-text-fill-color, because `color` loses in that layer too')
ok(/transition:\s*background-color 0s 600000s/.test(css),
  '...and a transition longer than the session, because WebKit repaints on focus')
{
  // It must not be inside the touch-only media query it was first written in:
  // a desktop browser autofills too, and the first draft of this shipped there.
  const at = css.indexOf('input:-webkit-autofill')
  const before = css.slice(0, at)
  const depth = (before.match(/\{/g) ?? []).length - (before.match(/\}/g) ?? []).length
  ok(depth === 1, `the rule sits in @layer base, not nested in a media query (depth ${depth})`)
}

// ── the field a password manager has to recognise ───────────────────────────
ok(/autoComplete="username"/.test(login),
  'THE OTHER HALF: the address field is the sign-in `username`, which is the token a password manager pairs with the password')
ok(!/autoComplete="email"/.test(login),
  '...not `email`, a contact-details token - iOS fills the password and leaves this one on its placeholder')
ok(/autoComplete="current-password"/.test(login), 'and the password says what it is')

// ── MEASURED, because the colours are the whole report ──────────────────────
function chromium(): string | null {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'
  let dirs: string[] = []
  try { dirs = readdirSync(base).filter(d => d.startsWith('chromium')) } catch { /* none */ }
  for (const exe of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
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
  // LOUD, like overlay-geometry: a suite that quietly reports nothing is the
  // fault three other files in here exist for.
  console.log('  \x1b[33mSKIPPED\x1b[0m no Chromium found; set PLAYWRIGHT_BROWSERS_PATH')
  done()
}

const work = mkdtempSync(join(tmpdir(), 'sytenav-auth-'))

// THE FIXTURE IS BUILT FROM THE REAL FILES, not typed out beside them.
//
// The first version of this suite hardcoded the two class strings here. Every
// colour assertion below passed - and went on passing when the layout was
// reverted to the hex-and-`bg-panel` version that produced the screenshot,
// because the browser was measuring this fixture rather than the app. A
// red-check is what found it: the source assertions went red, the MEASURED
// ones did not move. So the classes are read out of the layout and out of
// <Input>, and editing either really does move the numbers.
function classOf(src: string, marker: string): string {
  // The className CONTAINING the marker, not merely one near it. Searching a
  // window around the marker picked up the wrapper div's class instead, and
  // the browser dutifully measured a transparent box.
  const re = /className="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    if (m[1].indexOf(marker) !== -1) return m[1]
  }
  throw new Error(`auth-screen: no className containing "${marker}"`)
}
const layoutSrc = read('app/(auth)/layout.tsx')
const wrapCls = classOf(layoutSrc, 'flex flex-col items-center justify-center')
const cardCls = classOf(layoutSrc, 'rounded-xl border')
// <Input>'s own classes, minus the cn() plumbing - this is what every auth
// field now renders with, since the per-field overrides are gone.
const inputSrc = read('components/ui/input.tsx')
const inputCls = (inputSrc.match(/'([^']*\bbg-panel\b[^']*)'/) ?? [])[1]
  + ' ' + ((inputSrc.match(/'(border-muted2[^']*)'/) ?? [])[1] ?? '')

ok(/\bdark\b/.test(wrapCls), `the measured wrapper is the app's own (${wrapCls.slice(0, 40)}...)`)
ok(!!inputCls.trim(), 'the measured field carries <Input>\'s own classes')

const body = `
<div class="${wrapCls}">
  <div class="w-full max-w-md">
    <div id="card" class="${cardCls}">
      <input id="field" class="${inputCls}" placeholder="you@company.com">
    </div>
  </div>
</div>`
const fixture = join(work, 'fixture.html')
writeFileSync(fixture, `<!doctype html><html><head><meta charset=utf8></head><body>${body}</body></html>`)
const out = join(work, 'out.css')
execFileSync('npx', ['tailwindcss', '-i', join(root(), 'app/globals.css'), '-o', out, '--content', fixture],
  { cwd: root(), stdio: ['ignore', 'ignore', 'pipe'] })
const page = join(work, 'page.html')
writeFileSync(page, `<!doctype html><html><head><meta charset=utf8><style>${readFileSync(out, 'utf8')}</style></head><body>${body}
<pre id="probe"></pre><script>
  var g = function (id) { return getComputedStyle(document.getElementById(id)).backgroundColor }
  document.getElementById('probe').textContent = JSON.stringify({ card: g('card'), field: g('field') })
</script></body></html>`)

const dom = execFileSync(browser!, [
  '--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=3000',
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sytenav-auth-profile-'))}`,
  '--window-size=390,844', '--dump-dom', `file://${page}`,
], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const m = /<pre id="probe">([^<]*)<\/pre>/.exec(dom)
ok(!!m, 'the page reported its colours')
const seen = JSON.parse(m![1]) as { card: string; field: string }

// #1F2227 is --panel in the dark palette, and it is what the autofill rule
// paints. A field that is any other colour means an autofilled field and an
// empty one sit side by side in two different colours, which is the report.
ok(seen.field === 'rgb(31, 34, 39)',
  `THE REPORT: the sign-in field is the dark panel colour, not white (${seen.field})`)
ok(seen.card !== seen.field,
  `...and the card is a different surface from the field, so the field is visible at all (card ${seen.card})`)
ok(seen.card === 'rgb(42, 46, 52)',
  `...one step lighter, so the fields read as inset (${seen.card})`)

done()
