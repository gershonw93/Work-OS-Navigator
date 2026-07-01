import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://sytenav.com'

// Only the public marketing pages belong in the sitemap; the app itself is
// behind auth and excluded via robots.ts.
const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/homepage', priority: 1, changeFrequency: 'weekly' },
  { path: '/homepage/features', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/homepage/ai', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/homepage/contractors', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/homepage/subcontractors', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/homepage/why', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/homepage/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/homepage/security', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/homepage/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/homepage/contact', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/homepage/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/homepage/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/homepage/cookies', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/homepage/acceptable-use', priority: 0.3, changeFrequency: 'yearly' },
]

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(p => ({
    url: `${BASE}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))
}
