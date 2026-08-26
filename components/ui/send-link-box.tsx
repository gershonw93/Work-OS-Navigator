'use client'

import { useState } from 'react'
import { Send, Loader2, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; to: string }
  | { kind: 'failed'; message: string }

/**
 * "Email this link to somebody", wherever that is needed.
 *
 * Four flows hand a token link to somebody with no account - quote requests,
 * compliance document requests, shared files and client invoices - and all
 * four used to be a `mailto:` that opened YOUR mail client and sent nothing.
 * One control rather than four, for the same reason there is one send helper
 * behind it.
 *
 * TWO RULES IT ENFORCES.
 *
 * Copy Link never goes away. It is the fallback the failure message points at,
 * and the only thing that works at all while SENDGRID_API_KEY is unset - which
 * is the state every fresh environment starts in.
 *
 * A refusal is shown, never swallowed. The server answers 200 with
 * `{ sent: false }` when it did not send, precisely so this can say which -
 * a green tick over an email that never left is the one outcome worse than a
 * visible failure.
 */
export function SendLinkBox({
  endpoint,
  url,
  defaultTo = '',
  label = 'Email it to them',
  placeholder = 'them@example.com',
  notePlaceholder = 'Add a line for them (optional)',
  onSent,
  className,
}: {
  /** POST here with { to, note }. Must answer { sent, error? }. */
  endpoint: string
  /** The link itself, for Copy. */
  url: string
  defaultTo?: string
  label?: string
  placeholder?: string
  notePlaceholder?: string
  onSent?: (to: string) => void
  className?: string
}) {
  const [to, setTo] = useState(defaultTo)
  const [note, setNote] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ kind: 'sending' })
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ to, note: note.trim() || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d?.sent === false) {
        setState({ kind: 'failed', message: d?.error ?? 'Could not send that email.' })
        return
      }
      setState({ kind: 'sent', to: d.to ?? to })
      onSent?.(d.to ?? to)
    } catch {
      setState({ kind: 'failed', message: 'Network error - copy the link and send it yourself.' })
    }
  }

  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
        <span className="flex-1 truncate font-mono text-xs text-muted-fg">{url}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface"
        >
          {copied ? <><Check className="h-3 w-3" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
        </button>
      </div>

      {state.kind === 'sent' ? (
        <div className="rounded-lg bg-success-tint px-3 py-2 text-sm text-success">
          <span className="font-semibold">Sent to {state.to}.</span>{' '}
          <button type="button" onClick={() => setState({ kind: 'idle' })} className="font-semibold underline">
            Send to somebody else
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          <label className="block text-xs font-medium text-muted-fg">{label}</label>
          <div className="flex gap-2">
            <input
              type="email"
              required
              value={to}
              onChange={e => setTo(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={state.kind === 'sending' || !to.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-50"
            >
              {state.kind === 'sending'
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                : <><Send className="h-3.5 w-3.5" /> Send</>}
            </button>
          </div>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={notePlaceholder}
            maxLength={500}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
          {state.kind === 'failed' && <p className="text-sm text-danger">{state.message}</p>}
        </form>
      )}
    </div>
  )
}
