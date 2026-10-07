import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { HelpSearch } from '@/components/help-center/help-search'
import { HelpBreadcrumbs } from '@/components/help-center/breadcrumbs'
import { helpMeta } from '@/components/help-center/meta'
import { helpHref } from '@/lib/help-host'
import { articlePath, publicTopic, publicTopics, topicPath } from '@/lib/help/site'

export const dynamicParams = false
export function generateStaticParams() {
  return publicTopics().map(t => ({ topic: t.key }))
}

export function generateMetadata({ params }: { params: { topic: string } }): Metadata {
  const t = publicTopic(params.topic)
  if (!t) return {}
  return helpMeta({
    title: `${t.label} | SyteNav Help Center`,
    description: `${t.description} ${t.articles.length} articles on ${t.label.toLowerCase()} in SyteNav.`,
    path: topicPath(t.key),
  })
}

export default function TopicPage({ params }: { params: { topic: string } }) {
  const topic = publicTopic(params.topic)
  if (!topic) notFound()
  return (
    <div className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
      <HelpBreadcrumbs trail={[{ label: topic.label, path: topicPath(topic.key) }]} />
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{topic.label}</h1>
      <p className="mt-2 text-base text-muted-fg">{topic.description}</p>
      <div className="mt-6"><HelpSearch /></div>
      <ul className="mt-8 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel">
        {topic.articles.map(a => (
          <li key={a.slug}>
            <Link href={helpHref(articlePath(a.slug))} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-surface">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{a.title}</span>
                <span className="mt-0.5 block text-sm text-muted-fg">{a.summary}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
