'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'

// ─────────────────────────────────────────────────────────────────────────────
// THE ALLOW PAGE - where Claude sends somebody to connect SyteNav.
//
// Claude opens this with the sign-in request in the query string. The page
// asks the server whether the request is one it can answer at all, makes sure
// the person is signed in to SyteNav (via /login and back, `oauthReturnPath`),
// and then asks the one question: may this app read your jobs?
//
// IT NAMES WHERE YOU WILL BE SENT BACK TO, NOT ONLY WHO IS ASKING. The app's
// name is whatever it registered itself as; the address it returns to is the
// part that cannot be made up, so that is what the page prints beside it.
//
// AND IT SAYS WHAT THE CONNECTION CAN DO, which today is read. A consent page
// that does not say "it cannot change anything" invites the person to guess.
// ─────────────────────────────────────────────────────────────────────────────

type Phase =
  | { kind: 'checking' }
  | { kind: 'ready'; clientName: string | null; returnHost: string; email: string | null }
  | { kind: 'sending' ; clientName: string | null; returnHost: string; email: string | null }
  | { kind: 'error'; message: string; redirect?: string }

const READS = ['Projects and their details', 'Tasks and what is overdue', 'The schedule', 'Inspections', 'Bills from subs', 'Invoices to your clients']

export default function OAuthAuthorizePage() {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  // A SEPARATE consent, off by default. Reading and adding are different
  // powers, and a box that starts ticked is a claim the person never made.
  const [allowWrite, setAllowWrite] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function start() {
      const search = window.location.search
      try {
        const res = await fetch(`/api/oauth/authorize${search}`)
        const check = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !check) { setPhase({ kind: 'error', message: 'SyteNav could not check this sign-in just now. Try again from Claude.' }); return }
        if (!check.ok) { setPhase({ kind: 'error', message: check.error, redirect: check.redirect }); return }

        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) {
          window.location.href = `/login?next=${encodeURIComponent(`/oauth/authorize${search}`)}`
          return
        }
        setPhase({ kind: 'ready', clientName: check.clientName, returnHost: check.returnHost, email: session.user.email ?? null })
      } catch {
        if (!cancelled) setPhase({ kind: 'error', message: 'Could not reach SyteNav. Check your connection and try again from Claude.' })
      }
    }
    start()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function decide(allow: boolean) {
    if (phase.kind !== 'ready') return
    setPhase({ ...phase, kind: 'sending' })
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = Object.fromEntries(new URLSearchParams(window.location.search))
      const res = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, decision: allow ? 'allow' : 'deny', allow_write: allow && allowWrite }),
      })
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/oauth/authorize${window.location.search}`)}`
        return
      }
      const body = await res.json().catch(() => ({}))
      if (body.error) { setPhase({ kind: 'error', message: body.error, redirect: body.redirect }); return }
      if (body.redirect) { window.location.href = body.redirect; return }
      setPhase({ kind: 'error', message: 'SyteNav could not finish signing you in. Try again from Claude.' })
    } catch {
      setPhase({ kind: 'error', message: 'Could not reach SyteNav. Check your connection and try again from Claude.' })
    }
  }

  async function switchAccount() {
    await supabase.auth.signOut()
    window.location.href = `/login?next=${encodeURIComponent(`/oauth/authorize${window.location.search}`)}`
  }

  if (phase.kind === 'checking') {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-fg">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking the sign-in request…
      </div>
    )
  }

  if (phase.kind === 'error') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-ink">Could not connect</h1>
        <p className="text-sm text-muted-fg">{phase.message}</p>
        {phase.redirect && (
          <Button type="button" className="w-full" onClick={() => { window.location.href = phase.redirect! }}>
            Back to the app
          </Button>
        )}
      </div>
    )
  }

  const sending = phase.kind === 'sending'
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold text-ink">
          Allow {phase.clientName ? `"${phase.clientName}"` : 'this app'} to {allowWrite ? 'read and add to' : 'read'} your SyteNav jobs?
        </h1>
        <p className="text-sm text-muted-fg">
          You will be sent back to <span className="font-medium text-ink">{phase.returnHost}</span>.
          Only allow this if you started connecting SyteNav there yourself.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-panel p-4">
        <p className="mb-2 text-sm font-medium text-ink">It will be able to read</p>
        <ul className="space-y-1.5">
          {READS.map(r => (
            <li key={r} className="flex items-start gap-2 text-sm text-ink-soft">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-fg" /> {r}
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-fg">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          {allowWrite
            ? 'It can add the records below, and cannot change or delete anything. It sees only what you can see, on jobs your company runs.'
            : 'It cannot change anything in SyteNav. It sees only what you can see, on jobs your company runs.'}
          {' '}You can disconnect it any time on Settings → Integrations.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-line bg-panel p-4">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
          checked={allowWrite}
          onChange={e => setAllowWrite(e.target.checked)}
          disabled={sending}
        />
        <span className="text-sm">
          <span className="font-medium text-ink">Also let it add records (optional)</span>
          <span className="mt-1 block text-muted-fg">
            Tasks, bills from subs, inspection requests, change orders and Directory contacts - only
            after it shows you what it will enter. A bill waits for your approval before anything goes
            to QuickBooks. It cannot record payments, edit or delete.
          </span>
        </span>
      </label>

      <div className="row-even lg:flex lg:flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={sending} onClick={() => decide(false)}>Cancel</Button>
        <Button type="button" disabled={sending} onClick={() => decide(true)}>
          {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting</> : 'Allow'}
        </Button>
      </div>

      <p className="text-center text-xs text-muted-fg">
        Signed in as {phase.email ?? 'your SyteNav account'}.{' '}
        <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={switchAccount}>
          Not you?
        </button>
      </p>
    </div>
  )
}
