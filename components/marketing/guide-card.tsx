import Link from 'next/link'
import { ArrowRight, Clock } from 'lucide-react'
import type { Guide } from '@/lib/guides/schema'
import { guidePath, readMinutes } from '@/lib/guides/schema'

// One card per guide, used by the index and by the "read next" strip at the
// foot of an article. Read time is DERIVED here rather than stored on the
// article, so an edit cannot leave the card claiming a length the page no
// longer has.
export function GuideCard({ guide, className }: { guide: Guide; className?: string }) {
  return (
    <Link
      href={guidePath(guide.slug)}
      className={`group flex h-full flex-col rounded-2xl border border-line bg-panel p-5 sm:p-6 transition-colors hover:border-accent-fg/40 ${className ?? ''}`}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint whitespace-nowrap">
        {guide.keyword}
      </p>
      <h3 className="mt-2.5 text-lg font-bold text-ink leading-snug">{guide.title}</h3>
      <p className="mt-2.5 text-[15px] text-muted-fg leading-relaxed">{guide.description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 pt-1">
        <span className="inline-flex items-center gap-1.5 text-xs text-faint whitespace-nowrap">
          <Clock className="h-3.5 w-3.5" aria-hidden /> {readMinutes(guide)} min read
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg whitespace-nowrap">
          Read <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}
