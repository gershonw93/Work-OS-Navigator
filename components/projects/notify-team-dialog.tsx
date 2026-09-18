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

import type { NoticeRecipient } from '@/lib/scope-notice'
import { canBeTold } from '@/lib/scope-notice'

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

export function NotifyTeamDialog({
  projectId, planId, planName, onClose, onSent,
}: {
  projectId: string
  planId?: string | null
  planName?: string | null
  onClose: () => void
  /** Fired after a send lands, so a list showing the record can refresh. */
  onSent?: () => void
}) {
  const [people, setPeople] = useState<NoticeRecipient[]>([])
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

  // AN ADDRESS IS ENOUGH. Reported as "this should go to anyone via email -
  // subs too": the first version only offered people with a SyteNav account,
  // which excludes exactly the electrician the feature exists to warn.
  const reachable = people.filter(canBeTold)
  const allPicked = reachable.length > 0 && reachable.every(p => picked.has(p.key))
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
        body: JSON.stringify({ message, recipient_keys: recipientIds, plan_id: planId, plan_name: planName }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not send that.'); return }
      // WHAT ACTUALLY WENT OUT, not "sent". Somebody with email off for this
      // type got the bell only, and on a change that moves their work the
      // sender needs to know which it was.
      const bits: string[] = []
      if (body.inApp) bits.push(`${body.inApp} in the app`)
      if (body.emailed) bits.push(`${body.emailed} by email`)
      if (body.pushed) bits.push(`${body.pushed} to a phone`)
      // A failure is NAMED, not counted - "6 of 8" leaves somebody hunting for
      // the two, and on a scope change the two are the ones that matter.
      if (body.failed?.length) {
        notify(`Told ${body.sent - body.failed.length}: ${bits.join(', ')}. Could not reach: ${body.failed.join(', ')}.`)
      } else {
        notify(`Told ${body.sent}: ${bits.join(', ')}.`, { tone: 'success' })
      }
      onSent?.()
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
                  onClick={() => setPicked(allPicked ? new Set() : new Set(reachable.map(p => p.key)))}
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
                Nobody on this job has an email address yet. Add your crew on the Team tab, or a sub with a contract, and they can be told - no SyteNav account needed.
              </p>
            ) : (
              <div className="max-h-56 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                {people.map(p => {
                  const told = canBeTold(p)
                  return (
                    <label key={p.key}
                      className={told
                        ? 'flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface'
                        : 'flex items-center gap-3 px-3 py-2 opacity-60'}>
                      <input type="checkbox" className="accent-[#C9F24A] shrink-0"
                        // Only somebody with NEITHER an account NOR an address
                        // is out of reach, and they are listed saying so rather
                        // than dropped - the one you most wanted to warn is
                        // exactly the one you would not notice was missing.
                        disabled={!told}
                        checked={picked.has(p.key)}
                        onChange={e => setPicked(prev => {
                          const n = new Set(prev)
                          if (e.target.checked) n.add(p.key); else n.delete(p.key)
                          return n
                        })} />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm text-ink">{p.name}</span>
                          {/* WHERE THEY CAME FROM. A sub and a teammate are
                              different people to you, and the list mixes them. */}
                          {p.source === 'subcontractor' && (
                            <span className="shrink-0 whitespace-nowrap rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-fg">Sub</span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] text-faint">
                          {told
                            ? [p.role, p.email].filter(Boolean).join(' · ') || 'On this job'
                            : 'No email on file - add one so they can be told'}
                        </span>
                      </span>
                    </label>
                  )
                })}
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
