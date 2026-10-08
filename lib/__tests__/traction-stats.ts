// Usage figures on the public site ("140+ contractors", "$42M tracked",
// "1,800+ jobs", "12,500+ documents scanned", "11 states") are not counts of
// anything yet. lib/traction.ts is the one switch; every file that prints one
// has to read it, so a new page cannot quietly bring them back.
import { ok, done, code, walk } from './_helpers'

const FIGURE = /140\+|\$42M|1,800\+|12,500\+|9,400\+|end:\s*(140|42|1800|12500)\b|11 states/
const files = [...walk('app'), ...walk('components')]
const printing = files.filter(f => FIGURE.test(code(f)))

// The scan must be able to see the figures, or a clean run means nothing.
ok(printing.length >= 6, `the scan finds the figures (${printing.length} files)`)

for (const f of printing) {
  if (f === 'components/marketing/stat-marquee.tsx') continue   // gated where it is rendered
  ok(/SHOW_TRACTION_STATS/.test(code(f)), `${f} prints a usage figure behind SHOW_TRACTION_STATS`)
}

for (const f of files) {
  const src = code(f)
  const uses = src.match(/<StatMarquee\b[^>]*\/>/g) ?? []
  for (const _ of uses) {
    ok(/SHOW_TRACTION_STATS\s*&&\s*<StatMarquee/.test(src), `${f} renders StatMarquee behind SHOW_TRACTION_STATS`)
  }
}

done()
