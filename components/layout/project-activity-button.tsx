'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { ActivityDrawer } from './activity-drawer'

export function ProjectActivityButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm font-medium text-muted-fg hover:border-muted2 hover:bg-surface hover:text-ink transition-colors"
      >
        <History className="h-4 w-4" />
        Job History
      </button>
      <ActivityDrawer projectId={projectId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
