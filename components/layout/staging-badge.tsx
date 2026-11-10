'use client'

import { useEffect, useState } from 'react'
import { isPreviewBuild, previewLabel } from '@/lib/deploy-env'

/**
 * A fixed tag on every page of a preview build, staging.sytenav.com included.
 *
 * STAGING USES THE LIVE DATABASE (the owner's call), so a job made here is a
 * job your customers can see and an email sent here is a real email. The
 * page looks identical to the real app, which is the point of staging and the
 * danger of it - this is the only thing on the screen that tells them apart,
 * and it says why it matters, not just which one it is.
 *
 * Not an overlay: no `data-overlay`, `pointer-events: none`, so it never
 * freezes the page or swallows a tap meant for what is underneath it. It sits
 * bottom-left, above the phone's tab bar rather than over its first label.
 */
export function StagingBadge() {
  const [label, setLabel] = useState<'STAGING' | 'PREVIEW' | null>(null)
  useEffect(() => {
    if (isPreviewBuild) setLabel(previewLabel(window.location.hostname))
  }, [])
  if (!label) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-2 bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))_+_4rem)] lg:bottom-2 z-[60] whitespace-nowrap rounded-md bg-danger px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow"
    >
      {label} - live data
    </div>
  )
}
