'use client'

import { useCallback, useEffect, useState } from 'react'
import { Camera, Check, Clock, History, ListChecks, MapPin, Navigation, Phone, Plus, User, X } from 'lucide-react'
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
import { useSwipeDismiss } from '@/lib/use-swipe-dismiss'
import { LabelChips, LabelPicker } from '@/components/tasks/task-extras-ui'
import type { TaskLabel, TaskSubtask } from '@/lib/task-extras'

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
 * Where the call is on its way from New to Invoiced, as a row of pills - the
 * same shape as the Column buttons on a Project Management card. The steps it
 * has passed are filled quietly, the one it is on is the dark one, the ones
 * ahead are outlined. A READOUT, not a control: a call moves one step at a
 * time through the step buttons, which know what each move has to carry.
 */
function ProgressPath({ status }: { status: CallStatus }) {
  const at = CALL_PATH.indexOf(status)
  return (
    <ol className="scroll-fade flex gap-2 overflow-x-auto scrollbar-hide lg:flex-wrap lg:overflow-visible" aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {CALL_PATH.map((step, i) => {
        const past = i < at
        const here = i === at
        return (
          <li key={step} aria-current={here ? 'step' : undefined}
            className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm',
              here ? 'bg-ink font-semibold text-panel'
                : past ? 'bg-muted font-medium text-ink-soft'
                : 'border border-dashed border-muted2 font-medium text-muted-fg')}>
            {past && <Check className="h-3.5 w-3.5" aria-hidden />}
            {STATUS_LABEL[step]}
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
  const [labels, setLabels] = useState<TaskLabel[]>([])
  const [stepText, setStepText] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await callFetch(`/api/service-calls/${callId}`)
      if (!res.ok) { setState('failed'); return }
      const json = (await res.json()) as Detail
      setD(json)
      setAssign({ who: json.call.assigned_to ?? '', start: toLocalInput(json.call.scheduled_start), end: toLocalInput(json.call.scheduled_end) })
      setNotes(json.call.notes ?? '')
      setLabels(json.call.labels ?? [])
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

  // ONE SAVE for what is typed on this page: the notes, and for the office the
  // labels and who does it when. Cancel puts every field back as loaded.
  async function saveAll() {
    const body = d?.crewView
      ? { notes }
      : { notes, labels, assigned_to: assign.who || null, scheduled_start: fromLocalInput(assign.start), scheduled_end: fromLocalInput(assign.end) }
    await send('save', `/api/service-calls/${callId}`, { method: 'PATCH', body: JSON.stringify(body) }, 'Saved.')
  }
  function resetAll() {
    if (!d) return
    setAssign({ who: d.call.assigned_to ?? '', start: toLocalInput(d.call.scheduled_start), end: toLocalInput(d.call.scheduled_end) })
    setNotes(d.call.notes ?? '')
    setLabels(d.call.labels ?? [])
  }

  // STEPS SAVE AS THEY ARE TICKED. A tech on site reports a step done with one
  // tap - it is the same act as moving the call, not a field waiting for Save.
  // The route stamps who ticked it and when, and lets crew tick but not rewrite.
  async function saveSteps(next: TaskSubtask[]) {
    await send('steps', `/api/service-calls/${callId}`, { method: 'PATCH', body: JSON.stringify({ steps: next }) })
  }
  function addStep() {
    const text = stepText.trim()
    if (!text) { notice('Type the step first.'); return }
    setStepText('')
    saveSteps([...(d?.call.steps ?? []), { id: `s${Date.now().toString(36)}`, text: text.slice(0, 200), done: false }])
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
  const steps: TaskSubtask[] = c.steps ?? []
  const stepsDone = steps.filter(x => x.done).length
  // THE CLOCK IS AT THE TOP WHEN IT IS THE NEXT THING TO DO: clocking out while
  // on the clock, clocking in when you have arrived and are not on it yet.
  // Anywhere else it is a quiet button on the Time card, so it always exists.
  const clockInIsNext = !openPunch && c.status === 'on_site' && c.assigned_to === me
  const dirty = notes !== (c.notes ?? '')
    || (!d.crewView && (
      JSON.stringify(labels) !== JSON.stringify(c.labels ?? [])
      || assign.who !== (c.assigned_to ?? '')
      || assign.start !== toLocalInput(c.scheduled_start)
      || assign.end !== toLocalInput(c.scheduled_end)
    ))

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
            <LabelChips labels={c.labels} />
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink break-words">{c.issue}</h1>
          <p className="text-sm text-muted-fg">{c.customer_name}{d.gc_job ? ` - for the contractor job ${d.gc_job.name}` : ''}</p>
          {openPunch && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <Clock className="h-4 w-4" aria-hidden /> On the clock since {new Date(openPunch.clock_in).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
        <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2 lg:shrink-0">
          <Button variant="ghost" onClick={() => setShowHistory(true)}>
            <History className="h-4 w-4" /> History
          </Button>
          {back.map(m => (
            <Button key={m} variant="outline" disabled={busy !== ''} onClick={() => move(m)}>
              {busy === m ? 'Saving...' : moveLabel(from, m)}
            </Button>
          ))}
          {openPunch && (
            <Button variant="outline" onClick={() => punch('out')} disabled={busy !== ''}>
              <Clock className="h-4 w-4" /> {busy === 'punch-out' ? 'Clocking out...' : 'Clock out'}
            </Button>
          )}
          {clockInIsNext && (
            <Button onClick={() => punch('in')} disabled={busy !== ''}>
              <Clock className="h-4 w-4" /> {busy === 'punch-in' ? 'Clocking in...' : 'Clock in'}
            </Button>
          )}
          {forward.map(m => (
            <Button key={m} disabled={busy !== ''} onClick={() => (m === 'done' ? setClosing(true) : move(m))}>
              {busy === m ? 'Saving...' : moveLabel(from, m)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <ProgressPath status={c.status as CallStatus} />
        {c.status === 'new' && !d.crewView && (
          <p className="mt-2 text-xs text-muted-fg">Give it a person and a time below, or drag it on the dispatch board, and it becomes Scheduled.</p>
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

          {(steps.length > 0 || !d.crewView) && (
            <div className={cn(card, 'p-4 space-y-3')}>
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-faint" aria-hidden />
                <p className="text-sm font-semibold text-ink">Steps on site</p>
                {steps.length > 0 && <span className="text-xs text-muted-fg">{stepsDone} of {steps.length} done</span>}
              </div>
              {steps.length > 0 && (
                <>
                  <div aria-hidden className="h-1 rounded-full bg-muted">
                    <div className="h-1 rounded-full bg-accent-fg" style={{ width: `${Math.round((stepsDone / steps.length) * 100)}%` }} />
                  </div>
                  <div className="divide-y divide-line-soft rounded-xl border border-line">
                    {steps.map(st => (
                      <div key={st.id} className="flex items-center gap-1 pl-3 pr-1">
                        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-sm">
                          <input type="checkbox" checked={st.done} disabled={busy !== ''}
                            className="h-5 w-5 shrink-0 accent-[rgb(var(--accent-fg))]"
                            onChange={() => saveSteps(steps.map(x => x.id === st.id ? { ...x, done: !x.done } : x))} />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block break-words', st.done ? 'text-muted-fg line-through' : 'text-ink')}>{st.text}</span>
                            {st.done && st.done_by_name && <span className="block text-xs text-muted-fg">Done by {st.done_by_name}</span>}
                          </span>
                        </label>
                        {!d.crewView && (
                          <button type="button" aria-label={`Remove "${st.text}"`} title="Remove" disabled={busy !== ''}
                            onClick={() => saveSteps(steps.filter(x => x.id !== st.id))}
                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-danger">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {!d.crewView && (
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="cd-step" className="lg:text-xs">New step (optional)</Label>
                    <Input id="cd-step" value={stepText} maxLength={200} placeholder="One thing to do on site"
                      onChange={e => setStepText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addStep() } }} />
                  </div>
                  <Button type="button" variant="outline" onClick={addStep} disabled={busy !== ''}><Plus className="h-4 w-4" /> Add</Button>
                </div>
              )}
              <p className="text-xs text-muted-fg">A tick saves straight away and records who did it.</p>
            </div>
          )}

          <div className={cn(card, 'p-4 space-y-3')}>
            <Label htmlFor="cd-notes">Notes (optional)</Label>
            <textarea id="cd-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" placeholder="Gate code, dog in the yard, parts to bring..." />
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
                  <span className="text-sm font-medium text-ink-soft lg:text-xs">Crew member (optional)</span>
                  <div role="group" aria-label="Crew member" className="flex flex-wrap gap-2">
                    {[...d.crew, { id: '', name: 'Nobody yet' }].map(p => (
                      <button key={p.id || 'nobody'} type="button" aria-pressed={assign.who === p.id}
                        onClick={() => setAssign(a => ({ ...a, who: p.id }))}
                        className={cn('min-h-11 max-w-full truncate whitespace-nowrap rounded-xl border px-3.5 text-sm lg:min-h-9',
                          assign.who === p.id ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink-soft hover:bg-surface')}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-start">Starts (optional)</Label>
                  <Input id="cd-start" type="datetime-local" value={assign.start} onChange={e => setAssign(a => ({ ...a, start: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cd-end">Finishes (optional)</Label>
                  <Input id="cd-end" type="datetime-local" value={assign.end} onChange={e => setAssign(a => ({ ...a, end: e.target.value }))} />
                </div>
                <LabelPicker value={labels} onChange={setLabels} />
              </div>
            )}
          </div>

          <div className={cn(card, 'p-4 space-y-3')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-faint" aria-hidden />
                <p className="text-sm font-semibold text-ink">Time on site</p>
              </div>
              {/* Clock out, and Clock in when it is the next step, are at the top
                  of the page. Here only when neither is - so there is always
                  exactly one place to clock in. */}
              {!openPunch && !clockInIsNext && (
                <Button variant="outline" onClick={() => punch('in')} disabled={busy !== ''}>{busy === 'punch-in' ? 'Clocking in...' : 'Clock in'}</Button>
              )}
            </div>
            {d.time.length ? (
              <ul className="space-y-1 text-sm text-ink-soft">
                {d.time.map(t => (
                  <li key={t.id}>{t.person_name ?? 'Someone'}: {callTime(t.clock_in)}{t.clock_out ? ` to ${callTime(t.clock_out)}` : ' - still on the clock'}</li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-fg">Nobody has clocked in yet.</p>}
          </div>

        </div>
      </div>

      {/* ONE SAVE, said only when there is something to save. */}
      {dirty && (
        <div className={cn(card, 'sticky bottom-3 z-10 flex flex-col gap-2 p-3 shadow-lg lg:flex-row lg:items-center')}>
          <p className="min-w-0 flex-1 text-sm text-muted-fg">You have changes that are not saved yet.</p>
          <div className="row-even gap-2 lg:flex">
            <Button variant="outline" onClick={resetAll} disabled={busy !== ''}>Cancel</Button>
            <Button onClick={saveAll} disabled={busy !== ''}><Check className="h-4 w-4" /> {busy === 'save' ? 'Saving...' : 'Save'}</Button>
          </div>
        </div>
      )}

      {showHistory && <HistoryDrawer events={d.events} onClose={() => setShowHistory(false)} />}
      {closing && <CloseOut untimed={d.time.length === 0} onCancel={() => setClosing(false)} onDone={async notesText => { if (await move('done', notesText)) setClosing(false) }} busy={busy === 'done'} />}
    </div>
  )
}

/**
 * What happened on the call, in order. A panel that slides in from the right
 * when somebody asks for it, not a card that is always on the page - it is
 * the record, looked at now and then, and it was taking the space the next
 * step should have.
 */
function HistoryDrawer({ events, onClose }: { events: Detail['events']; onClose: () => void }) {
  const swipe = useSwipeDismiss(onClose)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay-drawer bg-black/40" data-overlay onClick={onClose}>
      <aside aria-label="History" onClick={e => e.stopPropagation()} {...swipe.handlers} style={swipe.style}
        className="flex flex-col overflow-hidden border-l border-line bg-panel shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink"><History className="h-4 w-4 text-faint" aria-hidden /> History</span>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="-mr-2 flex h-11 w-11 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ol className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-4">
          {events.length === 0 && <li className="text-sm text-muted-fg">Nothing recorded yet.</li>}
          {events.map((ev, i) => (
            <li key={ev.id} className="relative pl-5 text-sm">
              <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-muted2" aria-hidden />
              {i < events.length - 1 && <span className="absolute left-[3px] top-4 bottom-[-14px] w-0.5 bg-line-soft" aria-hidden />}
              <p className="text-ink">
                {ev.kind === 'status' ? (STATUS_LABEL[ev.status as CallStatus] ?? ev.status) : EVENT_WORDS[ev.kind] ?? ev.kind}
                {ev.actor_name ? <span className="text-muted-fg"> - {ev.actor_name}</span> : null}
              </p>
              {ev.note && ev.kind === 'status' && <p className="mt-0.5 break-words text-muted-fg">{ev.note}</p>}
              <p className="mt-0.5 text-xs text-faint" title={absoluteTime(ev.created_at)}>{timeAgo(ev.created_at)}</p>
            </li>
          ))}
        </ol>
      </aside>
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
