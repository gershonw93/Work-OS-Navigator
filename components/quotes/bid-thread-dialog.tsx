'use client'

// The GC's side of one quote conversation, opened from an invite row on
// Request Quotes. A dialog rather than a panel under the row: a row three
// invites down would otherwise push the thread out of sight on a phone.

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BidMessage } from '@/lib/bid-thread'
import { BidThread, type ThreadState } from './bid-thread'

export function BidThreadDialog({
  projectId, requestId, invite, requestTitle, onClose, onChanged,
}: {
  projectId: string
  requestId: string
  invite: { id: string; vendor_name: string | null; vendor_email: string | null }
  requestTitle: string
  onClose: () => void
  /** The list's counts are out of date once something is sent. */
  onChanged: () => void
}) {
  const [messages, setMessages] = useState<BidMessage[]>([])
  const [state, setState] = useState<ThreadState>('loading')
  const who = invite.vendor_name || invite.vendor_email || 'this sub'
  const url = `/api/projects/${projectId}/bid-requests/${requestId}/invites/${invite.id}/messages`
  // The invite being waited for. A response for one that is no longer open
  // must not paint over the one that is.
  const waitingFor = useRef(invite.id)

  async function auth() {
    const { data: { session } } = await createClient().auth.getSession()
    return { Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  async function read(quiet: boolean) {
    const forId = invite.id
    if (!quiet) setState('loading')
    try {
      const res = await fetch(url, { headers: await auth() })
      const d = await res.json().catch(() => ({}))
      if (waitingFor.current !== forId) return
      if (!res.ok) { setState('failed'); return }
      setMessages(d.messages ?? []); setState('ready')
    } catch {
      if (waitingFor.current === forId) setState('failed')
    }
  }

  useEffect(() => {
    waitingFor.current = invite.id
    read(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invite.id])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(body: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await auth()) },
        body: JSON.stringify({ body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return d.error ?? 'Could not send. Try again.'
      setMessages(m => [...m, d.message])
      onChanged()
      return null
    } catch {
      onChanged()
      return 'We could not tell whether that sent. Close and reopen the thread before sending it again.'
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full max-w-lg overflow-y-auto rounded-2xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-ink">Messages with {who}</h2>
            <p className="truncate text-sm text-muted-fg">{requestTitle}</p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="shrink-0 text-faint hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">
          <BidThread messages={messages} state={state} mine="gc" otherName={who} onSend={send} onRefresh={async () => { await read(true); onChanged() }} />
          <p className="mt-3 text-xs text-faint">
            {who} can read and reply once they have a free SyteNav account, which they can make from their quote link. They are told by email when you write.
          </p>
        </div>
      </div>
    </div>
  )
}
