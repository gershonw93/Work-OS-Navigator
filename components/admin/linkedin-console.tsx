'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Linkedin, Check, Loader2, Send, CalendarClock, Trash2, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

const POST_MAX_CHARS = 3000

interface Connection {
  org_urn: string | null
  org_name: string | null
  status: string
  connected_at: string
  access_expires_at: string | null
  auto_refresh: boolean
}
interface Status {
  configured: boolean
  connection: Connection | null
}
interface Post {
  id: string
  body: string
  status: string       // draft | scheduled | posted | failed
  scheduled_at: string | null
  posted_at: string | null
  linkedin_post_urn: string | null
  error: string | null
  created_at: string
}
interface OrgOption { urn: string; name: string }

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await createClient().auth.getSession()
  const token = data?.session?.access_token
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' }
}

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-info-tint text-info',
  scheduled: 'bg-warn-tint text-warn',
  posted: 'bg-success-tint text-success',
  failed: 'bg-danger-tint text-danger',
}

export function LinkedInConsole() {
  const [status, setStatus] = useState<Status | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [orgs, setOrgs] = useState<OrgOption[] | null>(null)
  const [orgInput, setOrgInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string>('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [body, setBody] = useState('')
  const [when, setWhen] = useState('')

  const load = useCallback(async () => {
    const headers = await authHeaders()
    const [sRes, pRes] = await Promise.all([
      fetch('/api/admin/linkedin/status', { headers }),
      fetch('/api/admin/linkedin/posts', { headers }),
    ])
    if (sRes.ok) {
      const s: Status = await sRes.json()
      setStatus(s)
      // Page still unpicked: pull the list of pages the member admins.
      if (s.connection?.status === 'needs_org') {
        try {
          const oRes = await fetch('/api/admin/linkedin/organization', { headers })
          if (oRes.ok) setOrgs((await oRes.json()).organizations ?? [])
          else setOrgs([])
        } catch { setOrgs([]) }
      }
    }
    if (pRes.ok) setPosts((await pRes.json()).posts ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Surface the OAuth callback result (redirect adds ?li=...).
    const p = new URLSearchParams(window.location.search)
    const li = p.get('li')
    if (li === 'connected') setMsg({ ok: true, text: 'LinkedIn connected.' })
    else if (li === 'needs_org') setMsg({ ok: true, text: 'LinkedIn connected - now choose which page to post as.' })
    else if (li === 'denied') setMsg({ ok: false, text: 'Connection cancelled.' })
    else if (li === 'error') setMsg({ ok: false, text: 'Could not complete the LinkedIn connection.' })
    if (li) {
      const url = new URL(window.location.href); url.searchParams.delete('li')
      window.history.replaceState({}, '', url.toString())
    }
  }, [load])

  async function connect() {
    setBusy('connect'); setMsg(null)
    try {
      const res = await fetch('/api/admin/linkedin/connect', { headers: await authHeaders() })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start the connection')
      window.location.href = data.url
    } catch (e: any) { setMsg({ ok: false, text: e.message }); setBusy('') }
  }

  async function disconnect() {
    if (!confirm('Disconnect LinkedIn? Scheduled posts will fail until you reconnect. Nothing already posted is affected.')) return
    setBusy('disconnect'); setMsg(null)
    try {
      const res = await fetch('/api/admin/linkedin/disconnect', { method: 'POST', headers: await authHeaders() })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(); setMsg({ ok: true, text: 'Disconnected.' })
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  async function pickOrg(value: string) {
    setBusy('org'); setMsg(null)
    try {
      const res = await fetch('/api/admin/linkedin/organization', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ organization: value }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not set the page')
      setMsg({ ok: true, text: `Posting as ${data.org_name || 'your page'}.` })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  async function submit(action: 'now' | 'schedule' | 'draft') {
    setBusy(action); setMsg(null)
    try {
      const res = await fetch('/api/admin/linkedin/posts', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ body, action, scheduled_at: action === 'schedule' ? new Date(when).toISOString() : undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setBody(''); setWhen('')
      setMsg({ ok: true, text: action === 'now' ? 'Posted to LinkedIn.' : action === 'schedule' ? 'Scheduled.' : 'Draft saved.' })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  async function postAction(id: string, action: 'now' | 'unschedule') {
    setBusy(id); setMsg(null)
    try {
      const res = await fetch(`/api/admin/linkedin/posts/${id}`, {
        method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (action === 'now') setMsg({ ok: true, text: 'Posted to LinkedIn.' })
      await load()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy('') }
  }

  async function remove(id: string) {
    if (!confirm('Remove this post from the queue? (Anything already on LinkedIn stays there.)')) return
    setBusy(id)
    try {
      await fetch(`/api/admin/linkedin/posts/${id}`, { method: 'DELETE', headers: await authHeaders() })
      await load()
    } finally { setBusy('') }
  }

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-fg" /></div>

  const conn = status?.connection
  const connected = conn?.status === 'connected'
  const needsOrg = conn?.status === 'needs_org'
  const expired = conn?.status === 'expired'
  const queue = posts.filter(p => p.status === 'draft' || p.status === 'scheduled' || p.status === 'failed')
  const history = posts.filter(p => p.status === 'posted').slice(0, 10)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-ink-soft">LinkedIn Page</h2>
        <p className="mt-1 text-sm text-muted-fg">One business page for the whole app. Only you (platform owner) can connect it or post - customers never see this.</p>
      </div>

      <div className="rounded-xl border border-line bg-panel p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-tint text-accent-fg">
            <Linkedin className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-ink">Connection</h3>
              {connected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2 py-0.5 text-xs font-semibold text-success">
                  <Check className="h-3 w-3" /> Connected
                </span>
              )}
              {expired && (
                <span className="rounded-full bg-warn-tint px-2 py-0.5 text-xs font-semibold text-warn">Expired - reconnect</span>
              )}
            </div>

            {!status?.configured && (
              <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn-tint p-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>LinkedIn is not set up on the server yet. Add a LinkedIn Developer app&apos;s Client ID/Secret (LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET) in Vercel. See docs/linkedin-setup.md for the full walkthrough.</span>
              </div>
            )}

            {connected && (
              <p className="mt-2 text-sm text-muted-fg">
                Posting as <strong className="text-ink">{conn?.org_name || conn?.org_urn}</strong>
                {conn?.access_expires_at && !conn.auto_refresh && (
                  <span> · reconnect before {new Date(conn.access_expires_at).toLocaleDateString()} to keep the token fresh</span>
                )}
              </p>
            )}
          </div>
        </div>

        {msg && (
          <div className={cn('mt-4 rounded-lg px-3 py-2 text-sm', msg.ok ? 'bg-success-tint text-success' : 'bg-danger-tint text-danger')}>
            {msg.text}
          </div>
        )}

        <div className="mt-5 space-y-4">
          {(!conn || expired) && (
            <button
              onClick={connect}
              disabled={!status?.configured || busy === 'connect'}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {busy === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Linkedin className="h-4 w-4" />}
              {expired ? 'Reconnect LinkedIn' : 'Connect LinkedIn'}
            </button>
          )}

          {needsOrg && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Which page should SyteNav post as?</p>
              {orgs && orgs.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {orgs.map(o => (
                    <button key={o.urn} onClick={() => pickOrg(o.urn)} disabled={busy === 'org'}
                      className="rounded-lg border border-line bg-panel px-3 py-1.5 text-sm font-semibold text-ink hover:border-accent disabled:opacity-50">
                      {o.name}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-fg">
                    We couldn&apos;t list your pages automatically. Paste your page&apos;s admin URL (linkedin.com/company/<strong>12345678</strong>/admin) or just the number.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input value={orgInput} onChange={e => setOrgInput(e.target.value)} placeholder="Page ID or admin URL"
                      className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted-fg" />
                    <button onClick={() => pickOrg(orgInput)} disabled={!orgInput.trim() || busy === 'org'}
                      className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                      {busy === 'org' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {connected && (
            <div className="rounded-lg border border-line bg-surface p-4">
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={4}
                maxLength={POST_MAX_CHARS}
                placeholder="Share an update with your LinkedIn followers…"
                className="w-full resize-y rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted-fg"
              />
              <div className="mt-1 text-right text-xs text-muted-fg">{body.length}/{POST_MAX_CHARS}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button onClick={() => submit('now')} disabled={!body.trim() || !!busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
                  {busy === 'now' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Post now
                </button>
                <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
                  className="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink" />
                <button onClick={() => submit('schedule')} disabled={!body.trim() || !when || !!busy}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  {busy === 'schedule' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                  Schedule
                </button>
                <button onClick={() => submit('draft')} disabled={!body.trim() || !!busy}
                  className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50">
                  Save draft
                </button>
              </div>
            </div>
          )}

          {conn && (
            <button onClick={disconnect} disabled={!!busy}
              className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-danger disabled:opacity-50">
              Disconnect
            </button>
          )}
        </div>

        <p className="mt-4 text-xs text-muted-fg">
          Scheduled posts go out with the next publish run after their time (see docs/linkedin-setup.md for timing). Text posts only for now - images are on the roadmap.
        </p>
      </div>

      {(queue.length > 0 || history.length > 0) && (
        <div className="rounded-xl border border-line bg-panel p-6">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Clock className="h-4 w-4" /> Queue &amp; recent posts
          </h4>
          <div className="space-y-2">
            {[...queue, ...history].map(p => (
              <div key={p.id} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-ink">{p.body}</p>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize', STATUS_STYLE[p.status] ?? 'bg-info-tint text-info')}>
                    {p.status}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-fg">
                    {p.status === 'scheduled' && p.scheduled_at && <>Scheduled for {new Date(p.scheduled_at).toLocaleString()}</>}
                    {p.status === 'posted' && p.posted_at && <>Posted {new Date(p.posted_at).toLocaleString()}</>}
                    {p.status === 'failed' && <span className="text-danger">{p.error}</span>}
                    {p.status === 'draft' && <>Draft · {new Date(p.created_at).toLocaleDateString()}</>}
                  </span>
                  {p.status !== 'posted' && (
                    <span className="flex items-center gap-1">
                      <button onClick={() => postAction(p.id, 'now')} disabled={!!busy || !connected}
                        title="Post now"
                        className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50">
                        {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post now'}
                      </button>
                      {p.status === 'scheduled' && (
                        <button onClick={() => postAction(p.id, 'unschedule')} disabled={!!busy}
                          className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-semibold text-ink disabled:opacity-50">
                          Unschedule
                        </button>
                      )}
                      <button onClick={() => remove(p.id)} disabled={!!busy} title="Remove"
                        className="rounded-md border border-line bg-panel p-1 text-danger disabled:opacity-50">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
