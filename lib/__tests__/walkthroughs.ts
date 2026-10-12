// ─────────────────────────────────────────────────────────────────────────────
// Step-by-step walkthroughs (public/tutorials/*.html), shown from Help articles.
//
// What this pins:
//   1. The registry and the folder agree, both ways - a file nobody lists is a
//      page nothing links to, and an entry with no file is a dialog showing a
//      404. Titles are the file's own <title> and <h1>.
//   2. Every walkthrough hangs off an article that exists.
//   3. A walkthrough that shows prices lives ONLY on `webOnly` articles, so it
//      can never be opened inside the iOS app (see lib/use-native.ts).
//   4. The first batch arrived as QA recordings: tester notes ("this
//      walkthrough cancelled", "QA example", "not tested") and screenshots of a
//      QA workspace holding copies of a real customer's job addresses. The
//      screenshots were blurred by hand and a text scan cannot see pixels - but
//      the TEXT can be scanned, and is, for both.
//   5. Both readers render them, and the frame is sandboxed.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ok, done, read, code, root } from './_helpers'
import { WALKTHROUGHS, walkthroughsFor, walkthroughLinks, walkthroughPath } from '../help/walkthroughs'
import { getArticle } from '../help/articles'

console.log('\nwalkthroughs')

const DIR = 'public/tutorials'
const files = readdirSync(join(root(), DIR)).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5))
const html = (file: string) => read(`${DIR}/${file}.html`)
/** What a reader sees: no inlined images, styles, scripts or tags. */
const visibleText = (file: string) => html(file)
  .replace(/data:[^"']+/g, '')
  .replace(/<(style|script)[\s\S]*?<\/\1>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#x27;/g, "'")

// ── 1. registry <-> folder ───────────────────────────────────────────────────
ok(files.length >= 50, `the folder holds the library (${files.length} files)`)
const listed = new Set(WALKTHROUGHS.map(w => w.file))
const unlisted = files.filter(f => !listed.has(f))
ok(unlisted.length === 0, `every file is in the registry${unlisted.length ? ` (missing: ${unlisted.join(', ')})` : ''}`)
const missing = WALKTHROUGHS.filter(w => !files.includes(w.file)).map(w => w.file)
ok(missing.length === 0, `every entry has a file${missing.length ? ` (no file: ${missing.join(', ')})` : ''}`)
ok(listed.size === WALKTHROUGHS.length, 'no file is registered twice')

const badTitles = WALKTHROUGHS.filter(w => files.includes(w.file)).filter(w => {
  const s = html(w.file)
  const title = s.match(/<title>([^<]*)<\/title>/)?.[1]
  const h1 = s.match(/<h1[^>]*>([^<]*)<\/h1>/)?.[1]
  return title !== w.title || h1 !== w.title
}).map(w => w.file)
ok(badTitles.length === 0, `each title matches the file's <title> and <h1>${badTitles.length ? ` (${badTitles.join(', ')})` : ''}`)

// ── 2. every walkthrough is reachable from a real article ───────────────────
const orphans = WALKTHROUGHS.filter(w => w.articles.length === 0 || w.articles.some(slug => !getArticle(slug)))
ok(orphans.length === 0, `every article slug exists${orphans.length ? ` (${orphans.map(w => w.file).join(', ')})` : ''}`)
ok(walkthroughsFor('create-first-project').some(w => w.file === 'create-your-first-project'),
  'an article finds its walkthrough')
ok(walkthroughLinks('time-clock')[0]?.src === '/tutorials/use-the-time-clock.html', 'in the app the link is same-site')
ok(walkthroughLinks('time-clock', 'https://www.sytenav.com')[0]?.src === 'https://www.sytenav.com/tutorials/use-the-time-clock.html',
  'with an origin it is absolute (the help host rewrites a relative path into its own tree)')
ok(walkthroughPath('x') === '/tutorials/x.html', 'served from public/tutorials')

// ── 3. a price stays off the iOS build ───────────────────────────────────────
// Screenshots can show a price the text never mentions, so the known one is
// named as well as sniffed.
const PRICE = /\$\s?\d|Settings > Billing|current prices|plan prices|\/month\b/i
const pricey = WALKTHROUGHS.filter(w => files.includes(w.file) && PRICE.test(visibleText(w.file)))
ok(pricey.some(w => w.file === 'review-plan-and-usage'), 'the scan sees the billing walkthrough (it can see the fault)')
const leaking = [...pricey, ...WALKTHROUGHS.filter(w => w.file === 'review-plan-and-usage')]
  .filter(w => w.articles.some(slug => !getArticle(slug)?.webOnly))
ok(leaking.length === 0,
  `a walkthrough showing prices sits only on webOnly articles${leaking.length ? ` (${leaking.map(w => w.file).join(', ')})` : ''}`)

// ── 4. no recording notes, no real customer ─────────────────────────────────
const NOTES = /\bQA\b|this walkthrough|this example|walkthrough cancel|was cancell?ed|not tested|not demonstrated|not exercised|fictional|fake example|example\.invalid/i
const noted = files.filter(f => NOTES.test(visibleText(f)))
ok(noted.length === 0, `no tester notes in the text${noted.length ? ` (${noted.join(', ')})` : ''}`)
// The QA workspace carried copies of a real customer's Palm Coast lots, and
// the account owner's name as a client. Their streets, by name.
const REAL = /palm coast|princess luise|palermo|port echo|pratt\b|prattwood|potterville|ryding|poindexter|wheeling|pepperdine|perrotti|weisblum|north port/i
const real = files.filter(f => REAL.test(visibleText(f)) || REAL.test(html(f).replace(/data:[^"']+/g, '')))
ok(real.length === 0, `no real customer names or addresses${real.length ? ` (${real.join(', ')})` : ''}`)
const dashed = files.filter(f => /[–—]/.test(html(f)))
ok(dashed.length === 0, `no em or en dashes (house style)${dashed.length ? ` (${dashed.join(', ')})` : ''}`)

// ── 5. both readers show them, in a sandboxed frame ──────────────────────────
const component = code('components/help/walkthroughs.tsx')
const sandbox = component.match(/sandbox="([^"]*)"/)?.[1]
ok(sandbox === 'allow-scripts', `the frame runs scripts and nothing else (sandbox="${sandbox}")`)
ok(/className="overlay\b/.test(component) && /data-overlay/.test(component), 'the dialog is an .overlay with data-overlay')
ok(/<Walkthroughs\s+items=\{walkthroughLinks\(article\.slug\)\}/.test(code('app/(dashboard)/help/page.tsx')),
  'the in-app reader renders an article\'s walkthroughs')
ok(/<Walkthroughs\s+items=\{publicWalkthroughs\(article\)\}/.test(code('app/help-center/articles/[slug]/page.tsx')),
  'the public article page renders them through the help-host-aware links')

done()
