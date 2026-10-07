import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { HelpSearch } from '@/components/help-center/help-search'
import { helpMeta } from '@/components/help-center/meta'
import { helpCanonical, helpHref } from '@/lib/help-host'
import { PUBLIC_HELP_ARTICLES } from '@/lib/help/articles'
import { articlePath, popularArticles, publicTopics, topicPath } from '@/lib/help/site'

export const metadata: Metadata = helpMeta({
  title: 'SyteNav Help Center',
  description: 'How to use SyteNav: projects, quotes, budgets, invoices, pay apps, schedules, daily logs, compliance and QuickBooks. Search the articles or ask a question.',
  path: '/',
})

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'SyteNav Help Center',
  url: helpCanonical('/'),
  publisher: { '@type': 'Organization', name: 'SyteNav' },
}

export default function HelpCenterHome() {
  const topics = publicTopics()
  const popular = popularArticles()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="border-b border-line bg-panel">
        <div className="mx-auto max-w-3xl px-6 py-14 text-center sm:py-20">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-5xl">How can we help?</h1>
          <p className="mt-3 text-base text-muted-fg sm:text-lg">
            Search {PUBLIC_HELP_ARTICLES.length} articles, or ask a question and get a short answer.
          </p>
          <div className="mt-8">
            <HelpSearch large />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-6 py-12 sm:py-16">
        <section aria-labelledby="topics">
          <h2 id="topics" className="text-xl font-bold text-ink sm:text-2xl">Browse by topic</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map(t => (
              <Link key={t.key} href={helpHref(topicPath(t.key))}
                className="group flex flex-col rounded-2xl border border-line bg-panel p-5 transition-colors hover:border-accent">
                <span className="text-base font-bold text-ink">{t.label}</span>
                <span className="mt-1 text-sm text-muted-fg">{t.description}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-fg">
                  {t.articles.length} article{t.articles.length === 1 ? '' : 's'}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              </Link>
            ))}
          </div>
        </section>

        {popular.length > 0 && (
          <section aria-labelledby="popular">
            <h2 id="popular" className="text-xl font-bold text-ink sm:text-2xl">Start here</h2>
            <ul className="mt-5 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel">
              {popular.map(a => (
                <li key={a.slug}>
                  <Link href={helpHref(articlePath(a.slug))} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{a.title}</span>
                      <span className="mt-0.5 block truncate text-sm text-muted-fg">{a.summary}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  )
}
