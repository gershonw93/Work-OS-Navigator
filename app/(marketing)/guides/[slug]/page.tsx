import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { ArrowLeft, Clock, CalendarDays } from 'lucide-react'
import { marketingMeta } from '@/components/marketing/meta'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { GuideBody, Prose } from '@/components/marketing/guide-body'
import { GuideByline } from '@/components/marketing/guide-byline'
import { GuideCard } from '@/components/marketing/guide-card'
import { GUIDES, GUIDE_CATEGORIES, guideBySlug, guidePath, relatedTo } from '@/lib/guides'
import { readMinutes, tocFor } from '@/lib/guides/schema'
import { authorNode, GUIDE_AUTHOR } from '@/lib/guides/author'
import { CANONICAL_ORIGIN, canonicalUrl } from '@/lib/canonical'
import { formatDate } from '@/lib/dates'

// Every guide is known at build time, so they are static pages rather than
// rendered per request. An unknown slug is a 404, never a page that renders
// with empty content - which is what a missing article looks like if you let
// the template draw itself around undefined.
export function generateStaticParams() {
  return GUIDES.map(g => ({ slug: g.slug }))
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = guideBySlug(params.slug)
  if (!guide) return {}

  const path = guidePath(guide.slug)
  const base = marketingMeta({ title: guide.metaTitle, description: guide.description, path })

  return {
    ...base,
    // An article, not a page. `type: 'article'` is what puts the published date
    // on a link preview, and marketingMeta's openGraph is replaced wholesale
    // rather than spread - Next does not merge these, and a half-set object is
    // how a card loses its image.
    openGraph: {
      type: 'article',
      siteName: 'SyteNav',
      title: guide.metaTitle,
      description: guide.description,
      url: canonicalUrl(path),
      publishedTime: guide.published,
      modifiedTime: guide.updated ?? guide.published,
      images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: guide.title }],
    },
  }
}

/** The contents list. Rendered twice - see the note where it is used. */
function Contents({ items, className }: { items: { text: string; id: string }[]; className?: string }) {
  return (
    <nav aria-label="On this page" className={className}>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">On this page</p>
      <ul className="mt-3 space-y-2.5">
        {items.map(h => (
          <li key={h.id}>
            <a href={`#${h.id}`} className="block text-sm text-muted-fg hover:text-ink transition-colors leading-snug">
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = guideBySlug(params.slug)
  if (!guide) notFound()

  const category = GUIDE_CATEGORIES.find(c => c.key === guide.category)
  const toc = tocFor(guide)
  const related = relatedTo(guide)
  const url = `${CANONICAL_ORIGIN}${guidePath(guide.slug)}`

  // Two graphs, because they answer two different questions: what this page is,
  // and the questions it answers. Both point at the same @id so they attach to
  // the page rather than floating free.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      // The PERSON wrote it; the organisation published it. Crediting the
      // organisation as author is what a page does when nobody will put their
      // name to it, and it is the half of the byline a crawler reads.
      authorNode,
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: guide.title,
        description: guide.description,
        datePublished: guide.published,
        // CONTENT DATA, never `new Date()`. A dateModified generated at build
        // time restamps all ten articles every deploy, which tells a crawler
        // the whole library was rewritten because a dependency changed.
        dateModified: guide.updated ?? guide.published,
        inLanguage: 'en-US',
        mainEntityOfPage: url,
        author: { '@id': GUIDE_AUTHOR.id },
        publisher: { '@id': `${CANONICAL_ORIGIN}/#organization` },
        articleSection: category?.label,
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: guide.faqs.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  }

  // formatDate, not `new Date(...).toLocaleDateString()`. A published date is a
  // CALENDAR date, and the raw idiom renders 2026-09-15 as the 14th for every
  // reader behind UTC - the same off-by-one that dated inspections a day early.
  const published = formatDate(guide.published, { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <BlueprintGrid />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-10 sm:pb-14">
          <Link
            href="/guides"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-fg hover:text-ink transition-colors"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> All guides
          </Link>
          {category && <Eyebrow className="mt-6">{category.label}</Eyebrow>}
          <h1 className="mt-3 text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-ink leading-[1.08]">
            {guide.title}
          </h1>
          <p className="mt-5 text-lg text-muted-fg leading-relaxed">{guide.lede}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-faint">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {published}
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" aria-hidden /> {readMinutes(guide)} min read
            </span>
          </div>
          <GuideByline />
        </div>
      </section>

      {/* Body, with the contents list beside it from lg up */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14 lg:grid lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <article className="min-w-0 max-w-3xl">
          {/* The short version, for somebody who will not read 1,500 words. */}
          <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint">The short version</p>
            <ul className="mt-4 space-y-3">
              {guide.takeaways.map(t => (
                <li key={t} className="flex gap-3 text-[15px] sm:text-base text-ink-soft leading-relaxed">
                  <span aria-hidden className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent-fg" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* The contents appear ABOVE the body on a phone and beside it on a
              desktop. Two placements, one list - the aside below is sticky and
              cannot also be the thing a phone reads first. */}
          <Contents items={toc} className="mt-8 rounded-2xl border border-line bg-panel p-5 lg:hidden" />

          <GuideBody blocks={guide.blocks} links={guide.links} />

          {guide.faqs.length > 0 && (
            <section className="mt-14 sm:mt-16 border-t border-line pt-10">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">Common questions</h2>
              <dl className="mt-6 divide-y divide-line-soft">
                {guide.faqs.map(f => (
                  <div key={f.q} className="py-5 first:pt-0">
                    <dt className="text-base sm:text-lg font-bold text-ink">{f.q}</dt>
                    <dd className="mt-2 text-[17px] text-ink-soft leading-[1.75]">
                      <Prose text={f.a} links={guide.links} />
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </article>

        <aside className="hidden lg:block">
          <Contents items={toc} className="sticky top-24" />
        </aside>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="read-next" className="border-t border-line bg-panel">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
            <h2 id="read-next" className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
              Read next
            </h2>
            <div className="mt-7 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
              {related.map(g => (
                <GuideCard key={g.slug} guide={g} />
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="pt-16 sm:pt-20">
        <CtaBand />
      </div>
    </>
  )
}
