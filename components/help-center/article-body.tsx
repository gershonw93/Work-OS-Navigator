import { Lightbulb, AlertTriangle } from 'lucide-react'
import type { HelpBlock } from '@/lib/help/articles'

// One article block, as the public Help Center prints it. Same block types as
// the in-app reader (`app/(dashboard)/help/page.tsx`) - a new block type has to
// be taught to both, and TypeScript's exhaustive switch says so.
export function ArticleBlock({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'text':
      return <p className="text-base leading-relaxed text-ink-soft">{block.text}</p>
    case 'steps':
      return (
        <ol className="space-y-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-base text-ink-soft">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-accent text-xs font-bold text-accent-ink">
                {i + 1}
              </span>
              <span className="pt-0.5 leading-relaxed">{item}</span>
            </li>
          ))}
        </ol>
      )
    case 'tip':
      return (
        <div className="flex gap-3 rounded-xl border border-accent/30 bg-accent-tint/50 px-4 py-3">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-accent-fg" aria-hidden />
          <p className="text-base leading-relaxed text-ink-soft">{block.text}</p>
        </div>
      )
    case 'warn':
      return (
        <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn-tint px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden />
          <p className="text-base leading-relaxed text-ink-soft">{block.text}</p>
        </div>
      )
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={block.src} alt={block.alt} className="max-w-full rounded-xl border border-line" />
  }
}
