'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { JobFilesPanel } from '@/components/files/job-files-panel'
import type { JobFile, JobFileKind } from '@/lib/job-files'

/**
 * Every file on THIS job, in one place - plans, site photos, permits (each
 * submission both ways, the fixes, what came back), quotes, submittals and
 * bills. Read off the records that own them, never copied: the same reader as
 * Files > Job Files (`/api/files/jobs`), narrowed to this job, so the two can
 * never disagree and each kind still asks its own permission.
 */
export default function ProjectFilesPage({ params }: { params: { id: string } }) {
  const [files, setFiles] = useState<JobFile[]>([])
  const [failed, setFailed] = useState<JobFileKind[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession()
        const res = await fetch(`/api/files/jobs?job=${encodeURIComponent(params.id)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        if (!live) return
        if (!res.ok) { setState('failed'); return }
        const d = await res.json()
        setFiles(d.files ?? []); setFailed(d.failed ?? []); setState('ready')
      } catch {
        if (live) setState('failed')
      }
    })()
    return () => { live = false }
  }, [params.id])

  return (
    <div className="p-0 lg:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Files</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Everything on this job, in one place. Each file stays where it was added - open it here or jump to it.
          Company-wide documents are in <Link href="/files" className="text-accent-fg hover:underline">Files</Link> in the menu.
        </p>
      </div>
      <JobFilesPanel files={files} failed={failed} state={state} query="" oneJob />
    </div>
  )
}
