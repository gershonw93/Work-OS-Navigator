'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
import { SiteModelsPanel, type HouseRow } from './site-models-panel'

// ─────────────────────────────────────────────────────────────────────────────
// House models, out from the side.
//
// "the whole model lines should come out from the side with a button - no? i
// dont need them everyday". Models are set-up work: made once, applied when a
// house starts, touched again when a price changes. They sat at the top of the
// development page above the houses, which ARE the daily work, so a button in
// the header opens them here instead.
//
// The panel's own dialogs (edit, houses, apply) render through a portal to
// <body>, so this drawer's transform cannot pen them in - and while one is
// open the drawer stops listening for a swipe, or dragging inside a dialog
// would slide the drawer away underneath it.
// ─────────────────────────────────────────────────────────────────────────────

export function HouseModelsDrawer({ siteId, houses, onChanged, onClose }: {
  siteId: string; houses: HouseRow[]; onChanged: () => void; onClose: () => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const swipe = useSwipeDismiss(onClose)
  return (
    <div className="overlay-drawer bg-black/20 backdrop-blur-[1px]" data-overlay onClick={() => { if (!dialogOpen) onClose() }}>
      <div onClick={e => e.stopPropagation()}
        {...(dialogOpen ? {} : swipe.handlers)} style={dialogOpen ? undefined : swipe.style}
        className="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          <h2 className="text-base font-semibold text-ink">House models</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-9 lg:w-9">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SiteModelsPanel siteId={siteId} houses={houses} onChanged={onChanged} bare onDialogChange={setDialogOpen} />
        </div>
      </div>
    </div>
  )
}
