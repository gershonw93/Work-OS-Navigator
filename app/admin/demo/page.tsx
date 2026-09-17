'use client'

import { useEffect, useState } from 'react'
import { Loader2, Send, Bell, Mail, Smartphone } from 'lucide-react'
import { adminGet } from '@/lib/admin-fetch'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { NOTIFICATION_TYPES } from '@/lib/notifications'
import { demoNotification } from '@/lib/demo-notification'
import { todayDateInput } from '@/lib/dates'

// The demo control board. Pick a person, pick a notification, press send.
//
// THE ASK: "im gonna be doin live demos and wanna show it... it doesnt need to
// be tied to any real data just a control board." So nothing here creates a
// task or an invoice - it sends the NOTIFICATION, with copy dated from today,
// through the same `notify()` every real event uses.
//
// IT SAYS WHAT IT IS, at the top, in red. The copy is deliberately convincing;
// the screen that fires it must not be.

interface AdminUser {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  companies?: { name?: string | null } | null
}

interface SendResult {
  sent: { title: string; message: string; link: string }
  recipient: { name: string | null; email: string | null }
  result: { inApp: number; emailed: number; pushed: number }
  emailNote: string | null
}

export default function DemoConsolePage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [recipientId, setRecipientId] = useState('')
  const [type, setType] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<SendResult | null>(null)

  useEffect(() => {
    adminGet<{ users: AdminUser[] }>('/api/admin/users').then(({ data, error }) => {
      setUsers(data?.users ?? [])
      setLoadError(error)
      setLoading(false)
    })
  }, [])

  // The picker IS the catalog, filtered to what can actually be sent. A demo
  // board with its own list of notifications would drift from the product the
  // first time somebody added one.
  const sendable = NOTIFICATION_TYPES.filter(t => t.status === 'live')

  const selected = users.find(u => u.id === recipientId) ?? null

  // Live preview, computed with the same function the route uses - so what is
  // on the screen before you press send is what lands.
  const preview = type ? demoNotification(type, todayDateInput()) : null

  async function send(e: React.FormEvent) {
    e.preventDefault()
    // A DISABLED BUTTON EXPLAINS NOTHING: it fires and answers with the
    // missing field.
    if (!recipientId) { setProblem('Pick who it goes to.'); return }
    if (!type) { setProblem('Pick a notification.'); return }

    setProblem(null); setResult(null); setSending(true)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/demo-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ recipient_id: recipientId, type }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setProblem(d?.error ?? `That did not send (${res.status}).`); return }
      setResult(d as SendResult)
    } catch (err: any) {
      setProblem(err?.message ?? 'Could not reach the server.')
    } finally {
      // try/catch/finally, always - a throw used to leave a spinner for ever.
      setSending(false)
    }
  }

  const field = 'w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none'

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-semibold text-ink-soft">Demo notifications</h2>
      <p className="mb-4 text-sm text-muted-fg">
        Send any notification to any user, with sample copy dated from today. For live demos.
      </p>

      {/* THE SCREEN SAYS WHAT IT IS. The copy it sends is meant to be
          convincing; the console firing it must not be, or somebody will one
          day use it thinking it reflects a real job. */}
      <div className="mb-5 rounded-xl border border-danger/40 bg-danger-tint px-4 py-3">
        <p className="text-sm font-medium text-danger">This sends a real email and a real bell to a real person.</p>
        <p className="mt-0.5 text-xs text-danger">
          The wording is made up and attached to no record. Every send is logged with your name against it.
        </p>
      </div>

      {!loading && loadError && (
        <div className="mb-4 rounded-xl border border-danger/40 bg-danger-tint px-4 py-3">
          <p className="text-sm font-medium text-danger">Could not load the user list.</p>
          <p className="mt-0.5 text-xs text-danger">{loadError}</p>
        </div>
      )}

      <form onSubmit={send} className="rounded-xl border border-line bg-panel p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="demo-user">Send to <span className="text-danger">*</span></Label>
            {/* Starts EMPTY. A useState default on a required select is a claim,
                and here the claim would be "this person, and press send". */}
            <select id="demo-user" className={field} value={recipientId}
              onChange={e => setRecipientId(e.target.value)}>
              <option value="">{loading ? 'Loading people...' : '-- Select --'}</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email || 'Unnamed'}
                  {/* THE ADDRESS IS IN THE OPTION. Two people called Admin User
                      are one company apart and indistinguishable by name, and
                      the thing you actually need on a stage is which inbox to
                      open. */}
                  {u.email ? ` - ${u.email}` : ' - no email'}
                  {u.role ? ` (${u.role})` : ''}
                </option>
              ))}
            </select>

            {/* And again once chosen, because an option list closes. */}
            {selected && (
              selected.email
                ? <p className="text-xs text-muted-fg">
                    Email goes to <span className="font-medium text-ink">{selected.email}</span>
                    {selected.companies?.name ? ` - ${selected.companies.name}` : ''}
                  </p>
                : <p className="text-xs text-warn">
                    No email address on this profile, so only the bell will fire.
                  </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="demo-type">Notification <span className="text-danger">*</span></Label>
            <select id="demo-type" className={field} value={type} onChange={e => setType(e.target.value)}>
              <option value="">-- Select --</option>
              {sendable.map(t => (
                <option key={t.key} value={t.key}>{t.group} - {t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* What will land, before it lands. Same function the route calls. */}
        {preview && (
          <div className="mt-4 rounded-lg border border-line bg-surface p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">They will see</p>
            <p className="text-sm font-semibold text-ink">{preview.title}</p>
            <p className="mt-1 text-sm text-ink-soft">{preview.message}</p>
            <p className="mt-2 text-xs text-faint">Opens {preview.link}</p>
          </div>
        )}

        {problem && <p role="alert" className="mt-4 text-sm text-danger">{problem}</p>}

        <div className="mt-5">
          <Button type="submit" disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending...' : 'Send it'}
          </Button>
        </div>
      </form>

      {/* WHAT ACTUALLY WENT OUT, not what was asked for. `notify()` honours
          each person's settings, so the bell can fire with no email - correct,
          and a mystery on a stage unless the screen says so. */}
      {result && (
        <div className="mt-5 rounded-xl border border-success/30 bg-success-tint p-5">
          <p className="text-sm font-semibold text-success">
            Sent to {result.recipient.name || result.recipient.email || 'them'}
          </p>
          {result.recipient.email && (
            <p className="mt-0.5 text-sm text-ink-soft">{result.recipient.email}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink-soft">
            <span className="inline-flex items-center gap-1.5">
              <Bell className="h-4 w-4" /> Bell: {result.result.inApp}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-4 w-4" /> Email: {result.result.emailed}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-4 w-4" /> Push: {result.result.pushed}
            </span>
          </div>
          {result.emailNote && (
            <p className="mt-3 text-sm text-warn">{result.emailNote}</p>
          )}
        </div>
      )}
    </div>
  )
}
