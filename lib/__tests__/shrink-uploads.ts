// "Can you add something to compress all these files?" - after the permit form
// was found sending a 3-6 MB phone photo up twice. There are ~50 upload boxes
// across ~30 screens, so it is ONE listener at the root rather than fifty
// edits: these pin that it is mounted, that it runs before the screens' own
// handlers, and that the uploads which must keep their original say so.

import { shouldShrinkInput } from '../../components/ui/shrink-uploads'
import { fitWithin, MAX_IMAGE_SIDE } from '../shrink-image'
import { ok, done, code, read, walk } from './_helpers'

// ── the rule ────────────────────────────────────────────────────────────────
const input = (attrs: string[]) => ({ type: 'file', hasAttribute: (n: string) => attrs.includes(n) })
ok(shouldShrinkInput(input([])), 'a file input is shrunk by default - a new upload box gets it without being told')
ok(!shouldShrinkInput(input(['data-full-size'])), '...unless it says data-full-size')
ok(!shouldShrinkInput({ type: 'text', hasAttribute: () => false }), '...and nothing that is not a file input is touched')
ok(!shouldShrinkInput(null), '...or nothing at all')

const f = fitWithin(4032, 3024)
ok(f.width === MAX_IMAGE_SIDE && f.height === 1500, `a camera photo comes down to ${MAX_IMAGE_SIDE}px on its long side, shape kept`)

const shrink = code('lib/shrink-image.ts')
ok(/const SHRINKABLE = \/\^image\\\/\(jpeg\|jpg\|png\|webp\|heic\|heif\)\$\/i/.test(shrink),
  'only photos are re-encoded - a PDF, a spreadsheet or a Word file goes up exactly as picked')
ok(/if \(!blob \|\| blob\.size >= file\.size\) return file/.test(shrink),
  'a "shrunk" copy that came out bigger is thrown away')
ok(/catch \{\s*return file\s*\}/.test(shrink), 'a picture the browser cannot decode goes up as it was, never lost')

// ── mounted once, ahead of every screen ─────────────────────────────────────
ok(/<ShrinkUploads \/>/.test(code('app/layout.tsx')),
  'the ROOT layout mounts it - every screen, the client portal and the share, bid, RFI and compliance links included')
const listener = code('components/ui/shrink-uploads.tsx')
ok(/window\.addEventListener\('change', onChange, true\)/.test(listener),
  'it listens in the CAPTURE phase on window, before React\'s own listener at the root')
ok(/e\.stopImmediatePropagation\(\)/.test(listener) && /input\.files = dt\.files/.test(listener)
  && /input\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/.test(listener),
  'it holds the pick, puts the smaller files on the input, and replays the change for the screen')
ok(/if \(replaying\.has\(input\)\) \{ replaying\.delete\(input\); return \}/.test(listener),
  'the replayed change goes straight through - or the listener would catch its own event for ever')
ok(/if \(!picked\.some\(f => f\.type\.toLowerCase\(\)\.startsWith\('image\/'\)\)\) return/.test(listener),
  'a pick with no photo in it is not held up at all')

// ── what keeps its original ─────────────────────────────────────────────────
const fullSize: [string, RegExp, string][] = [
  ['app/(dashboard)/projects/[id]/plans/page.tsx', /type="file" data-full-size/g, 'plans (a drawing loses the dimension you read off it)'],
  ['components/projects/site-models-panel.tsx', /ref=\{fileRef\} type="file" data-full-size/, 'house model plans'],
  ['app/(dashboard)/projects/[id]/request-quotes/page.tsx', /ref=\{planRef\} type="file" data-full-size/, 'the plans sent to bidders'],
  ['app/(dashboard)/projects/[id]/submittals/page.tsx', /type="file" data-full-size accept=\{ACCEPT_DOCS\}/, 'shop drawings on a submittal'],
  ['app/(dashboard)/files/page.tsx', /ref=\{fileRef\} type="file" data-full-size/, 'the company Files library'],
  ['app/(dashboard)/files/page.tsx', /ref=\{packetFileRef\} type="file" data-full-size/, 'files added to a packet'],
  ['app/(dashboard)/settings/page.tsx', /ref=\{logoInputRef\} type="file" data-full-size/, 'the company logo (a JPEG would lose its transparency)'],
]
for (const [file, re, what] of fullSize) ok(re.test(read(file)), `${what} keeps its original`)
ok((read('app/(dashboard)/projects/[id]/plans/page.tsx').match(/type="file" data-full-size/g) ?? []).length === 2,
  '...on BOTH of the Plans screen\'s upload boxes')

// The everyday photo boxes are NOT opted out - that is the point.
const photos = ['app/(dashboard)/projects/[id]/daily-logs/page.tsx', 'app/field/log/page.tsx', 'components/materials/materials-view.tsx']
for (const p of photos) ok(!/data-full-size/.test(read(p)), `${p.split('/').slice(-2).join('/')} photos are shrunk`)

// And the scan sees every file input in the app, so a count drifting is noticed.
const boxes = walk('app').concat(walk('components')).filter(p => p.endsWith('.tsx'))
  .reduce((n, p) => n + (read(p).match(/type="file"/g) ?? []).length, 0)
ok(boxes >= 45, `the listener covers every one of the app's ${boxes} upload boxes, with no per-screen wiring`)

done()
