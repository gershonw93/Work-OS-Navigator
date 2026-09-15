import type { Metadata } from 'next'
import { marketingMeta } from '@/components/marketing/meta'
import { Reveal } from '@/components/marketing/reveal'
import { Eyebrow } from '@/components/marketing/section'
import { CtaBand } from '@/components/marketing/cta-band'
import { BlueprintGrid } from '@/components/marketing/blueprint'
import { GuideCard } from '@/components/marketing/guide-card'
import { GUIDES, GUIDE_CATEGORIES, guidesIn, guidePath } from '@/lib/guides'
import { CANONICAL_ORIGIN } from '@/lib/canonical'

export const metadata: Metadata = marketingMeta({
  title: 'Construction guides · Change orders, billing and job costs',
  description:
    'Practical guides for small general contractors and subcontractors: tracking change orders, verifying sub invoices, job costing in real time, daily logs, and choosing construction software.',
  path: '/guides',
})

// An ItemList so the library reads as a collection rather than as ten unrelated
// pages that happen to share a directory.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'SyteNav construction guides',
  itemListElement: GUIDES.map((g, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    url: `${CANONICAL_ORIGIN}${guidePath(g.slug)}`,
    name: g.title,
  })),
}

export default function GuidesIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden">
        <BlueprintGrid />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 text-center">
          <Eyebrow className="justify-center">Guides</Eyebrow>
          <h1 className="mt-3 text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-ink leading-[1.04]">
            The parts of the job that quietly cost money
          </h1>
          <p className="mt-6 text-lg text-muted-fg leading-relaxed max-w-2xl mx-auto">
            Written for contractors running a handful of jobs, not a document-control department. Each guide says what
            to do, what it costs when you do not, and - at the end - what SyteNav does about it and where it stops.
          </p>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 space-y-16 sm:space-y-20">
        {GUIDE_CATEGORIES.map(cat => {
          const guides = guidesIn(cat.key)
          if (guides.length === 0) return null
          return (
            <section key={cat.key} aria-labelledby={`cat-${cat.key}`}>
              <Reveal>
                <div className="max-w-2xl">
                  <h2 id={`cat-${cat.key}`} className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink">
                    {cat.label}
                  </h2>
                  <p className="mt-2.5 text-muted-fg leading-relaxed">{cat.description}</p>
                </div>
              </Reveal>
              <div className="mt-7 grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3">
                {guides.map(g => (
                  <Reveal key={g.slug} className="h-full">
                    <GuideCard guide={g} />
                  </Reveal>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <CtaBand
        title="Stop the leaks the guides describe"
        body="Quotes scanned instead of retyped, change orders that reach the budget line, sub bills checked against what was agreed, and a field record that writes itself."
      />
    </>
  )
}
