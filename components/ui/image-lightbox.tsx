'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink, FileText, Download } from 'lucide-react'

export interface LightboxImage {
  url: string
  caption?: string | null
  /** File name, when there is one. Drives the type guess and the download name. */
  name?: string | null
}

/** Signed URLs carry a query string, so the extension has to be read off the path. */
function extOf(item: LightboxImage): string {
  const source = item.name || item.url
  const path = source.split('?')[0].split('#')[0]
  const dot = path.lastIndexOf('.')
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : ''
}

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'heic', 'heif', 'svg'])

/** No extension is the common case for a stored photo, so images are the default. */
function kindOf(item: LightboxImage): 'image' | 'pdf' | 'other' {
  const ext = extOf(item)
  if (!ext) return 'image'
  if (ext === 'pdf') return 'pdf'
  return IMAGE_EXT.has(ext) ? 'image' : 'other'
}

/** How far a finger has to travel, and how much straighter than it is tall. */
const SWIPE_PX = 50
const SWIPE_RATIO = 1.5

/**
 * Full-screen viewer for a set of files. Thumbnails stay small in the page and
 * open this on click.
 *
 * Paging: arrow keys, the on-screen chevrons, or a horizontal swipe. Swipe is
 * the one that matters on a phone - the alternative was tapping each document
 * open in a new tab and coming back, once per document.
 *
 * Named for images because that is all it used to show; it now also previews
 * PDFs and offers anything else as a download, so a set of mixed documents can
 * be paged through without leaving the page.
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
  const touch = useRef<{ x: number; y: number; multi: boolean } | null>(null)
  const [hintSeen, setHintSeen] = useState(true)

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

  // Tell a touch user once that swiping works - the chevrons are small and easy
  // to miss on a phone, and a gesture nobody knows about may as well not exist.
  useEffect(() => {
    if (count < 2) return
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return
    try {
      if (localStorage.getItem('sytenav-swipe-hint') === 'seen') return
    } catch { /* private mode - show it, it's one line */ }
    setHintSeen(false)
    const t = setTimeout(() => {
      setHintSeen(true)
      try { localStorage.setItem('sytenav-swipe-hint', 'seen') } catch { /* fine */ }
    }, 2800)
    return () => clearTimeout(t)
  }, [count])

  // Warm the neighbours so a swipe lands on a drawn image rather than a gap.
  useEffect(() => {
    if (count < 2) return
    for (const d of [1, -1]) {
      const nxt = images[(index + d + count) % count]
      if (nxt && kindOf(nxt) === 'image') {
        const img = new Image()
        img.src = nxt.url
      }
    }
  }, [images, index, count])

  if (!current) return null

  const kind = kindOf(current)

  // Only a single-finger, mostly-horizontal drag pages. A pinch (two fingers)
  // is a zoom on the photo, and a vertical drag is a scroll inside a PDF -
  // stealing either would make the viewer feel broken.
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touch.current = { x: t.clientX, y: t.clientY, multi: e.touches.length > 1 }
  }
  function onTouchMove(e: React.TouchEvent) {
    if (e.touches.length > 1 && touch.current) touch.current.multi = true
  }
  function onTouchEnd(e: React.TouchEvent) {
    const start = touch.current
    touch.current = null
    if (!start || start.multi || count < 2) return
    const t = e.changedTouches[0]
    if (!t) return
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return
    setHintSeen(true)
    go(dx < 0 ? 1 : -1)
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label={current.caption || current.name || 'Document'}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      {count > 1 && (
        <>
          {/* Kept on every screen. Swipe is the nicer gesture on a phone but it
              is invisible, so the chevrons stay as the way that is always
              there to be found. */}
          <button
            onClick={e => { e.stopPropagation(); go(-1) }}
            aria-label="Previous"
            className="absolute left-2 sm:left-6 z-10 flex h-11 w-11 rounded-full bg-white/10 text-white items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); go(1) }}
            aria-label="Next"
            className="absolute right-2 sm:right-6 z-10 flex h-11 w-11 rounded-full bg-white/10 text-white items-center justify-center hover:bg-white/20 transition-colors"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {!hintSeen && (
        <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
          Swipe to move between documents
        </div>
      )}

      <figure className="max-h-full w-full max-w-5xl flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        {kind === 'image' && (
          <img
            src={current.url}
            alt={current.caption || current.name || 'Photo'}
            className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
          />
        )}

        {kind === 'pdf' && (
          // Some mobile browsers refuse to render a PDF in a frame. The Open
          // original link below is always there, so a blank frame is a
          // disappointment rather than a dead end.
          <iframe
            src={current.url}
            title={current.name || 'Document'}
            className="h-[80vh] w-full rounded-lg bg-white"
          />
        )}

        {kind === 'other' && (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-white/10 px-6 py-10 text-center">
            <FileText className="h-10 w-10 text-white/70" />
            <p className="text-sm font-medium text-white break-all">{current.name || 'Document'}</p>
            <p className="text-xs text-white/60">This one can&apos;t be previewed here.</p>
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-sm font-medium text-white hover:bg-white/25 transition-colors"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          </div>
        )}

        <figcaption className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-white/70">
          {(current.caption || current.name) && (
            <span className="max-w-full truncate">{current.caption || current.name}</span>
          )}
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

/** The same viewer, named for what it now does. */
export const DocumentViewer = ImageLightbox
export type LightboxFile = LightboxImage
