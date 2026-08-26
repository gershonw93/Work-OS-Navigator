'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminGet } from '@/lib/admin-fetch'
import { clientAppOrigin } from '@/lib/app-url'
import { Check, X, Copy, Mail, RotateCcw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/lib/time-ago'

interface AccessRequest {
  id: string; name: string; email: string; company_name: string | null
  company_type: string | null; phone: string | null; message: string | null
  status: string; invite_token: string | null; created_at: string
  invite_sent_at: string | null
  account: { exists: boolean; last_sign_in_at: string | null }
}

/** What the server said about the email, per row, for this session only. */
type EmailOutcome = { sent: boolean; reason?: string; detail?: string }

const STATUS_CLS: Record<string, string> = {
  pending: 'bg-warn-tint text-warn',
  approved: 'bg-success-tint text-success',
  rejected: 'bg-danger-tint text-danger',
}

const GHOST_BTN =
  'inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted-fg hover:bg-surface'

export default function AccessRequestsPage() {
  const supabase = createClient()
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<Record<string, EmailOutcome>>({})

  async function load() {
    const d = await adminGet<{ requests: AccessRequest[] }>('/api/admin/access-requests')
    setRequests(d?.requests ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function act(id: string, action: 'approve' | 'reject' | 'reset' | 'resend') {
    setBusyId(id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/access-requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id, action }),
    })
    if (res.ok) {
      const { request, email } = await res.json()
      // PATCH returns the access_requests row only; `account` is assembled by
      // GET from auth.users. Merging wholesale dropped it, so every row read
      // "No account yet" the moment you touched it.
      setRequests(prev => prev.map(r => r.id === id ? { ...request, account: r.account } : r))
      // Only approve and resend attempt delivery; clear any stale note otherwise.
      setOutcomes(prev => ({ ...prev, [id]: email ?? undefined }))
    }
    setBusyId(null)
  }

  // The app origin, NOT window.location.origin. Signup lives on the app domain,
  // and an admin working on the marketing host was minting invite links to a
  // host that cannot complete a signup.
  const inviteLink = (r: AccessRequest) => `${clientAppOrigin()}/signup?invite=${r.invite_token}`

  function copyLink(r: AccessRequest) {
    navigator.clipboard?.writeText(inviteLink(r))
    setCopiedId(r.id); setTimeout(() => setCopiedId(null), 1500)
  }
  function mailto(r: AccessRequest) {
    const subject = "You're in - your SyteNav invite"
    const body = `Hi ${r.name.split(' ')[0]},\n\nYour SyteNav access request is approved. Create your account with this personal invite link:\n${inviteLink(r)}\n\nWelcome aboard!`
    return `mailto:${r.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }

  /**
   * Did this person ever actually get in, and when were they last here?
   *
   * The three states are genuinely different and were previously
   * indistinguishable: no account at all (approved, never signed up - the
   * ones who fall through the crack), an account that has never been signed
   * in to, and an account in real use.
   */
  function AccountNote({ r }: { r: AccessRequest }) {
    const a = r.account
    if (!a?.exists) {
      return <span className="rounded-full bg-warn-tint px-2 py-0.5 text-xs font-medium text-warn">No account yet</span>
    }
    if (!a.last_sign_in_at) {
      return <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-fg">Signed up, never logged in</span>
    }
    return (
      <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-fg" title={new Date(a.last_sign_in_at).toLocaleString()}>
        Last login {timeAgo(a.last_sign_in_at)}
      </span>
    )
  }

  /**
   * Say what actually happened to the email.
   *
   * An approved row with nothing sent is a normal state, not a fault - it is
   * what every row looks like until the sending domain is authenticated. The
   * point is that it says so, rather than leaving you to assume the applicant
   * was told.
   */
  function DeliveryNote({ r }: { r: AccessRequest }) {
    const o = outcomes[r.id]
    if (o && !o.sent) {
      return (
        <span className="text-xs text-warn" title={o.detail}>
          {o.reason === 'not_configured'
            ? 'Not emailed - sending is not set up yet. Copy the link instead.'
            : `Email failed to send${o.detail ? ` (${o.detail.slice(0, 80)})` : ''}. Copy the link instead.`}
        </span>
      )
    }
    if (r.invite_sent_at) {
      return (
        <span className="text-xs text-success">
          Invite emailed {new Date(r.invite_sent_at).toLocaleDateString()}
        </span>
      )
    }
    return <span className="text-xs text-faint">Not emailed yet</span>
  }

  const pending = requests.filter(r => r.status === 'pending')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-ink">Access Requests</h1>
        <p className="text-sm text-faint mt-0.5">
          {pending.length ? `${pending.length} waiting for review.` : 'No pending requests.'} Approving emails the invite automatically - the link is there to copy if it doesn&apos;t send.
        </p>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-faint">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="py-12 text-center text-sm text-faint">No requests yet - they&apos;ll appear here when someone fills the Request Access form.</p>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="rounded-xl border border-line bg-panel px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold text-ink">{r.name}</span>
                <span className="text-sm text-faint">{r.email}</span>
                {r.company_name && <span className="text-sm text-faint">· {r.company_name}</span>}
                <AccountNote r={r} />
                {r.company_type && <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-fg uppercase">{r.company_type === 'gc' ? 'GC' : 'Sub'}</span>}
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_CLS[r.status] ?? '')}>{r.status}</span>
                <span className="ml-auto text-xs text-faint">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {(r.message || r.phone) && (
                <p className="mt-1 text-sm text-muted-fg">{r.message}{r.phone ? ` · ${r.phone}` : ''}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.status === 'pending' && (
                  <>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'approve')} className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-60">
                      <Check className="h-3.5 w-3.5" /> {busyId === r.id ? 'Approving…' : 'Approve & email'}
                    </button>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'reject')} className={cn(GHOST_BTN, 'hover:text-danger hover:border-danger/50 disabled:opacity-60')}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </>
                )}
                {r.status === 'approved' && r.invite_token && (
                  <>
                    <button onClick={() => copyLink(r)} className={GHOST_BTN}>
                      <Copy className="h-3.5 w-3.5" /> {copiedId === r.id ? 'Copied!' : 'Copy invite link'}
                    </button>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'resend')} className={cn(GHOST_BTN, 'disabled:opacity-60')}>
                      <Send className="h-3.5 w-3.5" /> {busyId === r.id ? 'Sending…' : 'Resend invite'}
                    </button>
                    <a href={mailto(r)} className={GHOST_BTN} title="Compose it yourself in your own mail client">
                      <Mail className="h-3.5 w-3.5" /> Send by hand
                    </a>
                    <button disabled={busyId === r.id} onClick={() => act(r.id, 'reset')} className="inline-flex items-center gap-1 text-xs text-faint hover:text-danger disabled:opacity-60" title="Revoke the invite link">
                      <RotateCcw className="h-3 w-3" /> Revoke
                    </button>
                    <span className="ml-auto"><DeliveryNote r={r} /></span>
                  </>
                )}
                {r.status === 'rejected' && (
                  <button disabled={busyId === r.id} onClick={() => act(r.id, 'reset')} className="inline-flex items-center gap-1 text-xs text-faint hover:text-ink disabled:opacity-60">
                    <RotateCcw className="h-3 w-3" /> Move back to pending
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
