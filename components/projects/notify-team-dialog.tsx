'use client'

import { useEffect, useState, useCallback } from 'react'
import { Megaphone, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { scopeNoticeProblem, scopeNoticeTitle } from '@/lib/scope-notice'

// ─────────────────────────────────────────────────────────────────────────────
// "NOTIFY TEAM" - one tap from the plan that changed.
//
// "Attach it to the plans/scope change itself - one tap, selected people get
// the push. No new messaging system." So: no thread, no inbox, no reply. Say
// what moved, tick who it lands on, send. It rides `notify()`, which is what
// makes it reach the bell, the inbox and the phone without being a second
// messaging product.
// ─────────────────────────────────────────────────────────────────────────────

interface Recipient {
  member_id: string
  profile_id: string | null
  name: string
  role: string | null
  email: string | null
  reachable: boolean
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

export function NotifyTeamDialog({
  projectId, planId, planName, onClose,
}: {
  projectId: string
  planId?: string | null
  planName?: string | null
  onClose: () => void
}) {
  const [people, setPeople] = useState<Recipient[]>([])
  // Loading, failed and empty are three different facts, and "nobody is on this
  // job" is the one that must not be stated until it has been checked.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const notify = useNotice()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/scope-notice`, {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      if (!res.ok) { setState('failed'); return }
      setPeople((await res.json()).recipients ?? [])
      setState('ready')
    } catch { setState('failed') }
  }, [projectId])

  useEffect(() => { load() }, [load])

  const reachable = people.filter(p => p.reachable)
  const allPicked = reachable.length > 0 && reachable.every(p => picked.has(p.profile_id!))
  const recipientIds = Array.from(picked)
  // The SAME function the route asks. The answer is on the screen as you type,
  // rather than arriving as a message about a whole request that did not happen.
  const problem = scopeNoticeProblem({ message, recipientIds })

  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/scope-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ message, recipient_ids: recipientIds, plan_id: planId, plan_name: planName }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not send that.'); return }
      // WHAT ACTUALLY WENT OUT, not "sent". Somebody with email off for this
      // type got the bell only, and on a change that moves their work the
      // sender needs to know which it was.
      const bits = [`${body.inApp} in the app`]
      if (body.emailed) bits.push(`${body.emailed} by email`)
      if (body.pushed) bits.push(`${body.pushed} to a phone`)
      notify(`Told ${body.sent}: ${bits.join(', ')}.`, { tone: 'success' })
      onClose()
    } catch (e) {
      notify(fetchProblem(e, 'sending the notice'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="overlay" data-overlay onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-xl lg:rounded-xl"
        onClick={e => e.stopPropagation()}>
        {/* The close button is the one control that may never leave the title row. */}
        <div className="flex items-center gap-2 border-b border-line-soft px-4 py-3">
          <Megaphone className="h-4 w-4 shrink-0 text-accent" />
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">
            {scopeNoticeTitle(planName)}
          </h2>
          <button onClick={onClose} aria-label="Close" title="Close"
            className="shrink-0 rounded-lg p-1.5 text-muted-fg hover:bg-surface"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="scope-msg">What changed? <span className="text-danger">*</span></Label>
            <textarea
              id="scope-msg"
              rows={3}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Slab height dropped 1/2&quot; and the pour is floor-by-floor now - check your rough-in heights."
              className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>Who needs to know? <span className="text-danger">*</span></Label>
              {reachable.length > 0 && (
                <button type="button"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(reachable.map(p => p.profile_id!)))}
                  className="min-h-11 whitespace-nowrap px-2 text-xs font-semibold text-accent-fg hover:underline lg:min-h-0">
                  {allPicked ? 'Clear all' : `Select all ${reachable.length}`}
                </button>
              )}
            </div>

            {state === 'loading' ? (
              <p className="py-4 text-center text-sm text-faint">Loading the team…</p>
            ) : state === 'failed' ? (
              <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted-fg">
                Could not load who is on this job. Close this and try again.
              </p>
            ) : people.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted-fg">
                Nobody is on this job&apos;s team yet. Add them on the Team tab and they can be told.
              </p>
            ) : (
              <div className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                {people.map(p => (
                  <label key={p.member_id}
                    className={p.reachable
                      ? 'flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface'
                      : 'flex items-center gap-3 px-3 py-2 opacity-60'}>
                    <input type="checkbox" className="accent-[#C9F24A] shrink-0"
                      // A SUB WITH NO ACCOUNT CANNOT BE SENT A NOTIFICATION, and
                      // this says so rather than dropping them from the list -
                      // the one you most wanted to warn is exactly the one you
                      // would not notice was missing.
                      disabled={!p.reachable}
                      checked={!!p.profile_id && picked.has(p.profile_id)}
                      onChange={e => setPicked(prev => {
                        const n = new Set(prev)
                        if (!p.profile_id) return n
                        if (e.target.checked) n.add(p.profile_id); else n.delete(p.profile_id)
                        return n
                      })} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{p.name}</span>
                      <span className="block truncate text-[11px] text-faint">
                        {p.reachable ? (p.role || p.email || '') : 'No SyteNav account yet - invite them and they can be told'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* The reason is on screen BEFORE the press, not after a refused
              request. The button itself is only disabled while in flight. */}
          {problem && <p className="text-xs text-muted-fg">{problem}</p>}
        </div>

        <div className="row-even lg:flex lg:justify-end gap-2 border-t border-line-soft px-4 py-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (problem) { notify(problem); return } send() }} disabled={sending}>
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Megaphone className="h-4 w-4" /> Notify team</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
