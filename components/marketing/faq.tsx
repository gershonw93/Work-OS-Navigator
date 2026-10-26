import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Reveal } from '@/components/marketing/reveal'
import { faqJsonLd, type FaqItem } from '@/lib/marketing-faq'
import { cn } from '@/lib/utils'

// A FAQ block AND its FAQPage structured data, from one list - so the markup
// can only ever describe answers the page actually shows.
export function FaqSection({ items, title = 'Questions people ask', className = 'bg-panel' }: { items: FaqItem[]; title?: string; className?: string }) {
  return (
    <section className={cn('border-b border-line', className)}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(items)) }} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-20 sm:py-24">
        <Reveal>
          <h2 className="mb-12 text-center text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
            {title}
          </h2>
        </Reveal>
        <div className="divide-y divide-line">
          {items.map((f, i) => (
            <Reveal key={f.q} delay={i * 60}>
              <div className="py-7">
                <h3 className="text-lg font-bold text-ink">{f.q}</h3>
                <p className="mt-2.5 leading-relaxed text-muted-fg">{f.a}</p>
                {f.links && f.links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                    {f.links.map(l => (
                      <Link key={l.href} href={l.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:gap-2.5 transition-all">
                        {l.text} <ArrowRight className="h-4 w-4" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
