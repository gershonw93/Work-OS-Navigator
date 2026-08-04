'use client'

import { useEffect, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'

export interface LightboxImage {
  url: string
  caption?: string | null
}

/**
 * Full-screen image viewer. Thumbnails stay small in the page and open this
 * on click. Closes on Escape or backdrop click; arrow keys page through a set.
 */
export function ImageLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
}) {
  const count = images.length
  const current = images[index]

  const go = useCallback((delta: number) => {
    if (count < 2) return
    onIndexChange((index + delta + count) % count)
  }, [count, index, onIndexChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    // Don't let the page scroll behind the overlay.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, go])

  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={current.caption || 'Photo'}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {count > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); go(-1) }}
            aria-label="Previous photo"
            className="absolute left-3 sm:left-6 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1) }}
            aria-label="Next photo"
            className="absolute right-3 sm:right-6 h-11 w-11 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <figure className="max-h-full max-w-5xl flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        <img
          src={current.url}
          alt={current.caption || 'Photo'}
          className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
        />
        <figcaption className="flex items-center gap-3 text-sm text-white/70">
          {current.caption && <span>{current.caption}</span>}
          {count > 1 && <span>{index + 1} of {count}</span>}
          <a
            href={current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-white transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open original
          </a>
        </figcaption>
      </figure>
    </div>
  )
}
