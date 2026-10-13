'use client'

import { useState } from 'react'
import { X, Loader2, AlertTriangle, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { isEmailAddress } from '@/lib/contact-email'
import type { SectionDef } from '@/lib/report-builder'

// The two dialogs the Reports tab opens: Save and Share. At module scope, so
// a re-render of the page never remounts a half-typed name.

export function SaveDialog({
  initialName, existingName, onClose, onSave,
}: {
  initialName: string
  /** Set when a saved report is open: offers "save over it" as well as "save as new". */
  existingName: string | null
  onClose: () => void
  onSave: (name: string, asNew: boolean) => Promise<string | null>
}) {
  const [name, setName] = useState(initialName)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function go(asNew: boolean) {
    if (!name.trim()) { setErr('Give the report a name.'); return }
    setBusy(true); setErr('')
    try {
      const problem = await onSave(name.trim(), asNew)
      if (problem) setErr(problem)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Save report</h2>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-sm text-muted-fg">
            Saves the settings, not the numbers - opening it later runs it again with whatever is on the jobs then, so &quot;This month&quot; is always this month.
          </p>
          <div>
            <Label>Name <span className="text-danger">*</span></Label>
            <Input value={name} onChange={e => setName(e.target.value)} autoFocus={autoFocusOnDesktop()} placeholder="e.g. Monthly sub payments" />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {existingName && (
            <Button variant="secondary" onClick={() => go(true)} disabled={busy}>Save as new</Button>
          )}
          <Button onClick={() => go(!existingName)} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {existingName ? `Update "${existingName.length > 24 ? existingName.slice(0, 24) + '…' : existingName}"` : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export interface ShareRecipient { key: string; label: string; name: string; email: string | null; kind: 'customer' | 'sub' | 'supplier' }

export interface ShareResult { url: string; emailed: boolean; emailError: string | null; dropped: string[] }

export function ShareDialog({
  title, recipients, internal, onClose, onShare,
}: {
  title: string
  recipients: ShareRecipient[]
  /** Sections in this report that are internal - named so nobody sends margin to a sub by accident. */
  internal: SectionDef[]
  onClose: () => void
  onShare: (r: { recipientName: string; recipientEmail: string; message: string; sendEmail: boolean }) => Promise<ShareResult | string>
}) {
  const [pick, setPick] = useState('')
  const [recipientName, setRecipientName] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<ShareResult | null>(null)
  const [copied, setCopied] = useState(false)

  function choose(key: string) {
    setPick(key)
    const r = recipients.find(x => x.key === key)
    if (r) { setRecipientName(r.name); setRecipientEmail(r.email ?? '') }
  }

  async function go() {
    if (sendEmail && !recipientEmail.trim()) { setErr('Add an email address to send it to, or untick "Email it to them".'); return }
    if (recipientEmail.trim() && !isEmailAddress(recipientEmail.trim())) { setErr('That does not look like an email address.'); return }
    setBusy(true); setErr('')
    try {
      const out = await onShare({ recipientName: recipientName.trim(), recipientEmail: recipientEmail.trim(), message: message.trim(), sendEmail })
      if (typeof out === 'string') setErr(out)
      else setDone(out)
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!done) return
    try {
      await navigator.clipboard.writeText(done.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setErr('Could not copy - select the link and copy it by hand.')
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onClose()}>
      <div className="w-full max-w-lg overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="min-w-0 truncate text-lg font-bold text-ink">Share &quot;{title}&quot;</h2>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="space-y-3 px-5 py-4">
            <p className="text-sm text-ink">
              {done.emailed ? `Sent to ${recipientEmail}. ` : ''}Anyone with this link can open the report - no account needed.
            </p>
            {done.emailError && <p className="flex items-start gap-2 text-sm text-warn"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{done.emailError}</p>}
            {done.dropped.length > 0 && (
              <p className="text-sm text-muted-fg">Left out because you do not have access: {done.dropped.join(', ')}.</p>
            )}
            <div className="flex items-center gap-2">
              <Input readOnly value={done.url} onFocus={e => e.currentTarget.select()} />
              <Button variant="secondary" onClick={copy} aria-label="Copy link" title="Copy link">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-faint">
              The link shows the report as it reads right now. It does not update; share again for fresh numbers. You can turn it off any time under Shared links.
            </p>
            <div className="row-even lg:flex justify-end gap-2 pt-1">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-4">
              {internal.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-warn-tint px-3 py-2 text-sm text-warn">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>This report includes {internal.map(s => s.label.toLowerCase()).join(', ')} - internal figures. Untick {internal.length === 1 ? 'it' : 'them'} first if this is going to a developer or a sub.</span>
                </p>
              )}
              {recipients.length > 0 && (
                <div>
                  <Label>Who is it for? (optional)</Label>
                  <Select value={pick} onChange={e => choose(e.target.value)}>
                    <option value="">-- Pick a customer, sub or supplier --</option>
                    {(['customer', 'sub', 'supplier'] as const).map(k => {
                      const list = recipients.filter(r => r.kind === k)
                      if (!list.length) return null
                      return (
                        <optgroup key={k} label={k === 'customer' ? 'Customers and developers' : k === 'sub' ? 'Subcontractors' : 'Suppliers'}>
                          {list.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </optgroup>
                      )
                    })}
                  </Select>
                  <p className="mt-1 text-xs text-faint">Fills in the name and address below. You can still change them.</p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Their name (optional)</Label>
                  <Input value={recipientName} onChange={e => setRecipientName(e.target.value)} placeholder="e.g. Sam Rivera" />
                </div>
                <div>
                  <Label>Their email {sendEmail ? <span className="text-danger">*</span> : '(optional)'}</Label>
                  <Input type="email" inputMode="email" value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} placeholder="name@company.com" />
                </div>
              </div>
              <div>
                <Label>Message (optional)</Label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="e.g. Here is where the job stands this month."
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
                Email it to them
              </label>
              {!sendEmail && <p className="-mt-2 text-xs text-faint">You will get a link to copy and send yourself.</p>}
              {err && <p className="text-sm text-danger">{err}</p>}
            </div>
            <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
              <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={go} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {sendEmail ? 'Send report' : 'Make link'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
