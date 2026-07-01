import Link from 'next/link'

export interface LegalSection { h: string; body?: string[]; list?: string[] }

// Shared renderer for legal pages — consistent, readable, theme-aware.
export function LegalDoc({ title, updated, intro, sections }: { title: string; updated: string; intro?: string; sections: LegalSection[] }) {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Legal</p>
      <h1 className="text-3xl sm:text-4xl font-extrabold text-ink leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-faint">Last updated {updated}</p>
      {intro && <p className="mt-6 text-muted-fg leading-relaxed">{intro}</p>}

      <div className="mt-8 space-y-8">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="text-lg font-bold text-ink mb-2">{i + 1}. {s.h}</h2>
            {s.body?.map((p, j) => <p key={j} className="text-sm text-muted-fg leading-relaxed mb-2">{p}</p>)}
            {s.list && (
              <ul className="mt-1 space-y-1.5">
                {s.list.map((li, j) => (
                  <li key={j} className="text-sm text-muted-fg leading-relaxed flex gap-2"><span className="text-accent-fg">•</span><span>{li}</span></li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-xl border border-line bg-panel p-4 text-sm text-muted-fg">
        Questions about this policy? Contact us at <a href="mailto:legal@sytenav.com" className="text-accent-fg hover:underline">legal@sytenav.com</a> or via our <Link href="/homepage/contact" className="text-accent-fg hover:underline">contact page</Link>.
      </div>
    </article>
  )
}
