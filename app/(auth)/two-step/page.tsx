'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { supportMailto, SUPPORT_EMAIL } from '@/lib/support-email'
import { cleanCode, codeProblem, CODE_LENGTH, needsSecondStep, twoStepReturnPath } from '@/lib/two-step'

// THE SECOND STEP. Reached from the login form after a password that belongs
// to somebody with two-step on, and from middleware whenever a session that
// has not done the code tries to open an app screen. Not under /login: a
// signed-in visitor is bounced OFF /login, and this visitor is signed in -
// half of the way.

type Phase =
  | { kind: 'checking' }
  | { kind: 'ready'; factorId: string; email: string | null }
  | { kind: 'failed' }

export default function TwoStepPage() {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)

  const next = () => twoStepReturnPath(new URLSearchParams(window.location.search).get('next'))

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        // getUser, not the cookie's copy: the factors have to be current.
        const [{ data: { user } }, { data: { session } }] = await Promise.all([
          supabase.auth.getUser(), supabase.auth.getSession(),
        ])
        if (!active) return
        if (!user || !session) { window.location.href = '/login'; return }
        if (!needsSecondStep(user, session.access_token)) { window.location.href = next(); return }
        const factor = user.factors?.find(f => f.status === 'verified' && f.factor_type === 'totp')
        if (!factor) { window.location.href = next(); return }
        setPhase({ kind: 'ready', factorId: factor.id, email: user.email ?? null })
      } catch {
        if (active) setPhase({ kind: 'failed' })
      }
    })()
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (phase.kind !== 'ready') return
    const problem = codeProblem(code)
    if (problem) { setError(problem); return }
    setError(null)
    setVerifying(true)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: phase.factorId, code: cleanCode(code),
      })
      if (verifyError) {
        setError('That code did not work. Codes change every 30 seconds - type the one showing now.')
        return
      }
      // A FULL load, not router.push: the server reads the new token off the
      // cookie, and a client-side hop would reuse what was rendered for the old.
      window.location.href = next()
    } catch {
      setError('Could not reach SyteNav to check the code. Check your connection and try again.')
    } finally {
      setVerifying(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Two-step sign-in</h1>
        <p className="mt-1 text-sm text-faint">
          {phase.kind === 'ready' && phase.email
            ? <>Enter the code from your authenticator app for {phase.email}.</>
            : <>Enter the code from your authenticator app.</>}
        </p>
      </div>

      {phase.kind === 'checking' && (
        <div className="flex items-center gap-3 rounded-md border border-line bg-muted/40 px-4 py-3">
          <div className="h-4 w-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <p className="text-sm text-faint">Checking your sign-in…</p>
        </div>
      )}

      {phase.kind === 'failed' && (
        <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
          <p className="text-sm text-danger">Could not reach SyteNav. Check your connection and reload this page.</p>
        </div>
      )}

      {phase.kind === 'ready' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="code" className="text-faint">6-digit code *</Label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={CODE_LENGTH + 2}
              value={code}
              onChange={e => setCode(e.target.value)}
              autoFocus={autoFocusOnDesktop()}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-900/40 border border-red-700 px-4 py-2.5">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={verifying}>
            {verifying ? 'Checking…' : 'Continue'}
          </Button>
        </form>
      )}

      <div className="mt-6 space-y-3 text-center text-sm text-faint">
        <p>
          Lost your phone? Email{' '}
          <a href={supportMailto('Two-step sign-in: lost my authenticator')} className="text-accent-fg hover:text-accent">{SUPPORT_EMAIL}</a>
          {' '}from your account&apos;s address and we will turn two-step off so you can set it up again.
        </p>
        <button type="button" onClick={signOut} className="text-accent-fg hover:text-accent">
          Sign out
        </button>
      </div>
    </div>
  )
}
