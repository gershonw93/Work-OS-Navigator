import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, Mail } from 'lucide-react'
import { ArticleBlock } from '@/components/help-center/article-body'
import { HelpBreadcrumbs } from '@/components/help-center/breadcrumbs'
import { HelpSearch } from '@/components/help-center/help-search'
import { helpMeta } from '@/components/help-center/meta'
import { helpCanonical, helpHref } from '@/lib/help-host'
import { PUBLIC_HELP_ARTICLES } from '@/lib/help/articles'
import { articlePath, publicArticle, publicRelated, publicTopic, topicPath } from '@/lib/help/site'
import { SUPPORT_EMAIL, supportMailto } from '@/lib/support-email'

// Static, one page per PUBLIC article. `dynamicParams = false` makes an
// app-only slug a 404 rather than a page rendered on demand - the gate is the
// list of params, not a check somebody has to remember inside the page.
export const dynamicParams = false
export function generateStaticParams() {
  return PUBLIC_HELP_ARTICLES.map(a => ({ slug: a.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const a = publicArticle(params.slug)
  if (!a) return {}
  return helpMeta({ title: `${a.title} | SyteNav Help Center`, description: a.summary, path: articlePath(a.slug) })
}

export default function ArticlePage({ params }: { params: { slug: string } }) {
  const article = publicArticle(params.slug)
  if (!article) notFound()
  const topic = publicTopic(article.category)
  const related = publicRelated(article)
  const siblings = (topic?.articles ?? []).filter(a => a.slug !== article.slug).slice(0, 6)

  // No dates: articles carry none, and an invented one is worse than none.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: article.title,
    description: article.summary,
    url: helpCanonical(articlePath(article.slug)),
    publisher: { '@type': 'Organization', name: 'SyteNav' },
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-6 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article className="min-w-0">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <HelpBreadcrumbs trail={[
          ...(topic ? [{ label: topic.label, path: topicPath(topic.key) }] : []),
          { label: article.title, path: articlePath(article.slug) },
        ]} />
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{article.title}</h1>
        <p className="mt-3 text-lg text-muted-fg">{article.summary}</p>
        <div className="mt-8 space-y-5">
          {article.blocks.map((b, i) => <ArticleBlock key={i} block={b} />)}
        </div>

        {related.length > 0 && (
          <section className="mt-12 border-t border-line pt-6" aria-labelledby="related">
            <h2 id="related" className="text-sm font-semibold uppercase tracking-wide text-faint">Related articles</h2>
            <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel">
              {related.map(r => (
                <li key={r.slug}>
                  <Link href={helpHref(articlePath(r.slug))} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
                    <span className="font-medium text-ink-soft">{r.title}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-10 rounded-2xl border border-line bg-panel p-5">
          <p className="font-semibold text-ink">Didn&apos;t find what you needed?</p>
          <p className="mt-1 text-sm text-muted-fg">Ask a question, or email us and a person will answer.</p>
          <div className="mt-4"><HelpSearch /></div>
          <a href={supportMailto(`Help Center: ${article.title}`)}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
            <Mail className="h-4 w-4" aria-hidden /> {SUPPORT_EMAIL}
          </a>
        </div>
      </article>

      {topic && siblings.length > 0 && (
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm font-semibold text-ink">More in {topic.label}</p>
          <ul className="mt-3 space-y-2">
            {siblings.map(s => (
              <li key={s.slug}>
                <Link href={helpHref(articlePath(s.slug))} className="text-sm text-muted-fg hover:text-ink">{s.title}</Link>
              </li>
            ))}
          </ul>
          <Link href={helpHref(topicPath(topic.key))} className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
            All {topic.articles.length} articles <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </aside>
      )}
    </div>
  )
}
