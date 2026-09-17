// TYPE A PAGE NUMBER AND GO THERE.
//
// Asked for against a 44-page plan set. The viewer had `{page}/{numPages}`
// between two arrows, so the last sheet was forty-three taps away - on a phone,
// standing on a slab, that is not navigation.
//
// Everything here is about a TYPED string, which is the part that goes wrong:
// a blank box, a decimal, a negative, "1e3", and a number past the end of the
// document. `parseInt` answers all of those with confident nonsense.

import { parsePageInput, stepPage } from '../plan-page'
import { ok, done, code, read } from './_helpers'

const N = 44

// ── the ask ─────────────────────────────────────────────────────────────────
ok(parsePageInput('30', N) === 30, 'THE POINT: typing 30 asks for page 30')
ok(parsePageInput('1', N) === 1, '...and 1 for the first')
ok(parsePageInput(` ${N} `, N) === N, '...and the last, with whitespace around it')

// ── null means LEAVE THE READER ALONE, which is not page 1 ──────────────────
// `parseInt('') `is NaN, and a naive `|| 1` turns an emptied box into a jump to
// the first sheet - a control that moves you for clearing it.
ok(parsePageInput('', N) === null, 'an empty box asks for NOTHING, rather than for page 1')
ok(parsePageInput('   ', N) === null, '...and so does whitespace')
ok(parsePageInput('abc', N) === null, '...and junk')
ok(parsePageInput('page 3', N) === null, '...and a number with words around it')

// The two that a lenient parse gets WRONG rather than merely rejects.
ok(parsePageInput('1.9', N) === null,
  'THE TRAP: "1.9" is refused, not silently floored to 1 the way parseInt does it')
ok(parsePageInput('1e3', N) === null,
  '...and "1e3" is refused, not read as 1000 the way Number does it')
ok(parsePageInput('-5', N) === null,
  '...and "-5" is refused by the digits rule before any clamp is needed')

// ── past the end CLAMPS, because the intent is not ambiguous ────────────────
ok(parsePageInput('99', N) === N, 'asking for 99 of 44 lands on the last page')
ok(parsePageInput('0', N) === 1, '...and 0 on the first')
ok(parsePageInput('000', N) === 1, '...and so does a padded zero')

// A document whose length is not known yet must not strand the reader on a
// page that does not exist.
ok(parsePageInput('5', 1) === 1, 'with a one-page document every ask lands on page 1')
ok(parsePageInput('5', 0) === 1, '...and a nonsense length is treated as one page')
ok(parsePageInput('5', NaN) === 1, '...including NaN, which is what numPages is before the PDF loads')

// ── the arrows use the same clamp ───────────────────────────────────────────
ok(stepPage(1, -1, N) === 1, 'back from the first page stays on it')
ok(stepPage(N, 1, N) === N, 'forward from the last stays on it')
ok(stepPage(30, 1, N) === 31, 'and otherwise it is one page')
ok(stepPage(30, -1, N) === 29, '...either way')

// ── the screen ──────────────────────────────────────────────────────────────
const viewer = code('app/(dashboard)/projects/[id]/plans/[planId]/page.tsx')
ok(/parsePageInput\(/.test(viewer), 'the viewer asks this module rather than parsing inline')
ok(/stepPage\(/.test(viewer), '...and its arrows share the clamp')

// COMMITTED, NOT LIVE. Jumping per keystroke decodes page 4 on the way to 44.
ok(/onChange=\{e => setPageInput\(/.test(viewer),
  'typing only edits the box')
ok(/onBlur=\{commitPage\}/.test(viewer) && /onSubmit=\{[^}]*commitPage\(\)/.test(viewer),
  '...and the jump happens on Enter or on leaving the field, not on every keystroke')

// A numeric keypad has no Enter, so the form needs a submit of its own.
ok(/type="submit"/.test(viewer),
  'there is a submit, because a phone numeric keypad has no Enter key')
// `type="number"` brings spinners and scroll-to-change onto a drawing.
ok(/inputMode="numeric"/.test(viewer) && !/type="number"/.test(viewer),
  'the field is inputMode numeric, not type=number - no spinners over a plan')
ok(/aria-label=\{`Page number/.test(viewer), 'the box says what it is')

// The box must follow the page when something ELSE moves it - an arrow, or a
// pin in the list. A control that disagrees with the screen is worse than none.
ok(/useEffect\(\(\) => \{ setPageInput\(String\(page\)\) \}, \[page\]\)/.test(viewer),
  'THE SYNC: opening a pin on page 30 updates the box too')

// The arrows keep their labels - they are icon-only buttons.
ok(/aria-label="Previous page"/.test(viewer) && /aria-label="Next page"/.test(viewer),
  'both arrows carry a label, being icon-only')

done()
