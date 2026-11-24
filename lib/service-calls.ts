// ─────────────────────────────────────────────────────────────────────────────
// SERVICE CALLS - the rules, pure, so every one is a test
// (lib/__tests__/service-calls.ts). The routes ask these; the screens ask the
// same ones, so the refusal is on the control rather than arriving as a failed
// request.
//
// Spec "Sub company login + dispatch", items 3-5. A call belongs to the SUB's
// company. A call tied to a GC's job is a LINK only, and the GC sees its
// status, never the sub's notes, customer or contact (`gcView`). There is no
// price on a call at all, so there is nothing to leak.
// ─────────────────────────────────────────────────────────────────────────────

export const CALL_STATUSES = ['new', 'scheduled', 'en_route', 'on_site', 'done', 'invoiced'] as const
export type CallStatus = (typeof CALL_STATUSES)[number]

export const CALL_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const
export type CallPriority = (typeof CALL_PRIORITIES)[number]

export const STATUS_LABEL: Record<CallStatus, string> = {
  new: 'New',
  scheduled: 'Scheduled',
  en_route: 'En route',
  on_site: 'On site',
  done: 'Done',
  invoiced: 'Invoiced',
}

export const PRIORITY_LABEL: Record<CallPriority, string> = {
  low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent',
}

/**
 * Where a call may go from where it is. Forward one step, or BACK one step -
 * a crew member who pressed On site at the wrong house has to be able to say
 * so, and the move back is recorded like any other (a retraction is an event
 * too). Nothing skips: a call is not Done without anybody having been there.
 * `scheduled -> new` is unscheduling: it clears the slot and the crew member.
 */
const MOVES: Record<CallStatus, CallStatus[]> = {
  new: ['scheduled'],
  scheduled: ['en_route', 'new'],
  en_route: ['on_site', 'scheduled'],
  on_site: ['done', 'en_route'],
  done: ['invoiced', 'on_site'],
  invoiced: ['done'],
}

export function nextStatuses(from: CallStatus): CallStatus[] {
  return MOVES[from] ?? []
}

/** The states that claim a crew member and a time. */
const BOOKED = new Set<CallStatus>(['scheduled', 'en_route', 'on_site'])

export type CallFields = {
  customer_name?: string | null
  site_address?: string | null
  issue?: string | null
  priority?: string | null
  status?: string | null
  assigned_to?: string | null
  scheduled_start?: string | null
  scheduled_end?: string | null
  completion_notes?: string | null
  source?: string | null
  gc_project_id?: string | null
}

const blank = (v: unknown) => String(v ?? '').trim() === ''

/**
 * What is wrong with a call as it would be stored, or null. Asked by the form
 * AND the route. A status that CLAIMS something has to carry it: Scheduled
 * names who and when, Done says what was done.
 */
export function callProblem(c: CallFields): string | null {
  if (blank(c.customer_name)) return 'Who is the call for? Add the customer.'
  if (blank(c.site_address)) return 'Where is it? Add the site address.'
  if (blank(c.issue)) return 'What is the problem? Describe the issue.'
  if (c.priority && !(CALL_PRIORITIES as readonly string[]).includes(c.priority)) return 'That is not a priority.'
  const status = (c.status ?? 'new') as CallStatus
  if (!(CALL_STATUSES as readonly string[]).includes(status)) return 'That is not a call status.'
  if (c.scheduled_start && c.scheduled_end && new Date(c.scheduled_end).getTime() <= new Date(c.scheduled_start).getTime()) {
    return 'The finish has to be after the start.'
  }
  if (BOOKED.has(status)) {
    if (blank(c.assigned_to)) return `A ${STATUS_LABEL[status].toLowerCase()} call needs somebody on it. Pick a crew member.`
    if (blank(c.scheduled_start)) return `A ${STATUS_LABEL[status].toLowerCase()} call needs a time. Set when it starts.`
  }
  if ((status === 'done' || status === 'invoiced') && blank(c.completion_notes)) {
    return 'Say what was done before closing the call.'
  }
  if (c.source === 'gc_job' && blank(c.gc_project_id)) return 'Which contractor job is this call for?'
  return null
}

/**
 * May this person make this move on this call? `crew` is an assigned-only
 * role: it moves only its OWN calls, only through the field steps, and never
 * marks a call invoiced (that is the office's).
 */
export function moveProblem(
  from: CallStatus, to: CallStatus,
  who: { crew: boolean; userId: string },
  call: { assigned_to: string | null },
): string | null {
  if (from === to) return null
  if (!nextStatuses(from).includes(to)) {
    return `A call cannot go from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.`
  }
  if (who.crew) {
    if (call.assigned_to !== who.userId) return 'This call is not assigned to you.'
    if (to === 'invoiced' || from === 'invoiced') return 'The office marks a call invoiced.'
    if (to === 'new') return 'The office unschedules a call.'
  }
  return null
}

/**
 * The step BUTTONS a call shows. Not the same list as `nextStatuses`:
 *
 *   - `new -> scheduled` is never a button. Scheduled is DERIVED from somebody
 *     plus a time (`withDerivedStatus`), so a call with nobody on it offered
 *     "Back to scheduled" - a button that could only ever be refused, worded
 *     as if the call had been scheduled before;
 *   - crew never mark a call invoiced, never unschedule it, and do nothing to
 *     an invoiced one (the office's, as `moveProblem` says).
 *
 * The route still asks `moveProblem`; this only decides what is OFFERED.
 */
export function offeredMoves(from: CallStatus, crew: boolean): CallStatus[] {
  return nextStatuses(from).filter(to => {
    if (from === 'new' && to === 'scheduled') return false
    if (crew && (to === 'invoiced' || to === 'new' || from === 'invoiced')) return false
    return true
  })
}

/** The forward path a call travels, for the progress bar on its page. */
export const CALL_PATH: readonly CallStatus[] = ['new', 'scheduled', 'en_route', 'on_site', 'done', 'invoiced']

// ── dispatch: double-booking ────────────────────────────────────────────────

/** A call with a start and no finish is taken to run this long. */
export const DEFAULT_CALL_MINUTES = 60

export type Slot = { id: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null; status?: string | null }

/** [start, end) in ms, or null for a call with no time. */
export function slotWindow(s: Slot): [number, number] | null {
  if (!s.scheduled_start) return null
  const a = new Date(s.scheduled_start).getTime()
  if (!Number.isFinite(a)) return null
  const b = s.scheduled_end ? new Date(s.scheduled_end).getTime() : NaN
  return [a, Number.isFinite(b) && b > a ? b : a + DEFAULT_CALL_MINUTES * 60_000]
}

/** Closed calls hold nobody's time. */
const HOLDS_TIME = (s: Slot) => !s.status || BOOKED.has(s.status as CallStatus) || s.status === 'new'

/**
 * Every call that overlaps another call for the SAME crew member, keyed by id
 * to the ids it clashes with. Touching end-to-start is not a clash: a 9-10 and
 * a 10-11 are a morning, not a double booking.
 */
export function conflicts(slots: readonly Slot[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const byPerson = new Map<string, { id: string; w: [number, number] }[]>()
  for (const s of slots) {
    if (!s.assigned_to || !HOLDS_TIME(s)) continue
    const w = slotWindow(s)
    if (!w) continue
    byPerson.set(s.assigned_to, [...(byPerson.get(s.assigned_to) ?? []), { id: s.id, w }])
  }
  for (const list of Array.from(byPerson.values())) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = [list[i], list[j]]
        if (a.w[0] < b.w[1] && b.w[0] < a.w[1]) {
          out.set(a.id, [...(out.get(a.id) ?? []), b.id])
          out.set(b.id, [...(out.get(b.id) ?? []), a.id])
        }
      }
    }
  }
  return out
}

/** Would putting `slot` where it is clash with any of `others`? The ids, or []. */
export function clashesWith(slot: Slot, others: readonly Slot[]): string[] {
  return conflicts([slot, ...others.filter(o => o.id !== slot.id)]).get(slot.id) ?? []
}

// ── what leaves the sub's company ───────────────────────────────────────────

/**
 * The whole of what a GC sees of a call tied to their job: that it exists, who
 * is doing it, where it stands and when. NOT the customer, the contact, the
 * issue as the sub wrote it, the notes, the photos or the crew member - those
 * are the sub's business records. Built field by field, never by spreading the
 * row and deleting keys, so a column added later stays private by default.
 */
export function gcView(call: {
  id: string; call_number: number; status: string; scheduled_start: string | null; scheduled_end: string | null
  completed_at: string | null; updated_at: string | null
}, companyName: string | null) {
  return {
    id: call.id,
    number: call.call_number,
    company: companyName,
    status: call.status,
    status_label: STATUS_LABEL[call.status as CallStatus] ?? call.status,
    scheduled_start: call.scheduled_start,
    scheduled_end: call.scheduled_end,
    completed_at: call.completed_at,
    updated_at: call.updated_at,
  }
}

/** Directions to the site, in whatever maps app the phone opens. */
export function directionsUrl(address: string | null | undefined): string | null {
  const a = String(address ?? '').trim()
  return a ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}` : null
}

/**
 * What to call a person on a crew list, a board column or a call. A profile
 * can carry an EMPTY name (an account made from an invite never asked for
 * one), and `full_name ?? 'Unnamed'` lets '' through - so the sub owner was a
 * blank option in the picker and a blank row on the board, which read as
 * "nobody on my team". The address is the next best thing: it is theirs, and
 * it is what the office would recognise.
 */
export function personName(p: { full_name?: string | null; email?: string | null } | null | undefined): string {
  const n = String(p?.full_name ?? '').trim()
  if (n) return n
  const e = String(p?.email ?? '').trim()
  return e || 'Unnamed'
}

/** "SC-0042". */
export const callLabel = (n: number | null | undefined) => (n ? `SC-${String(n).padStart(4, '0')}` : 'Service call')
