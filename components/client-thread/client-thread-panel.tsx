'use client'

// The GC's half of a client thread - a selection, an invoice, a payment
// request or the job itself. Reads its own thread (a list only carries who
// spoke last) and keeps loading, failed and empty apart, so "no questions yet"
// is only said over a read that worked.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BidThread, type ThreadState } from '@/components/quotes/bid-thread'
import type { ClientMessage, ClientSubject } from '@/lib/client-thread'
import { readThread } from '@/lib/thread-read'

export function ClientThreadPanel({ projectId, subject, subjectId, clientName, onChanged, title }: {
  projectId: string
  subject: ClientSubject
  subjectId: string | null
  clientName: string | null
  /** Re-read whatever list shows who spoke last. */
  onChanged?: () => unknown
  title?: string
}) {
  const [messages, setMessages] = useState<ClientMessage[]>([])
  const [state, setState] = useState<ThreadState>('loading')
  const [note, setNote] = useState<string | null>(null)
  const who = clientName?.trim() || 'the client'
  const query = `subject=${subject}${subjectId ? `&id=${subjectId}` : ''}`

  async function bearer() {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? ''
  }

  async function read() {
    // Asked twice before it says it failed, and a failure keeps whatever was
    // already on screen (lib/thread-read.ts). The fresh bearer is fetched per
    // attempt, so a session refreshed in between is the one sent.
    const r = await readThread<ClientMessage>(async () =>
      fetch(`/api/projects/${projectId}/client-messages?${query}`, { headers: { Authorization: `Bearer ${await bearer()}` } }))
    if (r.ok) { setMessages(r.messages); setState('ready'); return }
    console.error('[client-thread] read failed', { subject, subjectId, status: r.status, error: r.error })
    setState('failed')
  }
  useEffect(() => { read() }, [projectId, query]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: string): Promise<string | null> {
    setNote(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/client-messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await bearer()}` },
        body: JSON.stringify({ subject, id: subjectId, body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return d.error ?? 'Could not send that. Try again.'
      // Saved is not the same as told - say which, since the client has no bell.
      const e = d.emailed
      if (e && !e.sent) {
        setNote(e.reason === 'no_email'
          ? `Saved. There is no email address on this client, so ${who} sees it next time they open their link.`
          : e.reason === 'no_link'
            ? 'Saved, but this job has not been shared with the client yet - share the client link so they can read it.'
            : `Saved, but the email to ${e.to} did not go. ${who} will still see it on their link.`)
      } else if (e?.sent) setNote(`Sent - ${who} was emailed at ${e.to}.`)
      // The message is saved whatever the re-read says - show it either way.
      if (d.message) setMessages(m => m.some(x => x.id === d.message.id) ? m : [...m, d.message])
      await read()
      onChanged?.()
      return null
    } catch {
      return 'We could not tell whether that went - reload before sending it again.'
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-ink">{title ?? `Questions from ${who}`}</p>
      <BidThread
        messages={messages}
        state={state}
        mine="gc"
        otherName={who}
        emptyText={`No questions yet. ${who} can ask from their link, and you can start the conversation here - they get it by email.`}
        onSend={send}
        onRefresh={read}
      />
      {note && <p className="text-xs text-muted-fg">{note}</p>}
    </div>
  )
}
