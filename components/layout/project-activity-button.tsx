'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { ActivityDrawer } from './activity-drawer'
import { headerIconButton } from './header-icon-button'

export function ProjectActivityButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Job history"
        title="Job history"
        className={headerIconButton}
      >
        <History className="h-4 w-4" />
      </button>
      <ActivityDrawer projectId={projectId} open={open} onClose={() => setOpen(false)} />
    </>
  )
}
