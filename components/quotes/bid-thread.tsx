'use client'

// One quote conversation, drawn the same way for both people in it - the sub
// on their quote link and the GC on Request Quotes. Holds no fetching: each
// side has its own route and its own idea of who is allowed, so the caller
// loads and sends and this only shows.

import { useEffect, useRef, useState } from 'react'
import { Loader2, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { messageProblem, MESSAGE_MAX, type BidMessage } from '@/lib/bid-thread'
import { absoluteTime, timeAgo } from '@/lib/time-ago'

export type ThreadState = 'loading' | 'ready' | 'failed'

export function BidThread({
  messages, state, mine, otherName, onSend, onRefresh,
}: {
  messages: BidMessage[]
  /** "No messages yet" is only ever said over a read that worked. */
  state: ThreadState
  /** Which side the person looking at it is on - theirs go on the right. */
  mine: 'gc' | 'sub'
  /** Who is at the other end, for the empty state and the placeholder. */
  otherName: string
  /** Resolves to an error sentence, or null when it went. */
  onSend: (body: string) => Promise<string | null>
  /** Re-read the thread - a reply arrives from somebody else's screen. */
  onRefresh?: () => Promise<void>
}) {
  const [checking, setChecking] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages.length])

  async function send() {
    const problem = messageProblem(draft)
    if (problem) { setError(problem); return }
    setSending(true); setError('')
    try {
      const err = await onSend(draft)
      if (err) setError(err)
      else setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {state === 'loading' && <p className="py-3 text-sm text-muted-fg">Loading messages…</p>}
        {state === 'failed' && <p className="py-3 text-sm text-danger">Could not load the messages. Reload to try again.</p>}
        {state === 'ready' && messages.length === 0 && (
          <p className="py-3 text-sm text-muted-fg">No messages yet. Ask {otherName} anything about this request.</p>
        )}
        {state === 'ready' && messages.map(m => {
          const own = m.side === mine
          return (
            <div key={m.id} className={cn('flex', own ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[85%] rounded-2xl px-3 py-2',
                own ? 'bg-accent-tint text-ink' : 'border border-line bg-surface text-ink',
              )}>
                <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{m.body}</p>
                <p className="mt-1 text-[11px] text-faint" title={absoluteTime(m.created_at)}>
                  {own ? 'You' : (m.author_name || otherName)} · {timeAgo(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div className="space-y-2">
        <label htmlFor="bid-thread-draft" className="sr-only">Message</label>
        <textarea
          id="bid-thread-draft"
          rows={3}
          maxLength={MESSAGE_MAX}
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError('') }}
          placeholder={`Message ${otherName}…`}
          className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2.5 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          {onRefresh ? (
            <button type="button" disabled={checking}
              onClick={async () => { setChecking(true); try { await onRefresh() } finally { setChecking(false) } }}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-fg hover:text-ink disabled:opacity-60">
              <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} /> Check for replies
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60 lg:min-h-0 lg:py-2"
          >
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Send className="h-4 w-4" /> Send</>}
          </button>
        </div>
      </div>
    </div>
  )
}
