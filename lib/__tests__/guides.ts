// ─────────────────────────────────────────────────────────────────────────────
// The guides library: ten public articles under /guides, rendered from data in
// lib/guides by one template.
//
// WHAT THIS SUITE IS FOR. A marketing article fails silently in ways product
// code does not. A guide that is not in the sitemap is a page nobody is told
// about - which already happened to /workflow, a page in the main nav that
// search engines were never given. A guide the host router does not recognise
// as marketing is worse: `isMarketingPath` decides, on the app host, whether a
// visitor is redirected OUT of the site, and anything not listed is treated as
// app-side by design. A related link with a typo in the slug is a 404 served
// from inside our own page. None of the three throws, breaks a build, or shows
// up on a screen anyone looks at.
//
// So the assertions here are mostly "every published guide is joined up to the
// four things that have to know about it": the router, the sitemap, the
// breadcrumb trail, and the renderer.
//
// Per lib/__tests__/README.md, every scan below is also shown a fault it must
// catch - a fabricated guide with a bad slug, a missing keyword, a colliding
// heading - because a scan that reports zero because its pattern never matched
// is worse than no scan.
// ─────────────────────────────────────────────────────────────────────────────

import { GUIDES, GUIDE_CATEGORIES, guideBySlug, guidePath, relatedTo } from '../guides'
import { cardLabel, headingId, isExternal, linkify, readMinutes, tocFor, guideText, type Guide } from '../guides/schema'
import { GUIDE_AUTHOR, authorNode } from '../guides/author'
import { isMarketingPath, isAppPath, MARKETING_PATHS } from '../hosts'
import { crumbsFor } from '../breadcrumbs'
import sitemap from '../../app/sitemap'
import { ok, done, code, read } from './_helpers'

const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase())

// ── 1. the registry is internally consistent ─────────────────────────────────
ok(GUIDES.length === 10, `ten guides are published (${GUIDES.length})`)

const slugs = GUIDES.map(g => g.slug)
ok(new Set(slugs).size === slugs.length, 'no two guides share a slug')
ok(slugs.every(s => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)),
  'every slug is lowercase, hyphenated and URL-safe')
ok(GUIDES.every(g => GUIDE_CATEGORIES.some(c => c.key === g.category)),
  'every guide names a category that exists')
ok(GUIDE_CATEGORIES.every(c => GUIDES.some(g => g.category === c.key)),
  '...and every category has at least one guide, so the index draws no empty section')

// ── 2. a related link goes somewhere ─────────────────────────────────────────
// `relatedTo` DROPS an unknown slug rather than rendering a dead link, which
// means a typo would ship quietly. This is the check that makes the drop safe.
const danglers: string[] = []
for (const g of GUIDES) {
  for (const slug of g.related) {
    if (slug === g.slug) danglers.push(`${g.slug} -> itself`)
    else if (!guideBySlug(slug)) danglers.push(`${g.slug} -> ${slug}`)
  }
}
ok(danglers.length === 0,
  `every "read next" link resolves${danglers.length ? ` - ${danglers[0]} (+${danglers.length - 1})` : ''}`)
ok(GUIDES.every(g => relatedTo(g).length >= 2), 'each guide offers at least two more to read')

// The fault: a guide pointing at a slug that does not exist must come back short.
const FAKE: Guide = { ...GUIDES[0], slug: 'fabricated', related: ['procore-alternatives-small-gcs', 'no-such-guide'] }
ok(relatedTo(FAKE).length === 1, '...and the resolver really does drop an unknown slug (fault check)')

// ── 3. the page is about the thing it is targeting ───────────────────────────
// A guide carries one keyword. If that phrase appears nowhere in the title, the
// description or the body, the page is not about it - and the article was
// written against a different brief from the one in the front matter.
const offTopic: string[] = []
for (const g of GUIDES) {
  const body = [g.title, g.metaTitle, g.description, g.lede, ...guideText(g)].join(' ')
  if (!has(body, g.keyword)) offTopic.push(g.slug)
  if (!g.keywords.some(k => k === g.keyword)) offTopic.push(`${g.slug} (keyword not in keywords)`)
}
ok(offTopic.length === 0,
  `every guide uses its own keyword${offTopic.length ? ` - ${offTopic[0]}` : ''}`)
const OFF: Guide = { ...GUIDES[0], keyword: 'hydraulic excavator financing' }
ok(!has([OFF.title, OFF.description, ...guideText(OFF)].join(' '), OFF.keyword),
  '...and the scan can see a keyword that is absent (fault check)')

// ── 3b. the title, the H1 and the slug are about ONE thing ───────────────────
// A page whose <title> targets one phrase while its H1 narrows to another is a
// page that ranks for neither: "construction spreadsheet vs software" in the
// title with "Google Sheets vs construction software" as the heading was the
// worked example. Both now have to carry the phrase the page is written for.
const mismatched: string[] = []
for (const g of GUIDES) {
  if (!has(g.title, g.keyword)) mismatched.push(`${g.slug}: H1`)
  if (!has(g.metaTitle, g.keyword)) mismatched.push(`${g.slug}: title`)
}
ok(mismatched.length === 0,
  `the H1 and the <title> both carry the target phrase${mismatched.length ? ` - ${mismatched[0]}` : ''}`)
ok(!has('Google Sheets vs construction software', 'construction spreadsheet vs software'),
  '...and the scan can see the mismatch it was written for (fault check)')

// A card and a breadcrumb print the SHORT label, which is why an H1 is allowed
// to be long. Without a cap the two silently become the same thing again.
const longCards = GUIDES.filter(g => cardLabel(g).length > 60)
ok(longCards.length === 0,
  `no card label is too long to read${longCards.length ? ` - ${longCards[0].slug} (${cardLabel(longCards[0]).length})` : ''}`)
ok(GUIDES.some(g => g.cardTitle && g.cardTitle !== g.title),
  '...and where an H1 carries a search phrase, the card has its own shorter name')

// ── 3c. an inline link points at something, and its words exist ──────────────
// THE SILENT FAILURE this exists for: a link is declared as a PHRASE plus an
// href, and a phrase that does not match the prose exactly links nothing at
// all. No error, no warning - the page just renders without the link somebody
// asked for. So every declared phrase must occur exactly once in the guide it
// belongs to, and every internal href must be a real marketing path.
const badLinks: string[] = []
for (const g of GUIDES) {
  const prose = guideText(g).join('\n')
  for (const link of g.links ?? []) {
    const hits = prose.split(link.text).length - 1
    if (hits === 0) badLinks.push(`${g.slug}: "${link.text}" is not in the text`)
    else if (hits > 1) badLinks.push(`${g.slug}: "${link.text}" appears ${hits} times, so which one is the link?`)
    if (!isExternal(link.href) && !isMarketingPath(link.href)) badLinks.push(`${g.slug}: ${link.href} is not a marketing page`)
  }
}
ok(badLinks.length === 0,
  `every inline link matches its prose exactly once${badLinks.length ? ` - ${badLinks[0]}` : ''}`)
ok(GUIDES.every(g => (g.links ?? []).length > 0), 'every guide links out to the product pages it describes')
ok(GUIDES.some(g => (g.links ?? []).some(l => isExternal(l.href))),
  '...and a claim about somebody else\u2019s pricing cites its source')

// The fault, both halves: a phrase that is absent, and one that is ambiguous.
const sample = GUIDES[0]
const sampleProse = guideText(sample).join('\n')
ok(sampleProse.split('a phrase nobody wrote').length - 1 === 0,
  '...and the scan can see an absent phrase (fault check)')
ok(sampleProse.split('the').length - 1 > 1,
  '...and an ambiguous one (fault check)')

// ── 3d. linkify itself ───────────────────────────────────────────────────────
const LINKS = [{ text: 'budget line', href: '/money' }, { text: 'the budget line it raises', href: '/features' }]
const spans = linkify('It carries the budget line it raises, and the budget line is the point.', LINKS)
ok(spans.filter(s => s.href).length === 2, `both phrases link (${spans.filter(s => s.href).length})`)
ok(spans.find(s => s.text === 'the budget line it raises')?.href === '/features',
  'the LONGER phrase wins, so a short one cannot eat half of it')
ok(spans.map(s => s.text).join('') === 'It carries the budget line it raises, and the budget line is the point.',
  'and the text is returned whole - nothing dropped, nothing reordered')
ok(linkify('nothing to link here', LINKS).length === 1, 'prose with no match comes back as one span')
ok(linkify('the budget line', []).length === 1, '...and so does prose with no links declared')

// ── 3e. a person wrote it, and the page says so ──────────────────────────────
// An Article whose author is the Organization is a page nobody put their name
// to. The byline a reader sees and the Person node a crawler reads come from
// one module, so they cannot name different people.
const byline = code('components/marketing/guide-byline.tsx')
ok(/GUIDE_AUTHOR\.byline/.test(byline) && /GUIDE_AUTHOR\.bio/.test(byline),
  'the visible byline and bio are printed from the author module')
ok(authorNode['@type'] === 'Person' && authorNode.description === GUIDE_AUTHOR.bio,
  '...and the Person node is built from the same one')
const articlePage = code('app/(marketing)/guides/[slug]/page.tsx')
ok(/<GuideByline \/>/.test(articlePage), 'every guide prints the byline, not just the markup')
ok(/author: \{ '@id': GUIDE_AUTHOR\.id \}/.test(articlePage),
  'the Article credits the PERSON as author')
ok(/publisher: \{ '@id': `\$\{CANONICAL_ORIGIN\}\/#organization` \}/.test(articlePage),
  '...and the organisation as publisher')
ok(!/author: \{ '@id': `\$\{CANONICAL_ORIGIN\}\/#organization` \}/.test(articlePage),
  '...and never the organisation as author again (fault check)')

// ── 3f. dateModified is CONTENT, not the build clock ─────────────────────────
// A dateModified generated at build time restamps all ten articles on every
// deploy, telling a crawler the library was rewritten because a dependency
// changed. It reads `updated ?? published`, both of which are written by hand.
ok(/dateModified: guide\.updated \?\? guide\.published/.test(articlePage),
  'dateModified comes from the article, not from the clock')
ok(!/dateModified: new Date\(\)|dateModified: Date\.now\(\)|dateModified: new Date\(\)\.toISOString/.test(articlePage),
  '...and is never generated at build time (fault check)')
ok(GUIDES.every(g => !g.updated || g.updated >= g.published),
  'no guide claims it was modified before it was published')

// ── 4. the parts a reader and a search result both need ──────────────────────
const thin: string[] = []
for (const g of GUIDES) {
  if (g.takeaways.length < 3) thin.push(`${g.slug}: takeaways`)
  if (g.faqs.length < 3) thin.push(`${g.slug}: faqs`)
  if (tocFor(g).length < 4) thin.push(`${g.slug}: headings`)
  if (readMinutes(g) < 4) thin.push(`${g.slug}: too short to be a guide`)
}
ok(thin.length === 0, `no guide is a stub${thin.length ? ` - ${thin[0]}` : ''}`)

// Meta lengths. Not style: a description past ~160 characters is truncated in
// the result, so the half that was doing the persuading is the half that goes.
// 90, not 80: a result truncates a title around 60 characters anyway, so this
// cap is here to catch a runaway, not to police the last few. The longest of
// the ten - "Construction Invoice Verification: How to Stop Subcontractor
// Overbilling | SyteNav" - is a deliberate 82.
const overlong = GUIDES.filter(g => g.description.length > 175 || g.metaTitle.length > 90)
ok(overlong.length === 0,
  `titles and descriptions stay inside what a result shows${overlong.length ? ` - ${overlong[0].slug}` : ''}`)

// ── 5. anchors: the contents list and the headings are one answer ────────────
// `tocFor` and the renderer both ask `headingId`, so the only way a contents
// link can point at nothing is two headings colliding on one id.
const collisions: string[] = []
for (const g of GUIDES) {
  const ids = tocFor(g).map(h => h.id)
  if (new Set(ids).size !== ids.length) collisions.push(g.slug)
  if (ids.some(id => id.length === 0)) collisions.push(`${g.slug}: empty id`)
}
ok(collisions.length === 0,
  `no guide has two headings on one anchor${collisions.length ? ` - ${collisions[0]}` : ''}`)
ok(headingId('What a “change order” really is') === 'what-a-change-order-really-is',
  'headingId strips smart quotes rather than putting them in a URL')
ok(headingId('Two dates') === headingId('Two  dates'),
  '...and the collision check above has something it could actually catch (fault check)')

// ── 6. the date on the article is a real one ─────────────────────────────────
// It is printed on the page AND written into the Article structured data as
// datePublished. A future date there is a claim a crawler can check.
const today = new Date().toISOString().slice(0, 10)
const badDates = GUIDES.filter(g =>
  !/^\d{4}-\d{2}-\d{2}$/.test(g.published) ||
  Number.isNaN(Date.parse(g.published)) ||
  g.published > today)
ok(badDates.length === 0,
  `no guide is dated in the future${badDates.length ? ` - ${badDates[0].slug} ${badDates[0].published}` : ''}`)

// ── 7. the host router calls a guide marketing ───────────────────────────────
// hosts.ts deliberately does NOT import the registry - middleware runs on the
// edge and would otherwise carry every article body - so it matches the
// /guides prefix instead. These two assertions are the join between them.
const misrouted = GUIDES.map(g => guidePath(g.slug)).filter(p => !isMarketingPath(p) || isAppPath(p))
ok(misrouted.length === 0,
  `every guide URL routes to the marketing host${misrouted.length ? ` - ${misrouted[0]}` : ''}`)
ok(isMarketingPath('/guides') && MARKETING_PATHS.indexOf('/guides') !== -1,
  'and so does the index itself')
ok(!isMarketingPath('/projects/abc') && !isMarketingPath('/settings'),
  '...without the prefix rule swallowing the product (fault check)')

// ── 8. the sitemap lists every one of them ───────────────────────────────────
const urls = sitemap().map(e => e.url)
const unlisted = GUIDES.map(g => guidePath(g.slug)).filter(p => !urls.some(u => u.endsWith(p)))
ok(unlisted.length === 0,
  `every guide is in the sitemap${unlisted.length ? ` - ${unlisted[0]}` : ''}`)
ok(urls.some(u => u.endsWith('/guides')), '...including the index')
ok(!urls.some(u => u.endsWith('/guides/no-such-guide')),
  '...and it is built from the registry, not a hand-kept list (fault check)')

// ── 9. the breadcrumb trail is three deep and names the article ──────────────
const first = GUIDES[0]
const trail = crumbsFor(guidePath(first.slug))
ok(!!trail && trail.length === 3, 'a guide gets a three-level trail')
ok(!!trail && trail[1].path === '/guides' && trail[2].name === cardLabel(first),
  '...ending in the article\u2019s short name rather than its slug or a long H1')
ok(crumbsFor('/guides/not-a-guide') === null,
  '...and an unpublished slug gets no trail (fault check)')

// ── 10. the template renders every kind of block ─────────────────────────────
// A block type with no case in the renderer returns undefined from the switch
// and draws NOTHING - no error, no warning, just a paragraph that is missing
// from the page. So the set of types and the set of cases are pinned together.
const schema = code('lib/guides/schema.ts')
const body = code('components/marketing/guide-body.tsx')
// [a-z0-9], because two of the eight are h2 and h3 - a digit in the name, and
// the first version of this line matched six of them and reported a clean scan.
const declared = Array.from(schema.matchAll(/\{ type: '([a-z0-9]+)'/g)).map(m => m[1])
ok(declared.length >= 8, `the block union still declares its types (${declared.length})`)
const unrendered = Array.from(new Set(declared)).filter(t => !new RegExp(`case '${t}'`).test(body))
ok(unrendered.length === 0,
  `every block type has a case in the renderer${unrendered.length ? ` - ${unrendered[0]}` : ''}`)
ok(!/case 'video'/.test(body), '...and the scan is matching cases, not just any text (fault check)')

// ── 11. the phone rules the rest of the site is held to ──────────────────────
const pages = ['app/(marketing)/guides/page.tsx', 'app/(marketing)/guides/[slug]/page.tsx']
const files = [...pages, 'components/marketing/guide-body.tsx', 'components/marketing/guide-card.tsx']
ok(files.every(f => !/<table/.test(read(f))),
  'no guide page renders a table to a phone - the comparison block is two stacked columns')
ok(/lg:hidden/.test(code(pages[1])) && /hidden lg:block/.test(code(pages[1])),
  'the contents list has a phone placement and a desktop one, not one that has to be both')
ok(files.every(f => !/fixed inset-0/.test(code(f))),
  'nothing here hand-rolls an overlay')

// ── 12. an unknown slug is a 404, not an empty template ──────────────────────
const article = code(pages[1])
ok(/generateStaticParams/.test(article), 'the guides are static pages, built from the registry')
ok(/notFound\(\)/.test(article), '...and an unknown slug 404s rather than drawing an empty article')
ok(/FAQPage/.test(article) && /'@type': 'Article'/.test(article),
  '...and each one carries Article and FAQPage structured data')
ok(/publishedTime/.test(article),
  '...and openGraph is replaced wholesale for an article, dated, rather than half-set')

done()
