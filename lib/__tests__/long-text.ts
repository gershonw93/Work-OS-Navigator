// Text somebody typed, which may be 2,033 characters with no spaces in it.
//
// THE BUG. A note that long broke the inspection card sideways - on a card that
// ALREADY had `break-words`. That is the interesting part: the obvious class was
// there and did not help, so adding it again would have been a fix that changed
// nothing while looking like diligence.
//
//   break-words    = overflow-wrap: break-word
//                    wraps the text, does NOT reduce min-content width
//   wrap-anywhere  = overflow-wrap: anywhere
//                    wraps the text AND reduces min-content width
//
// Grid and flex items default to `min-width: auto` and refuse to shrink below
// their content's min-content size. Under `break-word` that size is still the
// whole unbroken string, so the container blows out while the text inside it is
// wrapping perfectly correctly. `anywhere` is what lets the container shrink at
// all, and Tailwind 3.4 has no class for it.

import { ok, done, code, read } from './_helpers'

const css = read('app/globals.css')
const page = code('app/(dashboard)/projects/[id]/inspections/page.tsx')

// ── the utility exists and is the right property ─────────────────────────────
ok(/\.wrap-anywhere\s*\{[^}]*overflow-wrap:\s*anywhere/.test(css),
  '.wrap-anywhere sets overflow-wrap: anywhere')
ok(!/\.wrap-anywhere\s*\{[^}]*overflow-wrap:\s*break-word/.test(css),
  '...not break-word, which is the one that was already there and did not work')

// ── it is applied to the text a person actually types ────────────────────────
ok(/\{insp\.notes\}/.test(page), 'the note still renders')
const notesLine = page.split('\n').find(l => l.includes('{insp.notes}')) ?? ''
ok(/wrap-anywhere/.test(notesLine), 'the note wraps anywhere - this is the reported bug')

const failLine = page.split('\n').find(l => l.includes('{insp.failure_reason}')) ?? ''
ok(/wrap-anywhere/.test(failLine),
  'so does the failure reason, which is free text somebody types under pressure')

// ── and the containers can shrink, which is the half that was missing ────────
const grid = page.split('\n').find(l => l.includes('grid-cols-2 md:grid-cols-3')) ?? ''
ok(/\[&>div\]:min-w-0/.test(grid),
  'the detail grid lets its cells shrink - a grid item will not, by default')
ok(/\[&>div\]:\[overflow-wrap:anywhere\]/.test(grid),
  '...and its cells wrap anywhere, written as an arbitrary PROPERTY')
// A Tailwind arbitrary variant composes with Tailwind utilities, not with a
// class from globals.css. `[&>div]:wrap-anywhere` generates nothing at all -
// it compiles, it ships, and it silently does not exist.
ok(!/\[&>div\]:wrap-anywhere/.test(page),
  'no arbitrary variant points at a hand-written class, which would generate no CSS')

done()
