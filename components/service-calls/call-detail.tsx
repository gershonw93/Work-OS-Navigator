'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Check, Clock, History, MapPin, Navigation, Phone, User, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useNotice } from '@/components/ui/notice'
import { createClient } from '@/lib/supabase/client'
import { callLabel, callProblem, directionsUrl, offeredMoves, isForward, moveLabel, punchWith, CALL_PATH, STATUS_LABEL, PRIORITY_LABEL, type CallStatus, type CallPriority } from '@/lib/service-calls'
import { cn } from '@/lib/utils'
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


/**
 * Where the call is on its way from New to Invoiced - the bar across the top.
 * The steps it has passed are filled, the one it is on is ringed.
 */
function ProgressPath({ status }: { status: CallStatus }) {
  const at = CALL_PATH.indexOf(status)
  return (
    <ol className="flex items-start" aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {CALL_PATH.map((step, i) => {
        const past = i < at
        const here = i === at
        return (
          <li key={step} className="flex flex-1 flex-col items-center min-w-0 relative">
            {i > 0 && <span className={cn('absolute top-3 right-1/2 h-0.5 w-full', i <= at ? 'bg-ink' : 'bg-line')} aria-hidden />}
            <span className={cn('relative z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-semibold',
              past ? 'border-ink bg-ink text-panel' : here ? 'border-ink bg-panel text-ink' : 'border-line bg-panel text-faint')}>
              {past ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cn('mt-1.5 truncate text-[11px] sm:text-xs', here ? 'font-semibold text-ink' : past ? 'text-ink-soft' : 'text-faint')}>
              {STATUS_LABEL[step]}
            </span>
          </li>
        )
      })}
    </ol>
  )
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

export function CallDetail({ callId, narrow = false }: {
  callId: string
  /** Field Mode's single column, whatever the screen width. */
  narrow?: boolean
}) {
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
    const from = d?.call.status as CallStatus
    const moved = await send(to, `/api/service-calls/${callId}/status`, { method: 'POST', body: JSON.stringify({ to, completion_notes }) })
    // Arrived clocks the assignee in, Done clocks them out (punchWith). A punch
    // that fails is said, and the status move it followed still stands.
    const p = moved && d && me && d.call.assigned_to === me ? punchWith(from, to) : null
    const open = d?.time.some(t => t.profile_id === me && !t.clock_out)
    if (p === 'in' && !open) await punch('in')
    if (p === 'out' && open) await punch('out')
    return moved
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
  const moves = offeredMoves(c.status as CallStatus, d.crewView)
  const from = c.status as CallStatus
  const forward = moves.filter(m => isForward(from, m))
  const back = moves.filter(m => !isForward(from, m))
  const card = 'rounded-2xl border border-line bg-panel'

  return (
    <div className="space-y-5">
      {/* Title, status and the step buttons. */}
      <div className={cn('flex flex-col gap-3', !narrow && 'lg:flex-row lg:items-start lg:justify-between')}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted-fg">{callLabel(c.call_number)}</span>
            <Badge variant={STATUS_TONE[c.status] ?? 'default'}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</Badge>
            {c.priority !== 'normal' && (
              <Badge variant={c.priority === 'urgent' ? 'danger' : 'muted'}>{PRIORITY_LABEL[c.priority as CallPriority]}</Badge>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink break-words">{c.issue}</h1>
          <p className="text-sm text-muted-fg">{c.customer_name}{d.gc_job ? ` - for the contractor job ${d.gc_job.name}` : ''}</p>
          {openPunch && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <Clock className="h-4 w-4" aria-hidden /> On the clock since {new Date(openPunch.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        {moves.length > 0 && (
          <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2 lg:shrink-0">
            {back.map(m => (
              <Button key={m} variant="outline" disabled={busy !== ''} onClick={() => move(m)}>
                {busy === m ? 'Saving...' : moveLabel(from, m)}
              </Button>
            ))}
            {forward.map(m => (
              <Button key={m} disabled={busy !== ''} onClick={() => (m === 'done' ? setClosing(true) : move(m))}>
                {busy === m ? 'Saving...' : moveLabel(from, m)}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className={cn(card, 'px-4 py-4 sm:px-6')}>
        <ProgressPath status={c.status as CallStatus} />
        {c.status === 'new' && !d.crewView && (
          <p className="mt-3 text-center text-xs text-muted-fg">Give it a person and a time below, or drag it on the dispatch board, and it becomes Scheduled.</p>
        )}
      </div>

      <div className={cn('grid gap-5', !narrow && 'lg:grid-cols-[minmax(0,1fr)_400px]')}>
        {/* LEFT: the job itself. */}
        <div className="space-y-5 min-w-0">
          <div className={cn(card, 'divide-y divide-line-soft')}>
            <div className="p-4 flex items-start gap-3">
              <MapPin className="h-5 w-5 text-faint shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink break-words">{c.site_address}</p>
                {c.site_lat == null && <p className="text-xs text-warn mt-0.5">Not placed on the map, so a clock-in here cannot be checked against the site.</p>}
              </div>
            </div>
            {(c.contact_name || c.contact_phone || c.contact_email) && (
              <div className="p-4 flex items-start gap-3">
                <User className="h-5 w-5 text-faint shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-ink">{c.contact_name || c.customer_name}</p>
                  {c.contact_phone && <p className="text-muted-fg">{c.contact_phone}</p>}
                  {c.contact_email && <p className="text-muted-fg break-words">{c.contact_email}</p>}
                </div>
              </div>
            )}
            {(directions || tel) && (
              <div className="p-4 row-even lg:flex lg:flex-wrap gap-2">
                {directions && (
                  <a href={directions} target="_blank" rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink whitespace-nowrap hover:bg-surface">
                    <Navigation className="h-4 w-4" /> Directions
                  </a>
                )}
                {tel && (
                  <a href={tel} className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-4 text-sm font-medium text-ink whitespace-nowrap hover:bg-surface">
                    <Phone className="h-4 w-4" /> Call {c.contact_name || 'customer'}
                  </a>
                )}
              </div>
            )}
          </div>

          {c.completion_notes && (
            <div className={cn(card, 'p-4 space-y-1')}>
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">What was done</p>
              <p className="text-sm text-ink whitespace-pre-wrap break-words">{c.completion_notes}</p>
            </div>
          )}

          <div className={cn(card, 'p-4 space-y-3')}>
            <Label htmlFor="cd-notes">Notes (optional)</Label>
            <textarea id="cd-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" placeholder="Gate code, dog in the yard, parts to bring..." />
            <div className="row-even lg:flex lg:justify-end gap-2">
              <Button variant="outline" disabled={busy !== ''}
                onClick={() => send('notes', `/api/service-calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ notes }) }, 'Notes saved.')}>
                {busy === 'notes' ? 'Saving...' : 'Save notes'}
              </Button>
            </div>
          </div>

          <div className={cn(card, 'p-4 space-y-3')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-faint" aria-hidden />
                <p className="text-sm font-semibold text-ink">Photos</p>
              </div>
              <label className="inline-flex items-center justify-center gap-2 h-11 lg:h-9 rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink cursor-pointer whitespace-nowrap hover:bg-surface">
                <Camera className="h-4 w-4" /> {busy === 'photo' ? 'Uploading...' : 'Add photo'}
                <input type="file" accept="image/*" capture="environment" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) addPhoto(f) }} />
              </label>
            </div>
            {d.photos.length ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {d.photos.map(p => p.url && (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-line-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={p.file_name ?? 'Photo'} className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : <p className="text-sm text-muted-fg">No photos yet.</p>}
          </div>
        </div>

        {/* RIGHT: who, when, time on it, and what happened. */}
        <div className="space-y-5 min-w-0">
          <div className={cn(card, 'p-4 space-y-3')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Who and when</p>
            <div>
              <p className="text-base font-semibold text-ink">{callWindow(c.scheduled_start, c.scheduled_end) ?? 'No time yet'}</p>
              <p className="text-sm text-muted-fg">{d.assignee_name ? `With ${d.assignee_name}` : 'Nobody on it yet'}</p>
            </div>
            {!d.crewView && (
              <div className="space-y-3 border-t border-line-soft pt-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cd-crew">Crew member (optional)</Label>
                  <select id="cd-crew" value={assign.who} onChange={e => setAssign(a => ({ ...a, who: e.target.value }))}
                    className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
                    <option value="">-- Nobody yet --</option>
                    {d.crew.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-start">Starts (optional)</Label>
                  <Input id="cd-start" type="datetime-local" value={assign.start} onChange={e => setAssign(a => ({ ...a, start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-end">Finishes (optional)</Label>
                  <Input id="cd-end" type="datetime-local" value={assign.end} onChange={e => setAssign(a => ({ ...a, end: e.target.value }))} />
                </div>
                <div className="row-even lg:flex lg:justify-end gap-2">
                  <Button onClick={saveAssignment} disabled={busy !== ''}>{busy === 'assign' ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
            )}
          </div>

          <div className={cn(card, 'p-4 space-y-3')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-faint" aria-hidden />
                <p className="text-sm font-semibold text-ink">Time on site</p>
              </div>
              {openPunch
                ? <Button onClick={() => punch('out')} disabled={busy !== ''}>{busy === 'punch-out' ? 'Clocking out...' : 'Clock out'}</Button>
                : <Button variant="outline" onClick={() => punch('in')} disabled={busy !== ''}>{busy === 'punch-in' ? 'Clocking in...' : 'Clock in'}</Button>}
            </div>
            {d.time.length ? (
              <ul className="space-y-1 text-sm text-ink-soft">
                {d.time.map(t => (
                  <li key={t.id}>{t.person_name ?? 'Someone'}: {callTime(t.clock_in)}{t.clock_out ? ` to ${callTime(t.clock_out)}` : ' - still on the clock'}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-fg">Nobody has clocked in yet.</p>}
          </div>

          <div className={card}>
            <div className="flex items-center gap-2 px-4 pt-4">
              <History className="h-4 w-4 text-faint" aria-hidden />
              <p className="text-sm font-semibold text-ink">History</p>
            </div>
            <ol className="px-4 py-3 space-y-3">
              {d.events.map((ev, i) => (
                <li key={ev.id} className="relative pl-5 text-sm">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-muted2" aria-hidden />
                  {i < d.events.length - 1 && <span className="absolute left-[3px] top-4 bottom-[-14px] w-0.5 bg-line-soft" aria-hidden />}
                  <p className="text-ink">
                    {ev.kind === 'status' ? (STATUS_LABEL[ev.status as CallStatus] ?? ev.status) : EVENT_WORDS[ev.kind] ?? ev.kind}
                    {ev.actor_name ? <span className="text-muted-fg"> - {ev.actor_name}</span> : null}
                  </p>
                  {ev.note && ev.kind === 'status' && <p className="text-muted-fg mt-0.5 break-words">{ev.note}</p>}
                  <p className="text-xs text-faint mt-0.5" title={absoluteTime(ev.created_at)}>{timeAgo(ev.created_at)}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {closing && <CloseOut untimed={d.time.length === 0} onCancel={() => setClosing(false)} onDone={async notesText => { if (await move('done', notesText)) setClosing(false) }} busy={busy === 'done'} />}
    </div>
  )
}

/** Done collects what was done. Asked of `callProblem`, the route's own rule. */
function CloseOut({ onCancel, onDone, busy, untimed }: { onCancel: () => void; onDone: (notes: string) => void; busy: boolean; untimed: boolean }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onCancel}>
      <div className="bg-panel rounded-2xl border border-line w-full max-w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Close out the call</h2>
          <button type="button" onClick={onCancel} aria-label="Close" title="Close" className="text-faint hover:text-ink p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-2">
          {/* SAID, NOT REFUSED. The office closes calls for a tech who forgot to
              clock in, and a call that cannot close is stuck open - so a call
              with no time on it may close, but not without the reader knowing. */}
          {untimed && (
            <p className="rounded-lg border border-warn/30 bg-warn-tint px-3 py-2 text-sm text-warn">
              Nobody clocked in on this call, so it will close with no time on site.
            </p>
          )}
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
