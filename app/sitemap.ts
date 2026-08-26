import type { MetadataRoute } from 'next'
import { CANONICAL_ORIGIN } from '@/lib/canonical'


// Only the public marketing pages belong in the sitemap; the app itself is
// behind auth and excluded via robots.ts.
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
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
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(p => ({
    url: `${CANONICAL_ORIGIN}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
