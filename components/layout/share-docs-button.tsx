'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ShareFilesModal, type ShareableFile } from '@/components/files/share-files-modal'
import { usePermissions } from '@/lib/use-permissions'

/**
 * Send this job's paperwork to someone outside the company.
 *
 * Lives in the project header rather than on a tab because the documents being
 * sent are spread across Plans, Permits, Submittals and Compliance - putting
 * the action on any one of those would hide it from the others.
 */
export function ShareDocsButton({ projectId, projectName }: { projectId: string; projectName?: string | null }) {
  const supabase = createClient()
  const { can } = usePermissions()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [docs, setDocs] = useState<ShareableFile[]>([])

  if (!can('files', 'view')) return null

  async function openPicker() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${projectId}/documents`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    setLoading(false)
    if (res.ok) setDocs((await res.json()).documents ?? [])
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={openPicker}
        title="Send documents to someone outside the company"
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm font-medium text-muted-fg hover:bg-muted hover:text-ink transition-colors"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        <span className="hidden lg:inline">Send docs</span>
      </button>

      {open && (
        <ShareFilesModal
          files={docs}
          projectId={projectId}
          defaultTitle={projectName ? `Documents · ${projectName}` : undefined}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
