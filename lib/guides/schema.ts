// ─────────────────────────────────────────────────────────────────────────────
// SyteNav guides - the shape of a published article, and everything DERIVED
// from it.
//
// An article is plain data. The page is a renderer over these blocks and holds
// no copy of its own, so there is exactly one place a sentence lives and the
// index, the sitemap, the breadcrumb trail and the structured data cannot
// disagree with the page.
//
// WHAT IS DELIBERATELY NOT A FIELD HERE:
//
//   - read time. A stored "6 min read" is a claim that stops being true the
//     moment somebody edits a paragraph, and nothing would ever tell you.
//     `readMinutes()` counts the words that are actually on the page.
//   - the table of contents. Written by hand it is a second list of the
//     headings, one rename away from pointing at an anchor that no longer
//     exists. `tocFor()` reads the h2 blocks.
//   - heading ids. Same reason: `headingId()` is asked by the renderer AND by
//     the contents list, so the link and the target are one answer.
// ─────────────────────────────────────────────────────────────────────────────

export type GuideBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'callout'; tone: GuideTone; title: string; text: string }
  | { type: 'compare'; title: string; left: GuideColumn; right: GuideColumn }
  | { type: 'checklist'; title: string; items: string[] }

export type GuideTone = 'tip' | 'warn' | 'note'

/**
 * An inline link inside a guide's prose.
 *
 * WHY IT IS DECLARED HERE AND NOT WRITTEN INTO THE TEXT. A block is a plain
 * string, which is what keeps the copy readable and greppable. Putting anchors
 * in it would mean either HTML in the data (which the renderer would have to
 * trust) or a markdown parser nobody asked for. So a guide declares its links
 * beside its body: a phrase, and where that phrase should point.
 *
 * THE FAILURE THIS SHAPE HAS, and the reason the test is not optional: a phrase
 * that does not match the prose EXACTLY links nothing, silently. It does not
 * throw, it does not warn, and the page renders perfectly - just without the
 * link somebody asked for. `lib/__tests__/guides.ts` asserts every declared
 * phrase occurs EXACTLY ONCE in the guide it belongs to, which is the only
 * thing standing between a typo and a link nobody notices is missing.
 */
export interface GuideLink {
  /** The exact words to turn into a link. */
  text: string
  /** Where they point - a marketing path, or an absolute URL for a citation. */
  href: string
}

/** One piece of rendered prose: plain text, or text that is a link. */
export interface GuideSpan { text: string; href?: string }

/**
 * Split a string into spans, linking each declared phrase.
 *
 * Longest phrase first, so a declared phrase that contains another cannot be
 * half-eaten by it; each phrase links its FIRST occurrence only, and a region
 * already claimed by one link is never re-matched. Pure, and unit-tested.
 */
export function linkify(text: string, links: GuideLink[] = []): GuideSpan[] {
  const claims: { start: number; end: number; href: string }[] = []
  for (const link of [...links].sort((a, b) => b.text.length - a.text.length)) {
    let from = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const at = text.indexOf(link.text, from)
      if (at === -1) break
      const end = at + link.text.length
      if (!claims.some(c => at < c.end && end > c.start)) {
        claims.push({ start: at, end, href: link.href })
        break
      }
      from = at + 1
    }
  }
  if (claims.length === 0) return [{ text }]

  claims.sort((a, b) => a.start - b.start)
  const spans: GuideSpan[] = []
  let cursor = 0
  for (const c of claims) {
    if (c.start > cursor) spans.push({ text: text.slice(cursor, c.start) })
    spans.push({ text: text.slice(c.start, c.end), href: c.href })
    cursor = c.end
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) })
  return spans
}

/** True for a link that leaves the site, which is rendered differently. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//.test(href)
}

export interface GuideColumn { label: string; items: string[] }

export interface GuideFaq { q: string; a: string }

export interface Guide {
  /** URL segment under /guides. */
  slug: string
  /** The H1. */
  title: string
  /**
   * The short name used on a card and in the breadcrumb trail.
   *
   * An H1 may be long, because it is read in place and carries the search
   * phrase; "A construction daily log app that actually gets used: logs and
   * inspections from the field" is a good heading and a terrible card. Defaults
   * to the title, so it is only set where the two genuinely differ.
   */
  cardTitle?: string
  /** The <title> tag, which is allowed to be longer and more literal. */
  metaTitle: string
  /** The meta description. */
  description: string
  /** The one phrase this page is written to answer. */
  keyword: string
  /** Everything else it should be findable by. */
  keywords: string[]
  category: GuideCategoryKey
  /** ISO date. Real, because it is printed and put in the structured data. */
  published: string
  updated?: string
  /** The standfirst under the H1. */
  lede: string
  /** The short version, for somebody who will not read the whole thing. */
  takeaways: string[]
  blocks: GuideBlock[]
  /** Inline links applied to the prose. See GuideLink for why they live here. */
  links?: GuideLink[]
  faqs: GuideFaq[]
  /** Slugs of other guides. Validated, so a typo cannot ship a dead link. */
  related: string[]
}

export type GuideCategoryKey = 'choosing' | 'change-orders' | 'billing' | 'field'

export interface GuideCategory {
  key: GuideCategoryKey
  label: string
  description: string
}

export const GUIDE_CATEGORIES: GuideCategory[] = [
  { key: 'choosing', label: 'Choosing software', description: 'What to look for, what to ignore, and when a spreadsheet is still the right answer.' },
  { key: 'change-orders', label: 'Change orders', description: 'Getting extra work priced, approved and paid for - and documented well enough to hold up.' },
  { key: 'billing', label: 'Billing and job costs', description: 'Invoices in, invoices out, and knowing where a job stands while you can still do something about it.' },
  { key: 'field', label: 'The field', description: 'Daily logs, inspections and the record the site actually produces.' },
]

/** The short name for a card or a breadcrumb. One answer, so the two agree. */
export function cardLabel(g: Guide): string {
  return g.cardTitle ?? g.title
}

/** What a guide's category is CALLED. Asked by the card and by the article hero. */
export function categoryLabel(g: Guide): string {
  return GUIDE_CATEGORIES.find(c => c.key === g.category)?.label ?? ''
}

/** The URL a guide lives at. One answer, asked by the page, the sitemap and the trail. */
export function guidePath(slug: string): string {
  return `/guides/${slug}`
}

/**
 * The anchor for a heading.
 *
 * Stripped to ASCII words on purpose: a curly apostrophe or an en dash in an
 * `id` survives the HTML and dies in the URL, which is the kind of link that
 * works everywhere except the place somebody pasted it.
 */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The text the renderer APPLIES LINKS TO: every block except a heading, plus
 * the FAQ answers.
 *
 * Kept beside `guideText` rather than folded into it because the two answer
 * different questions. `guideText` is everything a reader sees, which is what
 * read time and the keyword check want. This is the subset a declared link can
 * actually land in - and a phrase that matches only a heading would pass a
 * check against the former while rendering as plain words.
 */
export function linkableText(g: Guide): string[] {
  const parts: string[] = [g.lede, ...g.takeaways]
  for (const b of g.blocks) {
    if (b.type === 'p') parts.push(b.text)
    else if (b.type === 'list' || b.type === 'steps' || b.type === 'checklist') parts.push(...b.items)
    else if (b.type === 'callout') parts.push(b.text)
    else if (b.type === 'compare') parts.push(...b.left.items, ...b.right.items)
  }
  for (const f of g.faqs) parts.push(f.a)
  return parts
}

/** Headings only - where a link may NOT go. */
export function headingText(g: Guide): string[] {
  return g.blocks.filter(b => b.type === 'h2' || b.type === 'h3').map(b => (b as { text: string }).text)
}

/** Every word a reader actually sees, in order. Used for read time and for search. */
export function guideText(g: Guide): string[] {
  const parts: string[] = [g.title, g.lede, ...g.takeaways]
  for (const b of g.blocks) {
    if (b.type === 'p' || b.type === 'h2' || b.type === 'h3') parts.push(b.text)
    else if (b.type === 'list' || b.type === 'steps') parts.push(...b.items)
    else if (b.type === 'callout') parts.push(b.title, b.text)
    else if (b.type === 'checklist') parts.push(b.title, ...b.items)
    else if (b.type === 'compare') parts.push(b.title, b.left.label, ...b.left.items, b.right.label, ...b.right.items)
  }
  for (const f of g.faqs) parts.push(f.q, f.a)
  return parts
}

/**
 * Read time, derived.
 *
 * 225 words a minute, rounded up, never less than one. Rounded UP because the
 * failure people notice is a page that takes longer than it promised.
 */
export function readMinutes(g: Guide): number {
  const words = guideText(g).join(' ').trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 225))
}

/** The contents list: the h2 headings, in the order they appear, with their anchors. */
export function tocFor(g: Guide): { text: string; id: string }[] {
  return g.blocks
    .filter((b): b is { type: 'h2'; text: string } => b.type === 'h2')
    .map(b => ({ text: b.text, id: headingId(b.text) }))
}
