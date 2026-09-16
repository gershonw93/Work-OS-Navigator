'use client'

import { useState } from 'react'
import { Send } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { invitePersonProblem } from '@/lib/invite-person'

// Invite somebody who never asked: first name, last name, email.
//
// ITS OWN FILE, not a function inside the page. A component declared inside a
// component is a new type on every render, so React throws the DOM away and
// rebuilds it - which here would mean the three boxes losing what is half typed
// in them any time the requests list below refreshed. The page already has two
// of those (`AccountNote`, `DeliveryNote`); adding a third, on the one part of
// the screen somebody actually types into, is the version that bites.
//
// The button is NOT disabled on an incomplete form. A greyed-out Send explains
// nothing: `invitePersonProblem` - the same function the route asks - answers
// with the field that is missing, and `disabled` is only ever "in flight".

export interface InviteResult {
  request: { id: string; name: string; email: string }
  email?: { sent: boolean; reason?: string; detail?: string }
}

export function InvitePersonForm({ onInvited }: { onInvited: (r: InviteResult) => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSent(null)

    // Asked at the FIELD, with the set the route uses. A server's answer can
    // only ever come back as a message about a whole request that did not
    // happen, and by then the typing is gone.
    const why = invitePersonProblem({ firstName, lastName, email })
    if (why) { setProblem(why); return }
    setProblem(null)

    setSending(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch('/api/admin/access-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ first_name: firstName, last_name: lastName, email }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) {
        // The route's own reason, which names the case - already invited,
        // already has an account, or which field is wrong.
        const reason = d?.error ?? `The invite could not be sent (${res.status}).`
        console.error('[admin/invite]', reason)
        setProblem(reason)
        return
      }
      setFirstName(''); setLastName(''); setEmail('')
      // Say what happened to the EMAIL, not just that a row was made. An
      // invite nobody received is the failure this whole screen exists to
      // make visible.
      setSent(d?.email?.sent
        ? `Invite emailed to ${d.request.email}.`
        : `${d.request.email} is invited, but the email did not send. Copy their link from the list below.`)
      onInvited(d as InviteResult)
    } catch (err: any) {
      const reason = err?.message ? `Could not reach SyteNav: ${err.message}` : 'Could not reach SyteNav.'
      console.error('[admin/invite]', reason)
      setProblem(reason)
    } finally {
      setSending(false)
    }
  }

  const field = 'w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none'

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-panel p-4">
      <h2 className="text-sm font-semibold text-ink">Invite someone</h2>
      <p className="mt-0.5 text-xs text-muted-fg">
        They get an email inviting them to SyteNav and a personal link that opens the real
        signup form. No second approval - the invite is the approval.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div>
          <label htmlFor="inv-first" className="mb-1 block text-xs font-medium text-muted-fg">First name *</label>
          <input id="inv-first" className={field} value={firstName} placeholder="Dana"
            onChange={e => setFirstName(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="inv-last" className="mb-1 block text-xs font-medium text-muted-fg">Last name *</label>
          <input id="inv-last" className={field} value={lastName} placeholder="Whitfield"
            onChange={e => setLastName(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="inv-email" className="mb-1 block text-xs font-medium text-muted-fg">Email *</label>
          <input id="inv-email" type="email" className={field} value={email} placeholder="dana@whitfieldbuild.com"
            onChange={e => setEmail(e.target.value)} autoComplete="off" />
        </div>
      </div>

      {problem && <p className="mt-2 text-xs text-danger">{problem}</p>}
      {sent && <p className="mt-2 text-xs text-success">{sent}</p>}

      <div className="mt-3">
        <button
          type="submit"
          disabled={sending}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
        >
          <Send className="h-3.5 w-3.5" /> {sending ? 'Sending…' : 'Send invite'}
        </button>
      </div>
    </form>
  )
}
