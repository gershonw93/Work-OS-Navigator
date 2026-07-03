'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Search, ChevronRight, ArrowLeft, Lightbulb, AlertTriangle, BookOpen } from 'lucide-react'
import {
  HELP_CATEGORIES, HELP_ARTICLES, searchArticles, getArticle, articlesByCategory,
  type HelpArticle, type HelpBlock,
} from '@/lib/help/articles'

function categoryLabel(key: string) {
  return HELP_CATEGORIES.find((c) => c.key === key)?.label ?? key
}

function Block({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'text':
      return <p className="text-sm leading-relaxed text-ink-soft">{block.text}</p>
    case 'steps':
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-soft">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink text-xs font-bold">{i + 1}</span>
              <span className="leading-relaxed pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      )
    case 'tip':
      return (
        <div className="flex gap-2 rounded-lg border border-accent/30 bg-accent-tint/50 px-3 py-2.5">
          <Lightbulb className="h-4 w-4 shrink-0 text-accent-fg mt-0.5" />
          <p className="text-sm text-ink-soft">{block.text}</p>
        </div>
      )
    case 'warn':
      return (
        <div className="flex gap-2 rounded-lg border border-warn/30 bg-warn-tint px-3 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warn mt-0.5" />
          <p className="text-sm text-ink-soft">{block.text}</p>
        </div>
      )
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={block.src} alt={block.alt} className="rounded-lg border border-line max-w-full" />
  }
}

function ArticleView({ article, onOpen, onBack }: { article: HelpArticle; onOpen: (slug: string) => void; onBack: () => void }) {
  const related = (article.related ?? []).map(getArticle).filter(Boolean) as HelpArticle[]
  return (
    <div className="max-w-2xl">
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Help Center
      </button>
      <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg">{categoryLabel(article.category)}</p>
      <h1 className="mt-1 text-2xl font-bold text-ink">{article.title}</h1>
      <p className="mt-1.5 text-sm text-muted-fg">{article.summary}</p>
      <div className="mt-6 space-y-4">
        {article.blocks.map((b, i) => <Block key={i} block={b} />)}
      </div>
      {related.length > 0 && (
        <div className="mt-8 border-t border-line pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Related articles</p>
          <div className="space-y-1.5">
            {related.map((r) => (
              <button key={r.slug} onClick={() => onOpen(r.slug)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-left hover:border-accent hover:bg-surface">
                <span className="text-sm font-medium text-ink-soft">{r.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResultRow({ article, onOpen }: { article: HelpArticle; onOpen: (slug: string) => void }) {
  return (
    <button onClick={() => onOpen(article.slug)}
      className="flex w-full items-start justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left hover:border-accent hover:bg-surface transition-colors">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink">{article.title}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide rounded-full bg-muted px-1.5 py-0.5 text-muted-fg">{categoryLabel(article.category)}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted-fg line-clamp-1">{article.summary}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint mt-1" />
    </button>
  )
}

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  const results = useMemo(() => searchArticles(query), [query])
  const article = openSlug ? getArticle(openSlug) : null

  function open(slug: string) { setOpenSlug(slug); window.scrollTo({ top: 0 }) }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {!article && (
        <div className="mb-6 text-center">
          <BookOpen className="mx-auto h-8 w-8 text-accent-fg" />
          <h1 className="mt-2 text-2xl font-bold text-ink">How can we help?</h1>
          <p className="mt-1 text-sm text-muted-fg">Search for anything, or browse by topic below.</p>
        </div>
      )}

      {/* Search — always visible so you can jump anywhere */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 bg-surface/80 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (openSlug) setOpenSlug(null) }}
            placeholder="Search help articles… e.g. how do I award a quote"
            className="w-full rounded-xl border border-line bg-panel py-3 pl-10 pr-3 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            autoFocus
          />
        </div>
        {query.trim() && (
          <p className="mt-1.5 px-1 text-xs text-faint">{results.length} result{results.length !== 1 ? 's' : ''} for “{query.trim()}”</p>
        )}
      </div>

      {/* Search results */}
      {query.trim() ? (
        results.length > 0 ? (
          <div className="space-y-2">
            {results.map((a) => <ResultRow key={a.slug} article={a} onOpen={open} />)}
          </div>
        ) : (
          <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
            <Search className="mx-auto mb-3 h-7 w-7 text-faint" />
            <p className="text-sm font-medium text-muted-fg">No articles matched “{query.trim()}”.</p>
            <p className="mt-1 text-xs text-faint">Try fewer or different words, or browse the topics below.</p>
            <button onClick={() => setQuery('')} className="mt-4 text-sm font-medium text-accent-fg hover:underline">Browse all topics</button>
          </div>
        )
      ) : article ? (
        <ArticleView article={article} onOpen={open} onBack={() => setOpenSlug(null)} />
      ) : (
        // Browse by category
        <div className="space-y-6">
          {HELP_CATEGORIES.map((cat) => {
            const items = articlesByCategory(cat.key)
            if (items.length === 0) return null
            return (
              <div key={cat.key}>
                <h2 className="text-sm font-bold text-ink">{cat.label}</h2>
                <p className="mb-2 text-xs text-muted-fg">{cat.description}</p>
                <div className="space-y-1.5">
                  {items.map((a) => (
                    <button key={a.slug} onClick={() => open(a.slug)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3.5 py-2.5 text-left hover:border-accent hover:bg-surface transition-colors">
                      <span className="text-sm font-medium text-ink-soft">{a.title}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
          <p className="pt-2 text-center text-xs text-faint">{HELP_ARTICLES.length} articles · always kept up to date with the app</p>
        </div>
      )}
    </div>
  )
}
