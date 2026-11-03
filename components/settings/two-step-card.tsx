'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { cleanCode, codeProblem, CODE_LENGTH } from '@/lib/two-step'

// ─────────────────────────────────────────────────────────────────────────────
// Settings > Profile: two-step sign-in, for the person signed in. PERSONAL -
// on Profile rather than the company Security tab, which only an admin can
// open. An authenticator app only (Google Authenticator, Authy, 1Password...):
// no text messages, which cost per code and can be intercepted.
//
// TURNING IT ON IS TWO ACTS, AND ONLY THE SECOND ONE COUNTS. `enroll()` writes
// an UNVERIFIED factor the moment the QR code is drawn; nothing is on until a
// code from the app proves it was scanned (`challengeAndVerify`, which also
// lifts THIS session to the two-step level, so nobody is asked for a code the
// second after setting it up). Closing the dialog first removes the half-made
// factor, and a fresh start clears any left behind by a closed tab.
//
// TURNING IT OFF ASKS FOR A CODE FIRST. A session left open on a borrowed
// laptop must not be the way somebody switches the lock off.
// ─────────────────────────────────────────────────────────────────────────────

type State =
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'off' }
  | { kind: 'on'; factorId: string }

type Dialog =
  | { kind: 'setup'; factorId: string; qr: string; secret: string }
  | { kind: 'turn-off'; factorId: string }

export function TwoStepCard() {
  const supabase = createClient()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase.auth.mfa.listFactors()
      if (e || !data) { setState({ kind: 'failed' }); return }
      const verified = data.totp.find(f => f.status === 'verified')
      setState(verified ? { kind: 'on', factorId: verified.id } : { kind: 'off' })
    } catch {
      setState({ kind: 'failed' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { load() }, [load])

  function close() {
    // A half-made factor goes with the dialog - see the note at the top.
    if (dialog?.kind === 'setup') supabase.auth.mfa.unenroll({ factorId: dialog.factorId }).catch(() => {})
    setDialog(null); setCode(''); setError(null)
  }

  useEffect(() => {
    if (!dialog) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog])

  async function startSetup() {
    setBusy(true); setDone(null); setError(null)
    try {
      // Clear anything a closed tab left half-made, or the new enrol collides.
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.all ?? []) {
        if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error: e } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })
      if (e || !data) throw e ?? new Error('enroll returned nothing')
      setDialog({ kind: 'setup', factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } catch (e) {
      console.error('[two-step] enroll failed', e)
      setDone('Could not start two-step sign-in just now. Try again in a minute.')
    } finally {
      setBusy(false)
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault()
    if (!dialog) return
    const problem = codeProblem(code)
    if (problem) { setError(problem); return }
    setBusy(true); setError(null)
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: dialog.factorId, code: cleanCode(code) })
      if (verifyError) { setError('That code did not work. Codes change every 30 seconds - type the one showing now.'); return }

      if (dialog.kind === 'setup') {
        setState({ kind: 'on', factorId: dialog.factorId })
        setDone('Two-step sign-in is on. Next time you sign in, you will be asked for a code from the app.')
      } else {
        const { error: offError } = await supabase.auth.mfa.unenroll({ factorId: dialog.factorId })
        if (offError) { setError('The code was right, but two-step sign-in could not be turned off. Try again.'); return }
        setState({ kind: 'off' })
        setDone('Two-step sign-in is off. You will sign in with your password only.')
      }
      setDialog(null); setCode('')
    } catch {
      setError('Could not reach SyteNav to check the code. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent-fg" /> Two-step sign-in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-fg">
          After your password, SyteNav asks for a 6-digit code from an authenticator app on your phone
          (Google Authenticator, Authy, 1Password or similar). Someone who learns your password still cannot get in.
        </p>

        {state.kind === 'loading' && <p className="text-sm text-faint">Checking…</p>}
        {state.kind === 'failed' && (
          <p className="text-sm text-danger">Could not check whether two-step sign-in is on. Reload the page to try again.</p>
        )}

        {state.kind === 'off' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
            <span className="text-sm text-ink-soft">Off - you sign in with your password only.</span>
            <Button onClick={startSetup} disabled={busy}>{busy ? 'Starting…' : 'Turn on'}</Button>
          </div>
        )}

        {state.kind === 'on' && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
            <span className="text-sm font-medium text-success">On - signing in asks for a code from your app.</span>
            <Button variant="outline" onClick={() => { setDone(null); setDialog({ kind: 'turn-off', factorId: state.factorId }) }}>
              Turn off
            </Button>
          </div>
        )}

        {done && <p className="text-sm text-ink-soft">{done}</p>}
      </CardContent>

      {dialog && (
        <div className="overlay" data-overlay onClick={close}>
          <div className="w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel shadow-xl lg:rounded-xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
              <ShieldCheck className="h-4 w-4 shrink-0 text-accent" />
              <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
                {dialog.kind === 'setup' ? 'Turn on two-step sign-in' : 'Turn off two-step sign-in'}
              </h2>
              <button onClick={close} aria-label="Close" title="Close"
                className="shrink-0 rounded-lg p-1.5 text-muted-fg hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>

            <form onSubmit={confirm} className="space-y-4 p-4">
              {dialog.kind === 'setup' ? (
                <>
                  <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-fg">
                    <li>Open your authenticator app and add an account.</li>
                    <li>Scan this code with it.</li>
                    <li>Type the 6-digit code the app shows.</li>
                  </ol>
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={dialog.qr} alt="QR code to scan with your authenticator app"
                      className="h-48 w-48 rounded-lg bg-white p-2" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-faint">Cannot scan? Enter this key in the app instead:</p>
                    <p className="break-all rounded-md bg-surface px-3 py-2 font-mono text-sm text-ink select-all">{dialog.secret}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-fg">
                  To turn it off, type the code your authenticator app is showing now. After this you sign in with your password only.
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="two-step-code">6-digit code *</Label>
                <Input id="two-step-code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
                  maxLength={CODE_LENGTH + 2} value={code} onChange={e => setCode(e.target.value)}
                  autoFocus={autoFocusOnDesktop()} />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
                <Button type="submit" variant={dialog.kind === 'setup' ? 'default' : 'destructive'} disabled={busy}>
                  {busy ? 'Checking…' : dialog.kind === 'setup' ? 'Turn on' : 'Turn off'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  )
}
