'use client'

// The sub's half of a quote conversation, on their /bid/<token> page.
//
// Pricing needs no account and still does not. Messaging does: an answer has
// to reach somebody, and the link has no person behind it. So with no session
// this offers a FREE account - a vendor account that sees the jobs it is
// invited to and cannot open a job of its own - and with the right session it
// is the thread.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { BidMessage } from '@/lib/bid-thread'
import { BidThread, type ThreadState } from './bid-thread'

type Mode =
  | { kind: 'checking' }
  | { kind: 'signed-out' }
  | { kind: 'wrong-account'; message: string }
  | { kind: 'thread' }

const inputCls = 'w-full rounded-lg bg-surface border border-line px-3 py-2.5 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none'

export function QuoteMessages({
  token, gcName, vendorName, hasEmail,
}: {
  token: string
  gcName: string | null
  vendorName: string | null
  /** Whether the invite already knows the address the account goes to. */
  hasEmail: boolean
}) {
  const gc = gcName || 'the contractor'
  const [mode, setMode] = useState<Mode>({ kind: 'checking' })
  const [messages, setMessages] = useState<BidMessage[]>([])
  const [state, setState] = useState<ThreadState>('loading')

  // Free-account form
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState(vendorName ?? '')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [signInInstead, setSignInInstead] = useState<string | null>(null)

  const bearer = useCallback(async () => {
    const { data: { session } } = await createClient().auth.getSession()
    return session?.access_token ?? null
  }, [])

  const load = useCallback(async () => {
    const t = await bearer()
    if (!t) { setMode({ kind: 'signed-out' }); return }
    try {
      const res = await fetch(`/api/bid/${token}/messages`, { headers: { Authorization: `Bearer ${t}` } })
      const d = await res.json().catch(() => ({}))
      if (res.status === 401) { setMode({ kind: 'signed-out' }); return }
      if (d.wrongAccount) { setMode({ kind: 'wrong-account', message: d.error }); return }
      setMode({ kind: 'thread' })
      if (!res.ok) { setState('failed'); return }
      setMessages(d.messages ?? []); setState('ready')
    } catch {
      setMode({ kind: 'thread' }); setState('failed')
    }
  }, [bearer, token])

  useEffect(() => { load() }, [load])

  async function send(body: string): Promise<string | null> {
    const t = await bearer()
    if (!t) { setMode({ kind: 'signed-out' }); return 'Your session ended. Sign in again.' }
    try {
      const res = await fetch(`/api/bid/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) return d.error ?? 'Could not send. Try again.'
      setMessages(m => [...m, d.message])
      return null
    } catch {
      // A request that did not come back is not a verdict - it may have gone.
      await load()
      return 'We could not tell whether that sent. Check the thread above before sending it again.'
    }
  }

  async function requestAccount(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setFormError('Enter your name.'); return }
    if (!hasEmail && !email.trim()) { setFormError('Enter your email address.'); return }
    setBusy(true); setFormError('')
    try {
      const res = await fetch(`/api/bid/${token}/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName.trim(), company_name: company.trim(), email: email.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setFormError(d.error ?? 'Could not set up your account. Try again.'); return }
      if (d.signIn) { setSignInInstead(d.message); return }
      setSentTo(d.email ?? 'your inbox')
    } catch {
      setFormError('We could not tell whether that went through. Check your inbox before trying again.')
    } finally {
      setBusy(false)
    }
  }

  const loginHref = `/login?next=${encodeURIComponent(`/bid/${token}`)}`

  return (
    <div className="rounded-2xl border border-line bg-panel px-5 py-5 text-ink">
      <div className="mb-3 flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-accent-fg" />
        <h2 className="text-base font-bold">Questions for {gc}?</h2>
      </div>

      {mode.kind === 'checking' && <p className="text-sm text-muted-fg">Loading…</p>}

      {mode.kind === 'wrong-account' && <p className="text-sm text-muted-fg">{mode.message}</p>}

      {mode.kind === 'thread' && (
        <BidThread messages={messages} state={state} mine="sub" otherName={gc} onSend={send} />
      )}

      {mode.kind === 'signed-out' && (
        sentTo ? (
          <div className="rounded-xl border border-success/30 bg-success-tint px-4 py-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-success" />
            <p className="font-semibold">Check {sentTo}</p>
            <p className="mt-1 text-sm text-muted-fg">
              We sent a link to finish your account. Set a password and you land back here, ready to message {gc}.
            </p>
          </div>
        ) : signInInstead ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-fg">{signInInstead}</p>
            <Link href={loginHref} className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90">
              Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={requestAccount} className="space-y-4">
            <p className="text-sm text-muted-fg">
              Create a free account to message {gc} about this request. It shows you the jobs you are invited to and nothing else, and you can still send your quote without one.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="qm-name" className="text-sm text-ink-soft">Your name *</label>
              <input id="qm-name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="qm-company" className="text-sm text-ink-soft">Company (optional)</label>
              <input id="qm-company" autoComplete="organization" value={company} onChange={e => setCompany(e.target.value)} className={inputCls} />
            </div>
            {hasEmail ? (
              <p className="text-xs text-faint">We will email the link to finish your account to the address this request was sent to.</p>
            ) : (
              <div className="space-y-1.5">
                <label htmlFor="qm-email" className="text-sm text-ink-soft">Email *</label>
                <input id="qm-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} />
              </div>
            )}
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : 'Create free account'}
              </button>
              <Link href={loginHref} className="text-sm font-medium text-ink-soft underline-offset-2 hover:underline">
                I already have an account
              </Link>
            </div>
          </form>
        )
      )}
    </div>
  )
}
