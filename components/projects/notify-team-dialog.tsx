'use client'

import { useEffect, useState, useCallback } from 'react'
import { Megaphone, Loader2, X, Paperclip, Search, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { Input } from '@/components/ui/input'
import { scopeNoticeProblem, scopeNoticeTitle, MAX_NOTICE_FILES } from '@/lib/scope-notice'
import type { NoticeAttachment } from '@/lib/scope-notice'

// ─────────────────────────────────────────────────────────────────────────────
// "NOTIFY TEAM" - one tap from the plan that changed.
//
// "Attach it to the plans/scope change itself - one tap, selected people get
// the push. No new messaging system." So: no thread, no inbox, no reply. Say
// what moved, tick who it lands on, send. It rides `notify()`, which is what
// makes it reach the bell, the inbox and the phone without being a second
// messaging product.
//
// A DOCUMENT CAN GO WITH IT: "an option there to select a file as well". The
// sentence is usually "here is the revised sheet", and a notice that describes
// a drawing without carrying it sends the reader hunting for it. It is a LINK
// rather than an attachment - a revised sheet is tens of megabytes and a mail
// server will refuse it - and the picker is COLLAPSED, because most notices
// carry nothing and two panels on the main path taxes everybody who does not
// need the second one.
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

  // The job's paperwork, fetched only when the picker is opened - most notices
  // carry nothing, and this is a second round trip on a dialog that is
  // frequently opened and closed without sending.
  const [showFiles, setShowFiles] = useState(false)
  const [docs, setDocs] = useState<{ id: string; name: string; file_url: string; source?: string | null }[]>([])
  const [docState, setDocState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [pickedFiles, setPickedFiles] = useState<NoticeAttachment[]>([])
  const [fileQ, setFileQ] = useState('')

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

  useEffect(() => {
    if (!showFiles || docState !== 'idle') return
    setDocState('loading')
    ;(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/documents`, {
          headers: { Authorization: `Bearer ${await token()}` },
        })
        if (!res.ok) { setDocState('failed'); return }
        setDocs((await res.json()).documents ?? [])
        setDocState('ready')
      } catch { setDocState('failed') }
    })()
  }, [showFiles, docState, projectId])

  // AN ADDRESS IS ENOUGH. Reported as "this should go to anyone via email -
  // subs too": the first version only offered people with a SyteNav account,
  // which excludes exactly the electrician the feature exists to warn.
  const reachable = people.filter(canBeTold)
  const allPicked = reachable.length > 0 && reachable.every(p => picked.has(p.key))
  const recipientIds = Array.from(picked)
  // The SAME function the route asks. The answer is on the screen as you type,
  // rather than arriving as a message about a whole request that did not happen.
  const problem = scopeNoticeProblem({ message, recipientIds })

  const shownDocs = docs.filter(d => {
    const q = fileQ.trim().toLowerCase()
    if (!q) return true
    return d.name.toLowerCase().includes(q) || (d.source ?? '').toLowerCase().includes(q)
  })

  function toggleFile(d: { name: string; file_url: string }) {
    setPickedFiles(prev => {
      const has = prev.some(f => f.url === d.file_url)
      if (has) return prev.filter(f => f.url !== d.file_url)
      // Capped, so one notice cannot become a document dump. The ROUTE caps it
      // too - this one is only so the count on screen is the truth.
      if (prev.length >= MAX_NOTICE_FILES) return prev
      return [...prev, { name: d.name, url: d.file_url }]
    })
  }

  async function send() {
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/scope-notice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          message, recipient_keys: recipientIds, plan_id: planId, plan_name: planName,
          files: pickedFiles,
        }),
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

          {/* SEND THE SHEET WITH IT.
              COLLAPSED, and the tap says what is inside so nobody opens it to
              find out - most notices carry nothing, and a second picker on the
              main path is a tax on everybody who does not need it. */}
          <div className="rounded-lg border border-line">
            <button type="button" onClick={() => setShowFiles(v => !v)}
              className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink-soft hover:bg-surface">
              <Paperclip className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate">
                Attach a document {pickedFiles.length > 0
                  ? <span className="font-semibold text-accent-fg">({pickedFiles.length} picked)</span>
                  : <span className="font-normal text-faint">(optional)</span>}
              </span>
              <span className="shrink-0 text-xs text-faint">{showFiles ? 'Hide' : 'Show'}</span>
            </button>

            {showFiles && (
              <div className="space-y-2 border-t border-line-soft p-3">
                <p className="text-xs text-muted-fg">
                  They get a link to it in the email - no account needed. Pick the revised sheet so nobody
                  has to go looking for what changed.
                </p>

                {docs.length > 4 && (
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
                    <Input className="h-9 pl-8 text-xs" placeholder="Find a document…"
                      value={fileQ} onChange={e => setFileQ(e.target.value)} />
                  </div>
                )}

                {/* Loading, failed and empty stay three different facts. */}
                {docState === 'loading' ? (
                  <p className="py-3 text-center text-sm text-faint">Loading the job&apos;s documents…</p>
                ) : docState === 'failed' ? (
                  <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted-fg">
                    Could not load this job&apos;s documents. You can still send the notice without one.
                  </p>
                ) : docs.length === 0 ? (
                  <p className="rounded-lg border border-line bg-surface p-3 text-sm text-muted-fg">
                    Nothing on this job to attach yet - upload the drawing on the Plans tab first.
                  </p>
                ) : (
                  <div className="max-h-44 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                    {shownDocs.map(d => {
                      const on = pickedFiles.some(f => f.url === d.file_url)
                      const full = !on && pickedFiles.length >= MAX_NOTICE_FILES
                      return (
                        <label key={d.id}
                          className={full
                            ? 'flex items-center gap-2.5 px-3 py-2 opacity-50'
                            : 'flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-surface'}>
                          <input type="checkbox" className="accent-[#C9F24A] shrink-0"
                            disabled={full} checked={on} onChange={() => toggleFile(d)} />
                          <FileText className="h-4 w-4 shrink-0 text-faint" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{d.name}</span>
                          <span className="shrink-0 text-[10px] text-faint">{d.source}</span>
                        </label>
                      )
                    })}
                    {shownDocs.length === 0 && (
                      <p className="px-3 py-4 text-center text-sm text-faint">Nothing matches that.</p>
                    )}
                  </div>
                )}

                {pickedFiles.length >= MAX_NOTICE_FILES && (
                  <p className="text-xs text-muted-fg">
                    That is the most that can go on one notice. Untick one to swap it.
                  </p>
                )}
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
            {sending ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</> : <><Megaphone className="h-4 w-4" /> Send scope update</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
