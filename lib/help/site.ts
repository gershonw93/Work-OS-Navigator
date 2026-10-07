// ─────────────────────────────────────────────────────────────────────────────
// The public Help Center (help.sytenav.com), derived from the in-app articles.
//
// THERE IS ONE SET OF ARTICLES. `lib/help/articles.ts` is still the only place
// help is written, and the in-app /help still reads it directly; this file only
// decides what the public site shows and where each page lives. A second copy
// of the content for the public site would be the "one fact, one home" failure
// at article scale - the public answer would drift from the app the first time
// a feature changed and only one of them was updated.
//
// Every public door asks `isPublicArticle`, so an app-only article cannot leak
// through a related link or the sitemap while the index correctly hides it.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetadataRoute } from 'next'
import {
  HELP_CATEGORIES, PUBLIC_HELP_ARTICLES, getArticle, isPublicArticle, searchArticles,
  type HelpArticle, type HelpCategory,
} from '@/lib/help/articles'
import { helpCanonical } from '@/lib/help-host'

export const articlePath = (slug: string) => `/articles/${slug}`
export const topicPath = (key: string) => `/topics/${key}`

/** A category with the public articles in it. Empty ones are not shown. */
export interface PublicTopic extends HelpCategory {
  articles: HelpArticle[]
}

export function publicTopics(): PublicTopic[] {
  return HELP_CATEGORIES
    .map(c => ({ ...c, articles: PUBLIC_HELP_ARTICLES.filter(a => a.category === c.key) }))
    .filter(t => t.articles.length > 0)
}

export function publicTopic(key: string): PublicTopic | undefined {
  return publicTopics().find(t => t.key === key)
}

export function publicArticle(slug: string): HelpArticle | undefined {
  const a = getArticle(slug)
  return isPublicArticle(a) ? a : undefined
}

/** The related links that survive the public gate. */
export function publicRelated(article: HelpArticle): HelpArticle[] {
  return (article.related ?? []).map(getArticle).filter(isPublicArticle)
}

/** The in-app ranking, behind the public gate. */
export function searchPublic(query: string): HelpArticle[] {
  return searchArticles(query).filter(isPublicArticle)
}

export function topicLabel(key: string): string {
  return HELP_CATEGORIES.find(c => c.key === key)?.label ?? key
}

/**
 * The articles a newcomer most needs, by slug. Named rather than computed:
 * there is no view count to rank by, and "first N in the file" would put a
 * logo upload above how to get paid. Unknown or app-only slugs drop out.
 */
const POPULAR_SLUGS = [
  'what-is-sytenav', 'set-up-existing-job', 'request-quotes', 'add-project-budget',
  'pay-applications', 'connect-quickbooks', 'client-portal', 'field-mode',
]

export function popularArticles(): HelpArticle[] {
  return POPULAR_SLUGS.map(publicArticle).filter((a): a is HelpArticle => !!a)
}

/** An article as plain prose - for the meta description fallback and the AI. */
export function articlePlainText(a: HelpArticle): string {
  const out: string[] = [a.title, a.summary]
  for (const b of a.blocks) {
    if (b.type === 'text') out.push(b.text)
    else if (b.type === 'tip') out.push(`Tip: ${b.text}`)
    else if (b.type === 'warn') out.push(`Note: ${b.text}`)
    else if (b.type === 'steps') out.push(b.items.map((s, i) => `${i + 1}. ${s}`).join('\n'))
  }
  return out.join('\n\n')
}

/**
 * The sitemap for the Help Center.
 *
 * NO lastModified, on purpose: articles carry no date, and the build clock is
 * the lie `app/sitemap.ts` already explains. "We are not telling you" is a
 * fact a crawler handles; an invented date is not.
 */
export function helpSitemap(): MetadataRoute.Sitemap {
  return [
    { url: helpCanonical('/'), changeFrequency: 'weekly', priority: 0.8 },
    ...publicTopics().map(t => ({
      url: helpCanonical(topicPath(t.key)), changeFrequency: 'weekly' as const, priority: 0.6,
    })),
    ...PUBLIC_HELP_ARTICLES.map(a => ({
      url: helpCanonical(articlePath(a.slug)), changeFrequency: 'monthly' as const, priority: 0.6,
    })),
  ]
}
