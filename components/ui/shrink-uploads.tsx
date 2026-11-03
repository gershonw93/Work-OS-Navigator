'use client'

import { useEffect } from 'react'
import { shrinkImages } from '@/lib/shrink-image'

// ─────────────────────────────────────────────────────────────────────────────
// Every photo picked anywhere in the app goes up small.
//
// The permit form shrank its photos first ("the save button took a while" - a
// 3-6 MB phone picture went up twice), and the ask after it was "compress all
// these files". There are ~50 upload boxes across 30 screens: daily-log photos,
// receipts, sub bills, compliance, submittals, quotes, the client and sub
// links. Editing each would be fifty places to miss one, and the fifty-first
// box would arrive without it - a rule that exists on one door has to exist on
// the others. So it is ONE listener, mounted once at the root layout.
//
// HOW: it catches the `change` of any <input type="file"> in the CAPTURE phase
// on window - before React's own listener at the root - holds it, shrinks the
// photos (lib/shrink-image.ts: images only, 2000px long side, JPEG), puts the
// smaller files back on the input, and fires `change` again for the screen.
// So the screen's onChange sees small files, and so does a form that reads
// `input.files` later on submit.
//
// OPTING OUT: an input with `data-full-size` is left alone. Plans and house
// model plans carry it - a drawing shrunk to 2000px loses the dimension
// somebody needs to read off it. PDFs, spreadsheets, Word files and anything
// the browser cannot decode pass through untouched whatever the input says.
// ─────────────────────────────────────────────────────────────────────────────

/** Whether a file input's picks should be shrunk. Pure, so the rule is tested. */
export function shouldShrinkInput(el: { type?: string; hasAttribute?: (n: string) => boolean } | null): boolean {
  if (!el || el.type !== 'file') return false
  return !el.hasAttribute?.('data-full-size')
}

// Inputs whose replayed `change` is ours, so the listener lets it through.
const replaying = new WeakSet<EventTarget>()

export function ShrinkUploads() {
  useEffect(() => {
    if (typeof DataTransfer === 'undefined') return // very old browser: send as-is
    const onChange = (e: Event) => {
      const input = e.target as HTMLInputElement | null
      if (!input || !shouldShrinkInput(input)) return
      if (replaying.has(input)) { replaying.delete(input); return }
      const picked = Array.from(input.files ?? [])
      // Nothing to shrink: let it straight through.
      if (!picked.some(f => f.type.toLowerCase().startsWith('image/'))) return
      e.stopImmediatePropagation()
      void (async () => {
        let files = picked
        try { files = await shrinkImages(picked) } catch { /* keep the originals */ }
        try {
          const dt = new DataTransfer()
          files.forEach(f => dt.items.add(f))
          input.files = dt.files
        } catch { /* cannot replace the list: the originals go up */ }
        replaying.add(input)
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })()
    }
    window.addEventListener('change', onChange, true)
    return () => window.removeEventListener('change', onChange, true)
  }, [])
  return null
}
