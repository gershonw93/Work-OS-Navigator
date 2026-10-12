'use client'

import { useEffect, useState } from 'react'
import { PlayCircle, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// The step-by-step walkthroughs an article carries, and the dialog that shows
// one. Shared by the in-app Help reader and the public Help Center, which hand
// in their own `src` for each (see `lib/help/walkthroughs.ts`).
//
// IT OPENS OVER THE ARTICLE, NEVER IN PLACE OF IT. Inside the native shell
// there is no browser bar, so a plain link to a static page is a page with no
// way back; a dialog keeps the close button ours. The page is sandboxed with
// scripts only - it needs them for its zoom controls and nothing else.

export interface WalkthroughLink {
  file: string
  title: string
  src: string
}

function WalkthroughDialog({ item, onClose }: { item: WalkthroughLink; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={e => e.stopPropagation()}
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-panel"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <PlayCircle className="h-5 w-5 shrink-0 text-accent-fg" aria-hidden />
          <p className="min-w-0 flex-1 truncate font-semibold text-ink">{item.title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <iframe
          src={item.src}
          title={item.title}
          sandbox="allow-scripts"
          className="min-h-0 w-full flex-1 bg-surface"
        />
      </div>
    </div>
  )
}

export function Walkthroughs({ items, size = 'sm' }: { items: WalkthroughLink[]; size?: 'sm' | 'base' }) {
  const [open, setOpen] = useState<WalkthroughLink | null>(null)
  if (items.length === 0) return null
  return (
    <section className="mt-8" aria-labelledby="walkthroughs">
      <h2 id="walkthroughs" className="text-xs font-semibold uppercase tracking-wide text-faint">
        Step-by-step {items.length === 1 ? 'walkthrough' : 'walkthroughs'}
      </h2>
      <ul className="mt-2 divide-y divide-line-soft rounded-2xl border border-line bg-panel">
        {items.map(w => (
          <li key={w.file}>
            <button
              type="button"
              onClick={() => setOpen(w)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface"
            >
              <PlayCircle className="h-5 w-5 shrink-0 text-accent-fg" aria-hidden />
              <span className={cn('min-w-0 flex-1 font-medium text-ink-soft', size === 'base' ? 'text-base' : 'text-sm')}>
                {w.title}
              </span>
              <span className="hidden whitespace-nowrap text-xs text-faint sm:inline">With screenshots</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {open && <WalkthroughDialog item={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
