import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { CANONICAL_ORIGIN, isIndexableHost } from '@/lib/canonical'
import { HELP_URL, isHelpHost } from '@/lib/help-host'

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

  // help.sytenav.com is nothing BUT public articles, so there is nothing on it
  // to hide - and it has its own sitemap, served from app/help-center.
  if (isHelpHost(host)) {
    return {
      rules: [{ userAgent: '*', allow: ['/'], disallow: ['/api'] }],
      sitemap: `${HELP_URL}/sitemap.xml`,
      host: HELP_URL,
    }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
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
