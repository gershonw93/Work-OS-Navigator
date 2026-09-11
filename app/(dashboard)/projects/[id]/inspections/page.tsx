'use client'

import { useEffect, useRef, useState } from 'react'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, ClipboardCheck, Phone, Calendar, CheckCircle2, XCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Loader2, Upload, Trash2, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import { ContactPicker } from '@/components/contact-picker'
import { withStructural } from '@/lib/notification-routing'

import { formatDate, todayDateInput } from '@/lib/dates'
import { OPEN, CLOSED, isVoid, requestProblem, scheduleProblem, inspectionDate } from '@/lib/inspection-status'
import { callTargetsFor, type CallTarget } from '@/lib/inspection-contacts'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { ACCEPT_SCAN } from '@/lib/file-accept'
import { useDeleteGuard } from '@/components/ui/delete-guard'
const INSPECTION_TYPES = [
  'Foundation', 'Framing', 'Rough Electrical', 'Rough Plumbing', 'Rough Mechanical',
  'Insulation', 'Drywall', 'Final Electrical', 'Final Plumbing', 'Final Mechanical',
  'Fire Sprinkler', 'Building Final', 'Certificate of Occupancy', 'Other'
]
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  requested: { label: 'Requested', color: 'bg-warn-tint border-warn/30 text-warn', icon: AlertCircle },
  not_scheduled: { label: 'Not Scheduled', color: 'bg-surface border-line text-muted-fg', icon: Clock },
  scheduled: { label: 'Scheduled', color: 'bg-info-tint border-info/30 text-info', icon: Calendar },
  passed: { label: 'Passed', color: 'bg-success-tint border-success/30 text-success', icon: CheckCircle2 },
  failed: { label: 'Failed', color: 'bg-danger-tint border-danger/30 text-danger', icon: XCircle },
  pending_reinspection: { label: 'Re-inspection', color: 'bg-warn-tint border-warn/30 text-warn', icon: AlertCircle },
}

interface Inspection {
  id: string; type: string; trade: string | null; status: string
  // TWO DATES. `requested_date` is what the field asked for; `scheduled_date`
  // is what the jurisdiction actually gave us. They were one column, labelled
  // "Scheduled Date", which is how a wish ended up on the company calendar.
  requested_date: string | null
  scheduled_date: string | null; scheduled_time: string | null; completed_date: string | null
  booked_with: string | null; booking_reference: string | null
  booked_at: string | null; booked_by_name: string | null
  inspector_name: string | null; inspector_phone: string | null; scheduling_phone: string | null
  scheduler_profile_id: string | null; scheduler_name: string | null; requested_by_name: string | null
  notes: string | null; ready_marked_by: string | null; ready_marked_at: string | null
  failure_reason?: string | null; voided_at?: string | null; voided_by?: string | null
  card_image_url: string | null; created_at: string
}

interface Teammate { id: string; full_name: string | null; email: string }

export default function InspectionsPage({ params }: { params: { id: string } }) {
  const guardDelete = useDeleteGuard()
  const supabase = createClient()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [currentUser, setCurrentUser] = useState('')
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null)
  const cardInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [editingInsp, setEditingInsp] = useState<Inspection | null>(null)

  // Form
  // EMPTY, not 'Foundation'. A blank submit created an inspection called
  // "Foundation" that nobody had named AND notified three schedulers about
  // it. The `required` on the select below could never fire while the state
  // started on a value.
  const [inspType, setInspType] = useState('')
  const [trade, setTrade] = useState('')
  // The REQUEST form asks when you need it by. It never sets the booked date -
  // booking is a separate act with its own dialog, because it is a thing a
  // person did on the phone rather than a box on a request.
  const [requestedDate, setRequestedDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [inspectorPhone, setInspectorPhone] = useState('')
  const [schedulingPhone, setSchedulingPhone] = useState('')
  const [schedulerId, setSchedulerId] = useState('')
  const [notes, setNotes] = useState('')
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Who will hear about this request. Asked for once and shown under the
  // assignee, because the form used to let you create an inspection nobody was
  // told about - the exact thing Settings refuses to let an admin configure.
  // `null` means we could not work it out, which is NOT the same fact as
  // "nobody", and the two must not render the same way.
  const [myId, setMyId] = useState('')
  const [routedIds, setRoutedIds] = useState<string[] | null>(null)

  // Voided inspections are kept for the record and hidden from the working
  // list. A notification linking to one has to be able to reveal it, or the
  // bell points at a row nobody can see.
  const [showVoided, setShowVoided] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Marking Failed asks WHY before it saves. A failure with no reason is the
  // least useful record in the app.
  const [voiding, setVoiding] = useState<Inspection | null>(null)
  const [failing, setFailing] = useState<Inspection | null>(null)
  const [failReason, setFailReason] = useState('')

  // BOOKING IS A STEP, NOT A PILL. Tapping "Scheduled" used to flip the status
  // on the spot, and its only guard was "is there a date?" - which the
  // REQUESTER had already satisfied by typing the date they wanted. So one tap
  // turned somebody's preference into a confirmed appointment that nobody had
  // arranged, and the Master Calendar and everyone's ICS feed showed it as one.
  const [booking, setBooking] = useState<Inspection | null>(null)
  const [bookDate, setBookDate] = useState('')
  const [bookTime, setBookTime] = useState('')
  const [bookWith, setBookWith] = useState('')
  const [bookRef, setBookRef] = useState('')
  const [bookError, setBookError] = useState<string | null>(null)
  const [bookSaving, setBookSaving] = useState(false)

  // Who to call, gathered from this job's permits and the Directory rather
  // than retyped into every request. Sent with the list by the same route, so
  // the card and the notification cannot offer two different numbers.
  const [callTargets, setCallTargets] = useState<CallTarget[]>([])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchInspections(voided = showVoided) {
    const token = await getToken()
    const res = await fetch(
      `/api/projects/${params.id}/inspections${voided ? '?voided=1' : ''}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.ok) {
      const d = await res.json()
      setInspections(d.inspections ?? [])
      setCallTargets(d.callTargets ?? [])
    }
    setLoading(false)
  }

  async function fetchTeammates() {
    const token = await getToken()
    const res = await fetch('/api/settings/teammates', { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setTeammates(d.teammates ?? d.members ?? []) }
  }

  async function fetchRoutedAudience() {
    try {
      const token = await getToken()
      const res = await fetch('/api/notifications/audience?type=inspection_to_schedule', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setRoutedIds(null); return }
      setRoutedIds((await res.json()).userIds ?? [])
    } catch {
      setRoutedIds(null)
    }
  }

  // A notification links to `?inspection=<id>`. If that row has since been
  // voided it is not in the default list, so the bell would point at nothing -
  // which is the whole reason voiding beats deleting. Ask for voided rows too
  // when we have been sent to a specific one, and open it.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('inspection')
    if (!wanted) return
    setShowVoided(true)
    setExpanded(wanted)
    fetchInspections(true)
  }, [])

  useEffect(() => {
    fetchInspections()
    fetchTeammates()
    fetchRoutedAudience()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setCurrentUser(session.user.email)
      if (session?.user?.id) setMyId(session.user.id)
    })
  }, [params.id])

  // AFTER the inspection happens: attach the inspector's card/paper. AI reads it
  // and fills any blank fields, and offers to set the pass/fail result.
  async function uploadCard(insp: Inspection, file: File) {
    setUploadingCardId(insp.id)
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}/card`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    const data = await res.json().catch(() => ({}))
    setUploadingCardId(null)
    // #3 - a .txt upload was refused by the server with a perfectly good
    // message ("Use a photo or PDF.") and this threw it away, so nothing
    // appeared, nothing errored, and the GC believed the card was on file.
    if (!res.ok) {
      setActionError(data?.error ?? `That file would not upload (${res.status}).`)
      return
    }
    // Asked in the page, not in a native dialog. This is a question rather
    // than a delete, so the guard takes its own words - and the refresh runs
    // either way, because the card is on file whichever answer comes back.
    if (data.suggested_status && insp.status !== data.suggested_status) {
      guardDelete(() => updateStatus(insp, data.suggested_status), {
        label: 'this inspection',
        title: 'The card says otherwise',
        body: `The card looks ${String(data.suggested_status).toUpperCase()}. Mark this inspection ${data.suggested_status}?`,
        confirmLabel: `Mark ${data.suggested_status}`,
      })
      return
    }
    fetchInspections()
  }

  // The response used to be discarded entirely, so a 500 closed the modal and
  // looked exactly like success - and everything the person had typed went with
  // it. On failure the modal stays open with the message, and setSubmitting is
  // in a `finally` because a throw used to leave the button spinning for good.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    // Asked at the field before anything is sent, from the same module the
    // route asks. A blank request used to reach three schedulers.
    const problem = requestProblem(inspType, requestedDate)
    if (problem) { setSubmitError(problem); return }
    setSubmitting(true)
    try {
      const token = await getToken()

      const res = editingInsp
        ? await fetch(`/api/projects/${params.id}/inspections/${editingInsp.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            type: inspType,
            trade: trade || null,
            requested_date: requestedDate || null,
            scheduled_time: scheduledTime || null,
            inspector_name: inspectorName || null,
            inspector_phone: inspectorPhone || null,
            scheduling_phone: schedulingPhone || null,
            scheduler_profile_id: schedulerId || null,
            scheduler_name: teammates.find(t => t.id === schedulerId)?.full_name || null,
            notes: notes || null,
          }),
        })
        : await fetch(`/api/projects/${params.id}/inspections`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: buildCreateForm(),
        })

      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setSubmitError(d?.error ?? `That did not save (${res.status}). Nothing has been lost - try again.`)
        return
      }

      resetForm()
      setShowForm(false)
      fetchInspections()
    } catch {
      setSubmitError('That did not save - check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function buildCreateForm() {
    const form = new FormData()
    form.append('inspection_type', inspType)
    if (trade) form.append('trade', trade)
    if (requestedDate) form.append('requested_date', requestedDate)
    if (scheduledTime) form.append('scheduled_time', scheduledTime)
    // A REQUEST IS NEVER BORN BOOKED. This used to read
    // `scheduledDate ? 'scheduled' : ...`, so filling in the date you wanted
    // filed the inspection as already arranged - before anybody had rung
    // anyone. Booking has its own dialog and its own evidence.
    form.append('status', schedulerId ? 'requested' : 'not_scheduled')
    if (inspectorName) form.append('inspector_name', inspectorName)
    if (inspectorPhone) form.append('inspector_phone', inspectorPhone)
    if (schedulingPhone) form.append('scheduling_phone', schedulingPhone)
    if (schedulerId) { form.append('scheduler_profile_id', schedulerId); form.append('scheduler_name', teammates.find(t => t.id === schedulerId)?.full_name || '') }
    if (notes) form.append('notes', notes)
    return form
  }

  function resetForm() {
    setEditingInsp(null)
    setInspType(''); setTrade(''); setRequestedDate(''); setScheduledTime('')
    setInspectorName(''); setInspectorPhone(''); setSchedulingPhone(''); setSchedulerId(''); setNotes('')
  }

  async function updateStatus(insp: Inspection, newStatus: string, reason?: string) {
    // Failed asks WHY before it saves. The server refuses a failure with no
    // reason too - a rule enforced only in a form is not a rule.
    if (newStatus === 'failed' && !reason && !insp.failure_reason) {
      setFailReason(''); setFailing(insp); return
    }
    // "Scheduled" asks what the inspector actually told you. Same shape as
    // Failed above and for the same reason: the status CLAIMS something
    // happened, so the thing that happened has to be recorded with it.
    if (newStatus === 'scheduled' && !insp.booked_with) {
      openBooking(insp); return
    }
    setActionError(null)
    const token = await getToken()
    // The DAY this happened, from the browser, because only the browser knows
    // which day the person is having. The server derived it from
    // `new Date().toISOString()` - that is UTC's day, so an inspection marked
    // passed on a west-coast evening was stamped tomorrow. The mirror image of
    // the render bug, and it never showed up because the render bug was
    // shifting it back again.
    const completed = newStatus === 'passed' || newStatus === 'failed'
      ? { completed_date: todayDateInput() }
      : {}
    const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus, ...completed, ...(reason ? { failure_reason: reason } : {}) }),
    })
    // The server now REFUSES some of these - "scheduled" with no date, "failed"
    // with no reason. A refusal the screen throws away is a button that looks
    // like it worked, which is how the invalid states got in.
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setActionError(d?.error ?? `That did not save (${res.status}).`)
      return
    }
    fetchInspections()
  }

  function openBooking(insp: Inspection) {
    setBookError(null)
    // Prefilled with the date they ASKED for, because it is usually the date
    // you ask the township for - but it is an editable starting point, not the
    // answer. The point of the dialog is that somebody types what they were
    // actually given.
    setBookDate(insp.scheduled_date ?? insp.requested_date ?? '')
    setBookTime(insp.scheduled_time ?? '')
    setBookWith(insp.booked_with ?? '')
    setBookRef(insp.booking_reference ?? '')
    setBooking(insp)
  }

  async function saveBooking(e: React.FormEvent) {
    e.preventDefault()
    const insp = booking
    if (!insp) return
    setBookError(null)
    // Asked at the field before anything is sent, from the same module the
    // route asks - a server's answer can only ever arrive as a message about a
    // whole request that did not happen.
    const problem = scheduleProblem('scheduled', bookDate, bookWith)
    if (problem) { setBookError(problem); return }
    setBookSaving(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          status: 'scheduled',
          scheduled_date: bookDate,
          scheduled_time: bookTime || null,
          booked_with: bookWith.trim(),
          booking_reference: bookRef.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setBookError(d?.error ?? `That did not save (${res.status}). Nothing has been lost - try again.`)
        return
      }
      setBooking(null)
      fetchInspections()
    } catch {
      setBookError('That did not save - check your connection and try again.')
    } finally {
      setBookSaving(false)
    }
  }

  function openEditInsp(insp: Inspection) {
    setEditingInsp(insp)
    setInspType(insp.type)
    setTrade(insp.trade ?? '')
    setRequestedDate(insp.requested_date ?? '')
    setScheduledTime(insp.scheduled_time ?? '')
    setInspectorName(insp.inspector_name ?? '')
    setInspectorPhone(insp.inspector_phone ?? '')
    setSchedulingPhone(insp.scheduling_phone ?? '')
    setSchedulerId(insp.scheduler_profile_id ?? '')
    setNotes(insp.notes ?? '')
    setShowForm(true)
  }

  // Void, not delete. It stays on the record - which is the point of keeping a
  // compliance history at all - and it can be put back.
  //
  // Its own inline confirmation rather than the shared guard, because "Confirm
  // delete" and "This can't be undone" are both untrue here - a reversible
  // action described as permanent is the same kind of lie as a failed save that
  // looks like a success. (The guard takes `title`/`body`/`confirmLabel` now,
  // so this could move over; it stays inline only because the void row already
  // has a good in-place confirmation of its own.)
  async function voidInsp(insp: Inspection) {
    setVoiding(null)
    setActionError(null)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setActionError(d?.error ?? `Could not void that (${res.status}).`)
      return
    }
    fetchInspections()
  }

  async function restoreInsp(insp: Inspection) {
    setActionError(null)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'restore' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setActionError(d?.error ?? `Could not restore that (${res.status}).`)
      return
    }
    fetchInspections()
  }

  async function markReady(insp: Inspection) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/inspections/${insp.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ready_marked_by: currentUser, ready_marked_at: new Date().toISOString() }),
    })
    fetchInspections()
  }

  // From the shared sets, so this and the project Overview cannot disagree
  // about what is outstanding. They already had: the Overview counted only
  // 'requested' while this counted four statuses.
  const pending = inspections.filter(i => (OPEN as readonly string[]).includes(i.status))
  const completed = inspections.filter(i => (CLOSED as readonly string[]).includes(i.status))
  const voided = inspections.filter(i => isVoid(i.status))

  function InspCard({ insp }: { insp: Inspection }) {
    const isExpanded = expanded === insp.id
    const cfg = STATUS_CONFIG[insp.status] ?? STATUS_CONFIG.not_scheduled
    const Icon = cfg.icon
    const dates = inspectionDate(insp)
    const needsBookingCall = !dates.confirmed && !isVoid(insp.status) && insp.status !== 'passed' && insp.status !== 'failed'
    // The numbers this card offers: what the inspection itself carries, then
    // the job's permits and Directory, deduped. ONE list - the details grid
    // used to print the first two a band above the second lot.
    const calls = callTargetsFor(needsBookingCall ? insp : null, callTargets)
    // A result can only be recorded for a visit somebody arranged. Offering
    // Passed on an inspection nobody booked is half of what made the old strip
    // of five pills read as a free-for-all.
    const booked = !!insp.scheduled_date && !isVoid(insp.status)
    const canRecordResult = booked && insp.status !== 'passed' && insp.status !== 'failed'
    // No card exists before the visit could have happened, so the upload block
    // is not shown for a request - it stays in the menu, where nothing is lost.
    const showCardBlock = !!insp.card_image_url || booked || insp.status === 'passed' || insp.status === 'failed'

    // NO `overflow-hidden` ON THE CARD, AND THAT IS LOAD-BEARING. The action
    // row at the foot of it ends in a RowMenu whose panel is `absolute` inside
    // this card, and `overflow-hidden` clips on BOTH axes - so the menu would
    // be sliced off at the card's bottom edge with every class on it
    // individually correct and nothing there to click. It was only ever here
    // to round the header button's corners against the card, which the two
    // children that touch an edge now do themselves. Measured in
    // overlay-geometry.ts with `elementFromPoint`, because clipping is a PAINT
    // operation: a clipped panel still reports its full bounding rect, so
    // measuring the panel proves nothing at all.
    return (
      <div className={cn('rounded-xl border bg-panel',
        isVoid(insp.status) ? 'border-dashed border-line opacity-70' : 'border-line')}>
        {isVoid(insp.status) && (
          <p className="rounded-t-xl bg-muted px-5 py-2 text-xs text-muted-fg">
            Voided{insp.voided_at ? ` on ${formatDate(insp.voided_at)}` : ''}. Kept for the record — Restore puts it back.
          </p>
        )}
        <button className={cn('w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left',
          isVoid(insp.status) ? '' : 'rounded-t-xl', isExpanded ? '' : 'rounded-b-xl')}
          onClick={() => setExpanded(isExpanded ? null : insp.id)}>
          <Icon className={cn('h-5 w-5 shrink-0', insp.status === 'passed' ? 'text-success' : insp.status === 'failed' ? 'text-danger' : insp.status === 'scheduled' ? 'text-info' : 'text-faint')} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-ink">{insp.type}</span>
              {insp.trade && <span className="whitespace-nowrap text-xs bg-muted text-muted-fg rounded-full px-2 py-0.5">{insp.trade}</span>}
              <span className={cn('whitespace-nowrap text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
              {insp.ready_marked_by && insp.status === 'scheduled' && (
                <span className="whitespace-nowrap text-xs font-medium bg-success-tint border border-success/30 text-success rounded-full px-2 py-0.5">Ready ✓</span>
              )}
            </div>
            <p className="text-xs text-faint mt-0.5 wrap-anywhere">
              {/* "Needed by" until somebody books it, "Confirmed for" after.
                  One definition (inspectionDate), because the whole bug was a
                  wish wearing the word "Scheduled". */}
              {dates.value
                ? `${dates.label} ${formatDate(dates.value)}${dates.confirmed && insp.scheduled_time ? ` ${insp.scheduled_time}` : ''}`
                : 'No date yet'}
              {dates.confirmed && insp.booked_with && ` · booked with ${insp.booked_with}`}
              {!dates.confirmed && insp.inspector_name && ` · ${insp.inspector_name}`}
              {insp.status === 'requested' && insp.scheduler_name && ` · ${insp.scheduler_name} to book`}
            </p>
          </div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-line-soft px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm [&>div]:min-w-0 [&>div]:[overflow-wrap:anywhere]">
              {/* BOTH dates, never one pretending to be the other. The
                  requested one stays visible after booking, because "we asked
                  for the 25th and got the 30th" is the fact somebody in the
                  field needs and it used to be overwritten. */}
              {insp.requested_date && (
                <div><p className="text-xs text-faint">Needed by</p><p className="font-medium text-ink-soft">{formatDate(insp.requested_date)}</p></div>
              )}
              {insp.scheduled_date && (
                <div><p className="text-xs text-faint">Confirmed for</p><p className="font-medium text-ink-soft">{formatDate(insp.scheduled_date)}{insp.scheduled_time ? ` · ${insp.scheduled_time}` : ''}</p></div>
              )}
              {insp.booked_with && (
                <div><p className="text-xs text-faint">Booked with</p><p className="font-medium text-ink-soft">{insp.booked_with}</p></div>
              )}
              {insp.booking_reference && (
                <div><p className="text-xs text-faint">Confirmation no.</p><p className="font-medium text-ink-soft">{insp.booking_reference}</p></div>
              )}
              {insp.booked_at && (
                <div><p className="text-xs text-faint">Booked</p><p className="font-medium text-ink-soft">{formatDate(insp.booked_at)}{insp.booked_by_name ? ` by ${insp.booked_by_name}` : ''}</p></div>
              )}
              {insp.failure_reason && (
                <div className="col-span-2"><p className="text-xs text-faint">Why it failed</p><p className="font-medium text-danger break-words wrap-anywhere">{insp.failure_reason}</p></div>
              )}
              {insp.completed_date && (
                <div><p className="text-xs text-faint">Completed</p><p className="font-medium text-ink-soft">{formatDate(insp.completed_date)}</p></div>
              )}
              {insp.scheduler_name && (
                <div><p className="text-xs text-faint">Scheduler</p><p className="font-medium text-ink-soft">{insp.scheduler_name}</p></div>
              )}
              {insp.requested_by_name && (
                <div><p className="text-xs text-faint">Requested by</p><p className="font-medium text-ink-soft">{insp.requested_by_name}</p></div>
              )}
              {/* Marked ready is a FACT about the visit, like the ones beside
                  it - it had its own green band saying what the header's
                  "Ready" badge already says. */}
              {insp.ready_marked_by && (
                <div>
                  <p className="text-xs text-faint">Marked ready</p>
                  <p className="font-medium text-success">
                    {insp.ready_marked_by}{insp.ready_marked_at ? ` · ${formatDate(insp.ready_marked_at)}` : ''}
                  </p>
                </div>
              )}
              {/* The numbers live in ONE place. While the call block is
                  showing they are in it; once the inspection is booked the
                  block is gone and the inspector is a fact about the visit. */}
              {!needsBookingCall && insp.inspector_name && (
                <div>
                  <p className="text-xs text-faint">Inspector</p>
                  <p className="font-medium text-ink-soft">{insp.inspector_name}</p>
                  {insp.inspector_phone && (
                    <a href={`tel:${insp.inspector_phone}`} className="flex items-center gap-1 text-xs text-accent-fg hover:underline mt-0.5">
                      <Phone className="h-3 w-3" />{insp.inspector_phone}
                    </a>
                  )}
                </div>
              )}
              {!needsBookingCall && insp.scheduling_phone && (
                <div>
                  <p className="text-xs text-faint">Schedule Inspection</p>
                  <a href={`tel:${insp.scheduling_phone}`} className="flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
                    <Phone className="h-3.5 w-3.5" />{insp.scheduling_phone}
                  </a>
                </div>
              )}
              {/* THE ORPHAN. `notes` was a bare paragraph floating mid-card
                  while every other fact carried a label above it - reported as
                  a lowercase line that does not say what it is. */}
              {insp.notes && (
                <div className="col-span-2 md:col-span-3">
                  <p className="text-xs text-faint">Notes</p>
                  <p className="font-medium text-ink-soft break-words wrap-anywhere">{insp.notes}</p>
                </div>
              )}
            </div>

            {/* THE QUESTION NOTHING ON THIS SCREEN ANSWERED: "the inspector got
                the notification - now what?" Nobody emailed an inspector; the
                notification went to whoever books inspections here. So the card
                says that outright, and hands over the numbers the job already
                knows rather than expecting the person who raised the request to
                have typed the township's scheduling line from memory. */}
            {needsBookingCall && (
              <div className="rounded-lg border border-line bg-surface px-3 py-3 space-y-2">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Somebody has to call this in</p>
                  <p className="text-xs text-muted-fg">
                    SyteNav does not contact the inspector. Ring the jurisdiction, then press Book it and
                    record the date and who you spoke to.
                  </p>
                </div>
                {calls.length > 0 ? (
                  <ul className="space-y-1.5">
                    {calls.slice(0, 4).map((t, idx) => (
                      <li key={`${t.name}-${idx}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {t.phone ? (
                          <a href={`tel:${t.phone}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent-fg hover:underline">
                            <Phone className="h-3.5 w-3.5" />{t.phone}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-ink-soft">{t.name}</span>
                        )}
                        <span className="text-xs text-faint wrap-anywhere">
                          {t.phone ? `${t.name} · ${t.source}` : t.source}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-faint">
                    No number on file. Add the issuing authority and inspector to the permit, or add an
                    inspector in the Directory, and it will show up here on every inspection.
                  </p>
                )}
              </div>
            )}

            {/* MOUNTED IN EVERY STATE, outside the block below. The menu's
                "Add inspector's card" clicks this input, and an input that only
                exists when the block is shown is a menu item that does nothing
                on exactly the states the block is hidden for. */}
            <input type="file" {...{ accept: ACCEPT_SCAN }} className="sr-only"
              ref={el => { cardInputRefs.current[insp.id] = el }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadCard(insp, f); e.target.value = '' }} />

            {insp.card_image_url && (
              <a href={insp.card_image_url} target="_blank" rel="noopener noreferrer" className="block">
                <img src={insp.card_image_url} alt="Inspection card" className="rounded-lg border border-line max-h-48 object-contain w-auto" />
                <p className="text-xs text-accent-fg mt-1 hover:underline">View full image ↗</p>
              </a>
            )}

            {/* Add the inspector's card/paper after the inspection happens -
                and NOT before. On a request it was a band of the card offering
                to upload paperwork for a visit nobody has booked. It is in the
                menu in every state, so gating the block hides nothing. */}
            {showCardBlock && (
            <div className="rounded-lg border border-dashed border-line-soft bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-ink-soft">{insp.card_image_url ? "Inspector's card attached" : "Inspector's card / paperwork"}</p>
                  <p className="text-xs text-faint">Upload the card you got from the inspector - AI reads it and fills the details.</p>
                </div>
                <button type="button" disabled={uploadingCardId === insp.id}
                  onClick={() => cardInputRefs.current[insp.id]?.click()}
                  className="flex items-center gap-2 rounded-md border border-muted2 bg-panel px-3 py-1.5 text-xs font-medium text-ink-soft hover:bg-surface hover:border-accent disabled:opacity-50">
                  {uploadingCardId === insp.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> {insp.card_image_url ? 'Replace card' : "Add inspector's card"}</>}
                </button>
              </div>
            </div>
            )}

            {/* ONE ACTION ROW. There used to be two-and-a-half: a pair of
                buttons, a strip of five status pills labelled "Update status:",
                and two loose icons. The strip was a SECOND DOOR to booking -
                reported as exactly that - and a control that quietly redirects
                somewhere else is worse than one that is gone: it teaches the
                old habit and it is one refactor away from being the bug again.
                Booking has one door now, and `openBooking` is the only path
                into `scheduled` from this screen.

                One primary action, named for what the inspection needs next,
                and the rest behind RowMenu - the same cure client invoices and
                bid invites already use. */}
            <div className="row-even lg:flex lg:items-center gap-2">
              {isVoid(insp.status) ? (
                <Button size="sm" onClick={() => restoreInsp(insp)}>
                  <Undo2 className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : !booked ? (
                <Button size="sm" onClick={() => openBooking(insp)}>
                  <Calendar className="h-3.5 w-3.5" /> Book it
                </Button>
              ) : !insp.ready_marked_by && canRecordResult ? (
                <Button size="sm" onClick={() => markReady(insp)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark ready for inspection
                </Button>
              ) : null}

              {/* A result can only be recorded for a visit somebody arranged. */}
              {canRecordResult && (
                <>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(insp, 'passed')}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Passed
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus(insp, 'failed')}>
                    <XCircle className="h-3.5 w-3.5 text-danger" /> Failed
                  </Button>
                </>
              )}

              <div className="lg:ml-auto flex justify-end">
                <RowMenu label={`More for the ${insp.type} inspection`}>
                  {close => (
                    <>
                      {booked && !isVoid(insp.status) && (
                        <MenuItem onClick={() => { openBooking(insp); close() }}>
                          <Calendar className="h-3.5 w-3.5" /> Change the booking
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => { cardInputRefs.current[insp.id]?.click(); close() }}>
                        <Upload className="h-3.5 w-3.5" /> {insp.card_image_url ? "Replace inspector's card" : "Add inspector's card"}
                      </MenuItem>
                      {!isVoid(insp.status) && insp.status !== 'pending_reinspection' && (
                        <MenuItem onClick={() => { updateStatus(insp, 'pending_reinspection'); close() }}>
                          <RotateCcw className="h-3.5 w-3.5" /> Needs re-inspection
                        </MenuItem>
                      )}
                      {booked && (
                        <MenuItem onClick={() => { updateStatus(insp, 'requested'); close() }}>
                          <Undo2 className="h-3.5 w-3.5" /> Back to requested — clears the booking
                        </MenuItem>
                      )}
                      <MenuItem onClick={() => { openEditInsp(insp); close() }}>
                        <Pencil className="h-3.5 w-3.5" /> Edit inspection
                      </MenuItem>
                      {isVoid(insp.status) ? (
                        <MenuItem onClick={() => { restoreInsp(insp); close() }}>
                          <Undo2 className="h-3.5 w-3.5" /> Restore
                        </MenuItem>
                      ) : (
                        <MenuItem danger onClick={() => { setVoiding(insp); close() }}>
                          <Trash2 className="h-3.5 w-3.5" /> Void inspection
                        </MenuItem>
                      )}
                    </>
                  )}
                </RowMenu>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-0 lg:p-6 space-y-5">
      {actionError && (
        <p role="alert" className="rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
          {actionError}
        </p>
      )}

      {/* Void, described truthfully. It is reversible, and saying otherwise
          would be the same lie as a failed save that looks like a success. */}
      {voiding && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h2 className="font-semibold text-ink flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-danger" /> Void this inspection?
            </h2>
            <p className="text-sm text-muted-fg">
              <span className="font-medium text-ink-soft">{voiding.type}{voiding.trade ? ` (${voiding.trade})` : ''}</span> stays
              on the record and drops out of the working list. It shows under “Show voided”, and you can restore it.
            </p>
            <div className="row-even lg:flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setVoiding(null)}>Cancel</Button>
              <Button type="button" onClick={() => voidInsp(voiding)}>Void it</Button>
            </div>
          </div>
        </div>
      )}

      {/* A failure with no reason is the least useful record in the app, and
          "what keeps failing" is a question a GC actually asks. */}
      {failing && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <h2 className="font-semibold text-ink">Why did it fail?</h2>
            <p className="text-sm text-muted-fg">
              {failing.type}{failing.trade ? ` (${failing.trade})` : ''} — what did the inspector call out?
            </p>
            <textarea
              value={failReason} onChange={e => setFailReason(e.target.value)} rows={3} autoFocus={autoFocusOnDesktop()}
              placeholder="e.g. Missing fire blocking at the second-floor chase"
              className="w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
            <div className="row-even lg:flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setFailing(null)}>Cancel</Button>
              <Button
                type="button"
                disabled={!failReason.trim()}
                onClick={() => { const i = failing; const r = failReason.trim(); setFailing(null); updateStatus(i, 'failed', r) }}
              >
                Mark failed
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* WHAT THE INSPECTOR TOLD YOU. The status used to flip on a tap, guarded
          only by "is there a date?" - and there always was one, because the
          requester had typed the date they wanted into the same column. A
          booking is a thing a person did on the phone, so it is recorded like
          one: the date you were given, and who gave it to you. */}
      {booking && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-md overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Book this inspection</h2>
              <button type="button" onClick={() => setBooking(null)} className="text-faint hover:text-muted-fg" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveBooking}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <p className="rounded-lg bg-surface border border-line-soft px-3 py-2 text-xs text-muted-fg">
                  {booking.type}{booking.trade ? ` (${booking.trade})` : ''}
                  {booking.requested_date ? ` — needed by ${formatDate(booking.requested_date)}.` : '.'}{' '}
                  Fill this in after you have called. It is what makes the inspection appear on the calendar
                  as a real appointment.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Date they gave you <span className="text-danger">*</span></Label>
                    <Input type="date" value={bookDate} onChange={e => setBookDate(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Time / window <span className="text-faint font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. 8-12 AM" value={bookTime} onChange={e => setBookTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Who you spoke to <span className="text-danger">*</span></Label>
                  <Input placeholder="e.g. Newark Building Dept — Maria at the desk" value={bookWith} onChange={e => setBookWith(e.target.value)} />
                  <p className="text-xs text-faint">The office or the person. This is what tells everyone it was actually booked.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmation no. <span className="text-faint font-normal">(optional)</span></Label>
                  <Input placeholder="Whatever reference they read out" value={bookRef} onChange={e => setBookRef(e.target.value)} />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft space-y-2">
                {bookError && <p role="alert" className="text-sm text-danger">{bookError}</p>}
                <div className="row-even lg:flex lg:justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setBooking(null)}>Cancel</Button>
                  <Button type="submit" disabled={bookSaving}>{bookSaving ? 'Saving...' : 'Save booking'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editingInsp ? 'Edit Inspection' : 'Request Inspection'}</h2>
              <button onClick={() => { setShowForm(false); setEditingInsp(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                {!editingInsp && (
                  <p className="rounded-lg bg-surface border border-line-soft px-3 py-2 text-xs text-muted-fg">
                    This asks somebody here to book it — SyteNav does not contact the inspector. Whoever books it
                    calls the jurisdiction and records the date they are given. Once it happens, upload the
                    inspector's card to record the result.
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspection Type <span className="text-danger">*</span></Label>
                    <SearchableSelect value={inspType} onChange={e => setInspType(e.target.value)} required
                      className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                      <option value="">-- Select inspection --</option>
                      {INSPECTION_TYPES.map(t => <option key={t}>{t}</option>)}
                    </SearchableSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
                    <Input placeholder="e.g. Electrical" value={trade} onChange={e => setTrade(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Date needed by <span className="text-danger">*</span></Label>
                    <Input type="date" value={requestedDate} onChange={e => setRequestedDate(e.target.value)} />
                    <p className="text-xs text-faint">When you need it on site. The booked date comes back from the inspector.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Preferred time <span className="text-faint font-normal">(optional)</span></Label>
                    <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Who schedules this? <span className="text-faint font-normal">(they get notified)</span></Label>
                  <SearchableSelect value={schedulerId} onChange={e => setSchedulerId(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">No one assigned yet</option>
                    {teammates.map(t => <option key={t.id} value={t.id}>{t.full_name || t.email}</option>)}
                  </SearchableSelect>
                  <WhoWillHear routedIds={routedIds} schedulerId={schedulerId} myId={myId} teammates={teammates} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Inspector Name</Label>
                    <ContactPicker
                      filterType="inspector"
                      value={inspectorName}
                      onChange={name => setInspectorName(name)}
                      onPhoneChange={phone => setInspectorPhone(phone)}
                      placeholder="Search inspectors…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Inspector Phone</Label>
                    <Input type="tel" placeholder="Direct line" value={inspectorPhone} onChange={e => setInspectorPhone(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label><Phone className="inline h-3.5 w-3.5 mr-1 text-faint" />Scheduling Phone</Label>
                  <Input type="tel" placeholder="Number to call to order inspection" value={schedulingPhone} onChange={e => setSchedulingPhone(e.target.value)} />
                  <p className="text-xs text-faint">Both GC and subs can see this to call and order the inspection</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <textarea rows={2} placeholder="Any notes about this inspection..." value={notes} onChange={e => setNotes(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft flex flex-wrap items-center gap-2 justify-end">
                {submitError && (
                  <p role="alert" className="mr-auto text-sm text-danger">{submitError}</p>
                )}
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setEditingInsp(null) }}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : editingInsp ? 'Save Changes' : 'Request Inspection'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Inspections</h1>
          <p className="text-sm text-muted-fg mt-0.5">Track all required inspections, status, and inspector contacts.</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Voided rows are kept, not destroyed - so there has to be a way to
              look at them, or "kept for the record" is a claim nobody can check. */}
          <label className="flex items-center gap-1.5 text-xs text-muted-fg cursor-pointer select-none">
            <input
              type="checkbox" checked={showVoided}
              onChange={e => { setShowVoided(e.target.checked); fetchInspections(e.target.checked) }}
              className="rounded border-muted2"
            />
            Show voided
          </label>
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Request Inspection</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : inspections.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <ClipboardCheck className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No inspections added yet</p>
          <p className="text-xs text-faint mt-1">Add all required inspections for this project to track status.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Pending ({pending.length})</p>
              {pending.map(i => <InspCard key={i.id} insp={i} />)}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Completed ({completed.length})</p>
              {completed.map(i => <InspCard key={i.id} insp={i} />)}
            </div>
          )}
          {voided.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Voided ({voided.length})</p>
              {voided.map(i => <InspCard key={i.id} insp={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Who will actually be told, said before the button is pressed.
 *
 * THE BUG. Requesting an inspection with nobody assigned created it and
 * notified nobody, with no warning - because the create route wrapped its whole
 * notification block in `if (scheduler_profile_id)`, so a blank assignee
 * suppressed the routed audience too. Settings carefully refuses to store an
 * empty audience on the grounds that it "would stop the notification without
 * saying so", and then this form did exactly that through a different door.
 *
 * It also answers the question nothing on screen answered: assigning somebody
 * ADDS them to the routed list, it does not replace it. That was unverifiable
 * from outside without reading four people's inboxes.
 *
 * The union is `withStructural` - the same function the routes send through, so
 * this cannot drift into a second opinion about who hears what.
 *
 * Loading, failed and nobody are three different facts and render as three
 * different sentences. Collapsing the middle one into "nobody" would be a
 * confident wrong answer about whether a request is going to reach anyone.
 */
function WhoWillHear({ routedIds, schedulerId, myId, teammates }: {
  routedIds: string[] | null
  schedulerId: string
  myId: string
  teammates: Teammate[]
}) {
  if (routedIds === null) {
    return (
      <p className="text-xs text-faint">
        Assign the person who books inspections. We could not work out who else will be told —
        check Settings → Notifications → Who gets told.
      </p>
    )
  }

  const will = withStructural(routedIds, [schedulerId], myId)
  const nameOf = (id: string) => {
    const t = teammates.find(x => x.id === id)
    return t?.full_name || t?.email || 'a teammate'
  }

  if (!will.length) {
    return (
      <p className="text-xs text-warn">
        Nobody will be told. Assign somebody above, or set who hears about inspections in
        Settings → Notifications → Who gets told.
      </p>
    )
  }

  const names = will.map(nameOf)
  const listed = names.length <= 3
    ? names.join(names.length === 2 ? ' and ' : ', ').replace(/, ([^,]*)$/, ' and $1')
    : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`

  return (
    <p className="text-xs text-muted-fg">
      {listed} will be told{names.length > 1 ? ` — ${names.length} people` : ''}.
      {schedulerId && ' Assigning somebody adds them; it does not replace the rest.'}
    </p>
  )
}
