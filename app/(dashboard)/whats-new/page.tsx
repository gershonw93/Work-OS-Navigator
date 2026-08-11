'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Sparkles, BookOpen, ArrowRight } from 'lucide-react'
import { RELEASES, KIND_LABEL, KIND_TINT, LATEST_RELEASE, SEEN_KEY } from '@/lib/whats-new'

const fmt = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })

export default function WhatsNewPage() {
  // Whatever they had seen when they arrived. Read once, before the visit is
  // recorded, so the "new" markers on this render reflect the state they came
  // in with rather than instantly clearing themselves.
  const [seenOnArrival, setSeenOnArrival] = useState<string | null>(null)

  useEffect(() => {
    try {
      setSeenOnArrival(localStorage.getItem(SEEN_KEY))
      localStorage.setItem(SEEN_KEY, LATEST_RELEASE)
      window.dispatchEvent(new Event('sytenav:whats-new-seen'))
    } catch { /* private mode - the page still reads fine */ }
  }, [])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ink flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent-fg" /> What&apos;s new
        </h1>
        <p className="text-sm text-muted-fg mt-1">
          What changed in SyteNav, newest first. Anything you would notice shows up here the day it ships.
        </p>
      </div>

      <div className="space-y-5">
        {RELEASES.map(rel => {
          const isNew = !seenOnArrival || rel.date > seenOnArrival
          return (
            <div key={rel.date} className={cn('bg-panel rounded-xl border overflow-hidden',
              isNew ? 'border-accent/40' : 'border-line')}>
              <div className="px-4 sm:px-5 py-3 border-b border-line-soft flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-sm font-semibold text-ink">{rel.title}</h2>
                  {isNew && (
                    <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-ink">
                      New
                    </span>
                  )}
                </div>
                <time className="text-xs text-faint shrink-0" dateTime={rel.date}>{fmt(rel.date)}</time>
              </div>

              <div className="divide-y divide-line-soft">
                {rel.items.map((item, i) => (
                  <div key={i} className="px-4 sm:px-5 py-3.5">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', KIND_TINT[item.kind])}>
                        {KIND_LABEL[item.kind]}
                      </span>
                      <h3 className="text-sm font-semibold text-ink-soft">{item.title}</h3>
                    </div>
                    <p className="text-sm text-muted-fg mt-1.5 leading-relaxed">{item.text}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
                      {item.help && (
                        <Link href={`/help?a=${item.help}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                          <BookOpen className="h-3.5 w-3.5" /> How it works
                        </Link>
                      )}
                      {item.href && (
                        <Link href={item.href}
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                          Try it <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-faint">
        Looking for how something works rather than what changed? That&apos;s the{' '}
        <Link href="/help" className="text-accent-fg hover:underline">Help Center</Link>.
      </p>
    </div>
  )
}
