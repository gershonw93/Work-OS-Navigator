'use client'

// The client's free login, on their project page.
//
// "approvals must come with a free login". The link is a bearer token that
// gets forwarded, so answering a change order needs a session for the address
// on the job's customer record: we email a six-digit code there, they type it
// here, and the session it starts stays in this browser for next time. No
// password, nothing to set up. See lib/portal-login.ts.
//
// Every change-order card asks `usePortalLogin`; signing in on one tells the
// others through a window event, so the page never shows a sign-in box beside
// a card that is already signed in.

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fetchProblem } from '@/lib/fetch-error'

const CHANGED = 'sytenav:portal-login-changed'

export type LoginState =
  | { kind: 'checking' }
  | { kind: 'signed-in' }
  | { kind: 'signed-out'; reason: 'no_session' | 'no_email_on_file' | 'wrong_person'; emailOnFile: string | null }
  | { kind: 'failed' }

/** The session token to send with a request, or null. */
export async function portalAccessToken(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export function usePortalLogin(token: string) {
  const [state, setState] = useState<LoginState>({ kind: 'checking' })

  const check = useCallback(async () => {
    try {
      const access = await portalAccessToken()
      const res = await fetch(`/api/portal/${token}/login`, {
        headers: access ? { Authorization: `Bearer ${access}` } : {},
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setState({ kind: 'failed' }); return }
      setState(d.signedIn
        ? { kind: 'signed-in' }
        : { kind: 'signed-out', reason: d.reason ?? 'no_session', emailOnFile: d.emailOnFile ?? null })
    } catch {
      // A failure to ASK is not "signed out" - the card says it could not
      // check rather than offering a code to somebody already signed in.
      setState({ kind: 'failed' })
    }
  }, [token])

  useEffect(() => {
    check()
    const again = () => { check() }
    window.addEventListener(CHANGED, again)
    return () => window.removeEventListener(CHANGED, again)
  }, [check])

  return { state, recheck: check }
}

function announce() {
  window.dispatchEvent(new Event(CHANGED))
}

export function PortalSignIn({ token, state, recheck }: {
  token: string
  state: LoginState
  recheck: () => void
}) {
  const [step, setStep] = useState<'start' | 'code'>('start')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (state.kind === 'checking') {
    return <p className="flex items-center gap-1.5 text-xs text-faint"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking whether you are signed in...</p>
  }
  if (state.kind === 'failed') {
    return (
      <p className="text-sm text-muted-fg">
        We could not check whether you are signed in.{' '}
        <button type="button" onClick={recheck} className="font-semibold text-accent underline">Try again</button>
      </p>
    )
  }
  if (state.kind === 'signed-in') return null

  if (state.reason === 'no_email_on_file') {
    return (
      <p className="rounded-lg bg-surface px-3 py-2 text-sm text-muted-fg">
        To answer, you sign in with your email - and we do not have one for you on this job yet.
        Ask us to add it, or ask a question below.
      </p>
    )
  }

  async function signOut() {
    setBusy(true); setError('')
    try { await createClient().auth.signOut() } finally { setBusy(false); announce() }
  }

  if (state.reason === 'wrong_person') {
    return (
      <div className="space-y-2 rounded-lg bg-surface px-3 py-2.5">
        <p className="text-sm text-muted-fg">
          This browser is signed in as somebody else. Sign out, then sign in with {state.emailOnFile ?? 'the address we have for you'}.
        </p>
        <button type="button" onClick={signOut} disabled={busy}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-panel disabled:opacity-60 lg:min-h-0 lg:py-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign out
        </button>
      </div>
    )
  }

  async function sendCode() {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/portal/${token}/login/code`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error ?? 'Could not send a code. Try again.'); return }
      setSentTo(d.to ?? '')
      setStep('code')
    } catch (e) {
      setError(fetchProblem(e, 'sending your code'))
    } finally { setBusy(false) }
  }

  async function verify() {
    if (!/^\d{6}$/.test(code.replace(/[\s-]/g, ''))) { setError('Type the six digits from the email.'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/portal/${token}/login/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.tokenHash) { setError(d.error ?? 'Could not sign you in. Try again.'); return }
      const { error: otpErr } = await createClient().auth.verifyOtp({ token_hash: d.tokenHash, type: 'magiclink' })
      if (otpErr) {
        console.error('[portal-login] session exchange failed', otpErr)
        setError('Your code was right but we could not start your session. Send a new code and try again.')
        setStep('start'); setCode('')
        return
      }
      announce()
    } catch (e) {
      setError(fetchProblem(e, 'signing you in'))
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2 rounded-lg bg-surface px-3 py-2.5">
      {step === 'start' ? (
        <>
          <p className="text-sm text-ink-soft">
            Sign in to answer - it is free, with no password. We will email a code to {state.emailOnFile ?? 'the address we have for you'}.
          </p>
          <button type="button" onClick={sendCode} disabled={busy}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60 lg:w-auto lg:min-h-0 lg:py-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Email me a code
          </button>
        </>
      ) : (
        <>
          <label htmlFor={`code-${token}`} className="block text-sm text-ink-soft">
            Type the 6-digit code we sent to {sentTo || 'your email'} *
          </label>
          <input id={`code-${token}`} inputMode="numeric" autoComplete="one-time-code" maxLength={9}
            value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') verify() }}
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-base tracking-widest text-ink focus:border-accent focus:outline-none" />
          <div className="row-even lg:flex lg:flex-wrap gap-2">
            <button type="button" onClick={verify} disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60 lg:min-h-0 lg:py-2">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
            <button type="button" onClick={sendCode} disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 text-sm font-semibold text-ink-soft hover:bg-panel disabled:opacity-60 lg:min-h-0 lg:py-2">
              Send a new code
            </button>
          </div>
        </>
      )}
      {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}
    </div>
  )
}
