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

import { ok, done, code, read, walk } from './_helpers'

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
ok(/shrink-0[\s\S]{0,120}<TopNav/.test(office),
  'the top bar cannot be squashed by a tall child - a flex item shrinks by default')

// ── 2. nothing behind an open overlay scrolls ────────────────────────────────
ok(/html:has\(\[data-overlay\]\)\s*\{[^}]*overflow:\s*hidden/.test(css),
  'an open overlay stops the document scrolling')
ok(/html:has\(\[data-overlay\]\)\s*\[data-app-scroll\]\s*\{[^}]*overflow:\s*hidden/.test(css),
  '...and stops <main> scrolling, which is the one that actually moves')
// A JS counter is the obvious alternative and the wrong one: one early return
// in one of 78 cleanup paths leaves the whole app frozen with no dialog open.
ok(!/document\.body\.style\.overflow/.test(code('components/ui/image-lightbox.tsx')),
  'no component sets body overflow by hand any more')

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

// ── long text, which is the same bug one level down ──────────────────────────
ok(/p,\s*li,\s*dd,\s*dt,\s*td,\s*th[\s\S]{0,80}overflow-wrap:\s*anywhere/.test(css),
  'prose wraps anywhere by default - `break-word` wraps the text but not the container')
ok(!/^\s*\*\s*\{[^}]*overflow-wrap:\s*anywhere/m.test(css),
  '...but not on everything: on a button that breaks the label instead of keeping the shape')

done()
