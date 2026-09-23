'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, RefreshCw, Loader2, Unplug, Link2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { fetchProblem } from '@/lib/fetch-error'
import { TRADES } from '@/lib/trades'
import { CONTACT_TYPES, hasEmail, stagedOrder } from '@/lib/google-contacts'
import { usePermissions } from '@/lib/use-permissions'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// THE STAGING AREA.
//
// "Connect Google Contacts. They land in a separate staging area, not
// auto-mixed into the directory. From there assign to a job and label - sub,
// supplier, delivery, electrician, whatever. Bulk actions: select 5, label all
// at once."
//
// A phone book is not a trade directory: it holds your dentist, your
// brother-in-law and four numbers for the same electrician. Nothing here
// reaches `companies` until somebody labels it and presses Import.
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  subcontractor: 'Sub', supplier: 'Supplier', delivery: 'Delivery',
  inspector: 'Inspector', other: 'Other',
}

interface Staged {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  organization: string | null
  job_title: string | null
  contact_type: string | null
  trade: string | null
  assigned_project_id: string | null
}

interface Status {
  configured: boolean
  connected: boolean
  status: string | null
  googleEmail: string | null
  lastSyncAt: string | null
  staged: number
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

export default function ImportedContactsPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [rows, setRows] = useState<Staged[]>([])
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])
  const { can, loading: permsLoading } = usePermissions()
  // Loading, failed and empty are three facts. "Nothing to review" is the happy
  // answer here, so it must not be the default.
  // 'denied' is its own fact: a 403 is not a failure to ask, and "reload the
  // page" would be advice that can never work.
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'denied'>('loading')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const notify = useNotice()
  const guardDelete = useDeleteGuard()

  const search = useSearchParams()
  // ONCE. A ref rather than state: without it the effect re-runs on every
  // render the notice triggers and the message stacks up - the same guard the
  // Directory uses for ?contact=.
  const saidRef = useRef(false)

  // WHAT THE TRIP TO GOOGLE ACTUALLY DID. The callback comes back with an
  // answer and this is what says it out loud; landing on a silent page is what
  // made a working connection look like nothing had happened.
  useEffect(() => {
    if (saidRef.current) return
    const outcome = search.get('google')
    if (!outcome) return
    saidRef.current = true
    if (outcome === 'connected') notify('Google Contacts connected. Press Read contacts to pull them in.', { tone: 'success' })
    else if (outcome === 'cancelled') notify('Google sign-in was cancelled - nothing was connected.')
    else if (outcome === 'failed') {
      // The reason is carried in the URL and printed, rather than being only in
      // a server log nobody reading this screen can see.
      const why = search.get('why')
      notify(`Google could not be connected${why ? ` (${why})` : ''}. Try again, or check the redirect URI in Google Cloud.`)
    }
  }, [search, notify])

  const load = useCallback(async () => {
    try {
      const t = await token()
      const h = { Authorization: `Bearer ${t}` }
      const [s, c, p] = await Promise.all([
        fetch('/api/google-contacts/status', { headers: h }),
        fetch('/api/google-contacts/staged', { headers: h }),
        fetch('/api/projects', { headers: h }),
      ])
      if (!s.ok) { setState(s.status === 403 ? 'denied' : 'failed'); return }
      setStatus(await s.json())
      setRows(c.ok ? stagedOrder((await c.json()).contacts ?? []) : [])
      setProjects(p.ok ? ((await p.json()).projects ?? []).map((x: any) => ({ id: x.id, name: x.name })) : [])
      setState('ready')
    } catch { setState('failed') }
  }, [])

  useEffect(() => { load() }, [load])

  const allPicked = rows.length > 0 && rows.every(r => picked.has(r.id))
  const ids = Array.from(picked)

  async function connect() {
    setBusy('connect')
    try {
      const res = await fetch('/api/google-contacts/connect', { headers: { Authorization: `Bearer ${await token()}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) { notify(body?.error ?? 'Could not start the connection.'); return }
      window.location.href = body.url
    } catch (e) { notify(fetchProblem(e, 'connecting Google')) } finally { setBusy(null) }
  }

  async function sync() {
    setBusy('sync')
    try {
      const res = await fetch('/api/google-contacts/sync', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not read your contacts.'); return }
      // SAY WHAT HAPPENED, including the boring case. "Read 412, 0 new" is an
      // answer; a silent refresh reads as a button that does nothing.
      notify(
        body.staged === 0
          ? `Read ${body.found} contacts - nothing new to review.`
          : `${body.staged} new to review, out of ${body.found} read.`,
        { tone: 'success' },
      )
      load()
    } catch (e) { notify(fetchProblem(e, 'reading your contacts')) } finally { setBusy(null) }
  }

  async function disconnect() {
    guardDelete(async () => {
      setBusy('disconnect')
      try {
        const res = await fetch('/api/google-contacts/disconnect', { method: 'POST', headers: { Authorization: `Bearer ${await token()}` } })
        if (!res.ok) { notify((await res.json().catch(() => ({})))?.error ?? 'Could not disconnect.'); return }
        notify('Google Contacts disconnected.', { tone: 'success' })
        load()
      } catch (e) { notify(fetchProblem(e, 'disconnecting')) } finally { setBusy(null) }
    }, {
      title: 'Disconnect Google Contacts?',
      body: 'We stop reading your address book. Anything already in the list below stays, with whatever labels you gave it.',
      confirmLabel: 'Disconnect',
    })
  }

  /**
   * Bulk label / assign / dismiss. Only what is SENT gets written.
   *
   * THE SELECTION SURVIVES A LABEL, AND THAT IS THE WHOLE POINT.
   *
   * Reported as "when i select a contact then choose the label and trade it
   * unchecks the contact": this cleared `picked` after every update, so
   * labelling five people as subs dropped the selection and setting their trade
   * meant ticking all five again. The three pickers are meant to be used one
   * after another ON THE SAME PEOPLE - label, trade, job - and clearing between
   * them turns one job into three.
   *
   * It is only cleared when the rows LEAVE the list, because a selection
   * pointing at rows that are no longer on screen is worse than none:
   * dismissing and importing do that, labelling does not.
   */
  async function patch(payload: Record<string, unknown>, said: string, keepSelection = true) {
    if (!ids.length) { notify('Pick at least one contact.'); return }
    setBusy('patch')
    try {
      const res = await fetch('/api/google-contacts/staged', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ ids, ...payload }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not update those.'); return }
      notify(`${body.updated} ${said}${keepSelection ? ' - still selected' : ''}.`, { tone: 'success' })
      if (!keepSelection) setPicked(new Set())
      load()
    } catch (e) { notify(fetchProblem(e, 'updating those contacts')) } finally { setBusy(null) }
  }

  async function importPicked() {
    if (!ids.length) { notify('Pick at least one contact.'); return }
    setBusy('import')
    try {
      const res = await fetch('/api/google-contacts/staged/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ ids }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { notify(body?.error ?? 'Could not import those.'); return }
      // A batch that partly failed says which part - "38 of 40" on its own
      // leaves somebody hunting for the two.
      notify(
        body.failed
          ? `${body.imported} added to your Directory, ${body.failed} could not be: ${body.problems?.[0]?.error ?? ''}`
          : `${body.imported} added to your Directory.`,
        { tone: body.failed ? 'error' : 'success' },
      )
      setPicked(new Set())
      load()
    } catch (e) { notify(fetchProblem(e, 'importing those contacts')) } finally { setBusy(null) }
  }

  return (
    <div className="p-6 space-y-4">
      <Link href="/directory" className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Directory
      </Link>

      <div>
        <h1 className="text-xl font-bold text-ink">Imported contacts</h1>
        <p className="mt-0.5 text-sm text-muted-fg">
          Contacts from your Google account wait here until you label them. This list is private to you -
          nobody else at your company can see it. A contact is shared only once you add it to the Directory.
        </p>
      </div>

      {/* ── the connection ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-line bg-panel p-4 lg:rounded-xl">
        {state === 'loading' ? (
          <p className="text-sm text-faint">Checking the connection…</p>
        ) : state === 'failed' ? (
          <p className="text-sm text-muted-fg">Could not check the Google connection. Reload the page.</p>
        ) : state === 'denied' ? (
          <p className="text-sm text-muted-fg">
            Your role cannot see the Directory, so there is nowhere for imported contacts to go. Ask an admin
            if you need it.
          </p>
        ) : !status?.configured ? (
          // The server has no credentials at all - a different fact from "this
          // company has not linked an account", and a different thing to do.
          <p className="text-sm text-muted-fg">
            Google is not set up on this server yet. An admin needs to add the Google client ID and secret
            in the hosting settings, then redeploy.
          </p>
        ) : !status.connected ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm text-muted-fg">
              Connect your Google account and we will read its contacts into the list below - read only, nothing is
              changed on Google&apos;s side, and only you can see the list.
            </p>
            <Button onClick={connect} disabled={busy === 'connect'}>
              {busy === 'connect' ? <><Loader2 className="h-4 w-4 animate-spin" /> Opening…</> : <><Link2 className="h-4 w-4" /> Connect Google Contacts</>}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {/* NAME THE ACCOUNT. "Connected" alone does not tell somebody
                    with three Google logins which one this is. */}
                Connected{status.googleEmail ? ` as ${status.googleEmail}` : ''}
              </p>
              <p className="text-xs text-faint">
                {status.status === 'expired'
                  ? 'The connection has expired - reconnect to read contacts again.'
                  : status.lastSyncAt ? `Last read ${formatDate(status.lastSyncAt)}` : 'Not read yet'}
              </p>
            </div>
            <div className="row-even lg:flex gap-2">
              <Button variant="outline" onClick={disconnect} disabled={busy === 'disconnect'}>
                <Unplug className="h-4 w-4" /> Disconnect
              </Button>
              <Button onClick={sync} disabled={busy === 'sync'}>
                {busy === 'sync' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><RefreshCw className="h-4 w-4" /> Read contacts</>}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── bulk actions ──────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-4 lg:rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
              {picked.size} of {rows.length} selected
            </span>
            <button type="button"
              onClick={() => setPicked(allPicked ? new Set() : new Set(rows.map(r => r.id)))}
              className="min-h-11 whitespace-nowrap px-2 text-xs font-semibold text-accent-fg hover:underline lg:min-h-0">
              {allPicked ? 'Clear all' : `Select all ${rows.length}`}
            </button>
          </div>

          {/* "select 5, label all at once" - each control acts on the whole
              selection, and sends ONLY its own field so labelling five people
              cannot blank a trade somebody already set. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Label as <span className="text-faint font-normal">(applies to selected)</span></Label>
              <Select defaultValue="" onChange={e => { if (e.target.value) { patch({ contact_type: e.target.value }, `labelled ${TYPE_LABEL[e.target.value] ?? e.target.value}`); e.target.value = '' } }}>
                <option value="">-- Select --</option>
                {CONTACT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t] ?? t}{t === 'delivery' ? ' (files as Supplier)' : ''}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
              <Select defaultValue="" onChange={e => { if (e.target.value) { patch({ trade: e.target.value }, `set to ${e.target.value}`); e.target.value = '' } }}>
                <option value="">-- Select --</option>
                {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assign to a job <span className="text-faint font-normal">(optional)</span></Label>
              <Select defaultValue="" onChange={e => { if (e.target.value) { patch({ assigned_project_id: e.target.value }, 'assigned to the job'); e.target.value = '' } }}>
                <option value="">-- Select --</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </div>
          </div>

          <div className="row-even lg:flex lg:justify-end gap-2">
            <Button variant="outline" onClick={() => patch({ status: 'dismissed' }, 'dismissed', false)} disabled={busy === 'patch'}>
              Not a work contact
            </Button>
            <Button onClick={importPicked} disabled={busy === 'import'}>
              {busy === 'import' ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</> : <><Check className="h-4 w-4" /> Add to Directory</>}
            </Button>
          </div>
          {/* SAID BEFORE THE PRESS, not only after it. Sorting your own list
              needs Directory view; filing into the shared Directory needs
              create, and the route refuses without it. */}
          {!permsLoading && !can('directory', 'create') && (
            <p className="text-xs text-faint lg:text-right">
              Adding to the Directory needs the Directory &quot;create&quot; permission. You can sort your list; an admin can give you that.
            </p>
          )}
        </div>
      )}

      {/* ── the list ──────────────────────────────────────────────────────── */}
      {state === 'ready' && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line py-12 text-center lg:rounded-xl">
          <Users className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-3 text-sm text-muted-fg">
            {status?.connected ? 'Nothing waiting. Press Read contacts to check Google again.' : 'Connect Google above and your contacts will appear here to sort.'}
          </p>
        </div>
      ) : rows.length > 0 ? (
        <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel lg:rounded-xl">
          {rows.map(r => (
            <label key={r.id} className={cn('flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-surface', !hasEmail(r) && 'opacity-60')}>
              <input type="checkbox" className="accent-[#C9F24A] mt-0.5 shrink-0"
                checked={picked.has(r.id)}
                onChange={e => setPicked(p => {
                  const n = new Set(p)
                  if (e.target.checked) n.add(r.id); else n.delete(r.id)
                  return n
                })} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {r.name || r.organization || r.email || 'Unnamed'}
                  {!hasEmail(r) && <span className="ml-2 whitespace-nowrap text-[11px] font-normal text-faint">No email</span>}
                </span>
                <span className="block truncate text-xs text-muted-fg">
                  {[r.organization && r.organization !== r.name ? r.organization : null, r.email, r.phone].filter(Boolean).join(' · ') || 'No contact details'}
                </span>
                {(r.contact_type || r.trade || r.assigned_project_id) && (
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {r.contact_type && <span className="whitespace-nowrap rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-medium text-accent-fg">{TYPE_LABEL[r.contact_type] ?? r.contact_type}</span>}
                    {r.trade && <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-fg">{r.trade}</span>}
                    {r.assigned_project_id && <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-fg">{projects.find(p => p.id === r.assigned_project_id)?.name ?? 'On a job'}</span>}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
