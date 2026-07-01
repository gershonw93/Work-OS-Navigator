import type { MetadataRoute } from 'next'

const BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://sytenav.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/homepage', '/'],
        disallow: [
          '/dashboard',
          '/projects',
          '/settings',
          '/directory',
          '/approvals',
          '/admin',
          '/api',
          '/portal',
          '/bid',
          '/auth',
          '/login',
          '/signup',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  }
}
