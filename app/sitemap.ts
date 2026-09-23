import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN } from '@/lib/canonical'
import { GUIDES, guidePath } from '@/lib/guides'


// Only the public marketing pages belong in the sitemap; the app itself is
// behind auth and excluded via robots.ts.
//
// `lastModified` IS CONTENT DATA, AND A LIE HERE IS EXPENSIVE. Every URL used
// to carry `new Date()` - the build clock - so a deploy that changed one
// dependency told Google the privacy policy, the pricing page and all ten
// guides had just been rewritten. Google says plainly that it ignores `lastmod`
// when it does not match what actually changed, and once it has learned to
// ignore a sitemap's dates it ignores the honest ones too. That is the same
// rule the guide pages already follow for `dateModified` (they read
// `updated ?? published`) - the sitemap was the one place still stamping the
// clock, on everything at once.
//
// A guide has real dates, so it uses them. A static page has none, so it sends
// NO lastmod at all: "we are not telling you" is a fact a crawler handles fine,
// and is the only honest alternative to inventing one.
const PAGES: {
  path: string
  priority: number
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  /** A real content date, or absent. Never the build clock. */
  lastModified?: string
}[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/features', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/money', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/flows', priority: 0.9, changeFrequency: 'weekly' },
  // Was missing entirely - a page linked from the main nav that search engines
  // were never told about.
  { path: '/workflow', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/ai', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/mobile', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/contractors', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/subcontractors', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/why', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/acceptable-use', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/delete-account', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/guides', priority: 0.8, changeFrequency: 'weekly' },
]

// The guides themselves are NOT listed by hand. A published article that nobody
// told a search engine about is the failure /workflow already demonstrated
// above, and a hand-kept list is exactly how that happens a second time.
const GUIDE_PAGES: typeof PAGES = GUIDES.map(g => ({
  path: guidePath(g.slug),
  priority: 0.7,
  changeFrequency: 'monthly',
  // The same pair the article's own dateModified reads. One home for the fact.
  lastModified: g.updated ?? g.published,
}))

export default function sitemap(): MetadataRoute.Sitemap {
  return [...PAGES, ...GUIDE_PAGES].map(p => ({
    url: `${CANONICAL_ORIGIN}${p.path}`,
    // Omitted entirely when there is no real date, rather than filled with the
    // build clock. Next drops the key when it is undefined.
    ...(p.lastModified ? { lastModified: new Date(p.lastModified) } : {}),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
