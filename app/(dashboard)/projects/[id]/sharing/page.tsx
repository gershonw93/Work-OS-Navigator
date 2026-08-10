'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Send, Copy, Check, Ban, Inbox, Share2, RotateCcw, Plus } from 'lucide-react'
import { ShareFilesModal, type ShareableFile } from '@/components/files/share-files-modal'

interface Share {
  id: string
  name: string
  url: string
  recipient_name: string | null
  files: { name: string; url: string; added_at?: string }[]
  created_at: string
  viewed_at: string | null
  revoked_at: string | null
  expires_at: string | null
  file_share_uploads: { id: string; name: string; file_url: string; created_at: string }[]
}

/**
 * Documents sent out on this job, and the button to send more.
 *
 * Lives here rather than in the header because sending paperwork to an
 * expeditor or an architect is an occasional thing, not something that earns
 * permanent space next to the project name. Keeping the send action beside the
 * record of what was already sent also means the link is easy to find again -
 * which is the thing you actually need a week later.
 */
export default function SharingPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [shares, setShares] = useState<Share[]>([])
  const [docs, setDocs] = useState<ShareableFile[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [addTo, setAddTo] = useState<Share | null>(null)
  const [copiedId, setCopiedId] = useState('')

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    const t = await token()
    const [sharesRes, docsRes] = await Promise.all([
      fetch(`/api/file-shares?project_id=${params.id}`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch(`/api/projects/${params.id}/documents`, { headers: { Authorization: `Bearer ${t}` } }),
    ])
    if (sharesRes.ok) setShares((await sharesRes.json()).shares ?? [])
    if (docsRes.ok) {
      const d = await docsRes.json()
      setDocs(d.documents ?? [])
      setProjectName(d.project_name ?? '')
    }
    setLoading(false)
  }, [params.id, token])

  useEffect(() => { load() }, [load])

  async function setRevoked(id: string, revoked: boolean) {
    const t = await token()
    await fetch(`/api/file-shares/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ revoked }),
    })
    load()
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Sharing</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Send this job&apos;s paperwork to someone outside your company - an expeditor, an architect, a lender.
            They get a link, no account needed.
          </p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-1.5 shrink-0">
          <Send className="h-4 w-4" /> Send documents
        </Button>
      </div>

      {shares.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Share2 className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">Nothing sent from this job yet.</p>
          <p className="text-xs text-faint mt-1 max-w-md mx-auto">
            Pick from the plans, permits, submittals and compliance documents on this job, plus your company
            files. Whoever you send it to can send documents straight back on the same link.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map(sh => {
            const back = sh.file_share_uploads ?? []
            const expired = !!sh.expires_at && new Date(sh.expires_at) < new Date()
            const dead = !!sh.revoked_at || expired
            return (
              <div key={sh.id} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{sh.name}</p>
                    <p className="text-xs text-muted-fg mt-0.5">
                      {[
                        sh.recipient_name && `To ${sh.recipient_name}`,
                        `${(sh.files ?? []).length} document${(sh.files ?? []).length !== 1 ? 's' : ''}`,
                        `Sent ${new Date(sh.created_at).toLocaleDateString()}`,
                        sh.viewed_at && `Opened ${new Date(sh.viewed_at).toLocaleDateString()}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    dead ? 'bg-muted text-muted-fg'
                      : back.length ? 'bg-success-tint text-success'
                      : sh.viewed_at ? 'bg-info-tint text-info'
                      : 'bg-warn-tint text-warn')}>
                    {sh.revoked_at ? 'Turned off' : expired ? 'Expired' : back.length ? 'Replied' : sh.viewed_at ? 'Opened' : 'Not opened yet'}
                  </span>
                </div>

                {back.length > 0 && (
                  <div className="mt-3 rounded-lg border border-success/30 bg-success-tint px-3 py-2.5">
                    <p className="text-xs font-semibold text-success mb-1.5 inline-flex items-center gap-1.5">
                      <Inbox className="h-3.5 w-3.5" /> Sent back to you
                    </p>
                    {back.map(u => (
                      <a key={u.id} href={u.file_url} target="_blank" rel="noreferrer"
                        className="block text-sm text-ink-soft hover:underline truncate">
                        {u.name}
                      </a>
                    ))}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!dead && (
                    <button onClick={() => setAddTo(sh)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-muted">
                      <Plus className="h-3.5 w-3.5" /> Add documents
                    </button>
                  )}
                  {!dead && (
                    <button
                      onClick={async () => { await navigator.clipboard.writeText(sh.url); setCopiedId(sh.id); setTimeout(() => setCopiedId(''), 2000) }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-muted"
                    >
                      {copiedId === sh.id ? <><Check className="h-3.5 w-3.5 text-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
                    </button>
                  )}
                  {sh.revoked_at ? (
                    <button onClick={() => setRevoked(sh.id, false)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:text-ink hover:bg-muted">
                      <RotateCcw className="h-3.5 w-3.5" /> Turn back on
                    </button>
                  ) : !expired && (
                    <button onClick={() => setRevoked(sh.id, true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:text-danger hover:bg-danger-tint">
                      <Ban className="h-3.5 w-3.5" /> Turn off link
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {open && (
        <ShareFilesModal
          files={docs}
          projectId={params.id}
          defaultTitle={projectName ? `Documents · ${projectName}` : undefined}
          onClose={() => setOpen(false)}
          onShared={load}
        />
      )}

      {addTo && (
        <ShareFilesModal
          files={docs}
          addTo={{ id: addTo.id, name: addTo.name, alreadySent: (addTo.files ?? []).map(f => f.url) }}
          onClose={() => setAddTo(null)}
          onShared={load}
        />
      )}
    </div>
  )
}
