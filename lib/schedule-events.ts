// ─────────────────────────────────────────────────────────────────────────────
// Everything dated on a job, in one list.
//
// THE BUG. "This scheduled inspection SHOULD show on the project's calendar? If
// yes why don't I see it by September 15" - and the answer was that the job's
// calendar had never drawn an inspection in its life. The page fetched
// `/api/projects/[id]/schedule`, that route queried `schedule_items` and
// `projects` and nothing else, and the page contained ZERO references to
// inspections or tasks. Every square it could draw was a schedule bar.
//
// The omission is invisible, which is why it survived: an empty square looks
// exactly like a free day. Nobody gets an error for a calendar that answers a
// narrower question than its name promises.
//
// (The screen that DID carry booked inspections was the Master Calendar - a
// different page, and admin/manager only. So the calendar on the job, the one
// anybody would actually look at, was the one that could not show it.)
//
// Pure, so the day maths can be tested without a database and the project
// calendar cannot drift from the Today band about what "booked" means.
// ─────────────────────────────────────────────────────────────────────────────

export type EventKind = 'schedule' | 'inspection' | 'task'

export interface ScheduleItemRow {
  id: string
  label: string | null
  start_date: string
  end_date: string
  color: string | null
  subcontract_id: string | null
  subcontracts: {
    scope: string
    trade: string | null
    companies: { name: string; type?: string } | null
  } | null
}

export interface InspectionRow {
  id: string
  type?: string | null
  trade?: string | null
  status?: string | null
  scheduled_date?: string | null
  scheduled_time?: string | null
}

export interface TaskRow {
  id: string
  title?: string | null
  due_date?: string | null
  status?: string | null
}

export interface CalendarEvent {
  id: string
  kind: EventKind
  label: string
  /** The small grey half - a time, or "due". */
  detail?: string | null
  /** Inclusive at both ends. A point event has start === end. */
  start: string
  end: string
  /** Where it lives. A schedule bar has none: it opens its own edit dialog. */
  href?: string | null
  done?: boolean
  /** The original row, so the page's colour helpers still apply to a bar. */
  item?: ScheduleItemRow
}

// ── what a schedule row is called ───────────────────────────────────────────
// Here rather than in the page, because the calendar and the list must not end
// up with two opinions about a bar's name.

export function isDelivery(item: ScheduleItemRow): boolean {
  return item.subcontracts?.companies?.type === 'supplier'
}

export function scheduleLabel(item: ScheduleItemRow): string {
  if (isDelivery(item)) return `Delivery - ${item.subcontracts?.companies?.name ?? item.subcontracts?.trade ?? 'Supplier'}`
  if (item.label) return item.label
  if (item.subcontracts) return item.subcontracts.scope
  return 'Untitled'
}

export function scheduleSubLabel(item: ScheduleItemRow): string | null {
  if (isDelivery(item)) return 'Material delivery'
  if (item.subcontracts?.companies?.name) return item.subcontracts.companies.name
  return null
}

/** Just the date part, so a timestamp and a date compare the same way. */
const day = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, 10) : null
}

export function calendarEvents({ projectId, items = [], inspections = [], tasks = [] }: {
  projectId: string
  items?: ScheduleItemRow[]
  inspections?: InspectionRow[]
  tasks?: TaskRow[]
}): CalendarEvent[] {
  const out: CalendarEvent[] = []

  for (const it of items) {
    if (!it.start_date) continue
    out.push({
      id: `s_${it.id}`, kind: 'schedule', label: scheduleLabel(it),
      start: it.start_date, end: it.end_date || it.start_date, item: it,
    })
  }

  // A CALENDAR IS APPOINTMENTS. The date that puts an inspection on a square is
  // `scheduled_date` - the one the jurisdiction gave - and never
  // `requested_date`, which is a day somebody asked for and nobody agreed to.
  // Same rule that took 14 merely-requested rows out of everyone's Outlook; one
  // still waiting to be booked is on the job's Today band instead, under
  // "needs booking", where it reads as work rather than as an appointment.
  for (const i of inspections) {
    if (i.status === 'void') continue
    const d = day(i.scheduled_date)
    if (!d) continue
    const name = [i.type, i.trade].filter(Boolean).join(' · ') || 'Inspection'
    out.push({
      id: `i_${i.id}`, kind: 'inspection', label: name,
      detail: i.scheduled_time || null,
      start: d, end: d,
      href: `/projects/${projectId}/inspections`,
      done: i.status === 'passed' || i.status === 'failed',
    })
  }

  for (const t of tasks) {
    const d = day(t.due_date)
    if (!d) continue
    out.push({
      id: `t_${t.id}`, kind: 'task', label: t.title || 'Task',
      detail: 'due', start: d, end: d,
      href: `/projects/${projectId}/tasks`,
      // Struck through, NOT hidden - the same treatment the Master Calendar
      // gives a done task, so the two screens say the same thing about a day.
      done: t.status === 'completed',
    })
  }

  return out.sort((a, b) => a.start.localeCompare(b.start) || a.kind.localeCompare(b.kind))
}

/** Everything covering one day. Inclusive at both ends. */
export const eventsOn = (events: CalendarEvent[], ds: string): CalendarEvent[] =>
  events.filter(e => e.start <= ds && e.end >= ds)
