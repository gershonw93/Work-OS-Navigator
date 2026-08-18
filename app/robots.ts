import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { CANONICAL_ORIGIN, isIndexableHost } from '@/lib/canonical'

/**
 * robots.txt, which is host-aware on purpose.
 *
 * The same deployment answers on the real domain AND on
 * work-os-navigator.vercel.app plus every preview alias. This file used to
 * allow crawling on all of them, so Google indexed the deployment URL as a
 * second copy of the entire site - competing with the real one and putting the
 * internal project name in the results.
 *
 * Anything that is not the canonical host now refuses the whole tree.
 */
export default function robots(): MetadataRoute.Robots {
  const host = headers().get('host')

  if (!isIndexableHost(host)) {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

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
          '/rfi',
          '/compliance',
          '/share',
          '/bill',
          '/field',
          '/my-jobs',
          '/auth',
          '/login',
          '/signup',
        ],
      },
    ],
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  }
}
