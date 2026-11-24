'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Clock, MapPin, Navigation, Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useNotice } from '@/components/ui/notice'
import { createClient } from '@/lib/supabase/client'
import { callLabel, callProblem, directionsUrl, STATUS_LABEL, PRIORITY_LABEL, type CallStatus, type CallPriority } from '@/lib/service-calls'
import { callFetch, callTime, callWindow, toLocalInput, fromLocalInput } from '@/lib/service-calls-client'
import { getPosition, geoFailureMessage } from '@/lib/geo-position'
import { fetchProblem } from '@/lib/fetch-error'
import { timeAgo, absoluteTime } from '@/lib/time-ago'

// ONE call, on the office screen and in Field Mode alike. What a person may do
// is the SERVER's answer (`crewView`, `moves`), so the two screens cannot
// offer different powers: crew see their own call, move it through the field
// steps, punch, add photos and notes; the office also sets who and when.

type Detail = {
  call: any
  assignee_name: string | null
  crew: { id: string; name: string }[]
  gc_job: { id: string; name: string } | null
  events: { id: string; kind: string; status: string | null; note: string | null; actor_name: string | null; created_at: string }[]
  time: { id: string; profile_id: string | null; person_name: string | null; clock_in: string; clock_out: string | null; in_fix: string | null }[]
  photos: { id: string; url: string | null; file_name: string | null }[]
  moves: CallStatus[]
  crewView: boolean
}

const MOVE_LABEL: Partial<Record<CallStatus, string>> = {
  scheduled: 'Back to scheduled', en_route: 'On my way', on_site: 'Arrived', done: 'Done', invoiced: 'Mark invoiced', new: 'Unschedule',
}

const STATUS_TONE: Record<string, 'default' | 'info' | 'warning' | 'success' | 'muted'> = {
  new: 'muted', scheduled: 'info', en_route: 'warning', on_site: 'warning', done: 'success', invoiced: 'default',
}

const EVENT_WORDS: Record<string, string> = {
  created: 'Call taken', assigned: 'Assigned', unassigned: 'Taken off', note: 'Note', photo: 'Photo added',
  punch_in: 'Clocked in', punch_out: 'Clocked out',
}

function phoneHref(p: string | null | undefined) {
  return p && /\d/.test(p) ? `tel:${p.replace(/[^\d+]/g, '')}` : null
}

export function CallDetail({ callId }: { callId: string }) {
  const notice = useNotice()
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [d, setD] = useState<Detail | null>(null)
  const [me, setMe] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [closing, setClosing] = useState(false)
  const [assign, setAssign] = useState({ who: '', start: '', end: '' })
  const [notes, setNotes] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await callFetch(`/api/service-calls/${callId}`)
      if (!res.ok) { setState('failed'); return }
      const json = (await res.json()) as Detail
      setD(json)
      setAssign({ who: json.call.assigned_to ?? '', start: toLocalInput(json.call.scheduled_start), end: toLocalInput(json.call.scheduled_end) })
      setNotes(json.call.notes ?? '')
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [callId])

  useEffect(() => {
    load()
    createClient().auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null))
  }, [load])

  async function send(label: string, url: string, init: RequestInit, done?: string) {
    setBusy(label)
    try {
      const res = await callFetch(url, init)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'That did not work. Try again.'); return false }
      if (json.message || done) notice(json.message ?? done, { tone: 'success' })
      await load()
      return true
    } catch (e) {
      notice(fetchProblem(e, 'updating the call'))
      return false
    } finally {
      setBusy('')
    }
  }

  async function move(to: CallStatus, completion_notes?: string) {
    return send(to, `/api/service-calls/${callId}/status`, { method: 'POST', body: JSON.stringify({ to, completion_notes }) })
  }

  async function punch(action: 'in' | 'out') {
    setBusy(`punch-${action}`)
    const pos = await getPosition()
    // A punch is never held up by the phone: no fix is recorded as no fix, and
    // the person is told why in words they can act on.
    if (!pos.ok) notice(geoFailureMessage(pos.why), { tone: 'info' })
    await send(`punch-${action}`, `/api/service-calls/${callId}/punch`, {
      method: 'POST',
      body: JSON.stringify({ action, ...(pos.ok ? { lat: pos.fix.lat, lng: pos.fix.lng, accuracy: pos.fix.accuracy } : {}) }),
    })
  }

  async function addPhoto(file: File) {
    const fd = new FormData()
    fd.append('file', file)
    await send('photo', `/api/service-calls/${callId}/photos`, { method: 'POST', body: fd }, 'Photo added.')
  }

  async function saveAssignment() {
    const body = { assigned_to: assign.who || null, scheduled_start: fromLocalInput(assign.start), scheduled_end: fromLocalInput(assign.end) }
    await send('assign', `/api/service-calls/${callId}`, { method: 'PATCH', body: JSON.stringify(body) }, 'Saved.')
  }

  if (state === 'loading') return <p className="text-sm text-faint py-12 text-center">Loading...</p>
  if (state === 'failed' || !d) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
        <p>Could not load this call. It may have been removed, or it is not one of yours.</p>
        <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
      </div>
    )
  }

  const c = d.call
  const openPunch = d.time.find(t => t.profile_id === me && !t.clock_out)
  const directions = directionsUrl(c.site_address)
  const tel = phoneHref(c.contact_phone)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold text-ink">{callLabel(c.call_number)}</h1>
        <Badge variant={STATUS_TONE[c.status] ?? 'default'}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</Badge>
        {c.priority !== 'normal' && (
          <Badge variant={c.priority === 'urgent' ? 'danger' : 'muted'}>{PRIORITY_LABEL[c.priority as CallPriority]}</Badge>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
        <div className="p-4 space-y-1">
          <p className="text-base font-semibold text-ink">{c.issue}</p>
          <p className="text-sm text-muted-fg">{c.customer_name}{c.contact_name ? ` - ${c.contact_name}` : ''}</p>
          {d.gc_job && <p className="text-sm text-muted-fg">For the contractor job {d.gc_job.name}</p>}
        </div>
        <div className="p-4 flex items-start gap-3">
          <MapPin className="h-5 w-5 text-faint shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-ink break-words">{c.site_address}</p>
            {c.site_lat == null && <p className="text-xs text-warn mt-0.5">Not placed on the map, so a clock-in here cannot be checked against the site.</p>}
          </div>
        </div>
        <div className="p-4 row-even lg:flex lg:flex-wrap gap-2">
          {directions && (
            <a href={directions} target="_blank" rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink whitespace-nowrap">
              <Navigation className="h-4 w-4" /> Directions
            </a>
          )}
          {tel && (
            <a href={tel} className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink whitespace-nowrap">
              <Phone className="h-4 w-4" /> Call {c.contact_name || 'customer'}
            </a>
          )}
        </div>
        <div className="p-4 text-sm">
          <p className="text-muted-fg">When</p>
          <p className="text-base font-semibold text-ink">{callWindow(c.scheduled_start, c.scheduled_end) ?? 'Not booked yet'}</p>
          <p className="text-muted-fg mt-1">{d.assignee_name ? `With ${d.assignee_name}` : 'Nobody on it yet'}</p>
        </div>
      </div>

      {/* Moving the call. The buttons are the server's list of next steps. */}
      {d.moves.length > 0 && (
        <div className="row-even lg:flex lg:flex-wrap gap-2">
          {d.moves.filter(m => !(d.crewView && (m === 'invoiced' || m === 'new' || c.status === 'invoiced'))).map(m => (
            <Button key={m} variant={m === 'done' || m === 'on_site' || m === 'en_route' ? 'default' : 'outline'}
              disabled={busy !== ''}
              onClick={() => (m === 'done' ? setClosing(true) : move(m))}>
              {busy === m ? 'Saving...' : MOVE_LABEL[m] ?? STATUS_LABEL[m]}
            </Button>
          ))}
        </div>
      )}

      {/* Time on the call, with where the phone was. */}
      <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-faint" aria-hidden />
          <p className="text-sm font-semibold text-ink">Time</p>
        </div>
        {d.time.length ? (
          <ul className="space-y-1 text-sm text-ink-soft">
            {d.time.map(t => (
              <li key={t.id}>{t.person_name ?? 'Someone'}: {callTime(t.clock_in)}{t.clock_out ? ` to ${callTime(t.clock_out)}` : ' - still on the clock'}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-fg">Nobody has clocked in yet.</p>}
        <div className="row-even lg:flex gap-2">
          {openPunch
            ? <Button onClick={() => punch('out')} disabled={busy !== ''}>{busy === 'punch-out' ? 'Clocking out...' : 'Clock out'}</Button>
            : <Button variant="outline" onClick={() => punch('in')} disabled={busy !== ''}>{busy === 'punch-in' ? 'Clocking in...' : 'Clock in'}</Button>}
        </div>
      </div>

      {/* Who and when - the office's. */}
      {!d.crewView && (
        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <p className="text-sm font-semibold text-ink">Who and when</p>
          <div className="space-y-1.5">
            <Label htmlFor="cd-crew">Crew member (optional)</Label>
            <select id="cd-crew" value={assign.who} onChange={e => setAssign(a => ({ ...a, who: e.target.value }))}
              className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
              <option value="">-- Nobody yet --</option>
              {d.crew.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cd-start">Starts (optional)</Label>
              <Input id="cd-start" type="datetime-local" value={assign.start} onChange={e => setAssign(a => ({ ...a, start: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cd-end">Finishes (optional)</Label>
              <Input id="cd-end" type="datetime-local" value={assign.end} onChange={e => setAssign(a => ({ ...a, end: e.target.value }))} />
            </div>
          </div>
          <div className="row-even lg:flex lg:justify-end gap-2">
            <Button onClick={saveAssignment} disabled={busy !== ''}>{busy === 'assign' ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
        <Label htmlFor="cd-notes">Notes (optional)</Label>
        <textarea id="cd-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" />
        <div className="row-even lg:flex lg:justify-end gap-2">
          <Button variant="outline" disabled={busy !== ''}
            onClick={() => send('notes', `/api/service-calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ notes }) }, 'Notes saved.')}>
            {busy === 'notes' ? 'Saving...' : 'Save notes'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Camera className="h-4 w-4 text-faint" aria-hidden />
          <p className="text-sm font-semibold text-ink">Photos</p>
        </div>
        {d.photos.length ? (
          <div className="grid grid-cols-3 gap-2">
            {d.photos.map(p => p.url && (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-line-soft">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.file_name ?? 'Photo'} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-muted-fg">No photos yet.</p>}
        <label className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink cursor-pointer whitespace-nowrap">
          <Camera className="h-4 w-4" /> {busy === 'photo' ? 'Uploading...' : 'Add photo'}
          <input type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(f) }} />
        </label>
      </div>

      <div className="rounded-2xl border border-line bg-panel">
        <p className="px-4 pt-4 text-sm font-semibold text-ink">History</p>
        <ul className="divide-y divide-line-soft">
          {d.events.map(ev => (
            <li key={ev.id} className="px-4 py-3 text-sm">
              <p className="text-ink">
                {ev.kind === 'status' ? (STATUS_LABEL[ev.status as CallStatus] ?? ev.status) : EVENT_WORDS[ev.kind] ?? ev.kind}
                {ev.actor_name ? <span className="text-muted-fg"> - {ev.actor_name}</span> : null}
              </p>
              {ev.note && ev.kind === 'status' && <p className="text-muted-fg mt-0.5 break-words">{ev.note}</p>}
              <p className="text-xs text-faint mt-0.5" title={absoluteTime(ev.created_at)}>{timeAgo(ev.created_at)}</p>
            </li>
          ))}
        </ul>
      </div>

      {closing && <CloseOut onCancel={() => setClosing(false)} onDone={async notesText => { if (await move('done', notesText)) setClosing(false) }} busy={busy === 'done'} />}
    </div>
  )
}

/** Done collects what was done. Asked of `callProblem`, the route's own rule. */
function CloseOut({ onCancel, onDone, busy }: { onCancel: () => void; onDone: (notes: string) => void; busy: boolean }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onCancel}>
      <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Close out the call</h2>
          <button type="button" onClick={onCancel} aria-label="Close" title="Close" className="text-faint hover:text-ink p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-2">
          <Label htmlFor="co-notes">What was done? *</Label>
          <textarea id="co-notes" value={text} onChange={e => setText(e.target.value)} rows={4}
            className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" placeholder="Replaced the run capacitor, tested cooling - holding 72F" />
          {problem && <p className="text-sm text-danger">{problem}</p>}
        </div>
        <div className="px-6 py-4 border-t border-line-soft row-even lg:flex lg:justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button disabled={busy} onClick={() => {
            const p = callProblem({ customer_name: 'x', site_address: 'x', issue: 'x', status: 'done', completion_notes: text })
            if (p) { setProblem(p); return }
            onDone(text.trim())
          }}>{busy ? 'Saving...' : 'Done'}</Button>
        </div>
      </div>
    </div>
  )
}
