'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Send, Copy, Check, Ban, Inbox, Share2, RotateCcw, Plus, Megaphone, AlertTriangle } from 'lucide-react'
import { ShareFilesModal, type ShareableFile } from '@/components/files/share-files-modal'
import { NotifyTeamDialog } from '@/components/projects/notify-team-dialog'
import { shareContentsLabel } from '@/lib/share-contents'
import { noticeReached, type NoticeRecord } from '@/lib/scope-notice'

import { formatDate } from '@/lib/dates'
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

/** One list, two kinds of thing: paperwork sent out, and updates broadcast. */
type Row =
  | { kind: 'share'; at: string; share: Share }
  | { kind: 'notice'; at: string; notice: NoticeRecord }

/**
 * EVERYTHING THAT HAS LEFT THIS JOB, and the buttons to send more.
 *
 * It started as the document-sending page. Then a scope-change broadcast
 * shipped, its record went into the job history behind a clock icon in the
 * project header, and the report was "so again where do i see the record?" -
 * followed by the fix: "why dnt we make it simpler and adjust the sharing tab
 * to be able to share without attaching files".
 *
 * That is the right shape. The question a person opens this page to ask is
 * "what has gone out on this job, and did they get it" - and the answer is not
 * useful if half of it lives somewhere else. So:
 *
 *   - Documents are OPTIONAL on a share. With none picked it is an update:
 *     words plus a link, which is how you tell an architect the slab moved
 *     without having to attach a file to say it.
 *   - Broadcasts are LISTED HERE TOO, read back out of the job history. No
 *     second table - one fact, one home; this page just reads it.
 *
 * TWO BUTTONS, NAMED BY WHO THEY REACH, because two controls answering the
 * same question is worse than one control in the wrong place. "Send" goes to
 * ONE person outside the company on a link. "Tell everyone on this job" goes
 * to the team and the trades through the bell and their inbox, with no link
 * at all.
 */
export default function SharingPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [shares, setShares] = useState<Share[]>([])
  const [notices, setNotices] = useState<NoticeRecord[]>([])
  // Loading, failed and empty are THREE facts. "Nothing has been sent from this
  // job" is a claim, and a failed read must never be allowed to make it - that
  // is the one sentence this page exists to be able to disprove.
  const [noticeState, setNoticeState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [docs, setDocs] = useState<ShareableFile[]>([])
  const [projectName, setProjectName] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [telling, setTelling] = useState(false)
  const [addTo, setAddTo] = useState<Share | null>(null)
  const [copiedId, setCopiedId] = useState('')

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    const t = await token()
    const auth = { headers: { Authorization: `Bearer ${t}` } }
    const [sharesRes, docsRes, noticeRes] = await Promise.all([
      fetch(`/api/file-shares?project_id=${params.id}`, auth),
      fetch(`/api/projects/${params.id}/documents`, auth),
      fetch(`/api/projects/${params.id}/scope-notice/log`, auth).catch(() => null),
    ])
    if (sharesRes.ok) setShares((await sharesRes.json()).shares ?? [])
    if (docsRes.ok) {
      const d = await docsRes.json()
      setDocs(d.documents ?? [])
      setProjectName(d.project_name ?? '')
    }
    if (noticeRes?.ok) {
      setNotices((await noticeRes.json()).notices ?? [])
      setNoticeState('ready')
    } else {
      setNoticeState('failed')
    }
    setLoading(false)
  }, [params.id, token])

  useEffect(() => { load() }, [load])

  // ONE CHRONOLOGICAL LIST. Two sources with two separate lists underneath each
  // other reads as two features again, which is the thing being fixed.
  const rows = useMemo<Row[]>(() => {
    const merged: Row[] = [
      ...shares.map(s => ({ kind: 'share' as const, at: s.created_at, share: s })),
      ...notices.map(n => ({ kind: 'notice' as const, at: n.sentAt, notice: n })),
    ]
    return merged.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  }, [shares, notices])

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
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Sharing</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Everything that has gone out on this job, and who it went to. Documents are optional - you can
            send a plain update with nothing attached.
          </p>
        </div>
        {/* A row of controls reaches both edges on a phone and sits right on a
            desktop. Two buttons share the row at equal width below lg. */}
        <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
          <Button variant="secondary" onClick={() => setTelling(true)} className="gap-1.5">
            <Megaphone className="h-4 w-4" /> Tell everyone on this job
          </Button>
          <Button onClick={() => setOpen(true)} className="gap-1.5">
            <Send className="h-4 w-4" /> Send to someone
          </Button>
        </div>
      </div>

      {/* A FAILED READ IS NOT AN EMPTY ONE. Saying so is the difference between
          "nothing was broadcast" and "we could not check". */}
      {noticeState === 'failed' && (
        <div className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-tint px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warn mt-0.5" />
          <p className="text-sm text-ink-soft">
            Could not load the updates broadcast from this job, so this list may be missing some of them.
            Reload the page to try again.
          </p>
        </div>
      )}

      {/* "Nothing sent yet" is only said when BOTH halves came back. With the
          broadcast read failed the banner above is the whole answer - stating
          the empty one underneath it would be the page contradicting itself. */}
      {rows.length === 0 && noticeState === 'failed' ? null : rows.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Share2 className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">Nothing sent from this job yet.</p>
          <p className="text-xs text-faint mt-1 max-w-md mx-auto">
            Send someone the plans, permits, submittals and compliance documents on this job, plus your company
            files - or send a plain update with nothing attached. Whoever you send it to can send documents
            straight back on the same link.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => row.kind === 'notice' ? (
            <NoticeRow key={`n:${row.notice.id}`} notice={row.notice} />
          ) : (
            <ShareRow
              key={`s:${row.share.id}`}
              sh={row.share}
              copiedId={copiedId}
              onCopy={async (sh) => {
                await navigator.clipboard.writeText(sh.url)
                setCopiedId(sh.id); setTimeout(() => setCopiedId(''), 2000)
              }}
              onAdd={setAddTo}
              onRevoke={setRevoked}
            />
          ))}
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

      {telling && (
        <NotifyTeamDialog
          projectId={params.id}
          onClose={() => setTelling(false)}
          onSent={load}
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

/**
 * A BROADCAST, AS A RECORD.
 *
 * Hoisted rather than declared inside the page: a component declared inside a
 * component is a new type on every render, so React throws the DOM away and
 * rebuilds it.
 *
 * The NAMES are the record. "Told 6 people" six weeks later is not an answer to
 * "did anybody tell the electrician" - and the ones who could NOT be reached
 * are part of it too, because an audit listing only successes answers the easy
 * half of the question.
 */
function NoticeRow({ notice }: { notice: NoticeRecord }) {
  const reached = noticeReached(notice)
  return (
    <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 font-semibold text-ink">
            <Megaphone className="h-4 w-4 shrink-0 text-warn" />
            <span className="truncate">
              {notice.planName ? `Update on ${notice.planName}` : 'Update on this job'}
            </span>
          </p>
          <p className="text-xs text-muted-fg mt-0.5">
            {[
              `${notice.actorName} told ${reached} ${reached === 1 ? 'person' : 'people'}`,
              `Sent ${formatDate(notice.sentAt)}`,
            ].join(' · ')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-warn-tint px-2.5 py-1 text-[11px] font-semibold text-warn">
          Broadcast
        </span>
      </div>

      <p className="mt-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink-soft whitespace-pre-wrap">
        {notice.message}
      </p>

      {notice.told.length > 0 && (
        <p className="mt-2 text-xs text-muted-fg">
          <span className="font-semibold text-ink-soft">Told:</span> {notice.told.join(', ')}
        </p>
      )}
      {notice.failed.length > 0 && (
        <p className="mt-1 text-xs text-danger">
          <span className="font-semibold">Could not reach:</span> {notice.failed.join(', ')}
        </p>
      )}
    </div>
  )
}

/** One document send, with its link and what came back on it. */
function ShareRow({
  sh, copiedId, onCopy, onAdd, onRevoke,
}: {
  sh: Share
  copiedId: string
  onCopy: (sh: Share) => void
  onAdd: (sh: Share) => void
  onRevoke: (id: string, revoked: boolean) => void
}) {
  const back = sh.file_share_uploads ?? []
  const expired = !!sh.expires_at && new Date(sh.expires_at) < new Date()
  const dead = !!sh.revoked_at || expired
  const count = (sh.files ?? []).length

  return (
    <div className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{sh.name}</p>
          <p className="text-xs text-muted-fg mt-0.5">
            {[
              sh.recipient_name && `To ${sh.recipient_name}`,
              // "0 documents" reads like a send that lost its attachments
              // rather than one that never had any.
              shareContentsLabel(count),
              `Sent ${formatDate(sh.created_at)}`,
              sh.viewed_at && `Opened ${formatDate(sh.viewed_at)}`,
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
          <button onClick={() => onAdd(sh)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-muted">
            <Plus className="h-3.5 w-3.5" /> Add documents
          </button>
        )}
        {!dead && (
          <button onClick={() => onCopy(sh)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-muted">
            {copiedId === sh.id ? <><Check className="h-3.5 w-3.5 text-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
          </button>
        )}
        {sh.revoked_at ? (
          <button onClick={() => onRevoke(sh.id, false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:text-ink hover:bg-muted">
            <RotateCcw className="h-3.5 w-3.5" /> Turn back on
          </button>
        ) : !expired && (
          <button onClick={() => onRevoke(sh.id, true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:text-danger hover:bg-danger-tint">
            <Ban className="h-3.5 w-3.5" /> Turn off link
          </button>
        )}
      </div>
    </div>
  )
}
