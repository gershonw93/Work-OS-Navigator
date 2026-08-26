'use client'

import { useState } from 'react'
import { Share2, X, Copy, Check, Loader2, Send, RotateCcw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SharePortalButtonProps {
  projectId: string
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; to: string }
  | { kind: 'failed'; message: string }

/**
 * Give a client a read-only link to their job - by copying it, or by emailing
 * it from here.
 *
 * ONE THING THIS USED TO DO THAT IT MUST NOT. Opening the dialog POSTed to
 * /portal-token, which mints a NEW token and overwrites the old one. So simply
 * looking at the link invalidated the link the client was already using, and
 * the footnote underneath cheerfully said "this link never expires". It now
 * GETs the existing token and only mints one when there is none - and
 * regenerating is a deliberate, confirmed action, because that is the whole
 * point of having one.
 *
 * That fix is why Send can exist at all. Emailing somebody a link and then
 * breaking it the next time you opened this box would have been worse than not
 * having the button.
 */
export function SharePortalButton({ projectId }: SharePortalButtonProps) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  const [to, setTo] = useState('')
  const [note, setNote] = useState('')
  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  async function handleOpen() {
    setOpen(true)
    setSend({ kind: 'idle' })
    setConfirmRegen(false)
    if (portalUrl) return
    setLoading(true)
    try {
      const headers = await authHeader()
      // Read first. Minting on open is what used to break live links.
      const res = await fetch(`/api/projects/${projectId}/portal-token`, { headers })
      const data = res.ok ? await res.json() : null
      if (data?.clientEmail && !to) setTo(data.clientEmail)

      if (data?.url) {
        setPortalUrl(data.url)
      } else {
        // No link yet - this is the one case where creating one is right.
        const made = await fetch(`/api/projects/${projectId}/portal-token`, { method: 'POST', headers })
        if (made.ok) setPortalUrl((await made.json()).url)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/portal-token`, {
        method: 'POST',
        headers: await authHeader(),
      })
      if (res.ok) {
        setPortalUrl((await res.json()).url)
        setSend({ kind: 'idle' })
      }
    } finally {
      setRegenerating(false)
      setConfirmRegen(false)
    }
  }

  async function handleCopy() {
    if (!portalUrl) return
    await navigator.clipboard.writeText(portalUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    setSend({ kind: 'sending' })
    try {
      const res = await fetch(`/api/projects/${projectId}/portal-token/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ to, note: note.trim() || null }),
      })
      const d = await res.json().catch(() => ({}))
      // A refusal to send is reported, never thrown away - the link is the
      // whole point, and Copy is the fallback the message points at.
      if (!res.ok || d?.sent === false) {
        setSend({ kind: 'failed', message: d?.error ?? 'Could not send that email.' })
        return
      }
      setSend({ kind: 'sent', to: d.to ?? to })
    } catch {
      setSend({ kind: 'failed', message: 'Network error - copy the link and send it yourself.' })
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-medium text-muted-fg hover:border-accent hover:text-accent-fg transition-colors"
      >
        <Share2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Share with Client</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div
            className="max-h-[88vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-panel p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-accent-tint flex items-center justify-center">
                  <Share2 className="h-4 w-4 text-accent-fg" />
                </div>
                <h2 className="text-base font-semibold text-ink-soft">Share with Client</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-muted-fg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-fg">
              Anyone with this link can view a read-only snapshot of this project - no login required.
            </p>

            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-faint" />
              </div>
            ) : portalUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2.5">
                  <span className="flex-1 truncate text-sm text-muted-fg font-mono">{portalUrl}</span>
                </div>

                <button
                  onClick={handleCopy}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface transition-colors"
                >
                  {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy Link</>}
                </button>

                <div className="border-t border-line pt-4">
                  {send.kind === 'sent' ? (
                    <div className="rounded-lg bg-success-tint px-3 py-2.5 text-sm text-success">
                      <span className="font-semibold">Sent to {send.to}.</span>{' '}
                      Ask them to check spam if it does not turn up.
                      <button
                        onClick={() => setSend({ kind: 'idle' })}
                        className="ml-1 font-semibold underline"
                      >
                        Send to somebody else
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleSend} className="space-y-2.5">
                      <label htmlFor="portal-to" className="block text-sm font-medium text-ink-soft">
                        Or email it to them
                      </label>
                      <input
                        id="portal-to"
                        type="email"
                        required
                        value={to}
                        onChange={e => setTo(e.target.value)}
                        placeholder="client@example.com"
                        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                      />
                      <input
                        type="text"
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Add a line for them (optional)"
                        maxLength={500}
                        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                      />
                      {send.kind === 'failed' && (
                        <p className="text-sm text-danger">{send.message}</p>
                      )}
                      <button
                        type="submit"
                        disabled={send.kind === 'sending' || !to.trim()}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent/90 disabled:opacity-50"
                      >
                        {send.kind === 'sending'
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                          : <><Send className="h-4 w-4" /> Send link</>}
                      </button>
                    </form>
                  )}
                </div>

                <div className="border-t border-line pt-3 text-center">
                  {confirmRegen ? (
                    <div className="space-y-2">
                      <p className="text-xs text-warn">
                        This makes a new link and <strong>breaks the one you already gave them</strong>. Only do this if the old link got into the wrong hands.
                      </p>
                      <div className="flex justify-center gap-2">
                        <button onClick={() => setConfirmRegen(false)} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:bg-surface">
                          Keep the current link
                        </button>
                        <button onClick={handleRegenerate} disabled={regenerating}
                          className="rounded-lg bg-danger-solid px-3 py-1.5 text-xs font-semibold text-white hover:bg-danger-solid/90 disabled:opacity-50">
                          {regenerating ? 'Working…' : 'Break it and make a new one'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRegen(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-faint hover:text-danger transition-colors">
                      <RotateCcw className="h-3 w-3" /> Regenerate link
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-danger text-center py-4">Failed to generate link. Please try again.</p>
            )}

            <p className="text-xs text-faint text-center">
              This link does not expire. Regenerating it above is the only thing that stops it working.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
