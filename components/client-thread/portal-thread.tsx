'use client'

// The client's half of a thread, on their portal link. No account: the link is
// who they are, and the answer comes back here and by email. Reads its thread
// when opened, unless the page already carried it (the selections page does).

import { useEffect, useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { BidThread, type ThreadState } from '@/components/quotes/bid-thread'
import { threadShape, type ClientMessage, type ClientSubject } from '@/lib/client-thread'
import { readThread } from '@/lib/thread-read'

export function PortalThread({ token, subject, subjectId, prompt, name, initial }: {
  token: string
  subject: ClientSubject
  subjectId: string | null
  /** The closed button: "Ask about this invoice". */
  prompt: string
  /** Who is asking, if the page knows. */
  name?: string
  /** Messages the page already loaded - opens straight onto the conversation. */
  initial?: ClientMessage[]
}) {
  const [messages, setMessages] = useState<ClientMessage[]>(initial ?? [])
  const [state, setState] = useState<ThreadState>(initial ? 'ready' : 'loading')
  const [open, setOpen] = useState((initial?.length ?? 0) > 0)
  const query = `subject=${subject}${subjectId ? `&id=${subjectId}` : ''}`

  async function read() {
    // Asked twice, and a failure keeps what is already on screen (lib/thread-read.ts).
    const r = await readThread<ClientMessage>(() => fetch(`/api/portal/${token}/messages?${query}`))
    if (r.ok) { setMessages(r.messages); setState('ready'); return }
    console.error('[portal-thread] read failed', { subject, subjectId, status: r.status, error: r.error })
    setState('failed')
  }
  useEffect(() => { if (open && !initial) read() }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(body: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, id: subjectId, body, name }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return d.error ?? 'Could not send that. Try again.'
      if (d.message) setMessages(m => m.some(x => x.id === d.message.id) ? m : [...m, d.message])
      await read()
      return null
    } catch {
      return 'We could not tell whether that went - reload the page before sending it again.'
    }
  }

  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const { waitingOnClient } = threadShape(sorted)

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
        <MessageSquare className="h-4 w-4" /> {prompt}
      </button>
    )
  }
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-faint font-semibold">
        <MessageSquare className="h-3.5 w-3.5" /> Questions
        {waitingOnClient && <span className="normal-case tracking-normal rounded-full bg-accent-tint px-2 py-0.5 text-[11px] text-accent-fg">We replied</span>}
      </p>
      <BidThread
        messages={sorted}
        state={state}
        mine="client"
        otherName="us"
        emptyText="Not sure about something? Ask here - we get it straight away and answer here and by email."
        onSend={send}
        onRefresh={read}
      />
    </div>
  )
}
