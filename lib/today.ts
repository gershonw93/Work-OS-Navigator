import { todayDateInput } from './dates'
// ─────────────────────────────────────────────────────────────────────────────
// What is on this job today.
//
// "Whoever is on the job site should see what's coming for that day." They
// could not: the Master Calendar is the only place that gathers a day, and it
// is `role === 'admin' || role === 'manager'` - a foreman, office staff, a
// worker or a sub cannot open it at all. And it is a month grid with no "what
// is next", so even an admin has to know which square to look in.
//
// LOCAL MIDNIGHT, like lib/expiry.ts. A calendar date belongs to whoever is
// living it; `toISOString()` is UTC's day, which is tomorrow for anyone working
// a west-coast evening and is how an inspection marked passed at 6pm got
// stamped with the wrong date twice before.
//
// Pure, so the project Overview and My Jobs cannot end up with two opinions
// about what "today" contains.
// ─────────────────────────────────────────────────────────────────────────────

export type TodayKind = 'inspection' | 'schedule' | 'task' | 'needs_booking'

export interface TodayRow {
  kind: TodayKind
  /** What it is, in the words on the record. */
  label: string
  /** The one-line "when", already worded - "8-12 AM", "due today", "needed by". */
  detail?: string | null
  href?: string | null
}

// `todayDateInput` FROM lib/dates.ts, not a fifth private copy. Four of those
// had already drifted in this codebase and past a week they printed three
// different things; that file's comment explains why it is not `toISOString()`,
// which is UTC's day and walks a west-coast evening forward.
export { todayDateInput } from './dates'

/** Just the date part, so a timestamp and a date compare the same way. */
const dayOf = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s.slice(0, 10) : null
}

export const isToday = (v: unknown, today = todayDateInput()): boolean => dayOf(v) === today

/** Inclusive: a schedule bar covers today if it starts on or before and ends on or after. */
export function spansToday(start: unknown, end: unknown, today = todayDateInput()): boolean {
  const s = dayOf(start)
  if (!s) return false
  const e = dayOf(end) ?? s
  return s <= today && today <= e
}

export interface TodayInput {
  projectId: string
  inspections?: { id: string; type?: string | null; trade?: string | null; status?: string | null; scheduled_date?: string | null; scheduled_time?: string | null; requested_date?: string | null }[]
  schedule?: { id: string; label?: string | null; start_date?: string | null; end_date?: string | null; trade?: string | null }[]
  tasks?: { id: string; title?: string | null; due_date?: string | null; status?: string | null }[]
  today?: string
}

/**
 * The day, in the order somebody standing on the site cares about it:
 * who is coming, who is working, what is due, and what still is not booked.
 *
 * A REQUESTED INSPECTION IS NOT AN APPOINTMENT and never appears among them -
 * it comes back under its own kind, so the strip can say "needs booking" rather
 * than implying the inspector is on the way. That is the same rule that took 14
 * unbooked inspections out of everyone's Outlook.
 */
export function todayOnJob(input: TodayInput): TodayRow[] {
  const today = input.today ?? todayDateInput()
  const rows: TodayRow[] = []
  const href = (tab: string) => `/projects/${input.projectId}/${tab}`

  for (const i of input.inspections ?? []) {
    if (i.status === 'void') continue
    const name = [i.type, i.trade].filter(Boolean).join(' · ') || 'Inspection'
    if (isToday(i.scheduled_date, today)) {
      rows.push({ kind: 'inspection', label: name, detail: i.scheduled_time || 'Booked for today', href: href('inspections') })
    }
  }
  for (const s of input.schedule ?? []) {
    if (!spansToday(s.start_date, s.end_date, today)) continue
    rows.push({ kind: 'schedule', label: s.label || s.trade || 'On site', detail: null, href: href('schedule') })
  }
  for (const t of input.tasks ?? []) {
    if (t.status === 'completed') continue
    if (!isToday(t.due_date, today)) continue
    rows.push({ kind: 'task', label: t.title || 'Task', detail: 'Due today', href: href('tasks') })
  }
  // Last, and named for what it is: somebody still has to ring the jurisdiction.
  for (const i of input.inspections ?? []) {
    if (i.status === 'void' || i.status === 'passed' || i.status === 'failed') continue
    if (i.scheduled_date) continue
    const name = [i.type, i.trade].filter(Boolean).join(' · ') || 'Inspection'
    rows.push({
      kind: 'needs_booking', label: name,
      detail: i.requested_date ? `Needed by ${i.requested_date}` : 'No date yet',
      href: href('inspections'),
    })
  }
  return rows
}
