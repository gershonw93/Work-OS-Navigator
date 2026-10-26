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
/** Assistant and AI-search crawlers. None is blocked; see the rule below. */
const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
]

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

  // The app's private paths, refused to every crawler alike.
  const disallow = [
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
    '/shared-report',
    '/reports',
    '/bill',
    '/field',
    '/my-jobs',
    '/auth',
    '/login',
    '/signup',
  ]

  return {
    rules: [
      // AI CRAWLERS ARE WELCOME, AND SAID SO BY NAME. The '*' group below
      // already lets them in; naming them makes the answer to "is GPTBot
      // blocked?" readable in robots.txt itself rather than inferred. A named
      // group REPLACES '*' for that bot, so it carries the same disallow list.
      { userAgent: AI_CRAWLERS, allow: ['/'], disallow },
      { userAgent: '*', allow: ['/'], disallow },
    ],
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  }
}
