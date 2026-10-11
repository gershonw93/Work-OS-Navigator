'use client'

// Every file on the company's jobs, grouped by job, each opening where it
// lives. See lib/job-files.ts for why the Files page needed this.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, FileText, FolderOpen, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/dates'
import { JOB_FILE_KINDS, jobFileHref, type JobFile, type JobFileKind } from '@/lib/job-files'

export function JobFilesPanel({ files, failed, state, query }: {
  files: JobFile[]
  failed: JobFileKind[]
  state: 'loading' | 'ready' | 'failed'
  query: string
}) {
  const [kind, setKind] = useState<JobFileKind | 'all'>('all')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return files.filter(f =>
      (kind === 'all' || f.kind === kind)
      && (!q || f.name.toLowerCase().includes(q) || f.project_name.toLowerCase().includes(q)))
  }, [files, kind, query])

  const byJob = useMemo(() => {
    const m = new Map<string, { name: string; files: JobFile[] }>()
    for (const f of shown) {
      const g = m.get(f.project_id) ?? { name: f.project_name, files: [] }
      g.files.push(f)
      m.set(f.project_id, g)
    }
    return Array.from(m.entries()).sort((a, b) => a[1].name.localeCompare(b[1].name))
  }, [shown])

  if (state === 'loading') return <p className="py-12 text-center text-sm text-muted-fg">Loading job files…</p>
  if (state === 'failed') return <p className="py-12 text-center text-sm text-danger">Could not load the files on your jobs. Reload to try again.</p>

  const kindsPresent = JOB_FILE_KINDS.filter(k => files.some(f => f.kind === k.kind))
  const label = (k: JobFileKind) => JOB_FILE_KINDS.find(x => x.kind === k)?.label ?? k

  return (
    <div className="space-y-4">
      {failed.length > 0 && (
        <p className="rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-ink">
          Some files could not be loaded ({failed.map(label).join(', ')}), so this list is incomplete. Reload to try again.
        </p>
      )}

      {kindsPresent.length > 1 && (
        <div className="scroll-fade flex gap-2 overflow-x-auto">
          {(['all', ...kindsPresent.map(k => k.kind)] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={cn('shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                kind === k ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-panel text-muted-fg hover:text-ink')}>
              {k === 'all' ? 'All' : label(k)}
            </button>
          ))}
        </div>
      )}

      {byJob.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-14 text-center">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-faint" />
          <p className="text-sm text-muted-fg">
            {files.length === 0 ? 'No files on your jobs yet. Plans, photos, quotes and bills added to a job show up here.' : 'Nothing matches.'}
          </p>
        </div>
      ) : byJob.map(([projectId, g]) => (
        <div key={projectId}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <Link href={`/projects/${projectId}`} className="truncate text-sm font-semibold text-ink hover:underline">{g.name}</Link>
            <span className="shrink-0 text-xs text-faint">{g.files.length} file{g.files.length === 1 ? '' : 's'}</span>
          </div>
          <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
            {g.files.map(f => {
              const Icon = f.kind === 'photo' ? ImageIcon : FileText
              const meta = `${label(f.kind)} · ${formatDate(f.created_at)}`
              return (
                <div key={`${f.kind}-${f.id}`} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="h-4 w-4 shrink-0 text-faint" />
                  <div className="min-w-0 flex-1">
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">{f.name}</a>
                    ) : (
                      <Link href={jobFileHref(f)} className="block truncate text-sm font-medium text-ink hover:underline">{f.name}</Link>
                    )}
                    <p className="truncate text-xs text-muted-fg">{meta}</p>
                  </div>
                  <Link href={jobFileHref(f)} aria-label={`Open ${label(f.kind)} on ${g.name}`} title={`Open on the job`}
                    className="shrink-0 rounded-lg p-2 text-faint hover:bg-surface hover:text-ink">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
